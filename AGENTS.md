<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# SafeDrop Taraba

Escrow-backed delivery platform for Taraba State, Nigeria. Buyer pays →
SafeDrop holds the funds → a rider collects and verifies the item at
pickup → delivers it → buyer confirms or rejects at the door → funds
release, refund, or the seller sends a working replacement.

## Setup

pnpm install
cp .env.example .env   # needs DATABASE_URL, PAYSTACK_SECRET_KEY, WHATSAPP_CLOUD_API_TOKEN
npx prisma migrate dev
npx prisma db seed     # seeds Role (Admin/Ops/Rider) and starter Category/ServiceArea rows

## Dev

pnpm dev

## Stack

Next.js, TypeScript, Tailwind CSS, Prisma + PostgreSQL, Better Auth,
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
- This system holds real escrowed money. Don't edit `schema.prisma` or
  anything under `lib/payments/` without flagging it explicitly first —
  these aren't routine changes.

## Testing

(not yet set up)