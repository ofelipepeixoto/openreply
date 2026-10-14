import { createHash } from "node:crypto";
import { sendClaimedOnce } from "@/lib/queue/delivery-claim";
import { isConfirmedSendRejection } from "@/lib/instagram/delivery-errors";
import { reserveWorkspaceDMSend, releaseWorkspaceDMReservation } from "@/lib/billing/usage";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import {
  getConversations,
  sendDirectMessage,
  MetaApiError,
} from "@/lib/instagram/provider";
import { createInstagramContext } from "@/lib/instagram/provider";

export interface ConversationListItem {
  id: string;
  detailsUnavailable?: boolean;
  contact: { id: string; username: string | null };
  updatedTime: string | null;
  lastMessage: {
    text: string;
    fromMe: boolean;
    createdTime: string | null;
  } | null;
}

export interface ConversationsResponse {
  conversations: ConversationListItem[];
  account: { id: string; username: string; instagramId: string };
}

// List the account's DM conversations for the inbox.
export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const account = await getWorkspaceInstagramAccount(
    workspaceId,
    request.nextUrl.searchParams.get("instagramAccountId")
  );
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Instagram account not connected." },
      { status: 400 }
    );
  }

  try {
    const accessToken = await createInstagramContext(account);
    const raw = await getConversations({
      context: accessToken,
      igUserId: account.instagramId,
    });

    const conversations: ConversationListItem[] = raw.map((c) => {
      const participants = c.participants?.data ?? [];
      const contact =
        participants.find((p) => p.id !== account.instagramId) ?? null;
      const last = c.messages?.data?.[0] ?? null;

      return {
        id: c.id,
        detailsUnavailable: c.detailsUnavailable,
        contact: {
          id: contact?.id ?? "",
          username: contact?.username ?? null,
        },
        updatedTime: c.updated_time ?? null,
        lastMessage: last
          ? {
              text: last.message ?? "",
              fromMe: last.from?.id === account.instagramId,
              createdTime: last.created_time ?? null,
            }
          : null,
      };
    });

    const data: ConversationsResponse = {
      conversations,
      account: {
        id: account.id,
        username: account.username,
        instagramId: account.instagramId,
      },
    };
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[Conversations] Error:", err);
    const message =
      err instanceof MetaApiError
        ? err.message
        : "Failed to load conversations";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// Send a direct message reply.
export async function POST(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  let body: {
    instagramAccountId?: string;
    recipientId?: string;
    text?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const requestId = request.headers.get("Idempotency-Key");
  if (!requestId || !/^[a-zA-Z0-9_-]{16,128}$/.test(requestId)) {
    return NextResponse.json({ success: false, error: "A valid Idempotency-Key is required." }, { status: 400 });
  }
  if (typeof body?.recipientId !== "string" || !body.recipientId || body.recipientId.length > 128 || !text || text.length > 4096 ||
      (body.instagramAccountId !== undefined && typeof body.instagramAccountId !== "string")) {
    return NextResponse.json(
      { success: false, error: "A recipient and message are required." },
      { status: 400 }
    );
  }

  const account = await getWorkspaceInstagramAccount(
    workspaceId,
    body.instagramAccountId ?? null
  );
  if (!account) {
    return NextResponse.json(
      { success: false, error: "Instagram account not connected." },
      { status: 400 }
    );
  }

  const operationId = "manual:" + createHash("sha256").update(JSON.stringify([
    workspaceId, account.id, requestId,
  ])).digest("hex");
  let accessToken;
  try {
    accessToken = await createInstagramContext(account, operationId);
  } catch {
    return NextResponse.json({ success: false, error: "Account credentials unavailable." }, { status: 503 });
  }
  const usage = await reserveWorkspaceDMSend(workspaceId);
  if (!usage.allowed) {
    return NextResponse.json({ success: false, error: "Workspace send limit reached." }, { status: 429 });
  }
  let attempted = false;
  try {
    let result: unknown;
    const delivered = await sendClaimedOnce({ operationId, send: async () => {
      attempted = true;
      result = await sendDirectMessage({
        context: accessToken,
        instagramAccountId: account.instagramId,
        userId: body.recipientId!,
        message: text,
      });
    } });
    if (!delivered) {
      await releaseWorkspaceDMReservation(workspaceId, usage.periodStart);
      return NextResponse.json({ success: false, outcome: "UNKNOWN", error: "This send was already claimed. Inspect the inbox before composing another message." }, { status: 409 });
    }
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (!attempted || isConfirmedSendRejection(err)) {
      await releaseWorkspaceDMReservation(workspaceId, usage.periodStart);
    }
    const unknown = attempted && !isConfirmedSendRejection(err);
    return NextResponse.json({ success: false, outcome: unknown ? "UNKNOWN" : "FAILED",
      error: unknown ? "Delivery is unconfirmed. Inspect the inbox before composing another message." : "Message could not be sent." },
      { status: unknown ? 409 : 502 });
  }
}
