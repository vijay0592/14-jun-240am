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

## Bug Fix Session (13 Jun 2026)
- **Fixed** missing `POST /api/voice/parse` endpoint (text-only voice parsing was not exposed via HTTP). Added in `server.py` right above `/voice/transcribe`. Reuses existing `parse_voice_order_with_items()` helper. Returns 400 on empty text.
- Verified with new realistic regression suite `/app/backend/tests/test_realistic_smoke_iter1.py` — 29/29 passing (auth, customers, products, orders, dispatch + same-day merge, payments, suppliers, ledger, settings, daily report, attestations, voice parse).
- Verified frontend smoke (login, role-based nav, all 11 protected routes, i18n EN<->HI, logout) — 100% green.
- Note: 15 failures in the legacy `tests/test_*.py` files are stale fixtures (hardcoded SEED_CUSTOMER_ID `c823afd1-...` and date 2026-06-12 that pre-date the current fresh seed). Not real bugs; superseded by `test_realistic_smoke_iter1.py`.

## Feature Add: Raw Materials Settings + Line-item Purchase (13 Jun 2026)
- **NEW Settings tab "Raw Material"** (admin-only) at `/admin/raw-materials` — CRUD for raw material inventory items (name, unit, default rate per unit, notes). i18n: en="Raw Material", hi="कच्चा माल". Reuses existing `/api/raw-materials` backend.
- **Purchase Center upgraded** — "Record purchase" dialog now mirrors how a Sale is recorded: line-item table with Raw Material dropdown (auto-fills unit + default rate), Qty, Unit, Rate, Line ₹, with auto-computed Total amount. Sum of line items is sent as the purchase amount; backend persists items[] with line_value=qty*rate.
- Each purchase row in the Purchase Center list now expands to show the raw-material line items beneath the supplier name.
- Validated: 15 new pytest cases + 29/29 regression suite still passing.

## Rename + New Tab: Vendor Price List (13 Jun 2026)
- **Renamed labels** (UI/i18n only, backend endpoints unchanged):
  - "Price Lists" → "Customer Price List" (en) / "ग्राहक मूल्य सूची" (hi). PriceLists.jsx H1 updated.
  - "Suppliers" → "Vendors" (en) / "विक्रेता" (hi). Suppliers.jsx H1 + Add/Edit/Delete dialog labels updated.
- **NEW Settings tab "Vendor Price List"** (admin-only) at `/admin/vendor-price-lists`:
  - Each price list is bound to a specific vendor (one vendor can have many lists, e.g. "Standard", "Bulk Q4").
  - Items inside a list are FREE-FORM (name + unit + price) — vendor catalog items don't have to match our SKU master.
  - Full CRUD on lists and on individual items, inline edit (onBlur autosave), cascade-delete items when list is removed.
- Backend: 6 new endpoints under `/api/vendor-price-lists` + `/{id}/items` (all mutations admin-only, reads open to any auth user).
- Validated: 16 new pytest + 44 regression = **60/60 backend tests passing**; frontend admin smoke (sidebar labels, page load, dialog, list create, item add) all green.
