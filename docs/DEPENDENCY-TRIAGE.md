# Triagem de dependências — lote 2

Evidência: npm audit JSON e npm explain locais, 14/10/2026.
CODE VERIFIED identifica caminhos e intervalos do lock; advisories são DOC CLAIM,
não exploração comprovada. Runtime/build indicam o caminho observado, não uma
prova de inexplo­rabilidade. Nenhum payload de exploit ou serviço real foi usado.

| Entrada alta no lote1 | Caminho observado | Ação/limite | Após atualização |
|---|---|---|---|
| @auth/core | SMTP/auth runtime | Herdado de nodemailer; peer não aceita versão10 corrigida. Não forçar. | Permanece |
| @auth/prisma-adapter | Auth runtime | Herdado de @auth/core/nodemailer; manter contrato de autenticação. | Permanece |
| @next/eslint-plugin-next | Lint/desenvolvimento | Herdado de fast-glob/braces; sem fix compatível indicado. | Permanece |
| @prisma/config | CLI/generate/build | deepmerge-ts fixado7.1.5 pelo Prisma; não substituir major8 sem validar. | Permanece |
| brace-expansion | Lint/desenvolvimento | Atualizado dentro das faixas dos pais:1.1.21 e5.0.12. | Não reportada |
| braces | Lint/desenvolvimento | Audit indica todas versões; downgrade Next14 sugerido não é compatível. | Permanece |
| browserslist | Build | Atualizado4.28.2→4.29.3 na faixa aceita; dados associados atualizados. | Não reportada |
| deepmerge-ts | Prisma CLI | 7.1.5 fixado; correção requer major8 e revisão do Prisma. | Permanece |
| eslint-config-next | Lint/desenvolvimento | Herdado de plugin/fast-glob; não regredir Next para14. | Permanece |
| fast-glob | Lint/desenvolvimento | Herdado de micromatch/braces; sem atualização compatível corrigida. | Permanece |
| fast-uri | Validação/tooling | Atualizado3.1.2→3.1.8 dentro da faixa^3.0.1. | Não reportada |
| hono | Prisma tooling transitivo | Atualizado4.12.19→4.13.13 dentro de^4; app não importa Hono. | Não reportada |
| js-yaml | Lint/tooling | Atualizado4.1.1→4.3.2 dentro da faixa^4.1.1. | Não reportada |
| micromatch | Lint/desenvolvimento | Herdado de braces; sem versão corrigida compatível. | Permanece |
| mysql2 | Prisma tooling transitivo | 3.15.3 fixado; app usa pg. Atualizar via Prisma validado, sem override cego. | Permanece |
| next-auth | Auth runtime | Herdado de nodemailer; versão beta32 aceita7/8, não10. Não downgrade para1. | Permanece |
| nodemailer | SMTP/auth runtime | 7.0.13; correções completas exigem>10.0.5, fora do peer atual. Bloqueio de produção SMTP; reachable exploit não demonstrado. | Permanece |
| prisma | CLI/build/dev | Achados herdados config/dev/mysql2; atualização coordenada requer geração/build que estão bloqueados403. | Permanece |

Resultado: 24→18 entradas totais; 18→13 altas; 0 críticas, 3 moderadas, 2 baixas.
Atualização somente do lock nas faixas já declaradas, sem overrides ou audit force.
Nodemailer é alcançável pelo fluxo SMTP configurável de magic links; não é seguro
concluir que não há risco só porque o app não usa raw attachments. A decisão de
upgrade de Auth/Nodemailer ou de transporte exige testes de login e uma matriz de
compatibilidade, sem mudar configuração de produção nesta execução.

Prisma permanece7.8.0; o HTTP403 de checksum não foi contornado nem reexecutado.
Os apontamentos altos remanescentes continuam gates de produção.
