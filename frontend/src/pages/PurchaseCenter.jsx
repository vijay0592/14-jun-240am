import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, FileText, Building2, Search, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { api } from "@/lib/api";

const todayIso = () => new Date().toISOString().slice(0, 10);
const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-GB") : "—";

export default function PurchaseCenter() {
  const [suppliers, setSuppliers] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ supplier_id: "", q: "", start: "", end: "" });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    supplier_id: "", amount: "", bill_number: "", material: "", purchased_at: todayIso(), notes: "",
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // Load suppliers + walk every supplier's ledger to get all purchase rows.
      // (We don't have a global GET /supplier-purchases endpoint, so aggregate
      // client-side from the supplier ledger.)
      const r = await api.get("/suppliers");
      const supList = r.data || [];
      setSuppliers(supList);
      const all = [];
      for (const s of supList) {
        try {
          const led = await api.get(`/supplier-ledger/${s.id}`);
          for (const row of (led.data?.rows || [])) {
            if (row.kind === "purchase") {
              all.push({ ...row.raw, supplier_id: s.id, supplier_name: s.name });
            }
          }
        } catch { /* skip individual failures */ }
      }
      all.sort((a, b) => (b.purchased_at || "").localeCompare(a.purchased_at || ""));
      setPurchases(all);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load purchases");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = purchases.filter((p) => {
    if (filter.supplier_id && p.supplier_id !== filter.supplier_id) return false;
    if (filter.start && (p.purchased_at || "") < filter.start) return false;
    if (filter.end && (p.purchased_at || "") > filter.end + "T23:59:59") return false;
    const q = filter.q.trim().toLowerCase();
    if (q) {
      const hay = [p.supplier_name, p.material, p.bill_number, p.notes].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const totalAmount = filtered.reduce((s, p) => s + Number(p.amount || 0), 0);

  const openCreate = () => {
    setForm({
      supplier_id: suppliers[0]?.id || "",
      amount: "", bill_number: "", material: "", purchased_at: todayIso(), notes: "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.supplier_id) { toast.error("Pick a supplier"); return; }
    const amt = Number(form.amount);
    if (!amt || amt <= 0) { toast.error("Amount > 0"); return; }
    setSaving(true);
    try {
      await api.post("/supplier-purchases", { ...form, amount: amt });
      toast.success("Purchase recorded");
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to save");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4" data-testid="purchase-center-page">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#E65100] font-bold">
            Inbound · Vendor Material
          </div>
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
            Purchase Center
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Record material received from suppliers — each entry adds a debit to that supplier&apos;s ledger.
          </p>
        </div>
        <Button onClick={openCreate}
                disabled={suppliers.length === 0}
                data-testid="purchase-center-record-btn"
                className="bg-slate-900 hover:bg-slate-800 text-white rounded-sm h-10">
          <FileText className="w-4 h-4 mr-1" /> Record purchase
        </Button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end bg-orange-50/40 border border-orange-100 rounded-sm p-3">
        <div className="sm:col-span-4">
          <Label className="text-[10px] uppercase font-bold text-slate-500">Search</Label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={filter.q} onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
                   placeholder="Supplier, material, bill #"
                   data-testid="purchase-center-search"
                   className="pl-9 h-10 rounded-sm mt-1" />
          </div>
        </div>
        <div className="sm:col-span-3">
          <Label className="text-[10px] uppercase font-bold text-slate-500">Supplier</Label>
          <select value={filter.supplier_id}
                  onChange={(e) => setFilter((f) => ({ ...f, supplier_id: e.target.value }))}
                  data-testid="purchase-center-supplier-filter"
                  className="mt-1 w-full h-10 rounded-sm border border-slate-300 px-3 text-sm bg-white">
            <option value="">All suppliers</option>
            {suppliers.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label className="text-[10px] uppercase font-bold text-slate-500">From</Label>
          <Input type="date" value={filter.start}
                 onChange={(e) => setFilter((f) => ({ ...f, start: e.target.value }))}
                 className="h-10 rounded-sm mt-1" />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-[10px] uppercase font-bold text-slate-500">To</Label>
          <Input type="date" value={filter.end}
                 onChange={(e) => setFilter((f) => ({ ...f, end: e.target.value }))}
                 className="h-10 rounded-sm mt-1" />
        </div>
        <div className="sm:col-span-1 text-right">
          <div className="text-[10px] uppercase font-bold text-slate-500">Total</div>
          <div className="text-sm font-extrabold text-slate-900 tabular-nums">{fmt(totalAmount)}</div>
        </div>
      </div>

      <div className="border border-slate-200 rounded-sm overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-600 font-bold">
            <tr>
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Supplier</th>
              <th className="text-left px-3 py-2">Material</th>
              <th className="text-left px-3 py-2">Bill #</th>
              <th className="text-right px-3 py-2">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {loading && (<tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Loading…</td></tr>)}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500" data-testid="purchases-empty">
                {suppliers.length === 0
                  ? "Add a supplier first from Suppliers, then record a purchase."
                  : "No purchases match the current filters."}
              </td></tr>
            )}
            {!loading && filtered.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 hover:bg-orange-50/30" data-testid={`purchase-row-${p.id}`}>
                <td className="px-3 py-2 text-slate-600">
                  <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3 text-slate-400" />{fmtDate(p.purchased_at)}</span>
                </td>
                <td className="px-3 py-2">
                  <Link to={`/admin/suppliers/${p.supplier_id}`} className="font-bold text-slate-900 hover:text-[#E65100] inline-flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" /> {p.supplier_name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate-700">
                  {p.material || "—"}
                  {p.notes && <div className="text-[11px] italic text-slate-500 mt-0.5">{p.notes}</div>}
                </td>
                <td className="px-3 py-2 text-slate-500 font-mono text-xs">{p.bill_number || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold">{fmt(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Record purchase dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm max-w-md" data-testid="purchase-center-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">Record purchase</DialogTitle>
            <DialogDescription>Material received from a supplier — adds a debit to their ledger.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-bold uppercase">Supplier *</Label>
              <select value={form.supplier_id}
                      onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))}
                      data-testid="purchase-supplier-select"
                      className="mt-1 w-full h-11 rounded-sm border border-slate-300 px-3 text-sm bg-white">
                <option value="">— Pick a supplier —</option>
                {suppliers.map((s) => (<option key={s.id} value={s.id}>{s.name}{s.city ? ` · ${s.city}` : ""}</option>))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold uppercase">Amount (₹) *</Label>
                <Input type="number" min="0" step="0.01" value={form.amount}
                       onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                       placeholder="0.00"
                       data-testid="purchase-amount"
                       className="h-11 rounded-sm mt-1 tabular-nums" />
              </div>
              <div>
                <Label className="text-xs font-bold uppercase">Date</Label>
                <Input type="date" value={form.purchased_at}
                       onChange={(e) => setForm((f) => ({ ...f, purchased_at: e.target.value }))}
                       className="h-11 rounded-sm mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">Bill number</Label>
              <Input value={form.bill_number}
                     onChange={(e) => setForm((f) => ({ ...f, bill_number: e.target.value }))}
                     placeholder="e.g. INV-2026-001"
                     className="h-11 rounded-sm mt-1 font-mono" />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">Material</Label>
              <Input value={form.material}
                     onChange={(e) => setForm((f) => ({ ...f, material: e.target.value }))}
                     placeholder="e.g. 100kg MS rod 8mm"
                     className="h-11 rounded-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">Notes</Label>
              <Input value={form.notes}
                     onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                     className="h-11 rounded-sm mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-sm">Cancel</Button>
            <Button onClick={save} disabled={saving || !form.supplier_id || !form.amount}
                    data-testid="purchase-center-save"
                    className="bg-slate-900 hover:bg-slate-800 text-white rounded-sm">
              {saving ? "Saving…" : (<><Plus className="w-4 h-4 mr-1" /> Save purchase</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
