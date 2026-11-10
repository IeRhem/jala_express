<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:nextjs-agent-rules -->
<!-- managed by `next dev` — don't hand-edit this block, it's regenerated automatically -->
<!-- END:nextjs-agent-rules -->

# SafeDrop Taraba

Escrow-backed delivery platform for Taraba State, Nigeria. Buyer pays →
SafeDrop holds the funds → a rider collects and verifies the item at
pickup → delivers it → buyer confirms or rejects at the door → funds
release, refund, or the seller sends a working replacement.

## Setup

pnpm install
cp .env.example .env   # needs DATABASE_URL, PAYSTACK_SECRET_KEY, WHATSAPP_CLOUD_API_TOKEN,
                        # WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET
pnpm prisma contract emit   # regenerate contract.json / contract.d.ts after any contract.prisma change
pnpm prisma db init         # create tables — Prisma 8, not `migrate dev`
# then seed Role (Admin/Ops/Rider) and starter Category/ServiceArea rows — no `db seed` in the Prisma 8 CLI yet, so this is a one-off script for now

## Dev

pnpm dev

## Stack

Next.js, TypeScript, Tailwind CSS, Prisma ORM 8 (contract-based, `db.orm.public.*` client — not the `PrismaClient`/`@prisma/client` API) + PostgreSQL, Better Auth,
Paystack (payments), WhatsApp Cloud API (order intake), Cloudflare R2
(verification photos).

## Conventions

- Money is always an `Int` in kobo. Never `Float`.
- Never update `Transaction.status` directly. Every change creates a
  matching `TransactionEvent` row (status, actor, timestamp) — this is
  the audit trail the dispute/refund flow depends on.
- `Staff.role`, `Vendor.category`, and `Vendor.area` come from the
  `Role`, `Category`, and `ServiceArea` tables, not enums or free text.
  Add new values as rows, not code changes.
- All Paystack calls go through `lib/paystack.ts`. All WhatsApp sends
  go through `lib/whatsapp.ts`. Don't call either API directly from a
  route handler or server action.
- This system holds real escrowed money. Don't edit `prisma/contract.prisma`
  or anything under `lib/payments/` without flagging it explicitly first —
  these aren't routine changes.
- Prisma 8, not 7: import `db` from `@/prisma/db`, never `PrismaClient`
  from `@prisma/client`. Queries are `db.orm.public.Model.where({...}).first()`
  / `.all()`, not `findUnique`/`findMany`. Multi-step writes use
  `db.transaction(async (tx) => ...)` with `tx.orm`, not `$transaction`.
- Every inbound WhatsApp message is claimed in `WebhookInbox` by its
  `wamid` before processing — this is what actually prevents a WhatsApp
  retry from double-firing a status change, not the webhook's HTTP 200.

## Testing

(not yet set up)