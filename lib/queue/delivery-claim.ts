import { prisma } from "@/lib/db/client";
import { classifySendError, isConfirmedSendRejection } from "@/lib/instagram/delivery-errors";

// A retained row means SENT or UNKNOWN, never permission to resend.
export async function sendClaimedOnce({
  operationId,
  send,
}: {
  operationId: string;
  send: () => Promise<unknown>;
}): Promise<boolean> {
  try {
    await prisma.postbackDelivery.create({ data: { id: operationId } });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    )
      return false;
    throw error;
  }
  try {
    await send();
    return true;
  } catch (error) {
    // A durable claim survives queue eviction, concurrent redelivery, and a
    // process crash during delivery. Only confirmed rejections permit retry.
    if (isConfirmedSendRejection(error)) {
      await prisma.postbackDelivery.delete({ where: { id: operationId } });
      throw error;
    }
    throw classifySendError(error);
  }
}

