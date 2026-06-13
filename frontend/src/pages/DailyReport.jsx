import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Calendar, Truck, IndianRupee, Package, Phone, MapPin, Printer, ChevronDown, ChevronRight, Save, Tag,
} from "lucide-react";

/**
 * End-of-Day Dispatch Report — grouped by party.
 *
 * All users see per-line pricing (unit price, discount, net unit price) and
 * transport details so operators can confirm what was billed. Only admins see
 * value-roll-ups — line totals, party subtotals, and the grand total — keeping
 * sensitive revenue figures restricted while still surfacing the per-piece
 * rates needed on the shop floor.
 */
function todayYmd() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

const inr = (n) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(n || 0));

export default function DailyReport() {
  const { isAdmin } = useAuth();
  const [date, setDate] = useState(todayYmd());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState({});

  // Edit-buffer keyed by entity id: { dispatch:<id> | customer:<id> }
  const [edits, setEdits] = useState({});
  const [savingKey, setSavingKey] = useState(null);

  const dispatchEdit = (did, field) => edits[`dispatch:${did}`]?.[field];
  const customerEdit = (cid, field) => edits[`customer:${cid}`]?.[field];

  const updEdit = (scope, id, patch) => {
    const k = `${scope}:${id}`;
    setEdits((e) => ({ ...e, [k]: { ...(e[k] || {}), ...patch } }));
  };

  const saveDispatchRow = async (did) => {
    const buf = edits[`dispatch:${did}`] || {};
    if (Object.keys(buf).length === 0) return;
    const body = {};
    if (buf.gr_number !== undefined) body.gr_number = buf.gr_number;
    if (buf.total_value !== undefined && buf.total_value !== "" && !Number.isNaN(Number(buf.total_value))) {
      body.total_value = Number(buf.total_value);
    }
    if (Object.keys(body).length === 0) return;
    setSavingKey(`dispatch:${did}`);
    try {
      await api.patch(`/dispatches/${did}`, body);
      setEdits((e) => { const n = { ...e }; delete n[`dispatch:${did}`]; return n; });
      toast.success("Saved");
      await load(date);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSavingKey(null); }
  };

  const savePrivateMark = async (cid, dispatches) => {
    const buf = edits[`customer:${cid}`] || {};
    const hasMark = buf.private_mark !== undefined;
    const hasBags = buf.bag_count !== undefined && buf.bag_count !== "" && !Number.isNaN(Number(buf.bag_count));
    if (!hasMark && !hasBags) return;
    setSavingKey(`customer:${cid}`);
    try {
      if (hasMark) {
        await api.patch(`/customers/${cid}`, { private_mark: buf.private_mark });
      }
      if (hasBags && (dispatches || []).length > 0) {
        // Attach bag count to the (consolidated) dispatch for this customer.
        // After the same-day merge fix there is at most one slip per
        // customer per day, so the first entry is the right target.
        const bags = Math.max(0, parseInt(buf.bag_count, 10) || 0);
        await api.patch(`/dispatches/${dispatches[0].id}`, { bag_count: bags });
      }
      setEdits((e) => { const n = { ...e }; delete n[`customer:${cid}`]; return n; });
      toast.success("Saved");
      await load(date);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSavingKey(null); }
  };

  const load = async (d) => {
    setLoading(true);
    try {
      const r = await api.get("/reports/daily-dispatch", { params: { date: d } });
      setData(r.data);
      setCollapsed({});
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(date); }, [date]);

  const groups = data?.groups || [];

  const toggle = (cid) => setCollapsed((c) => ({ ...c, [cid]: !c[cid] }));

  // Expand every party group before printing so collapsed sections are
  // included in the PDF. Without this, anything the user collapsed on
  // screen would silently disappear from the printout.
  const doPrint = () => {
    setCollapsed({});
    // Defer until after React commits the expanded state to the DOM.
    setTimeout(() => window.print(), 150);
  };

  return (
    <div className="space-y-5" data-testid="daily-report-page">
      <div className="flex items-end justify-between flex-wrap gap-3 print:hidden">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#E65100] font-bold">Reports</div>
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900">Daily Dispatch Report</h1>
          <p className="text-slate-500 text-sm mt-1">
            Consolidated end-of-day summary grouped by party with item-wise pricing &amp; transport.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs font-bold uppercase">Date</Label>
            <div className="relative mt-1">
              <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                data-testid="report-date-input"
                className="h-10 rounded-sm pl-8"
              />
            </div>
          </div>
          <Button
            onClick={doPrint}
            variant="outline"
            data-testid="report-print-btn"
            className="rounded-sm border-slate-300 h-10"
          >
            <Printer className="w-4 h-4 mr-1.5" /> Print / Save PDF
          </Button>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block">
        <h1 className="text-2xl font-bold">JK Products — Daily Dispatch Report</h1>
        <div className="text-sm text-slate-600">{data?.date}</div>
      </div>

      {/* Summary tiles */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Tile label="Parties" value={groups.length} testid="tile-parties" />
          <Tile label="Dispatches" value={data.dispatch_count} testid="tile-dispatches" />
          <Tile label="Total pieces" value={inr(data.grand_total_pcs)} testid="tile-pcs" />
          {isAdmin ? (
            <Tile
              label="Total value"
              value={`₹ ${inr(data.grand_total_value)}`}
              valueClass="text-[#E65100]"
              testid="tile-value"
            />
          ) : (
            <Tile label="Restricted" value="—" valueClass="text-slate-400" testid="tile-value-locked" />
          )}
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-sm p-10 text-center text-slate-400">
          Loading…
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-sm p-10 text-center text-slate-400 text-sm">
          No dispatches on this date.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const isCollapsed = !!collapsed[g.customer_id];
            return (
              <section
                key={g.customer_id}
                className="bg-white border border-slate-200 rounded-sm overflow-hidden print:break-inside-avoid"
                data-testid={`report-group-${g.customer_id}`}
              >
                <button
                  onClick={() => toggle(g.customer_id)}
                  className="w-full px-4 py-3 flex items-center gap-3 bg-slate-50 border-b border-slate-200 text-left hover:bg-slate-100 print:cursor-default"
                  data-testid={`report-group-toggle-${g.customer_id}`}
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-slate-500 print:hidden" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500 print:hidden" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-heading font-bold text-slate-900 text-base truncate">
                      {g.customer_name}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {g.transport_name && (
                        <span className="flex items-center gap-1 text-[#E65100] font-bold">
                          <Truck className="w-3 h-3" />
                          {g.transport_name}
                        </span>
                      )}
                      {g.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {g.phone}
                        </span>
                      )}
                      {(g.city || g.location) && (
                        <span className="flex items-center gap-1 font-semibold text-slate-700">
                          <MapPin className="w-3 h-3" />
                          {[g.city, g.location].filter(Boolean).join(", ")}
                        </span>
                      )}
                      {g.address && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {g.address}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                      {isAdmin ? "Total" : "Pieces"}
                    </div>
                    {isAdmin ? (
                      <div className="font-heading font-extrabold text-lg text-[#E65100] font-mono-num" data-testid={`group-total-${g.customer_id}`}>
                        ₹ {inr(g.total_value)}
                      </div>
                    ) : (
                      <div className="font-heading font-extrabold text-lg text-slate-900 font-mono-num" data-testid={`group-pcs-${g.customer_id}`}>
                        {inr(g.total_pcs)}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-500 font-mono-num">
                      {g.total_pcs} pcs · {g.dispatch_count} dispatch{g.dispatch_count > 1 ? "es" : ""}
                    </div>
                  </div>
                </button>

                {!isCollapsed && (
                  <>
                    {/* Editable bookkeeping fields per dispatch + per-party private mark */}
                    <div className="px-4 py-3 bg-orange-50/40 border-b border-orange-100 space-y-3 print:hidden">
                      {/* Per-dispatch GR + Bill amount editors */}
                      {(g.dispatches || []).map((dsp) => {
                        const gEdit = dispatchEdit(dsp.id, "gr_number");
                        const tEdit = dispatchEdit(dsp.id, "total_value");
                        const grVal = gEdit !== undefined ? gEdit : (dsp.gr_number || "");
                        // Bill amount is NEVER auto-filled — operator must enter it.
                        // 0 / null / undefined ⇒ empty input prompting the user.
                        const savedTV = Number(dsp.total_value || 0);
                        const tvVal = tEdit !== undefined ? tEdit : (savedTV > 0 ? String(savedTV) : "");
                        const dirty = gEdit !== undefined || tEdit !== undefined;
                        const isSaving = savingKey === `dispatch:${dsp.id}`;
                        return (
                          <div
                            key={dsp.id}
                            className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end"
                            data-testid={`report-dispatch-edit-${dsp.id}`}
                          >
                            <div className="sm:col-span-2 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                              Slip #<span className="font-mono text-slate-900 ml-1">{dsp.slip_no ?? dsp.id.slice(0, 8).toUpperCase()}</span>
                            </div>
                            <div className="sm:col-span-4">
                              <Label className="text-[10px] uppercase font-bold text-slate-500">GR number</Label>
                              <Input
                                value={grVal}
                                onChange={(e) => updEdit("dispatch", dsp.id, { gr_number: e.target.value })}
                                placeholder="e.g. 123456"
                                data-testid={`report-gr-input-${dsp.id}`}
                                className="h-9 rounded-sm mt-0.5"
                              />
                            </div>
                            <div className="sm:col-span-4">
                              <Label className="text-[10px] uppercase font-bold text-slate-500">Bill amount (₹)</Label>
                              <Input
                                type="number" min="0" step="0.01"
                                value={tvVal}
                                placeholder="Enter bill amount"
                                onChange={(e) => updEdit("dispatch", dsp.id, { total_value: e.target.value })}
                                onFocus={(e) => { if (parseFloat(tvVal || "0") === 0) updEdit("dispatch", dsp.id, { total_value: "" }); e.target.select(); }}
                                onBlur={() => { if (tvVal === "" || tvVal === "-") updEdit("dispatch", dsp.id, { total_value: "0" }); }}
                                data-testid={`report-amount-input-${dsp.id}`}
                                className="no-spinner h-9 rounded-sm mt-0.5 font-mono-num text-right"
                              />
                            </div>
                            <div className="sm:col-span-2 flex">
                              <Button
                                size="sm"
                                onClick={() => saveDispatchRow(dsp.id)}
                                disabled={!dirty || isSaving}
                                data-testid={`report-dispatch-save-${dsp.id}`}
                                className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm h-9 w-full disabled:opacity-40"
                              >
                                <Save className="w-3.5 h-3.5 mr-1" /> {isSaving ? "Saving…" : "Save"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}

                      {/* Per-party private mark + No. of bags — admin only */}
                      {isAdmin && (
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end pt-2 border-t border-orange-100">
                          <div className="sm:col-span-2 text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1">
                            <Tag className="w-3 h-3" /> Private mark
                          </div>
                          <div className="sm:col-span-4">
                            <Label className="text-[10px] uppercase font-bold text-slate-500">Mark</Label>
                            <Input
                              value={
                                customerEdit(g.customer_id, "private_mark") !== undefined
                                  ? customerEdit(g.customer_id, "private_mark")
                                  : (g.private_mark || "")
                              }
                              onChange={(e) => updEdit("customer", g.customer_id, { private_mark: e.target.value })}
                              placeholder="Stenciled mark on packages (e.g. AB)"
                              data-testid={`report-pvtmark-input-${g.customer_id}`}
                              className="h-9 rounded-sm mt-0.5"
                            />
                          </div>
                          {(() => {
                            const bagBuf = customerEdit(g.customer_id, "bag_count");
                            const dsp0 = (g.dispatches || [])[0];
                            const savedBags = Number(dsp0?.bag_count || 0);
                            const bagVal = bagBuf !== undefined ? bagBuf : (savedBags > 0 ? String(savedBags) : "");
                            return (
                              <div className="sm:col-span-4">
                                <Label className="text-[10px] uppercase font-bold text-slate-500">No. of bags</Label>
                                <Input
                                  type="number" min="0" step="1"
                                  value={bagVal}
                                  placeholder="Bags"
                                  onChange={(e) => updEdit("customer", g.customer_id, { bag_count: e.target.value })}
                                  onFocus={(e) => { if (parseInt(bagVal || "0", 10) === 0) updEdit("customer", g.customer_id, { bag_count: "" }); e.target.select(); }}
                                  onBlur={() => { if (bagVal === "" || bagVal === "-") updEdit("customer", g.customer_id, { bag_count: "0" }); }}
                                  data-testid={`report-bags-input-${g.customer_id}`}
                                  className="no-spinner h-9 rounded-sm mt-0.5 font-mono-num text-right"
                                />
                              </div>
                            );
                          })()}
                          <div className="sm:col-span-2 flex">
                            <Button
                              size="sm"
                              onClick={() => savePrivateMark(g.customer_id, g.dispatches)}
                              disabled={customerEdit(g.customer_id, "private_mark") === undefined && customerEdit(g.customer_id, "bag_count") === undefined || savingKey === `customer:${g.customer_id}`}
                              data-testid={`report-pvtmark-save-${g.customer_id}`}
                              className="bg-slate-800 hover:bg-slate-900 text-white rounded-sm h-9 w-full disabled:opacity-40"
                            >
                              <Save className="w-3.5 h-3.5 mr-1" />
                              {savingKey === `customer:${g.customer_id}` ? "Saving…" : "Save"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-white border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                          <th className="text-left px-4 py-2">Item</th>
                          <th className="text-right px-4 py-2">Qty</th>
                          <th className="text-right px-4 py-2">Net ₹</th>
                          {isAdmin && <th className="text-right px-4 py-2">Line ₹</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {g.lines.map((l, i) => (
                          <tr
                            key={`${g.customer_id}-${i}`}
                            data-testid={`report-line-${g.customer_id}-${i}`}
                            className="border-b border-slate-100 last:border-0"
                          >
                            <td className="px-4 py-2">
                              <div className="font-bold text-slate-900 break-words">{l.item_name}</div>
                              {l.variant && (
                                <div className="text-[10px] text-slate-500 uppercase">{l.variant}</div>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right font-mono-num font-bold">{inr(l.quantity)}</td>
                            <td className="px-4 py-2 text-right font-mono-num font-bold text-slate-900">
                              {inr(l.net_unit_price)}
                            </td>
                            {isAdmin && (
                              <td className="px-4 py-2 text-right font-mono-num font-bold text-[#E65100]">
                                ₹ {inr(l.line_value)}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                      {isAdmin && (
                        <tfoot>
                          <tr className="bg-orange-50 border-t border-orange-200">
                            <td className="px-4 py-2 text-xs font-bold text-slate-700">
                              Subtotal
                            </td>
                            <td className="px-4 py-2 text-right font-mono-num font-bold">{inr(g.total_pcs)}</td>
                            <td className="px-4 py-2" />
                            <td className="px-4 py-2 text-right font-mono-num font-extrabold text-[#E65100]">
                              ₹ {inr(g.total_value)}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, valueClass = "text-slate-900", testid }) {
  return (
    <div className="bg-white border border-slate-200 rounded-sm p-4" data-testid={testid}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</div>
      <div className={`font-heading font-extrabold text-2xl ${valueClass} font-mono-num mt-1`}>{value}</div>
    </div>
  );
}
