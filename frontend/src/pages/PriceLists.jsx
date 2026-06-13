import React, { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Upload, Download, Trash2, Edit3, ArrowLeft, Tag, Percent, IndianRupee, Save, X,
} from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useConfirm } from "@/lib/useConfirm";

/**
 * Price Lists admin page.
 *
 *  - Browse / create / rename / delete price lists.
 *  - Drill into a price list → manage per-item prices + per-category discounts.
 *  - Excel template upload (Item Name | Price) and download.
 */
export default function PriceLists() {
  const { isAdmin } = useAuth();
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [active, setActive] = useState(null); // selected price list detail
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [savingRow, setSavingRow] = useState(null);
  const fileInputRef = useRef(null);
  const { state: confirmState, confirm, close: closeConfirm } = useConfirm();

  const loadLists = async () => {
    setLoading(true);
    try { const { data } = await api.get("/price-lists"); setLists(data); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadLists(); }, []);

  const loadDetail = async (plid) => {
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/price-lists/${plid}`);
      setDetail(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load price list");
    } finally { setDetailLoading(false); }
  };

  useEffect(() => {
    if (active?.id) loadDetail(active.id);
    else setDetail(null);
  }, [active]);

  const createList = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    try {
      const { data } = await api.post("/price-lists", form);
      toast.success(`Price list "${data.name}" created`);
      setShowAdd(false);
      setForm({ name: "", description: "" });
      loadLists();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  const deleteList = (pl) => {
    confirm({
      title: "Delete price list?",
      description: `"${pl.name}" — all per-item prices and discounts inside this list will be removed.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      variant: "destructive",
      onConfirm: async () => {
        try {
          await api.delete(`/price-lists/${pl.id}`);
          toast.success(`"${pl.name}" deleted`);
          if (active?.id === pl.id) setActive(null);
          loadLists();
        } catch (e) {
          toast.error(e?.response?.data?.detail || "Failed");
        }
      },
    });
  };

  const saveRow = async (row, newPrice) => {
    setSavingRow(row.item_id);
    try {
      await api.post(`/price-lists/${active.id}/items`, {
        item_id: row.item_id,
        price: parseFloat(newPrice) || 0,
      });
      setDetail((d) => ({
        ...d,
        items: d.items.map((it) =>
          it.item_id === row.item_id ? { ...it, price: parseFloat(newPrice) || 0 } : it,
        ),
      }));
    } catch (e) {
      toast.error("Save failed");
    } finally {
      setSavingRow(null);
    }
  };

  const saveDiscount = async (productName, value, type) => {
    const numVal = parseFloat(value) || 0;
    // Defensive default: if user entered a non-zero discount but forgot to
    // pick ₹ or %, default to ₹ so the discount actually applies on
    // dispatch & in the daily report (instead of silently being ignored).
    const finalType = numVal > 0 && !type ? "₹" : (type || "");
    try {
      await api.post(`/price-lists/${active.id}/discounts`, {
        product_name: productName,
        discount_value: numVal,
        discount_type: finalType,
      });
      setDetail((d) => {
        const existing = d.discounts.find((x) => x.product_name === productName);
        const next = existing
          ? d.discounts.map((x) =>
              x.product_name === productName
                ? { ...x, discount_value: numVal, discount_type: finalType }
                : x,
            )
          : [
              ...d.discounts,
              { product_name: productName, discount_value: numVal, discount_type: finalType },
            ];
        return { ...d, discounts: next };
      });
      toast.success("Discount saved");
    } catch (e) {
      toast.error("Save failed");
    }
  };

  const downloadXlsx = async () => {
    try {
      const res = await api.get(`/price-lists/${active.id}/export`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      const safe = active.name.replace(/[^a-z0-9]+/gi, "_");
      a.download = `price_list_${safe}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Download failed");
    }
  };

  const onUploadFile = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post(`/price-lists/${active.id}/import`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`Updated ${data.updated} item price(s)${data.unknown_count ? ` — ${data.unknown_count} row(s) skipped` : ""}`);
      if (data.unknown && data.unknown.length) {
        console.warn("Unmatched rows:", data.unknown);
      }
      loadDetail(active.id);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Import failed");
    }
  };

  if (!isAdmin) return <div className="p-6 text-slate-500">Admin only.</div>;

  // -------------------- List view --------------------
  if (!active) {
    return (
      <div className="space-y-5" data-testid="price-lists-page">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#E65100] font-bold">Pricing</div>
            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900">Price Lists</h1>
            <p className="text-slate-500 text-sm mt-1">
              Maintain multiple price lists. Assign one to each party from the Customers page.
            </p>
          </div>
          <Button
            onClick={() => setShowAdd(true)}
            data-testid="add-price-list-btn"
            className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm h-10 px-4 font-bold"
          >
            <Plus className="w-4 h-4 mr-1.5" /> New price list
          </Button>
        </div>

        <div className="bg-white border border-slate-200 rounded-sm">
          {loading ? (
            <div className="p-10 text-center text-slate-400">Loading…</div>
          ) : lists.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">
              No price lists yet. Create your first one.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {lists.map((pl) => (
                <div
                  key={pl.id}
                  data-testid={`price-list-row-${pl.id}`}
                  className="p-4 sm:p-5 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                >
                  <button
                    onClick={() => setActive(pl)}
                    data-testid={`open-price-list-${pl.id}`}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="font-bold text-slate-900 truncate">{pl.name}</div>
                    {pl.description && (
                      <div className="text-xs text-slate-500 mt-0.5">{pl.description}</div>
                    )}
                    <div className="flex gap-3 mt-1.5">
                      <span className="text-[10px] uppercase tracking-wider font-bold bg-orange-50 border border-orange-200 text-orange-900 px-2 py-1 rounded-sm">
                        {pl.items_count} items priced
                      </span>
                      <span className="text-[10px] uppercase tracking-wider font-bold bg-slate-50 border border-slate-200 text-slate-700 px-2 py-1 rounded-sm">
                        {pl.discounts_count} category discounts
                      </span>
                    </div>
                  </button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setActive(pl)}
                    className="rounded-sm border-slate-300"
                  >
                    <Edit3 className="w-3.5 h-3.5 mr-1" /> Manage
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deleteList(pl)}
                    data-testid={`delete-price-list-${pl.id}`}
                    className="rounded-sm border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create dialog */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent className="rounded-sm">
            <DialogHeader>
              <DialogTitle className="font-heading">New price list</DialogTitle>
              <DialogDescription>e.g. "Wholesale", "Retail", "Premium dealer"</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-bold uppercase">Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  data-testid="price-list-name-input"
                  className="h-11 rounded-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-bold uppercase">Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  rows={2}
                  className="rounded-sm mt-1"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAdd(false)} className="rounded-sm">
                Cancel
              </Button>
              <Button
                onClick={createList}
                data-testid="price-list-save-btn"
                className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm"
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={!!confirmState}
          onOpenChange={(o) => { if (!o) closeConfirm(); }}
          {...(confirmState || {})}
        />
      </div>
    );
  }

  // -------------------- Detail view --------------------
  const rows = (detail?.items || []).filter(
    (r) =>
      !search ||
      r.item_name.toLowerCase().includes(search.toLowerCase()) ||
      (r.product_name || "").toLowerCase().includes(search.toLowerCase()),
  );

  // Group rows by category for category-discount section
  const categories = Array.from(
    new Set((detail?.items || []).map((r) => r.product_name).filter(Boolean)),
  ).sort();
  const discountMap = Object.fromEntries(
    (detail?.discounts || []).map((d) => [d.product_name, d]),
  );

  return (
    <div className="space-y-5" data-testid="price-list-detail-page">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setActive(null)}
            data-testid="back-to-price-lists"
            className="rounded-sm border-slate-300 h-9"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#E65100] font-bold">Price list</div>
            <h1 className="font-heading text-2xl font-extrabold text-slate-900">{active.name}</h1>
            {active.description && (
              <div className="text-xs text-slate-500 mt-0.5">{active.description}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              onUploadFile(f);
              e.target.value = "";
            }}
            data-testid="price-list-upload-input"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            data-testid="upload-price-xlsx"
            className="rounded-sm border-slate-300 h-9"
          >
            <Upload className="w-4 h-4 mr-1.5" /> Upload Excel
          </Button>
          <Button
            variant="outline"
            onClick={downloadXlsx}
            data-testid="download-price-xlsx"
            className="rounded-sm border-slate-300 h-9"
          >
            <Download className="w-4 h-4 mr-1.5" /> Download
          </Button>
        </div>
      </div>

      {/* Category discounts */}
      <section className="bg-white border border-slate-200 rounded-sm">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <Tag className="w-4 h-4 text-[#E65100]" />
          <h2 className="font-heading font-bold text-slate-900">Category-level discounts</h2>
          <span className="text-xs text-slate-500 ml-2">Applied automatically when a customer on this price list is dispatched.</span>
        </div>
        {categories.length === 0 ? (
          <div className="p-6 text-sm text-slate-400">No item categories found.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {categories.map((cat) => {
              const d = discountMap[cat] || { discount_value: 0, discount_type: "" };
              return (
                <DiscountRow
                  key={cat}
                  category={cat}
                  value={d.discount_value}
                  type={d.discount_type}
                  onSave={saveDiscount}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Per-item prices */}
      <section className="bg-white border border-slate-200 rounded-sm">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-3 flex-wrap">
          <h2 className="font-heading font-bold text-slate-900">Item prices</h2>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKU or category…"
            data-testid="price-list-search"
            className="h-9 rounded-sm ml-auto max-w-xs"
          />
        </div>
        {detailLoading ? (
          <div className="p-10 text-center text-slate-400">Loading prices…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">
            {detail?.items?.length === 0 ? "No items found in master." : "No matching SKUs."}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((r) => (
              <PriceRow
                key={r.item_id}
                row={r}
                saving={savingRow === r.item_id}
                onSave={(p) => saveRow(r, p)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PriceRow({ row, onSave, saving }) {
  const [val, setVal] = useState(String(row.price ?? 0));
  useEffect(() => { setVal(String(row.price ?? 0)); }, [row.price]);
  const dirty = parseFloat(val || "0") !== parseFloat(row.price || 0);
  return (
    <div className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50" data-testid={`price-row-${row.item_id}`}>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-slate-900 break-words leading-snug">{row.item_name}</div>
        {row.product_name && (
          <div className="text-[11px] text-slate-500 mt-0.5">{row.product_name}</div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative">
          <IndianRupee className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <Input
            type="number"
            min="0"
            step="0.01"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onFocus={(e) => { if (parseFloat(val || "0") === 0) setVal(""); e.target.select(); }}
            onBlur={() => {
              if (val === "" || val === "-" || val === ".") setVal("0");
              if (dirty) onSave(val || "0");
            }}
            data-testid={`price-input-${row.item_id}`}
            className="no-spinner h-9 w-28 pl-7 rounded-sm font-mono-num text-right"
          />
        </div>
        {dirty && (
          <Button
            size="sm"
            onClick={() => onSave(val)}
            disabled={saving}
            className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm h-9 px-3"
          >
            <Save className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function DiscountRow({ category, value, type, onSave }) {
  const [val, setVal] = useState(String(value || 0));
  const [tp, setTp] = useState(type || "");
  useEffect(() => { setVal(String(value || 0)); setTp(type || ""); }, [value, type]);
  const dirty = parseFloat(val || "0") !== parseFloat(value || 0) || tp !== (type || "");
  const numVal = parseFloat(val || "0");
  const needsType = numVal > 0 && !tp;
  return (
    <div className="px-4 py-3 flex items-center gap-3 flex-wrap" data-testid={`discount-row-${category}`}>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-slate-900">{category}</div>
        <div className="text-[11px] text-slate-500 mt-0.5">All items in this category get the discount below.</div>
        {needsType && (
          <div className="text-[11px] text-rose-600 mt-1 font-bold" data-testid={`discount-warn-${category}`}>
            Pick ₹ or % — otherwise we'll default to ₹ on save.
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Input
          type="number"
          min="0"
          step="0.01"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onFocus={(e) => { if (parseFloat(val || "0") === 0) setVal(""); e.target.select(); }}
          onBlur={() => { if (val === "" || val === "-" || val === ".") setVal("0"); }}
          data-testid={`discount-value-${category}`}
          className={`no-spinner h-9 w-24 rounded-sm font-mono-num text-right ${needsType ? "border-rose-400" : ""}`}
        />
        <div className="flex">
          <button
            type="button"
            onClick={() => setTp(tp === "₹" ? "" : "₹")}
            data-testid={`discount-type-rs-${category}`}
            className={`h-9 px-2 rounded-l-sm border text-xs font-bold ${tp === "₹" ? "bg-[#E65100] text-white border-[#E65100]" : `bg-white text-slate-700 ${needsType ? "border-rose-400" : "border-slate-300"}`}`}
          >
            <IndianRupee className="w-3 h-3 inline -mt-0.5" />
          </button>
          <button
            type="button"
            onClick={() => setTp(tp === "%" ? "" : "%")}
            data-testid={`discount-type-pct-${category}`}
            className={`h-9 px-2 rounded-r-sm border -ml-px text-xs font-bold ${tp === "%" ? "bg-[#E65100] text-white border-[#E65100]" : `bg-white text-slate-700 ${needsType ? "border-rose-400" : "border-slate-300"}`}`}
          >
            <Percent className="w-3 h-3 inline -mt-0.5" />
          </button>
        </div>
        <Button
          size="sm"
          onClick={() => onSave(category, val, tp)}
          disabled={!dirty}
          data-testid={`discount-save-${category}`}
          className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm h-9 px-3 disabled:opacity-40"
        >
          <Save className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
