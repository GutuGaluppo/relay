# Relay

> **Capture agora. Aja depois.**

Relay captura uma intenção no celular em poucos segundos e a devolve no computador
no momento certo: ao iniciar a sessão, ao desbloquear a tela ou quando o adiamento vence.

Especificação: [docs/RELAY_BASE_PROMPT.md](docs/RELAY_BASE_PROMPT.md) · Plano: [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md)

## Estrutura

```text
apps/
  desktop/     Tauri 2 + React — utilitário de menu bar, lembretes, Modo Foco
  mobile/      Expo (SDK 57) — tela única de captura por texto e voz
packages/
  types/       Schemas Zod + tipos Reminder, mapeamento de linhas do banco
  domain/      Regras puras: transições, adiamentos, agendamento (sem UI/backend)
  sync/        Outbox local, reconciliação last-writer-wins, SyncEngine, adapter Supabase
supabase/
  migrations/  Tabela reminders, RLS, trigger LWW, RPC upsert_reminders, realtime
  templates/   E-mail com código de 6 dígitos
  tests/       Teste da migração em PGlite (Postgres WASM)
design/icon/   Fontes SVG do ícone e dos glifos de menu bar / bandeja
```

## Começando

Requisitos: Node 22+, pnpm 11, Rust stable (desktop), Xcode/Android Studio (mobile), Docker (Supabase local).

```bash
pnpm install
pnpm dev:desktop     # app Tauri (porta 1470 para o Vite)
pnpm dev:mobile      # Expo
```

Sem variáveis de ambiente, ambos rodam em **modo local**: tudo funciona, mas sem
sincronização entre dispositivos. Para sincronizar:

```bash
supabase start                       # sobe Postgres, Auth, Realtime e Mailpit localmente
supabase db reset                    # aplica as migrações
cp apps/desktop/.env.example apps/desktop/.env.local   # preencha com a anon key exibida
cp apps/mobile/.env.example apps/mobile/.env.local
```

O login é por **código de 6 dígitos enviado por e-mail** (Supabase Auth OTP), a opção mais
simples e segura que não exige deep links. Localmente os e-mails aparecem no Mailpit
(`http://127.0.0.1:54324`). Em produção, os templates de `supabase/templates` precisam
ser configurados no painel (Auth → Email Templates) com `{{ .Token }}`.

A captura por voz usa `expo-speech-recognition`, que tem código nativo: rode com
`npx expo run:ios` / `run:android` (development build), não no Expo Go. O
reconhecimento é feito no dispositivo quando disponível, e o áudio nunca é salvo.

## Verificações

```bash
pnpm test         # domínio, sync e controller do desktop (vitest)
pnpm test:db      # migração: RLS, idempotência, last-writer-wins
pnpm typecheck
pnpm lint
pnpm format:check
```

## Como funciona

**Ciclo de vida:** `inbox → pending → active → done`, com saídas `pending → archived` e
`active → pending`. Todas as transições são funções puras em `packages/domain`.

| Momento             | Ação             | Resultado                                            |
| ------------------- | ---------------- | ---------------------------------------------------- |
| Lembrete inicial    | Agora não        | `pending`, volta em 2 h                              |
|                     | Farei agora      | `active`, abre o Modo Foco                           |
| Lembrete de retorno | Prorrogar        | 30 min · 1 h · 2 h · Amanhã (9h) · horário escolhido |
|                     | Ainda não        | volta em 90 min                                      |
|                     | Iniciar tarefa   | `active`, Modo Foco                                  |
| Modo Foco           | Concluir / Adiar | `done` / `pending` com adiamento                     |

Fechar a janela durante um lembrete conta como a opção gentil (Agora não / Ainda não).

**Quando o desktop mostra algo** (`apps/desktop/src/app/controller.ts`):

- A fonte da verdade é `nextReminderAt` persistido. Timers são só otimização.
- A avaliação roda ao iniciar, ao desbloquear a tela (macOS), ao acordar do sono
  (detectado por salto de relógio), após cada sincronização, a cada 20 s e pelo menu "Lembretes pendentes".
- Capturas novas (sem horário) aparecem em **momentos intencionais**: início, desbloqueio,
  retorno do sono ou menu. Durante o uso, chega só uma notificação discreta.
- Momento intencional: sobreposição em tela cheia. Adiamento que vence durante o uso:
  janela compacta que não rouba o foco, mais uma notificação.
- Um lembrete por vez, sempre o mais antigo primeiro. Uma tarefa ativa nunca é interrompida.

**Sincronização** (`packages/sync`): toda alteração vai primeiro para o armazenamento
local e para um outbox, depois é enviada via `upsert_reminders`. IDs gerados no cliente
tornam reenvios idempotentes, e o trigger no banco descarta escritas com `updated_at`
mais antigo (last-writer-wins). Realtime acelera a entrega, e a reconciliação periódica,
ao reconectar e ao acordar garante consistência. O celular opera em modo _push-only_
e apaga do aparelho o que já foi entregue.

**Desktop em segundo plano:** fechar a janela esconde o app (fica na menu bar, sem ícone
no Dock). "Sair do Relay" encerra. Início com o sistema via LaunchAgent, desligável em
Ajustes. O ícone da menu bar é um glifo template próprio, que ganha um ponto maior
quando há algo esperando.

## Pendências conhecidas

- **Windows:** detecção de desbloqueio ainda não implementada (`session.rs`, TODO com
  `WTSRegisterSessionNotification`). O restante do shell é multiplataforma.
- **Login com Apple/Google:** não incluído. O OTP por e-mail cobre o MVP.
- **Beta (Milestone 13):** assinatura e notarização macOS, builds EAS, relatório de erros
  e política de privacidade ainda não foram feitos.
