# JK Products — Factory Order Management System

## Source
- Restored from GitHub: https://github.com/manoj592/13-JUN-8PM.git
- Date restored to /app: 13 Jun 2026 (this session)

## Tech Stack
- Backend: FastAPI + Motor (MongoDB) + JWT + bcrypt + RapidFuzz + openpyxl + emergentintegrations
- Frontend: React 19 + CRACO + Tailwind + Radix UI + cmdk + i18next + framer-motion + recharts

## What's implemented in /app today (running)
- Auth (JWT, admin + operator) with login attestation (location + selfie).
- Orders, Customers, Products, Dispatch Center, Dispatch Ledger / Single Party Ledger.
- Admin: Users, Settings, Price Lists, Login Attestations.
- Daily Report, voice order entry (Hinglish).
- Seeded: admin/admin123, user/user123, 15 products, 388 item SKUs.

## Iterations done in this session (13 Jun 2026)
1. Renamed "Settings" → "Overdue Threshold" in nav + page title (en/hi).
2. Same-day dispatches to same customer auto-merge into ONE slip (IST day boundary).
3. Bill Amount field no longer auto-filled — operator enters it manually.
4. Added per-customer "No. of bags" field on Daily Report (alongside Private Mark).
5. Made Mark + No. of bags inputs equal width; swapped order.
6. Dispatch slip print now shows Private Mark + No. of Bags in a new bordered box next to Bill/Cash box.
7. **Suppliers module** (NEW, admin only):
   - CRUD page at `/admin/suppliers` (name, phone, address, city, GST, contact person, material category, opening balance, notes).
   - Supplier ledger page at `/admin/suppliers/:id` with purchase + payment recording and running balance.
   - Backend: `/api/suppliers`, `/api/supplier-purchases`, `/api/supplier-payments`, `/api/supplier-ledger/:id`.
8. **Customer "Record Payment" extended** with payment_mode toggle:
   - **Cash received** (existing) — credits the customer's ledger.
   - **Paid to supplier on behalf** — credits the customer AND debits the chosen supplier's ledger (linked via `customer_payment_id`). Cascade-deletes the supplier mirror when the customer payment is deleted.
9. Sidebar: "Suppliers" nav added under Settings group (admin-only).

## Default Credentials (seeded)
- Admin: `admin` / `admin123`
- Operator: `user` / `user123`

## Prioritized backlog
- P1: Twilio WhatsApp receipts on payment save.
- P2: Bag count totals on Daily Report summary strip.
- P2: Split server.py (~3.3k lines) into routers.
- P2: Split DispatchLedger.jsx (~1.3k lines).

## Next tasks
- Awaiting user request.
