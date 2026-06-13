import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Pencil, X, Search, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { api } from "@/lib/api";

const empty = { name: "", unit: "kg", default_rate: "0", notes: "" };

export default function RawMaterials() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/raw-materials");
      setRows(r.data || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load raw materials");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      [r.name, r.unit, r.notes].filter(Boolean).some((v) => String(v).toLowerCase().includes(t)),
    );
  }, [rows, q]);

  const openCreate = () => { setEditingId(null); setForm(empty); setOpen(true); };
  const openEdit = (r) => {
    setEditingId(r.id);
    setForm({
      name: r.name || "",
      unit: r.unit || "pcs",
      default_rate: String(r.default_rate ?? "0"),
      notes: r.notes || "",
    });
    setOpen(true);
  };
  const save = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      const body = { ...form, default_rate: Number(form.default_rate || 0) };
      if (editingId) await api.patch(`/raw-materials/${editingId}`, body);
      else await api.post("/raw-materials", body);
      toast.success(editingId ? "Raw material updated" : "Raw material added");
      setOpen(false); setEditingId(null);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };
  const remove = async (r) => {
    try {
      await api.delete(`/raw-materials/${r.id}`);
      toast.success("Deleted");
      setConfirm(null);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };

  return (
    <div className="space-y-4" data-testid="raw-materials-page">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#E65100] font-bold">Admin · Inbound Master</div>
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">Raw Materials</h1>
          <p className="text-slate-500 text-sm mt-1">Inventory of raw materials you buy from suppliers. Used as line-items when recording purchases.</p>
        </div>
        <Button onClick={openCreate}
                data-testid="raw-materials-add-btn"
                className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm h-10">
          <Plus className="w-4 h-4 mr-1" /> Add raw material
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)}
               placeholder="Search by name, unit…"
               data-testid="raw-materials-search-input"
               className="pl-9 h-10 rounded-sm" />
      </div>

      <div className="border border-slate-200 rounded-sm overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-600 font-bold">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Unit</th>
              <th className="text-right px-4 py-2">Default rate (₹/unit)</th>
              <th className="text-left px-4 py-2">Notes</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Loading…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500" data-testid="raw-materials-empty">
                {rows.length === 0 ? "No raw materials yet. Click Add to create your first entry." : "No items match your search."}
              </td></tr>
            )}
            {!loading && filtered.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-orange-50/30" data-testid={`raw-row-${r.id}`}>
                <td className="px-4 py-2 font-bold text-slate-900 inline-flex items-center gap-2">
                  <Package className="w-4 h-4 text-slate-400" /> {r.name}
                </td>
                <td className="px-4 py-2 text-slate-600">{r.unit || "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums">{Number(r.default_rate || 0) > 0 ? `₹${Number(r.default_rate).toLocaleString("en-IN")}` : "—"}</td>
                <td className="px-4 py-2 text-slate-500">{r.notes || "—"}</td>
                <td className="px-4 py-2 text-right space-x-1 whitespace-nowrap">
                  <Button size="sm" variant="outline" className="rounded-sm h-8" onClick={() => openEdit(r)} data-testid={`raw-edit-${r.id}`}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-sm h-8 text-red-700 hover:bg-red-50" onClick={() => setConfirm(r)} data-testid={`raw-delete-${r.id}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm max-w-md" data-testid="raw-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">{editingId ? "Edit raw material" : "Add raw material"}</DialogTitle>
            <DialogDescription>Items you purchase from suppliers. Pick these as line-items in Purchase Center.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-bold uppercase">Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                     placeholder="MS Steel Rod 8mm"
                     data-testid="raw-name-input"
                     className="h-11 rounded-sm mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold uppercase">Unit</Label>
                <select value={form.unit}
                        onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                        data-testid="raw-unit-select"
                        className="mt-1 w-full h-11 rounded-sm border border-slate-300 px-3 text-sm bg-white">
                  {["kg", "pcs", "litre", "metre", "ton", "bag", "box", "set", "other"].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs font-bold uppercase">Default rate (₹/unit)</Label>
                <Input type="number" min="0" step="0.01" value={form.default_rate}
                       onChange={(e) => setForm((f) => ({ ...f, default_rate: e.target.value }))}
                       placeholder="0.00"
                       data-testid="raw-rate-input"
                       className="h-11 rounded-sm mt-1 tabular-nums" />
              </div>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">Notes</Label>
              <Input value={form.notes}
                     onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                     placeholder="Internal note"
                     className="h-11 rounded-sm mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-sm">
              <X className="w-4 h-4 mr-1" /> Cancel
            </Button>
            <Button onClick={save} disabled={saving || !form.name.trim()}
                    data-testid="raw-save-btn"
                    className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm">
              {saving ? "Saving…" : (editingId ? "Update" : "Add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <DialogContent className="rounded-sm max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">Delete raw material?</DialogTitle>
            <DialogDescription>Are you sure you want to delete <span className="font-bold">{confirm?.name}</span>?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} className="rounded-sm">Cancel</Button>
            <Button onClick={() => remove(confirm)} className="bg-red-700 hover:bg-red-800 text-white rounded-sm">
              <Trash2 className="w-4 h-4 mr-1" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
