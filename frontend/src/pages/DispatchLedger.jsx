import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { useAuth } from "@/lib/auth";
import {
  ScrollText, RefreshCw, Filter, X,
  BookUser, ChevronRight, CheckCircle2, Check, ChevronsUpDown,
  Wallet, Trash2, ArrowDownToLine, ArrowUpFromLine, Pencil, Printer, FileText, Plus,
} from "lucide-react";

const fmtINR = (v) => Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

function fmtDateOnly(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  } catch { return iso; }
}

function todayIso() { return new Date().toISOString().slice(0, 10); }
function isoDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

const PAYMENT_SOURCES = ["cash", "upi", "bank_transfer", "neft", "rtgs", "cheque", "card", "adjustment", "other"];

function sourceLabel(t, src) {
  const map = {
    cash: t("ledger.sourceCash"),
    upi: t("ledger.sourceUpi"),
    bank_transfer: t("ledger.sourceBankTransfer"),
    neft: t("ledger.sourceNeft"),
    rtgs: t("ledger.sourceRtgs"),
    cheque: t("ledger.sourceCheque"),
    card: t("ledger.sourceCard"),
    adjustment: t("ledger.sourceAdjustment"),
    other: t("ledger.sourceOther"),
  };
  return map[src] || t("ledger.sourceOther");
}

// Searchable combobox for party selection — uses cmdk via shadcn Command.
function PartyCombobox({ customers, value, onChange, t }) {
  const [open, setOpen] = useState(false);
  const selected = customers.find((c) => c.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          data-testid="ledger-party-picker"
          className="w-full sm:w-2/3 justify-between h-10 rounded-sm border-slate-300 font-normal text-sm bg-white"
        >
          <span className={selected ? "text-slate-900 font-medium truncate" : "text-slate-400"}>
            {selected ? selected.name : `— ${t("ledger.filterPickParty")} —`}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 rounded-sm" align="start">
        <Command>
          <CommandInput placeholder={t("ledger.partySearchPlaceholder")}
                        data-testid="ledger-party-search-input"
                        className="h-10" />
          <CommandList>
            <CommandEmpty data-testid="ledger-party-search-empty">{t("ledger.partyNoMatch")}</CommandEmpty>
            <CommandGroup>
              {customers.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name} ${c.phone || ""} ${c.city || ""} ${c.private_mark || ""}`}
                  onSelect={() => { onChange(c.id); setOpen(false); }}
                  data-testid={`ledger-party-option-${c.id}`}
                  className="cursor-pointer"
                >
                  <Check className={`mr-2 h-4 w-4 ${value === c.id ? "opacity-100" : "opacity-0"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 truncate">{c.name}</div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {[c.phone, c.city, c.private_mark && `🏷️ ${c.private_mark}`].filter(Boolean).join(" · ") || " "}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function DispatchLedger() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [dispatches, setDispatches] = useState([]);
  const [payments, setPayments] = useState([]);
  const [dispatchMeta, setDispatchMeta] = useState({ total: 0, grand_total_value: 0, grand_total_pcs: 0 });
  const [paymentMeta, setPaymentMeta] = useState({ total: 0, total_amount: 0 });

  const [partyDraft, setPartyDraft] = useState({
    startDate: isoDaysAgo(90),
    endDate: todayIso(),
    partyId: "",
  });
  const [partyApplied, setPartyApplied] = useState(null);

  const [customers, setCustomers] = useState([]);

  // Payment dialog state
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentEditingId, setPaymentEditingId] = useState(null); // null = create, else PATCH this id
  const [paymentForm, setPaymentForm] = useState({
    amount: "", source: "cash", reference: "", paid_at: todayIso(), notes: "",
    payment_mode: "cash", paid_to_supplier_id: "",
  });
  const [savingPayment, setSavingPayment] = useState(false);
  const [suppliersForPayment, setSuppliersForPayment] = useState([]);

  // Row action popup state
  const [actionRow, setActionRow] = useState(null); // { kind, id, raw }

  // Slip preview state (single-tap on a dispatch row)
  const [slipRow, setSlipRow] = useState(null);

  // Long-press vs single-tap distinction on ledger rows
  const longPressTimer = useRef(null);
  const longPressFired = useRef(false);
  const pressOriginXY = useRef({ x: 0, y: 0 });
  const LONG_PRESS_MS = 500;

  const startPress = (e, r) => {
    longPressFired.current = false;
    pressOriginXY.current = { x: e.clientX || 0, y: e.clientY || 0 };
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setActionRow(r);
    }, LONG_PRESS_MS);
  };
  const endPress = (r) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (longPressFired.current) return; // long press already handled
    // Short tap → preview the slip (dispatch) or open edit popup (payment)
    if (r.kind === "dispatch") setSlipRow(r);
    else setActionRow(r);
  };
  const cancelPress = (e) => {
    // Cancel if user starts dragging / scrolling
    if (e && e.type === "pointermove") {
      const dx = Math.abs((e.clientX || 0) - pressOriginXY.current.x);
      const dy = Math.abs((e.clientY || 0) - pressOriginXY.current.y);
      if (dx < 8 && dy < 8) return;
    }
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressFired.current = true; // suppress click-as-tap
  };

  // Edit dispatch (sale) dialog state
  const [saleEditOpen, setSaleEditOpen] = useState(false);
  const [saleEditForm, setSaleEditForm] = useState({
    id: "", gr_number: "", transport_name: "", notes: "", total_value: "",
    items: [], // [{ item_id, item_name, quantity, unit_price, net_unit_price }]
    overrideTotal: false, // if true, send total_value override; else recompute from items
  });
  const [savingSale, setSavingSale] = useState(false);

  // Confirm-delete dialog state
  const [confirmDelete, setConfirmDelete] = useState(null); // { kind, id, label }
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!partyApplied) {
      setDispatches([]); setPayments([]);
      setDispatchMeta({ total: 0, grand_total_value: 0, grand_total_pcs: 0 });
      setPaymentMeta({ total: 0, total_amount: 0 });
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (partyApplied.startDate) params.set("start_date", partyApplied.startDate);
      if (partyApplied.endDate) params.set("end_date", partyApplied.endDate);
      params.set("customer_id", partyApplied.partyId);
      params.set("limit", "500");
      const [dRes, pRes] = await Promise.all([
        api.get(`/admin/dispatch-ledger?${params.toString()}`),
        api.get(`/payments?${params.toString()}`),
      ]);
      setDispatches(dRes.data.items || []);
      setDispatchMeta({
        total: dRes.data.total || 0,
        grand_total_value: dRes.data.grand_total_value || 0,
        grand_total_pcs: dRes.data.grand_total_pcs || 0,
      });
      setPayments(pRes.data.items || []);
      setPaymentMeta({
        total: pRes.data.total || 0,
        total_amount: pRes.data.total_amount || 0,
      });
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("common.failed"));
    } finally { setLoading(false); }
  }, [partyApplied, t]);

  useEffect(() => {
    api.get("/customers").then(({ data }) => setCustomers(data || [])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const applyPartyFilters = () => {
    if (!partyDraft.partyId) {
      toast.error(t("ledger.partyApplyPrompt"));
      return;
    }
    setPartyApplied({ ...partyDraft });
  };

  const resetPartyFilters = () => setPartyApplied(null);

  const customerOptions = useMemo(
    () => [...customers].sort((a, b) => a.name.localeCompare(b.name)),
    [customers],
  );

  const selectedParty = useMemo(
    () => customers.find((c) => c.id === partyApplied?.partyId) || null,
    [customers, partyApplied],
  );

  // Merge dispatches (Debit) + payments (Credit) into one chronological
  // ledger with a running balance (positive = party owes us money).
  const ledger = useMemo(() => {
    const tx = [];
    for (const d of dispatches) {
      tx.push({
        kind: "dispatch",
        id: d.id,
        when: d.dispatched_at,
        debit: Number(d.total_value || 0),
        credit: 0,
        raw: d,
      });
    }
    for (const p of payments) {
      tx.push({
        kind: "payment",
        id: p.id,
        when: p.paid_at,
        debit: 0,
        credit: Number(p.amount || 0),
        raw: p,
      });
    }
    tx.sort((a, b) => (a.when > b.when ? 1 : a.when < b.when ? -1 : 0));
    let bal = 0;
    return tx.map((r) => {
      bal = bal + r.debit - r.credit;
      return { ...r, balance: bal };
    });
  }, [dispatches, payments]);

  const totals = useMemo(() => {
    const debit = dispatches.reduce((s, d) => s + Number(d.total_value || 0), 0);
    const credit = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    return { debit, credit, outstanding: debit - credit };
  }, [dispatches, payments]);

  const openPaymentDialog = () => {
    setPaymentEditingId(null);
    setPaymentForm({
      amount: "", source: "cash", reference: "", paid_at: todayIso(), notes: "",
      payment_mode: "cash", paid_to_supplier_id: "",
    });
    // Lazy-load supplier list (for the "on behalf" picker)
    api.get("/suppliers").then((r) => setSuppliersForPayment(r.data || [])).catch(() => {});
    setPaymentOpen(true);
  };

  const openPaymentEditDialog = (p) => {
    setPaymentEditingId(p.id);
    setPaymentForm({
      amount: String(p.amount || ""),
      source: p.source || "cash",
      reference: p.reference || "",
      paid_at: (p.paid_at || "").slice(0, 10) || todayIso(),
      notes: p.notes || "",
      payment_mode: p.payment_mode || "cash",
      paid_to_supplier_id: p.paid_to_supplier_id || "",
    });
    setPaymentOpen(true);
  };

  const savePayment = async () => {
    if (!partyApplied?.partyId && !paymentEditingId) return;
    const amt = Number(paymentForm.amount);
    if (!amt || amt <= 0) {
      toast.error(t("ledger.paymentSaveFailed") + ": amount > 0");
      return;
    }
    if (paymentForm.payment_mode === "supplier_on_behalf" && !paymentForm.paid_to_supplier_id) {
      toast.error("Pick a supplier for the on-behalf payment");
      return;
    }
    setSavingPayment(true);
    try {
      if (paymentEditingId) {
        await api.patch(`/payments/${paymentEditingId}`, {
          amount: amt,
          source: paymentForm.source,
          reference: paymentForm.reference || "",
          paid_at: paymentForm.paid_at || todayIso(),
          notes: paymentForm.notes || "",
        });
      } else {
        await api.post("/payments", {
          customer_id: partyApplied.partyId,
          amount: amt,
          source: paymentForm.source,
          reference: paymentForm.reference || "",
          paid_at: paymentForm.paid_at || todayIso(),
          notes: paymentForm.notes || "",
          payment_mode: paymentForm.payment_mode || "cash",
          paid_to_supplier_id: paymentForm.payment_mode === "supplier_on_behalf"
            ? paymentForm.paid_to_supplier_id : null,
        });
      }
      toast.success(t("ledger.paymentSaved"));
      setPaymentOpen(false);
      setPaymentEditingId(null);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("ledger.paymentSaveFailed"));
    } finally { setSavingPayment(false); }
  };

  const openSaleEditDialog = (d) => {
    const items = (d.items || []).map((it) => ({
      item_id: it.item_id || "",
      item_name: it.item_name || "",
      product_name: it.product_name || "",
      variant: it.variant || "",
      quantity: String(it.quantity ?? ""),
      unit_price: String(it.unit_price ?? ""),
      net_unit_price: String(it.net_unit_price ?? it.unit_price ?? ""),
      discount_value: Number(it.discount_value || 0),
      discount_type: it.discount_type || "",
    }));
    setSaleEditForm({
      id: d.id,
      gr_number: d.gr_number || "",
      transport_name: d.transport_name || "",
      notes: d.notes || "",
      // Bill amount is operator-entered only — never auto-filled.
      // 0 / null ⇒ empty input prompting the user.
      total_value: Number(d.total_value || 0) > 0 ? String(d.total_value) : "",
      items,
      overrideTotal: false,
    });
    setSaleEditOpen(true);
  };

  // Recompute total from items (used by UI and on save when not overridden)
  const computedSaleTotal = useMemo(() => {
    const items = saleEditForm.items || [];
    return items.reduce((s, it) => {
      const q = parseFloat(it.quantity || "0") || 0;
      const net = parseFloat(it.net_unit_price !== "" ? it.net_unit_price : it.unit_price) || 0;
      return s + q * net;
    }, 0);
  }, [saleEditForm.items]);

  const updateSaleItem = (idx, patch) => {
    setSaleEditForm((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  };
  const addSaleItem = () => {
    setSaleEditForm((f) => ({
      ...f,
      items: [
        ...f.items,
        { item_id: "", item_name: "", product_name: "", variant: "",
          quantity: "1", unit_price: "0", net_unit_price: "0",
          discount_value: 0, discount_type: "" },
      ],
    }));
  };
  const removeSaleItem = (idx) => {
    setSaleEditForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  };

  const saveSaleEdit = async () => {
    if (!saleEditForm.id) return;
    // Validate items: at least one row with name + qty > 0
    const cleaned = (saleEditForm.items || []).filter(
      (it) => (it.item_name || "").trim() && (parseFloat(it.quantity || "0") || 0) > 0,
    );
    if (cleaned.length === 0) {
      toast.error("Add at least one item with a name and quantity > 0");
      return;
    }
    setSavingSale(true);
    try {
      const body = {
        gr_number: saleEditForm.gr_number,
        transport_name: saleEditForm.transport_name,
        notes: saleEditForm.notes,
        items: cleaned.map((it) => ({
          item_id: it.item_id || null,
          item_name: it.item_name.trim(),
          product_name: it.product_name || "",
          variant: it.variant || "",
          quantity: parseFloat(it.quantity || "0") || 0,
          unit_price: parseFloat(it.unit_price || "0") || 0,
          net_unit_price: parseFloat(
            it.net_unit_price !== "" ? it.net_unit_price : it.unit_price,
          ) || 0,
          discount_value: Number(it.discount_value || 0),
          discount_type: it.discount_type || "",
        })),
      };
      if (saleEditForm.overrideTotal && saleEditForm.total_value !== "" && !Number.isNaN(Number(saleEditForm.total_value))) {
        body.total_value = Number(saleEditForm.total_value);
      }
      await api.patch(`/dispatches/${saleEditForm.id}`, body);
      toast.success(t("ledger.saleUpdated"));
      setSaleEditOpen(false);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("ledger.saleUpdateFailed"));
    } finally { setSavingSale(false); }
  };

  const requestDelete = (row) => {
    // row = ledger merged row { kind, id, raw }
    const label = row.kind === "dispatch"
      ? `Sale #${row.id.slice(0, 8).toUpperCase()}`
      : `Payment #${row.id.slice(0, 8).toUpperCase()}`;
    setConfirmDelete({ kind: row.kind, id: row.id, label });
  };

  const confirmDeleteYes = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      if (confirmDelete.kind === "dispatch") {
        await api.delete(`/dispatches/${confirmDelete.id}`);
        toast.success(t("ledger.saleDeleted"));
      } else {
        await api.delete(`/payments/${confirmDelete.id}`);
        toast.success(t("ledger.paymentDeleted"));
      }
      setConfirmDelete(null);
      setActionRow(null);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("ledger.saleDeleteFailed"));
    } finally { setDeleting(false); }
  };

  const handleActionEdit = () => {
    if (!actionRow) return;
    if (actionRow.kind === "dispatch") {
      openSaleEditDialog(actionRow.raw);
    } else {
      openPaymentEditDialog(actionRow.raw);
    }
    setActionRow(null);
  };

  const handleActionDelete = () => {
    if (!actionRow) return;
    requestDelete(actionRow);
  };

  return (
    <div className="space-y-5" data-testid="dispatch-ledger-page">
      {/* Page header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#E65100] font-bold">{t("ledger.overline")}</div>
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900 flex items-center gap-2">
            <ScrollText className="w-7 h-7 text-[#E65100]" /> {t("ledger.title")}
          </h1>
          <p className="text-slate-500 text-sm mt-1">{t("ledger.subtitle")}</p>
        </div>
        {partyApplied && (
          <div className="flex items-center gap-2">
            <Button onClick={openPaymentDialog} data-testid="ledger-record-payment-btn"
                    className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-sm h-10">
              <Wallet className="w-4 h-4 mr-1.5" /> {t("ledger.recordPayment")}
            </Button>
            <Button onClick={load} variant="outline" size="sm" data-testid="ledger-refresh"
                    className="rounded-sm border-slate-300 h-10">
              <RefreshCw className="w-4 h-4 mr-1" /> {t("ledger.refresh")}
            </Button>
          </div>
        )}
      </div>

      {/* Picker card (pre-apply) OR applied-filter summary bar (post-apply) */}
      {partyApplied ? (
        <div className="bg-white border border-slate-200 rounded-sm p-3 flex items-center justify-between flex-wrap gap-3"
             data-testid="ledger-party-applied-bar">
          <div className="flex items-center gap-4 text-sm flex-wrap">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="font-bold text-slate-900">{selectedParty?.name || "—"}</span>
            </div>
            <div className="text-slate-500 tabular-nums">
              {partyApplied.startDate} → {partyApplied.endDate}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={resetPartyFilters}
                  data-testid="ledger-party-change-filters"
                  className="rounded-sm border-slate-300 h-9">
            <Filter className="w-3.5 h-3.5 mr-1.5" /> {t("ledger.partyChangeFilters")}
          </Button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-sm p-5 space-y-5"
             data-testid="ledger-party-picker-card">
          {/* Step 1 — Accounting period */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#E65100] text-white text-xs font-extrabold">1</span>
              <h3 className="font-heading font-extrabold text-slate-900 text-sm uppercase tracking-wide">{t("ledger.partyStep1")}</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-8">
              <div>
                <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-bold">{t("ledger.filterFrom")}</label>
                <Input type="date" value={partyDraft.startDate}
                       onChange={(e) => setPartyDraft((p) => ({ ...p, startDate: e.target.value }))}
                       data-testid="ledger-party-start-date"
                       className="h-10 rounded-sm mt-1" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-bold">{t("ledger.filterTo")}</label>
                <Input type="date" value={partyDraft.endDate}
                       onChange={(e) => setPartyDraft((p) => ({ ...p, endDate: e.target.value }))}
                       data-testid="ledger-party-end-date"
                       className="h-10 rounded-sm mt-1" />
              </div>
            </div>
          </div>
          {/* Step 2 — Searchable party combobox */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#E65100] text-white text-xs font-extrabold">2</span>
              <h3 className="font-heading font-extrabold text-slate-900 text-sm uppercase tracking-wide">{t("ledger.partyStep2")}</h3>
            </div>
            <div className="pl-8">
              <PartyCombobox
                customers={customerOptions}
                value={partyDraft.partyId}
                onChange={(id) => setPartyDraft((p) => ({ ...p, partyId: id }))}
                t={t}
              />
            </div>
          </div>
          {/* Apply CTA */}
          <div className="flex items-center justify-end pt-2 border-t border-slate-100">
            <Button onClick={applyPartyFilters}
                    disabled={!partyDraft.partyId}
                    data-testid="ledger-party-apply-btn"
                    className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm h-11 px-6 font-bold">
              {t("ledger.partyOK")} <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Summary tiles (only after apply) */}
      {partyApplied && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-sm p-3" data-testid="ledger-total-count">
            <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-bold">{t("ledger.totalLabel")}</div>
            <div className="text-2xl font-extrabold text-slate-900 tabular-nums mt-1">{dispatchMeta.total}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-sm p-3" data-testid="ledger-total-debit">
            <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-bold flex items-center gap-1">
              <ArrowDownToLine className="w-3 h-3 text-slate-700" /> {t("ledger.totalDebit")}
            </div>
            <div className="text-2xl font-extrabold text-slate-900 tabular-nums mt-1">₹{fmtINR(totals.debit)}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-sm p-3" data-testid="ledger-total-credit">
            <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-bold flex items-center gap-1">
              <ArrowUpFromLine className="w-3 h-3 text-emerald-700" /> {t("ledger.totalCredit")}
            </div>
            <div className="text-2xl font-extrabold text-emerald-700 tabular-nums mt-1">₹{fmtINR(totals.credit)}</div>
          </div>
          <div className={`border rounded-sm p-3 ${totals.outstanding >= 0 ? "bg-[#FFF4EC] border-[#FFA152]" : "bg-emerald-50 border-emerald-300"}`}
               data-testid="ledger-outstanding">
            <div className="text-[10px] uppercase tracking-[0.15em] font-bold"
                 style={{ color: totals.outstanding >= 0 ? "#9C3D00" : "#065F46" }}>
              {totals.outstanding >= 0 ? t("ledger.outstandingDue") : t("ledger.outstandingAdvance")}
            </div>
            <div className={`text-2xl font-extrabold tabular-nums mt-1 ${totals.outstanding >= 0 ? "text-[#E65100]" : "text-emerald-700"}`}>
              ₹{fmtINR(Math.abs(totals.outstanding))}
            </div>
          </div>
        </div>
      )}

      {/* Ledger body */}
      <div data-testid="ledger-party-view">
        {!partyApplied ? (
          <div className="bg-white border border-slate-200 rounded-sm p-10 text-center text-slate-400 text-sm"
               data-testid="ledger-party-prompt">
            <BookUser className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            {t("ledger.partyApplyPrompt")}
          </div>
        ) : loading ? (
          <div className="bg-white border border-slate-200 rounded-sm p-10 text-center text-slate-400 text-sm">
            {t("ledger.loading")}
          </div>
        ) : dispatches.length === 0 ? (
          // Per spec: "If no dispatch has occurred, show the message 'No
          // dispatch has been made to this party.'"
          <div className="bg-white border border-slate-200 rounded-sm" data-testid="ledger-no-dispatch-view">
            <div className="bg-slate-900 text-white px-5 py-4" data-testid="ledger-party-header">
              <div className="text-[10px] uppercase tracking-[0.15em] text-[#FFA152] font-bold">{t("ledger.title")}</div>
              <div className="font-heading text-xl font-extrabold tracking-wide">{selectedParty?.name || "—"}</div>
              <div className="text-xs text-slate-300 mt-1 space-x-3">
                {selectedParty?.phone && <span>📞 {selectedParty.phone}</span>}
                {selectedParty?.city && <span>📍 {selectedParty.city}</span>}
                {selectedParty?.transport_name && <span>🚚 {selectedParty.transport_name}</span>}
                {selectedParty?.private_mark && (
                  <span data-testid="ledger-party-private-mark">🏷️ {selectedParty.private_mark}</span>
                )}
              </div>
            </div>
            <div className="p-10 text-center text-slate-500" data-testid="ledger-party-empty">
              <BookUser className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <div className="text-base font-bold text-slate-700">{t("ledger.emptyParty")}</div>
              {payments.length > 0 && (
                <div className="mt-2 text-xs text-slate-500">
                  {t("ledger.totalCredit")}: <span className="font-bold text-emerald-700 tabular-nums">₹{fmtINR(totals.credit)}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-sm">
            {/* Party header banner */}
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between flex-wrap gap-3"
                 data-testid="ledger-party-header">
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-[#FFA152] font-bold">{t("ledger.title")}</div>
                <div className="font-heading text-xl font-extrabold tracking-wide">{selectedParty?.name || "—"}</div>
                <div className="text-xs text-slate-300 mt-1 space-x-3">
                  {selectedParty?.phone && <span>📞 {selectedParty.phone}</span>}
                  {selectedParty?.city && <span>📍 {selectedParty.city}</span>}
                  {selectedParty?.transport_name && <span>🚚 {selectedParty.transport_name}</span>}
                  {selectedParty?.private_mark && (
                    <span data-testid="ledger-party-private-mark">🏷️ {selectedParty.private_mark}</span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 mt-2 tabular-nums">
                  {t("ledger.filterFrom")}: {partyApplied.startDate} · {t("ledger.filterTo")}: {partyApplied.endDate}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.15em] text-slate-300">{t("ledger.closingBalance")}</div>
                <div className={`font-extrabold tabular-nums text-2xl ${totals.outstanding >= 0 ? "text-[#FFA152]" : "text-emerald-400"}`}
                     data-testid="ledger-closing-balance">
                  ₹{fmtINR(Math.abs(totals.outstanding))}
                  <span className="text-xs ml-1 font-medium opacity-80">{totals.outstanding >= 0 ? "Dr" : "Cr"}</span>
                </div>
              </div>
            </div>

            {/* Combined Debit / Credit ledger table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b-2 border-slate-900">
                  <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-slate-600 font-bold">
                    <th className="px-3 py-2.5 border-r border-slate-200">{t("ledger.colDate")}</th>
                    <th className="px-3 py-2.5 border-r border-slate-200">{t("ledger.colBillNo")} / {t("ledger.colReceiptNo")}</th>
                    <th className="px-3 py-2.5 border-r border-slate-200">{t("ledger.colParticulars")}</th>
                    <th className="px-3 py-2.5 text-right border-r border-slate-200" title={t("ledger.debitTooltip")}>
                      {t("ledger.colDebit")} · {t("ledger.colDebitHint")}
                    </th>
                    <th className="px-3 py-2.5 text-right border-r border-slate-200" title={t("ledger.creditTooltip")}>
                      {t("ledger.colCredit")} · {t("ledger.colCreditHint")}
                    </th>
                    <th className="px-3 py-2.5 text-right border-r border-slate-200">{t("ledger.colRunning")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* Opening row */}
                  <tr className="bg-slate-50/60">
                    <td className="bg-slate-50/60" colSpan={5}>
                      <div className="px-3 py-2 text-xs italic text-slate-500">{t("ledger.openingBalance")}</div>
                    </td>
                    <td className="bg-slate-50/60 px-3 py-2 text-right tabular-nums text-slate-500 border-r border-slate-200">₹0</td>
                  </tr>

                  {ledger.map((r) => {
                    const isDispatch = r.kind === "dispatch";
                    return (
                      <tr key={`${r.kind}-${r.id}`}
                          onPointerDown={(e) => startPress(e, r)}
                          onPointerUp={() => endPress(r)}
                          onPointerLeave={cancelPress}
                          onPointerCancel={cancelPress}
                          onPointerMove={cancelPress}
                          onContextMenu={(e) => { e.preventDefault(); cancelPress(); setActionRow(r); }}
                          className={`${isDispatch ? "hover:bg-amber-50" : "hover:bg-emerald-50/50"} cursor-pointer group select-none`}
                          style={{ touchAction: "manipulation", WebkitTouchCallout: "none" }}
                          data-testid={isDispatch ? `ledger-party-row-${r.id}` : `ledger-payment-row-${r.id}`}>
                        <td className="px-3 py-3 align-top whitespace-nowrap border-r border-slate-100">
                          <div className="text-slate-900 font-medium tabular-nums">{fmtDateOnly(r.when)}</div>
                        </td>
                        <td className="px-3 py-3 align-top font-mono font-bold text-slate-900 border-r border-slate-100">
                          {isDispatch
                            ? (r.raw.slip_no ?? r.id.slice(0, 8).toUpperCase())
                            : (r.raw.receipt_no ?? r.id.slice(0, 8).toUpperCase())}
                        </td>
                        <td className="px-3 py-3 align-top border-r border-slate-100">
                          {isDispatch ? (
                            <div className="text-xs font-bold uppercase tracking-wide text-slate-700"
                                 data-testid={`particulars-sale-${r.id}`}>
                              {t("ledger.txTypeDispatch")}
                            </div>
                          ) : (
                            <div>
                              <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                                {t("ledger.txTypePayment")} · {sourceLabel(t, r.raw.source)}
                              </div>
                              {r.raw.reference && (
                                <div className="text-[11px] text-slate-500 mt-0.5">Ref: {r.raw.reference}</div>
                              )}
                              {r.raw.notes && (
                                <div className="text-[11px] text-slate-500 mt-0.5 italic">{r.raw.notes}</div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top text-right tabular-nums border-r border-slate-100">
                          {isDispatch ? (
                            <span className="inline-flex items-center gap-1 font-bold text-slate-900" data-testid={`row-debit-${r.id}`}>
                              ₹{fmtINR(r.debit)}
                              <span className="text-[9px] font-extrabold px-1 py-0.5 rounded-sm bg-slate-200 text-slate-700">Dr</span>
                            </span>
                          ) : (
                            <span className="text-slate-200">·</span>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top text-right tabular-nums border-r border-slate-100">
                          {!isDispatch ? (
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-700" data-testid={`row-credit-${r.id}`}>
                              ₹{fmtINR(r.credit)}
                              <span className="text-[9px] font-extrabold px-1 py-0.5 rounded-sm bg-emerald-100 text-emerald-800">Cr</span>
                            </span>
                          ) : (
                            <span className="text-slate-200">·</span>
                          )}
                        </td>
                        <td className={`px-3 py-3 align-top text-right tabular-nums font-extrabold border-r border-slate-100 ${r.balance >= 0 ? "text-[#E65100]" : "text-emerald-700"}`}
                            data-testid={`ledger-running-${r.id}`}>
                          ₹{fmtINR(Math.abs(r.balance))}
                          <span className="text-[9px] ml-1 opacity-70">{r.balance >= 0 ? "Dr" : "Cr"}</span>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Closing row */}
                  <tr className={`text-white ${totals.outstanding >= 0 ? "bg-[#E65100]" : "bg-emerald-700"}`}>
                    <td colSpan={3} className="px-3 py-3 font-extrabold uppercase tracking-[0.15em] text-sm border-r border-orange-300">
                      {t("ledger.closingBalance")}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-extrabold border-r border-orange-300">
                      ₹{fmtINR(totals.debit)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-extrabold border-r border-orange-300">
                      ₹{fmtINR(totals.credit)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-extrabold text-lg border-r border-orange-300">
                      ₹{fmtINR(Math.abs(totals.outstanding))} <span className="text-xs opacity-80">{totals.outstanding >= 0 ? "Dr" : "Cr"}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ===================== Record / Edit Payment Dialog ===================== */}
      <Dialog open={paymentOpen} onOpenChange={(o) => { setPaymentOpen(o); if (!o) setPaymentEditingId(null); }}>
        <DialogContent className="rounded-sm max-w-lg" data-testid="payment-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              {paymentEditingId
                ? <><Pencil className="w-5 h-5 text-emerald-700" /> {t("ledger.editPaymentTitle")}</>
                : <><Wallet className="w-5 h-5 text-emerald-700" /> {t("ledger.paymentDialogTitle")}</>}
            </DialogTitle>
            <DialogDescription>
              {paymentEditingId
                ? t("ledger.editPaymentSubtitle", { name: selectedParty?.name || "—" })
                : t("ledger.paymentDialogSubtitle", { name: selectedParty?.name || "—" })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Payment Mode toggle — cash vs paid-to-supplier-on-behalf.
                Only shown for NEW payments; editing keeps the original mode. */}
            {!paymentEditingId && (
              <div>
                <Label className="text-xs font-bold uppercase">Payment mode</Label>
                <div className="grid grid-cols-2 gap-2 mt-1" data-testid="payment-mode-group">
                  <button
                    type="button"
                    data-testid="payment-mode-cash"
                    onClick={() => setPaymentForm((p) => ({ ...p, payment_mode: "cash", paid_to_supplier_id: "" }))}
                    className={`h-11 rounded-sm border-2 text-sm font-bold transition-colors ${
                      paymentForm.payment_mode === "cash"
                        ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >Cash received</button>
                  <button
                    type="button"
                    data-testid="payment-mode-supplier"
                    onClick={() => setPaymentForm((p) => ({ ...p, payment_mode: "supplier_on_behalf" }))}
                    className={`h-11 rounded-sm border-2 text-sm font-bold transition-colors ${
                      paymentForm.payment_mode === "supplier_on_behalf"
                        ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >Paid to supplier on behalf</button>
                </div>
              </div>
            )}
            {!paymentEditingId && paymentForm.payment_mode === "supplier_on_behalf" && (
              <div>
                <Label className="text-xs font-bold uppercase">Supplier</Label>
                <select
                  value={paymentForm.paid_to_supplier_id}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, paid_to_supplier_id: e.target.value }))}
                  data-testid="payment-supplier-select"
                  className="mt-1 w-full h-11 rounded-sm border border-slate-300 px-3 text-sm bg-white"
                >
                  <option value="">— Pick a supplier —</option>
                  {suppliersForPayment.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.city ? ` · ${s.city}` : ""}</option>
                  ))}
                </select>
                {suppliersForPayment.length === 0 && (
                  <div className="text-[11px] text-slate-500 mt-1">No suppliers yet — add one from Admin → Suppliers.</div>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold uppercase">{t("ledger.paymentAmount")}</Label>
                <Input type="number" min="0" step="0.01" value={paymentForm.amount}
                       onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value }))}
                       placeholder="0.00"
                       data-testid="payment-amount-input"
                       className="h-11 rounded-sm mt-1 tabular-nums" />
              </div>
              <div>
                <Label className="text-xs font-bold uppercase">{t("ledger.paymentDate")}</Label>
                <Input type="date" value={paymentForm.paid_at}
                       onChange={(e) => setPaymentForm((p) => ({ ...p, paid_at: e.target.value }))}
                       data-testid="payment-date-input"
                       className="h-11 rounded-sm mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">{t("ledger.paymentSource")}</Label>
              <select value={paymentForm.source}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, source: e.target.value }))}
                      data-testid="payment-source-select"
                      className="mt-1 w-full h-11 rounded-sm border border-slate-300 px-3 text-sm bg-white">
                {PAYMENT_SOURCES.map((s) => (
                  <option key={s} value={s}>{sourceLabel(t, s)}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">{t("ledger.paymentReference")}</Label>
              <Input value={paymentForm.reference}
                     onChange={(e) => setPaymentForm((p) => ({ ...p, reference: e.target.value }))}
                     placeholder={t("ledger.paymentReferenceHint")}
                     data-testid="payment-reference-input"
                     className="h-11 rounded-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">{t("ledger.paymentNotes")}</Label>
              <Input value={paymentForm.notes}
                     onChange={(e) => setPaymentForm((p) => ({ ...p, notes: e.target.value }))}
                     placeholder="—"
                     data-testid="payment-notes-input"
                     className="h-11 rounded-sm mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)} className="rounded-sm">
              {t("ledger.closeBtn")}
            </Button>
            <Button onClick={savePayment} disabled={savingPayment || !paymentForm.amount}
                    data-testid="payment-save-btn"
                    className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-sm">
              <Wallet className="w-4 h-4 mr-1" /> {t("ledger.paymentSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== Row Action Popup (Edit / Delete) ===================== */}
      <Dialog open={!!actionRow} onOpenChange={(o) => { if (!o) setActionRow(null); }}>
        <DialogContent className="rounded-sm max-w-sm" data-testid="action-popup">
          <DialogHeader>
            <DialogTitle className="font-heading">{t("ledger.rowAction")}</DialogTitle>
            <DialogDescription asChild>
              <div>
                {actionRow?.kind === "dispatch"
                  ? <>SALE · <span className="font-mono font-bold">{actionRow?.raw?.slip_no ?? actionRow?.id?.slice(0,8).toUpperCase()}</span> · ₹{fmtINR(actionRow?.raw?.total_value)}</>
                  : <>PAYMENT · <span className="font-mono font-bold">{actionRow?.raw?.receipt_no ?? actionRow?.id?.slice(0,8).toUpperCase()}</span> · ₹{fmtINR(actionRow?.raw?.amount)}</>
                }
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button onClick={handleActionEdit} data-testid="action-edit-btn"
                    className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm h-12 font-bold text-base">
              <Pencil className="w-4 h-4 mr-2" /> {t("ledger.rowEdit")}
            </Button>
            <Button onClick={handleActionDelete} data-testid="action-delete-btn"
                    disabled={!isAdmin}
                    title={!isAdmin ? "Admin only" : undefined}
                    className="bg-rose-700 hover:bg-rose-800 text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-sm h-12 font-bold text-base">
              <Trash2 className="w-4 h-4 mr-2" /> {t("ledger.rowDelete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===================== Slip Preview Dialog (single-tap on dispatch row) ===================== */}
      <Dialog open={!!slipRow} onOpenChange={(o) => { if (!o) setSlipRow(null); }}>
        <DialogContent
          className="rounded-sm max-w-2xl max-h-[90vh] overflow-y-auto p-0"
          data-testid="slip-preview-dialog"
        >
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-200 no-print">
            <DialogTitle className="font-heading flex items-center gap-2 text-slate-900">
              <FileText className="w-5 h-5 text-[#E65100]" /> Dispatch Slip
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Preview · Tap <span className="font-bold">Print</span> to save / print this slip.
              Long-press a row in the ledger to Edit or Delete it instead.
            </DialogDescription>
          </DialogHeader>

          {slipRow && (
            <div id="slip-print-area" className="px-6 py-5 print-target bg-white">
              {/* Slip header */}
              <div className="flex items-start justify-between border-b-2 border-slate-900 pb-3 mb-3">
                <div>
                  <div className="font-heading text-xl font-extrabold text-slate-900 leading-tight">Dispatch Slip</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Two-wheeler spare parts</div>
                </div>
                <div className="text-right text-[11px] text-slate-700">
                  <div><span className="font-bold">Slip #:</span> <span className="font-mono">{slipRow.raw.slip_no ?? slipRow.id.slice(0,8).toUpperCase()}</span></div>
                  <div><span className="font-bold">Date:</span> {fmtDateOnly(slipRow.when)}</div>
                  {slipRow.raw.gr_number && (
                    <div><span className="font-bold">GR No.:</span> <span className="font-mono">{slipRow.raw.gr_number}</span></div>
                  )}
                </div>
              </div>

              {/* Party info */}
              <div className="grid grid-cols-2 gap-3 text-[12px] text-slate-800 mb-4">
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Party</div>
                  <div className="font-bold text-slate-900">{slipRow.raw.customer_name || selectedParty?.name || "—"}</div>
                  {selectedParty?.phone && <div className="text-[11px]">📞 {selectedParty.phone}</div>}
                  {selectedParty?.city && <div className="text-[11px]">📍 {[selectedParty.city, selectedParty.location].filter(Boolean).join(", ")}</div>}
                  {selectedParty?.address && <div className="text-[11px] text-slate-500">{selectedParty.address}</div>}
                </div>
                <div className="text-right">
                  <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Transport</div>
                  <div className="font-bold text-slate-900">{slipRow.raw.transport_name || selectedParty?.transport_name || "—"}</div>
                  {slipRow.raw.dispatched_by && (
                    <div className="text-[11px] text-slate-500 mt-1">Dispatched by · {slipRow.raw.dispatched_by}</div>
                  )}
                </div>
              </div>

              {/* Items table */}
              <table className="w-full text-[12px] border border-slate-300 mb-3">
                <thead>
                  <tr className="bg-slate-100 text-[10px] uppercase tracking-wider text-slate-700 font-bold">
                    <th className="border border-slate-300 px-2 py-1.5 text-left">Item</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-right w-14">Qty</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-right w-20">Net ₹</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-right w-24">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(slipRow.raw.items || []).map((it, i) => {
                    const qty = Number(it.quantity || 0);
                    const unit = Number(it.unit_price || 0);
                    const net = Number(it.net_unit_price || unit);
                    const line = Number(it.line_value || (net * qty));
                    return (
                      <tr key={i} className="align-top">
                        <td className="border border-slate-300 px-2 py-1.5">
                          <div className="font-bold text-slate-900">{it.item_name}</div>
                          {it.product_name && it.product_name !== it.item_name && (
                            <div className="text-[10px] text-slate-500">{it.product_name}</div>
                          )}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums font-bold">{qty}</td>
                        <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums font-bold">{fmtINR(net)}</td>
                        <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums font-bold text-[#E65100]">{fmtINR(line)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {(() => {
                  const billAmount = Number(slipRow.raw.total_value || 0);
                  const lineAmount = (slipRow.raw.items || []).reduce((s, it) => {
                    const qty = Number(it.quantity || 0);
                    const net = Number(it.net_unit_price || it.unit_price || 0);
                    return s + (Number(it.line_value) || net * qty);
                  }, 0);
                  const gst = Math.round(billAmount * (1 - 0.8474));
                  const grandTotal = Math.round(lineAmount + gst);
                  return (
                    <tfoot>
                      <tr className="bg-slate-50 border-t border-slate-300">
                        <td className="border border-slate-300 px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-700" colSpan={3}>
                          Total amount
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums font-bold text-slate-900">
                          ₹{fmtINR(lineAmount)}
                        </td>
                      </tr>
                      <tr className="bg-slate-50">
                        <td className="border border-slate-300 px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-700" colSpan={3}>
                          GST
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-right tabular-nums font-bold text-slate-900">
                          ₹{gst.toLocaleString("en-IN")}
                        </td>
                      </tr>
                      <tr className="bg-orange-50 border-t-2 border-orange-300">
                        <td className="border border-slate-300 px-2 py-2 text-xs font-bold uppercase tracking-wider">Grand Total</td>
                        <td className="border border-slate-300 px-2 py-2 text-right tabular-nums font-extrabold">{slipRow.raw.total_pcs || 0}</td>
                        <td className="border border-slate-300"></td>
                        <td className="border border-slate-300 px-2 py-2 text-right tabular-nums font-extrabold text-[#E65100] text-base">
                          ₹{grandTotal.toLocaleString("en-IN")}/-
                        </td>
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>

              {/* Bill amount + Cash amount grouped in a single bordered box */}
              {(() => {
                const billAmount = Number(slipRow.raw.total_value || 0);
                const lineAmount = (slipRow.raw.items || []).reduce((s, it) => {
                  const qty = Number(it.quantity || 0);
                  const net = Number(it.net_unit_price || it.unit_price || 0);
                  return s + (Number(it.line_value) || net * qty);
                }, 0);
                const gst = Math.round(billAmount * (1 - 0.8474));
                const grandTotal = Math.round(lineAmount + gst);
                const cashAmount = Math.max(0, grandTotal - billAmount);
                const privateMark = selectedParty?.private_mark || "";
                const bagCount = Number(slipRow.raw.bag_count || 0);
                return (
                  <div className="flex flex-wrap items-start gap-3 mb-3">
                    <div className="inline-block border-2 border-slate-400 rounded-sm divide-y divide-slate-300">
                      <div className="px-3 py-2 flex items-center justify-between gap-6">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Bill amount</span>
                        <span className="tabular-nums font-bold text-slate-900">₹{fmtINR(billAmount)}/-</span>
                      </div>
                      <div className="px-3 py-2 flex items-center justify-between gap-6">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Cash amount</span>
                        <span className="tabular-nums font-bold text-slate-900">₹{cashAmount.toLocaleString("en-IN")}/-</span>
                      </div>
                    </div>
                    {/* Private Mark (top) + No. of Bags (bottom) */}
                    <div className="inline-block border-2 border-slate-400 rounded-sm divide-y divide-slate-300" data-testid="slip-mark-bags-box">
                      <div className="px-3 py-2 flex items-center justify-between gap-6">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Private mark</span>
                        <span className="font-bold text-slate-900" data-testid="slip-private-mark">{privateMark || "—"}</span>
                      </div>
                      <div className="px-3 py-2 flex items-center justify-between gap-6">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-700">No. of bags</span>
                        <span className="tabular-nums font-bold text-slate-900" data-testid="slip-bag-count">{bagCount > 0 ? bagCount : "—"}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {slipRow.raw.notes && (
                <div className="text-[11px] text-slate-600 italic border-t border-slate-200 pt-2">
                  <span className="font-bold not-italic">Notes:</span> {slipRow.raw.notes}
                </div>
              )}

              <div className="mt-6 pt-3 border-t border-dashed border-slate-300 flex justify-between text-[10px] text-slate-500">
                <div>Customer signature: ____________________</div>
              </div>
            </div>
          )}

          <DialogFooter className="px-5 py-3 border-t border-slate-200 bg-slate-50 no-print gap-2">
            <Button
              variant="outline"
              onClick={() => setSlipRow(null)}
              data-testid="slip-close-btn"
              className="rounded-sm"
            >
              <X className="w-4 h-4 mr-1" /> Close
            </Button>
            <Button
              onClick={() => {
                document.body.classList.add("printing-slip");
                const cleanup = () => {
                  document.body.classList.remove("printing-slip");
                  window.removeEventListener("afterprint", cleanup);
                };
                window.addEventListener("afterprint", cleanup);
                setTimeout(() => window.print(), 50);
              }}
              data-testid="slip-print-btn"
              className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm"
            >
              <Printer className="w-4 h-4 mr-1.5" /> Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== Confirm Delete Dialog ===================== */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <DialogContent className="rounded-sm max-w-md" data-testid="confirm-delete-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-rose-700 flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> {t("ledger.confirmDeleteTitle")}
            </DialogTitle>
            <DialogDescription asChild>
              <div>
                <div className="text-slate-700">{t("ledger.confirmDeleteBody")}</div>
                {confirmDelete && (
                  <div className="mt-3 px-3 py-2 bg-rose-50 border border-rose-200 rounded-sm text-rose-900 font-mono font-bold text-sm">
                    {confirmDelete.label}
                  </div>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}
                    data-testid="confirm-delete-no" className="rounded-sm">
              <X className="w-4 h-4 mr-1" /> {t("ledger.confirmNo")}
            </Button>
            <Button onClick={confirmDeleteYes} disabled={deleting}
                    data-testid="confirm-delete-yes"
                    className="bg-rose-700 hover:bg-rose-800 text-white rounded-sm">
              <Trash2 className="w-4 h-4 mr-1" /> {t("ledger.confirmYes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== Edit Sale Dialog ===================== */}
      <Dialog open={saleEditOpen} onOpenChange={setSaleEditOpen}>
        <DialogContent className="rounded-sm max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="edit-sale-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Pencil className="w-5 h-5 text-[#E65100]" /> {t("ledger.editSaleTitle")}
            </DialogTitle>
            <DialogDescription>{t("ledger.editSaleSubtitle")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Header fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold uppercase">{t("ledger.grNumber")}</Label>
                <Input value={saleEditForm.gr_number}
                       onChange={(e) => setSaleEditForm((f) => ({ ...f, gr_number: e.target.value }))}
                       data-testid="edit-sale-gr-input"
                       className="h-11 rounded-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs font-bold uppercase">{t("ledger.transport")}</Label>
                <Input value={saleEditForm.transport_name}
                       onChange={(e) => setSaleEditForm((f) => ({ ...f, transport_name: e.target.value }))}
                       data-testid="edit-sale-transport-input"
                       className="h-11 rounded-sm mt-1" />
              </div>
            </div>

            {/* Items editor */}
            <div className="border border-slate-200 rounded-sm">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                <div className="font-heading font-bold text-slate-900 text-sm">Items</div>
                <div className="text-[11px] text-slate-500">Edit name, quantity, or price. Use ＋ to add a new line.</div>
                <Button
                  size="sm"
                  onClick={addSaleItem}
                  data-testid="edit-sale-add-item-btn"
                  className="ml-auto bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm h-8 px-3 text-xs font-bold"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add item
                </Button>
              </div>

              <div className="divide-y divide-slate-100">
                {(saleEditForm.items || []).length === 0 && (
                  <div className="px-3 py-6 text-center text-xs text-slate-400">
                    No items. Click <span className="font-bold">Add item</span> to add one.
                  </div>
                )}
                {(saleEditForm.items || []).map((it, idx) => {
                  const q = parseFloat(it.quantity || "0") || 0;
                  const net = parseFloat(it.net_unit_price !== "" ? it.net_unit_price : it.unit_price) || 0;
                  const lineVal = q * net;
                  return (
                    <div
                      key={idx}
                      className="px-3 py-2.5 grid grid-cols-12 gap-2 items-center"
                      data-testid={`edit-sale-item-row-${idx}`}
                    >
                      <div className="col-span-12 sm:col-span-7">
                        <Label className="text-[10px] uppercase font-bold text-slate-500">Item name</Label>
                        <Input
                          value={it.item_name}
                          onChange={(e) => updateSaleItem(idx, { item_name: e.target.value })}
                          placeholder="e.g. Center Stand Pin 8mm"
                          data-testid={`edit-sale-item-name-${idx}`}
                          className="h-9 rounded-sm mt-0.5"
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <Label className="text-[10px] uppercase font-bold text-slate-500">Qty</Label>
                        <Input
                          type="number" min="0" step="1"
                          value={it.quantity}
                          onChange={(e) => updateSaleItem(idx, { quantity: e.target.value })}
                          onFocus={(e) => { if (parseFloat(it.quantity || "0") === 0) updateSaleItem(idx, { quantity: "" }); e.target.select(); }}
                          onBlur={() => { if (it.quantity === "" || it.quantity === "-") updateSaleItem(idx, { quantity: "0" }); }}
                          data-testid={`edit-sale-item-qty-${idx}`}
                          className="no-spinner h-9 rounded-sm mt-0.5 font-mono-num text-right"
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <Label className="text-[10px] uppercase font-bold text-slate-500">Price ₹</Label>
                        <Input
                          type="number" min="0" step="0.01"
                          value={it.net_unit_price}
                          onChange={(e) => updateSaleItem(idx, { net_unit_price: e.target.value, unit_price: e.target.value })}
                          onFocus={(e) => { if (parseFloat(it.net_unit_price || "0") === 0) updateSaleItem(idx, { net_unit_price: "", unit_price: "" }); e.target.select(); }}
                          onBlur={() => { if (it.net_unit_price === "" || it.net_unit_price === "-") updateSaleItem(idx, { net_unit_price: "0", unit_price: "0" }); }}
                          data-testid={`edit-sale-item-price-${idx}`}
                          className="no-spinner h-9 rounded-sm mt-0.5 font-mono-num text-right"
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-1 flex sm:flex-col items-center sm:items-end justify-between sm:justify-end gap-1">
                        <div className="text-[10px] uppercase font-bold text-slate-500 sm:hidden">Line</div>
                        <div className="text-xs font-extrabold text-[#E65100] font-mono-num">
                          ₹{fmtINR(lineVal)}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSaleItem(idx)}
                          data-testid={`edit-sale-item-remove-${idx}`}
                          className="h-7 w-7 p-0 text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Totals strip */}
              <div className="px-3 py-2.5 bg-orange-50 border-t border-orange-200 flex items-center justify-between text-sm">
                <div className="text-xs text-slate-600">
                  <span className="font-bold text-slate-900">Auto total:</span>{" "}
                  <span className="font-mono-num font-extrabold text-[#E65100]" data-testid="edit-sale-computed-total">
                    ₹{fmtINR(computedSaleTotal)}
                  </span>
                </div>
                <label className="flex items-center gap-2 text-[11px] text-slate-700">
                  <input
                    type="checkbox"
                    checked={saleEditForm.overrideTotal}
                    onChange={(e) => setSaleEditForm((f) => ({ ...f, overrideTotal: e.target.checked }))}
                    data-testid="edit-sale-override-total-cb"
                  />
                  Override total manually
                </label>
              </div>
              {saleEditForm.overrideTotal && (
                <div className="px-3 py-2 border-t border-slate-100">
                  <Label className="text-[10px] uppercase font-bold text-slate-500">Bill amount (override)</Label>
                  <Input
                    type="number" min="0" step="0.01"
                    value={saleEditForm.total_value}
                    onChange={(e) => setSaleEditForm((f) => ({ ...f, total_value: e.target.value }))}
                    onFocus={(e) => { if (parseFloat(saleEditForm.total_value || "0") === 0) setSaleEditForm((f) => ({ ...f, total_value: "" })); e.target.select(); }}
                    onBlur={() => { if (saleEditForm.total_value === "" || saleEditForm.total_value === "-") setSaleEditForm((f) => ({ ...f, total_value: "0" })); }}
                    data-testid="edit-sale-amount-input"
                    className="no-spinner h-10 rounded-sm mt-1 tabular-nums"
                  />
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs font-bold uppercase">{t("ledger.notesLabel")}</Label>
              <Input value={saleEditForm.notes}
                     onChange={(e) => setSaleEditForm((f) => ({ ...f, notes: e.target.value }))}
                     data-testid="edit-sale-notes-input"
                     className="h-11 rounded-sm mt-1" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSaleEditOpen(false)} className="rounded-sm">
              <X className="w-4 h-4 mr-1" /> {t("ledger.closeBtn")}
            </Button>
            <Button onClick={saveSaleEdit} disabled={savingSale}
                    data-testid="edit-sale-save-btn"
                    className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm">
              <Pencil className="w-4 h-4 mr-1" /> {t("ledger.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
