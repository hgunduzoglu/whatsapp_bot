# WhatsApp Farm CRM & Debt Tracker

[![CI](https://github.com/hgunduzoglu/whatsapp_bot/actions/workflows/ci.yml/badge.svg)](https://github.com/hgunduzoglu/whatsapp_bot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A WhatsApp-based mini CRM and debt tracking system for small agricultural businesses (agro-dealers, seedling nurseries, farm supply shops). The entire system is operated through WhatsApp: the operator manages customers, monetary debts, product (pesticide/fertilizer) debts, payments, seedling orders and promissory notes by simply texting a bot.

**No LLM, no AI.** The bot is a fully deterministic, menu-driven state machine — every interaction is a numbered menu or a guarded input prompt. This makes it predictable, cheap to run, and safe for financial records.

> **Note on language:** the bot speaks **Turkish** (its target users are Turkish-speaking shop owners), while all code, identifiers and documentation are in English. All user-facing strings live in a single file ([texts.ts](apps/api/src/bot/texts.ts)), so translating the bot to another language is a one-file change.

## What it does

| Module | Description |
|---|---|
| Customers | Add/search customers with Turkish-aware normalized search and duplicate detection ("Mehmet Ali" vs "Mehmet Ali - Karadere") |
| Monetary ledger | Debts, payments and corrections as an append-only ledger; balance is always derived, never stored |
| Product debts | Pesticide/fertilizer debts tracked **by quantity** (3 boxes, 5 sacks), separate from money |
| Product payments | Settle product debts partially or fully; the accounting value never touches the monetary balance |
| Seedling orders | Track who wants which seedlings and when; orders create no debt by themselves |
| Seedling debts | Recorded as monetary debt: unit price × seedling count |
| Promissory notes | The owner's *own* debts to suppliers, with due-date reminders |
| Reminders | 3 days / 1 day before note due dates and 3 days before seedling pickups, via BullMQ delayed jobs + a daily reconciliation sweep |
| Reports | Daily/weekly summaries, receivables, open product debts, upcoming deliveries/notes, full customer statements |
| Corrections | Undo (void) or delete any recent transaction with a mandatory reason; everything is soft-deleted and audit-logged |

### Core accounting rules

These rules are enforced at the service layer and covered by integration tests:

1. **Monetary debt and product debt are strictly separate.** A product debt has no fixed TL value when created (prices change between purchase and settlement).
2. **Product payments never reduce the monetary balance.** Their TL value is informational, for reports only.
3. **Seedling orders create no debt.** Seedling debt is added separately (usually at delivery) and *is* monetary.
4. **Nothing is hard-deleted.** Transactions are voided or soft-deleted with a reason, and every critical action is written to an audit log.
5. **Money is stored as integer kurus** (1 TL = 100 kurus). No floating point, ever.
6. Voiding a product payment **restores the open quantities** it had settled; a product debt with active payments cannot be voided until those payments are voided first.

## Architecture

```
WhatsApp user
    │
    ▼
Meta WhatsApp Cloud API ──webhook──▶ NestJS API
                                       │
                          ┌────────────┼───────────────┐
                          ▼            ▼               ▼
                   Bot state machine  Business      BullMQ worker
                   (PostgreSQL-backed  services      (reminders +
                    sessions)          (Prisma)      daily reconciliation)
                          │            │               │
                          └────────────┼───────────────┘
                                       ▼
                              PostgreSQL + Redis
```

- **NestJS + TypeScript** — modular service architecture, one module per domain
- **Prisma + PostgreSQL** — schema in [schema.prisma](apps/api/prisma/schema.prisma)
- **Redis + BullMQ** — delayed reminder jobs and the daily 08:00 (Istanbul) reconciliation job that re-sends anything the queue missed
- **Zod** — environment validation at boot
- All business dates use the **Europe/Istanbul** calendar regardless of server timezone; timestamps are stored in UTC

The repository is structured as a monorepo (`apps/api`) so an admin panel (`apps/admin`) can be added later without restructuring.

## Getting started

### Prerequisites

- Node.js ≥ 20
- Docker (for PostgreSQL and Redis)
- A Meta developer account with a WhatsApp Business app ([setup guide](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started))

### 1. Clone and install

```bash
git clone https://github.com/hgunduzoglu/whatsapp_bot.git
cd whatsapp_bot/apps/api
npm install
```

### 2. Configure the environment

```bash
cp .env.example .env   # run this at the repo root
```

Fill in your own values — see the [Environment variables](#environment-variables) table. **Never commit `.env`**; it is gitignored and must stay that way.

### 3. Start the databases and migrate

```bash
docker compose up -d postgres redis   # repo root
cd apps/api
npm run prisma:migrate
```

> The compose file maps PostgreSQL to host port **5434** and Redis to **6380** to avoid clashing with locally installed services.

### 4. Run the API

```bash
npm run start:dev
```

Check `http://localhost:3000/health` — it reports database and Redis connectivity.

### 5. Connect the WhatsApp webhook

Meta must be able to reach your webhook over HTTPS. For local development use a tunnel:

```bash
ngrok http 3000   # or: cloudflared tunnel --url http://localhost:3000
```

In the Meta developer portal (your app → WhatsApp → Configuration):

1. Set the webhook URL to `https://<your-domain>/webhooks/whatsapp`
2. Set the verify token to the same value as `WHATSAPP_VERIFY_TOKEN` in your `.env`
3. Subscribe to the `messages` webhook field
4. Add your operator phone number(s) to `AUTHORIZED_WHATSAPP_PHONES`

Send any message (e.g. `merhaba`) to your WhatsApp business number from an authorized phone — the bot replies with the main menu (in Turkish):

```
Ana Menü

1) Müşteri işlemleri
2) Senetlerim
3) Raporlar
4) Son işlemler / düzeltme
5) Yardım
```

Global commands work in every state: `iptal` (cancel), `geri` (back), `ana menü` (main menu), `yardım` (help).

### Money input format

The bot uses **strict Turkish number formatting** to keep money entry unambiguous:

| Input | Meaning |
|---|---|
| `1.500` | 1.500 TL (dot = thousands separator) |
| `10,50` | 10,50 TL (comma = decimal separator) |
| `1.250.000,75` | 1.250.000,75 TL |
| `10.5` | **rejected** — ambiguous, the bot re-asks |

## Reminders and the 24-hour window

The bot sends reminders on its own initiative (note due dates, seedling pickups). Meta only delivers free-form messages within 24 hours of the user's last message; outside that window an **approved template message** is required. The sender service supports both ([whatsapp-sender.service.ts](apps/api/src/whatsapp/whatsapp-sender.service.ts)) — for production use you should create and get approval for reminder templates in the Meta business manager, and adapt the reminder processor to use `sendTemplate`. If the operator messages the bot daily, plain-text reminders will usually work as-is.

## Testing

```bash
cd apps/api
npm test                  # unit tests (no external services needed)

docker compose --profile test up -d postgres_test   # repo root, once
npm run test:integration  # real PostgreSQL + Redis
```

Integration tests cover the accounting rules end to end — including full bot conversations (create customer → add debt → check balance → settle product debt) driven through the state machine against a real database.

## Environment variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | — |
| `TEST_DATABASE_URL` | Test database (integration tests) | dev value on port 5435 |
| `REDIS_URL` | Redis connection string | — |
| `APP_TIMEZONE` | Business timezone | `Europe/Istanbul` |
| `WHATSAPP_ACCESS_TOKEN` | Cloud API access token | — |
| `WHATSAPP_PHONE_NUMBER_ID` | Sender phone number id | — |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WABA id | — |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verification token (you choose it) | — |
| `WHATSAPP_APP_SECRET` | App secret for webhook signature checks | empty = skip |
| `WHATSAPP_DRY_RUN` | `true` = log outgoing messages instead of sending | `false` |
| `AUTHORIZED_WHATSAPP_PHONES` | Comma-separated allowed phones (digits only) | empty |
| `REPLY_TO_UNAUTHORIZED` | Reply to strangers (`false` = silently ignore) | `false` |
| `SESSION_TTL_MINUTES` | Bot session expiry | `30` |
| `REMINDER_SEND_HOUR` | Hour of day (Istanbul) reminders are sent | `9` |

## Customization

The system is deliberately modular — each concern lives in its own NestJS module:

- **All bot texts and menus** are in [apps/api/src/bot/texts.ts](apps/api/src/bot/texts.ts). Change wording or translate the whole bot there; no flow logic is involved.
- **Conversation flows** are one class per feature in [apps/api/src/bot/flows/](apps/api/src/bot/flows/). Each flow registers its states in the `FlowRegistry`; adding a new flow does not touch the router.
- **Quick date options** (10/14/20/30/45 days) live in [date.util.ts](apps/api/src/common/utils/date.util.ts) (`DATE_OPTION_DAYS`).
- **Product units and categories** are Prisma enums in [schema.prisma](apps/api/prisma/schema.prisma) with Turkish labels in `texts.ts` (`UNIT_LABELS`).
- **Reminder offsets** (3 days / 1 day) are set where reminders are scheduled in [reminders.service.ts](apps/api/src/reminders/reminders.service.ts).
- **Business rules** (balances, settlement, void/restore) are in the domain services, fully covered by tests — change them with confidence.

## Project structure

```
apps/api/
  prisma/               # schema + migrations
  src/
    audit/              # audit logging
    bot/                # state machine core, flows, Turkish texts
    common/             # money/date/normalization utilities, domain errors
    config/             # env validation (Zod) + typed config
    corrections/        # cross-entity undo/delete
    customers/          # customer management
    monetary-ledger/    # money debts/payments/adjustments
    product-debts/      # quantity-based product debts
    product-payments/   # product settlements
    promissory-notes/   # owner's own debts
    reminders/          # BullMQ scheduling + reconciliation
    reports/            # report data assembly
    seedlings/          # seedling orders & debts
    whatsapp/           # webhook, signature check, message sender
  test/                 # integration tests (real PostgreSQL + Redis)
docker-compose.yml      # postgres (5434), redis (6380), test db (5435)
```

## Security notes

- No secrets in code or in the repository — everything comes from environment variables, validated at boot.
- Webhook payloads are verified with `X-Hub-Signature-256` when `WHATSAPP_APP_SECRET` is set.
- Only numbers in `AUTHORIZED_WHATSAPP_PHONES` can use the bot; strangers are ignored by default (replying would open a paid conversation).
- Incoming messages are deduplicated by WhatsApp message id, so Meta's webhook retries can't double-book a debt.

## Roadmap

- Admin panel (Next.js) for browsing/correcting records and viewing audit logs
- Automated PostgreSQL backups to Cloudflare R2
- Template-message-based reminder delivery out of the box
- JWT-based auth for the admin REST API

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow, coding conventions and how to run the test suites. In short: fork, branch, add tests for behavior changes, make sure `npm run lint && npm test && npm run test:integration` pass, and open a PR.

## License

[MIT](LICENSE)
