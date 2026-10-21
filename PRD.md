# SafeDrop Taraba — Product Requirements Document

*MVP scope for the 45-day pilot in Jalingo, Wukari, and Takum, Taraba State, Nigeria*

## 1. Overview

SafeDrop Taraba formalizes an existing informal behavior — buyers and sellers in Taraba State sending money over WhatsApp and trusting the other side to deliver — into a structured, escrow-backed transaction flow. Funds are held by SafeDrop as soon as the buyer pays. SafeDrop then collects the goods from the seller, verifies them against the listing, and delivers them to the buyer — if the goods are fake or don't match what was listed, the buyer is refunded or the seller sends a working replacement; otherwise the held funds are released to the seller. This removes blind trust from both the payment and the goods themselves, not just the money.

This PRD covers the systems required to run the 45-day pilot, not the full long-term vision. Scope is deliberately narrow: build the smallest set of real systems that can safely hold and release money for a small number of daily transactions, and defer everything that only matters at higher volume.

## 2. Goals

- Run a live, safe, escrow-backed pilot across food/market goods, phones/electronics, and local ride/delivery categories.
- Prove that buyers will choose an escrow flow over direct transfer, and that it measurably reduces disputes/no-shows versus the status quo.
- Keep pilot operating costs inside a revenue model that actually breaks even at pilot volume (see Financial Model note under Risks).
- Produce a transaction and dispute dataset that justifies (or disproves) further investment before Phase 2 spend.

## 3. Non-Goals (Explicitly Out of Scope for the Pilot)

- **Apartment/land rental escrow.** Deferred due to tenancy-law dispute risk; revisit only after legal review.
- **Dedicated rider app.** 3 pilot riders are coordinated manually (phone/WhatsApp group); a rider PWA is Phase 2.
- **Vendor self-service portal.** Vendors are onboarded and tracked manually inside the admin dashboard.
- **Buyer accounts/profiles.** Buyers are identified by WhatsApp number only; no signup flow at pilot stage.
- **Proprietary custodial wallet.** The system holds a ledger state, not actual custody — funds sit with Paystack between collection and payout. See Section 6.
- **Automated BVN/NIN identity verification.** Manual verification only until a data-protection review is complete.

## 4. User Personas

| Persona | Who | Primary need |
| --- | --- | --- |
| Buyer | Someone ordering food, a phone, or a ride via WhatsApp | Confidence that what arrives has already been checked against the listing before any money reaches the seller |
| Seller/Vendor | Suya spot, restaurant, or phone dealer | Confidence that payment is guaranteed once SafeDrop verifies the item matches what was listed |
| Rider | Pilot delivery partner (3 at launch) | Clear pickup instructions, a simple way to flag an item that doesn't match its listing, and reliable per-delivery pay |
| Ops Admin | Founder(s) running the pilot | A single screen to see every transaction's state and act on disputes |

## 5. Core Features

### 5.1 Escrow Transaction Ledger (Backend)

The system of record. SafeDrop takes custody of both the payment and the goods until verification is complete — not a wallet, and not a system that simply waits on the buyer's word.

**Requirements:**

- Create a `Transaction` record on order confirmation: buyer WhatsApp number, category, amount, seller.
- States: `pending_payment` → `held` → `collecting` → `verified` | `rejected_at_pickup` → `delivered` → `confirmed` | `rejected_at_delivery` → `replaced` | `refunded`.
- Paystack checkout link generated per transaction; funds move to `held` once payment clears, before any pickup happens.
- Rider/agent collects the item from the seller and inspects it against the listing before taking custody; logs the outcome (`verified` or `rejected_at_pickup`) and a photo in the admin dashboard. A `rejected_at_pickup` item is never collected, and the buyer is refunded immediately.
- `verified` items are delivered, and the buyer gets a final check at the door. Accepted → `confirmed`, and a Paystack Transfers API call pays the seller (`released`). Rejected (`rejected_at_delivery`) → the buyer chooses, rider mediating: the seller sends a working replacement (a new collection/delivery cycle; transaction moves to `replaced` once accepted) or the buyer is refunded via Paystack (`refunded`).
- Full audit log per transaction: status changes, timestamps, and which rider/agent made each verification call.

### 5.2 Admin/Ops Dashboard

Internal tool; this is where the pilot is actually run.

**Requirements:**

- Auth via Better Auth, admin role only at pilot stage.
- List view of all transactions, filterable by status.
- Detail view per transaction: full history, manual release/refund/dispute actions.
- Dispute intake: log a dispute, attach notes/photos (stored in Cloudflare R2), resolve or escalate.
- Manual vendor and rider directory (name, contact, category, active/inactive).
- Verification log per transaction: who inspected the item at pickup, the outcome (verified/rejected), and a photo stored in Cloudflare R2.

### 5.3 WhatsApp Ordering Flow

The customer-facing intake channel. Starts manual, automates only once validated.

**Requirements — Pilot (manual):**

- Single WhatsApp Business number; ops manually creates the `Transaction` record from the conversation.

**Requirements — Phase 1 (automated, post-validation):**

- WhatsApp Cloud API webhook captures structured order intent (category, item, amount, seller) and writes directly to the `Transaction` table.
- Automated confirmation messages at each state change (payment received, held, released, disputed).

### 5.4 Public Website

Trust and legitimacy layer, not a transactional storefront at pilot stage.

**Requirements:**

- Explains how escrow works, dispute windows per category, and how to start an order (links to WhatsApp).
- Lists active categories and example vendors.
- No buyer accounts, no in-browser checkout required for the pilot.

## 6. Technical Requirements

| Layer | Choice |
| --- | --- |
| Frontend/Admin | Next.js, React, TypeScript, Tailwind CSS |
| Database/ORM | PostgreSQL, Prisma |
| Auth | Better Auth (admin/ops roles only at pilot stage) |
| File storage | Cloudflare R2 (dispute evidence, proof-of-delivery photos) |
| Payments | Paystack (checkout for collection, Transfers API for payout) |
| Messaging | WhatsApp Business number (manual) → WhatsApp Cloud API (Phase 1) |
|  |  |

## 7. Success Metrics (Pilot)

- Number of completed transactions per category per week.
- Dispute rate (% of transactions disputed).
- Average time from `held` to `released`.
- Revenue vs. operating cost per month (target: break-even at pilot scale after financial model revisions).
- Buyer/seller qualitative feedback on trust vs. the prior informal process.

## 8. Risks & Open Questions

- **Financial model.** The original plan's revenue projection does not cover fixed costs at the proposed rider headcount; pay structure and fee model need revision before the pilot launches (see prior financial model critique).
- **Regulatory exposure.** Holding and releasing funds, even via Paystack's transfer rails rather than a proprietary wallet, should be reviewed by a fintech-literate lawyer before real transactions begin.
- **Data protection.** Any BVN/NIN or identity data collected needs an NDPR-compliant basis and storage approach before collection starts, not after.
- **Cash handling.** No reconciliation process is currently defined for rider-collected cash; needs a decision (define a process, or go cashless for the pilot).
- **Headcount contradiction.** Source business plan lists both 3 and 10 riders for launch across different sections — needs to be resolved to one number before budgeting or hiring.
- **Custody risk while goods are in SafeDrop's possession.** Between collection and delivery, SafeDrop — not the seller — is responsible for loss, damage, or spoilage; perishable or live goods (produce, livestock) need a defined handling process, and agents need consistent training to judge authenticity across categories, since a wrong verification call creates liability either way.

## 9. Phased Rollout

**Phase 0 — Pilot build (Weeks 1–2):** Transaction ledger, admin dashboard, manual WhatsApp intake, manual goods collection and verification by the founder/rider, Paystack checkout + manual transfer payout.

**Phase 1 — Automation (Weeks 3–8, contingent on pilot results):** WhatsApp Cloud API integration, automated dispute-window release job, public website live.

**Phase 2 — Scale (post-pilot, contingent on validated demand and resolved legal review):** Rider PWA, vendor self-service portal, automated identity verification, reassessment of custody/licensing needs.
