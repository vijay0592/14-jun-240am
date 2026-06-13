import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, FileText, Building2, Search, Calendar, Trash2, Boxes, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { api } from "@/lib/api";

const todayIso = () => new Date().toISOString().slice(0, 10);
const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-GB") : "—";

const EMPTY_LINE = { raw_material_id: "", name: "", unit: "", quantity: "", rate: "" };

export default function PurchaseCenter() {
  const [suppliers, setSuppliers] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ supplier_id: "", q: "", start: "", end: "" });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    supplier_id: "", bill_number: "", purchased_at: todayIso(), notes: "",
    items: [{ ...EMPTY_LINE }],
  });
  const [saving, setSaving] = useState(false);

  // Vendor (supplier) search — same UX as Dispatch Center customer picker
  const [vendorQuery, setVendorQuery] = useState("");
  const [showVendorSuggest, setShowVendorSuggest] = useState(false);
  const vendorPickerRef = useRef(null);

  // Close the vendor suggestion dropdown when the user clicks outside it
  useEffect(() => {
    const onDoc = (e) => {
      if (vendorPickerRef.current && !vendorPickerRef.current.contains(e.target)) {
        setShowVendorSuggest(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filteredVendors = useMemo(() => {
    const q = vendorQuery.trim().toLowerCase();
    if (!q) return suppliers.slice(0, 12);
    return suppliers.filter((s) =>
      [s.name, s.phone, s.material_category, s.contact_person]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    ).slice(0, 12);
  }, [suppliers, vendorQuery]);

  const selectedVendor = useMemo(
    () => suppliers.find((s) => s.id === form.supplier_id) || null,
    [suppliers, form.supplier_id],
  );

  const pickVendor = (v) => {
    setForm((f) => ({ ...f, supplier_id: v.id }));
    setVendorQuery("");
    setShowVendorSuggest(false);
  };
  const clearVendor = () => {
    setForm((f) => ({ ...f, supplier_id: "" }));
    setVendorQuery("");
    setShowVendorSuggest(true);
  };

  const load = async () => {
    setLoading(true);
    try {
      // Load suppliers + raw materials in parallel
      const [supRes, rmRes] = await Promise.all([
        api.get("/suppliers"),
        api.get("/raw-materials"),
      ]);
      const supList = supRes.data || [];
      setSuppliers(supList);
      setRawMaterials(rmRes.data || []);
      // Aggregate every supplier's ledger to get all purchase rows.
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

  // Auto-computed totals for the in-dialog form
  const formAmount = useMemo(() => form.items.reduce((sum, it) => {
    const q = Number(it.quantity || 0); const r = Number(it.rate || 0);
    return sum + (q > 0 && r >= 0 ? q * r : 0);
  }, 0), [form.items]);

  const openCreate = () => {
    setForm({
      supplier_id: "",
      bill_number: "", purchased_at: todayIso(), notes: "",
      items: [{ ...EMPTY_LINE }],
    });
    setVendorQuery("");
    setShowVendorSuggest(false);
    setOpen(true);
  };

  const updateLine = (idx, patch) =>
    setForm((f) => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));

  const onPickRawMaterial = (idx, rmId) => {
    const rm = rawMaterials.find((r) => r.id === rmId);
    if (!rm) { updateLine(idx, { raw_material_id: "", name: "", unit: "", rate: "" }); return; }
    updateLine(idx, {
      raw_material_id: rm.id,
      name: rm.name,
      unit: rm.unit || "",
      // Pre-fill default rate but allow operator override
      rate: form.items[idx]?.rate || (Number(rm.default_rate) > 0 ? String(rm.default_rate) : ""),
    });
  };

  const addLine = () => setForm((f) => ({ ...f, items: [...f.items, { ...EMPTY_LINE }] }));
  const removeLine = (idx) => setForm((f) => ({
    ...f,
    items: f.items.length === 1 ? [{ ...EMPTY_LINE }] : f.items.filter((_, i) => i !== idx),
  }));

  const save = async () => {
    if (!form.supplier_id) { toast.error("Pick a vendor"); return; }
    const lines = form.items
      .map((it) => ({
        raw_material_id: it.raw_material_id || null,
        name: (it.name || "").trim(),
        unit: (it.unit || "").trim(),
        quantity: Number(it.quantity || 0),
        rate: Number(it.rate || 0),
      }))
      .filter((it) => it.name && it.quantity > 0);
    if (lines.length === 0) { toast.error("Add at least one raw material line"); return; }
    const amount = lines.reduce((s, it) => s + it.quantity * it.rate, 0);
    if (amount <= 0) { toast.error("Total amount must be > 0 — set a rate on each line"); return; }
    setSaving(true);
    try {
      await api.post("/supplier-purchases", {
        supplier_id: form.supplier_id,
        amount,
        bill_number: form.bill_number,
        purchased_at: form.purchased_at,
        notes: form.notes,
        items: lines,
      });
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
                   placeholder="Vendor, material, bill #"
                   data-testid="purchase-center-search"
                   className="pl-9 h-10 rounded-sm mt-1" />
          </div>
        </div>
        <div className="sm:col-span-3">
          <Label className="text-[10px] uppercase font-bold text-slate-500">Vendor</Label>
          <select value={filter.supplier_id}
                  onChange={(e) => setFilter((f) => ({ ...f, supplier_id: e.target.value }))}
                  data-testid="purchase-center-supplier-filter"
                  className="mt-1 w-full h-10 rounded-sm border border-slate-300 px-3 text-sm bg-white">
            <option value="">All vendors</option>
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
              <th className="text-left px-3 py-2">Vendor</th>
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
                  ? "Add a vendor first from Vendors, then record a purchase."
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
                  {Array.isArray(p.items) && p.items.length > 0 && (
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {p.items.map((it, i) => (
                        <div key={i} className="tabular-nums">
                          • {it.quantity} {it.unit} {it.name} @ {fmt(it.rate)} = <span className="font-bold">{fmt(it.line_value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {p.notes && <div className="text-[11px] italic text-slate-500 mt-0.5">{p.notes}</div>}
                </td>
                <td className="px-3 py-2 text-slate-500 font-mono text-xs">{p.bill_number || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold">{fmt(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Record purchase dialog — line-item entry like a sale */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm max-w-3xl" data-testid="purchase-center-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">Record purchase</DialogTitle>
            <DialogDescription>
              Pick raw materials, enter quantity & rate per line — the total amount is computed automatically (just like a sale).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2" ref={vendorPickerRef}>
                <Label className="text-xs font-bold uppercase">Vendor *</Label>
                {!selectedVendor ? (
                  <div className="relative mt-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      data-testid="purchase-vendor-input"
                      value={vendorQuery}
                      onChange={(e) => { setVendorQuery(e.target.value); setShowVendorSuggest(true); }}
                      onFocus={() => setShowVendorSuggest(true)}
                      placeholder="Type vendor name, phone, material…"
                      className="pl-9 h-11 rounded-sm"
                    />
                    {showVendorSuggest && (
                      <div
                        className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-sm shadow-lg max-h-60 overflow-y-auto"
                        data-testid="purchase-vendor-suggestions"
                      >
                        {filteredVendors.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-slate-500">
                            {suppliers.length === 0
                              ? "No vendors yet. Add one from the Vendors tab first."
                              : "No vendors match your search."}
                          </div>
                        ) : (
                          filteredVendors.map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => pickVendor(v)}
                              data-testid={`purchase-vendor-suggestion-${v.id}`}
                              className="w-full text-left px-3 py-2 hover:bg-orange-50 border-b border-slate-100 last:border-b-0"
                            >
                              <div className="font-bold text-sm text-slate-900">{v.name}</div>
                              <div className="text-[11px] text-slate-500">
                                {v.material_category || "—"}{v.phone ? ` · ${v.phone}` : ""}{v.contact_person ? ` · ${v.contact_person}` : ""}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className="mt-1 flex items-center justify-between bg-slate-50 border border-slate-200 rounded-sm px-3 py-2"
                    data-testid="purchase-vendor-selected"
                  >
                    <div>
                      <div className="font-bold text-slate-900 text-sm inline-flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" /> {selectedVendor.name}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {selectedVendor.material_category || "—"}
                        {selectedVendor.phone ? ` · ${selectedVendor.phone}` : ""}
                        {selectedVendor.contact_person ? ` · ${selectedVendor.contact_person}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clearVendor}
                      data-testid="purchase-vendor-clear"
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              <div>
                <Label className="text-xs font-bold uppercase">Date</Label>
                <Input type="date" value={form.purchased_at}
                       onChange={(e) => setForm((f) => ({ ...f, purchased_at: e.target.value }))}
                       className="h-11 rounded-sm mt-1" />
              </div>
            </div>

            {/* Line items */}
            <div className="border border-slate-200 rounded-sm overflow-hidden">
              <div className="bg-slate-50 px-3 py-2 flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-wider font-bold text-slate-600 inline-flex items-center gap-2">
                  <Boxes className="w-3.5 h-3.5" /> Raw material line items
                </div>
                {rawMaterials.length === 0 && (
                  <Link to="/admin/raw-materials" className="text-[11px] text-[#E65100] underline">Add raw materials first</Link>
                )}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-white border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                  <tr>
                    <th className="text-left px-3 py-2 w-[42%]">Raw material *</th>
                    <th className="text-left px-3 py-2 w-[14%]">Qty *</th>
                    <th className="text-left px-3 py-2 w-[14%]">Unit</th>
                    <th className="text-left px-3 py-2 w-[16%]">Rate (₹) *</th>
                    <th className="text-right px-3 py-2 w-[12%]">Line ₹</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((it, idx) => {
                    const lineVal = Number(it.quantity || 0) * Number(it.rate || 0);
                    return (
                      <tr key={idx} className="border-t border-slate-100" data-testid={`purchase-line-${idx}`}>
                        <td className="px-2 py-1.5">
                          <select value={it.raw_material_id}
                                  onChange={(e) => onPickRawMaterial(idx, e.target.value)}
                                  data-testid={`purchase-line-${idx}-rm`}
                                  className="w-full h-10 rounded-sm border border-slate-300 px-2 text-sm bg-white">
                            <option value="">— Pick raw material —</option>
                            {rawMaterials.map((r) => (
                              <option key={r.id} value={r.id}>{r.name} ({r.unit || "—"})</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <Input type="number" min="0" step="0.01" value={it.quantity}
                                 onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                                 data-testid={`purchase-line-${idx}-qty`}
                                 className="h-10 rounded-sm tabular-nums" />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input value={it.unit}
                                 onChange={(e) => updateLine(idx, { unit: e.target.value })}
                                 placeholder="kg / pcs"
                                 data-testid={`purchase-line-${idx}-unit`}
                                 className="h-10 rounded-sm" />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input type="number" min="0" step="0.01" value={it.rate}
                                 onChange={(e) => updateLine(idx, { rate: e.target.value })}
                                 data-testid={`purchase-line-${idx}-rate`}
                                 className="h-10 rounded-sm tabular-nums" />
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-bold text-slate-900">
                          {fmt(lineVal)}
                        </td>
                        <td className="px-1 py-1.5 text-center">
                          <Button variant="ghost" size="icon"
                                  onClick={() => removeLine(idx)}
                                  data-testid={`purchase-line-${idx}-remove`}
                                  className="h-8 w-8 text-red-600 hover:bg-red-50 rounded-sm">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td colSpan={4} className="px-3 py-2">
                      <Button variant="outline" size="sm" onClick={addLine}
                              data-testid="purchase-add-line"
                              className="rounded-sm h-8">
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add line
                      </Button>
                    </td>
                    <td className="px-3 py-2 text-right text-[11px] uppercase font-bold text-slate-600">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums font-extrabold text-slate-900" data-testid="purchase-form-total">
                      {fmt(formAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold uppercase">Bill number</Label>
                <Input value={form.bill_number}
                       onChange={(e) => setForm((f) => ({ ...f, bill_number: e.target.value }))}
                       placeholder="e.g. INV-2026-001"
                       data-testid="purchase-bill"
                       className="h-11 rounded-sm mt-1 font-mono" />
              </div>
              <div>
                <Label className="text-xs font-bold uppercase">Notes</Label>
                <Input value={form.notes}
                       onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                       data-testid="purchase-notes"
                       className="h-11 rounded-sm mt-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-sm">Cancel</Button>
            <Button onClick={save}
                    disabled={saving || !form.supplier_id || formAmount <= 0}
                    data-testid="purchase-center-save"
                    className="bg-slate-900 hover:bg-slate-800 text-white rounded-sm">
              {saving ? "Saving…" : (<><Plus className="w-4 h-4 mr-1" /> Save purchase · {fmt(formAmount)}</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
