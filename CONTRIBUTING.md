# Contributing

Thanks for considering a contribution! This project is a deterministic, menu-driven WhatsApp CRM — no LLMs, no magic. Keeping it predictable and well-tested matters more than adding features quickly.

## Development setup

```bash
git clone <repository-url>
cd whatsapp_bot
cp .env.example .env          # fill in what you need; WHATSAPP_DRY_RUN=true works without Meta credentials
docker compose up -d postgres redis
cd apps/api
npm install
npm run prisma:migrate
npm run start:dev
```

You do **not** need WhatsApp credentials to develop. With `WHATSAPP_DRY_RUN=true` outgoing messages are logged instead of sent, and the whole bot can be exercised through the integration test harness (see `test/bot-flows.integration.spec.ts` for examples of driving full conversations in code).

## Running the checks

All three must pass before you open a PR — CI runs exactly these:

```bash
npm run lint
npm test                                              # unit tests
docker compose --profile test up -d postgres_test     # once, repo root
npm run test:integration                              # real PostgreSQL + Redis
```

## Project conventions

- **Language:** all code, identifiers, comments and docs are in English. All user-facing bot strings are Turkish and live exclusively in [apps/api/src/bot/texts.ts](apps/api/src/bot/texts.ts) — never hardcode user-facing text inside flows or services.
- **Money:** always integer kurus (`amountKurus`). Never use floats for money. Parse user input with `parseMoneyInput`, format with `formatKurus`.
- **Dates:** business dates follow the Istanbul calendar and are stored as UTC-midnight dates. Use the helpers in [date.util.ts](apps/api/src/common/utils/date.util.ts) instead of `new Date()` arithmetic.
- **Deletion:** nothing is hard-deleted. Use void / soft-delete through the owning service so consistency rules (quantity restore, payment guards) and audit logging apply.
- **Architecture:** one NestJS module per domain. Bot conversation logic belongs in a flow class under `src/bot/flows/` that registers its states in the `FlowRegistry`; business rules belong in domain services. Flows should stay thin — parse input, call a service, render text.
- **Errors:** services throw typed domain errors from [errors.ts](apps/api/src/common/errors.ts); the bot router maps them to Turkish messages.

## Adding a new bot flow

1. Add your states to `BotState` in [bot-state.enum.ts](apps/api/src/bot/bot-state.enum.ts).
2. Create a flow class in `src/bot/flows/` that registers a `prompt` and `handle` for each state.
3. Add the flow to the providers in [bot.module.ts](apps/api/src/bot/bot.module.ts).
4. Put all new user-facing strings in `texts.ts`.
5. Add an integration test that drives the conversation end to end.

The shared pickers are reusable: the customer picker (`CUSTOMER_PICK_QUERY`) and the manual date entry (`DATE_ENTRY_DAY`) accept a *purpose* and call a continuation you register on the `FlowRegistry` — see existing flows for examples.

## Database changes

1. Edit [schema.prisma](apps/api/prisma/schema.prisma).
2. Run `npm run prisma:migrate -- --name describe_your_change` to generate a migration.
3. Commit the migration folder together with your code.

## Commit and PR guidelines

- Write commit messages as plain, descriptive sentences (e.g. "Add seedling order flow to the bot"). No `feat:`/`chore:` prefixes.
- Keep commits focused — one logical change per commit.
- For behavior changes, include or update tests that demonstrate the new behavior.
- **Never commit secrets.** `.env` is gitignored; only `.env.example` (with placeholders) belongs in the repo. If you accidentally commit a credential, rotate it immediately — rewriting git history is not enough.

## Reporting issues

Open a GitHub issue with steps to reproduce. For anything security-sensitive (e.g. a way to bypass the phone allowlist or the webhook signature check), please do not open a public issue — contact the maintainer directly instead.
