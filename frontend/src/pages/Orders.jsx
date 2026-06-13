import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Search, Filter, Trash2, Edit3, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import OrderEditDialog from "@/components/OrderEditDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useConfirm } from "@/lib/useConfirm";

const STATUSES = ["Pending", "Dispatched", "Cleared"];

function StatusBadge({ status }) {
  const { t } = useTranslation();
  const cls = {
    Pending: "badge-pending",
    Dispatched: "badge-dispatched",
    Cleared: "badge-cleared",
  }[status] || "badge-pending";
  return <span className={`badge-status ${cls}`}>{t(`orders.status.${status}`, status)}</span>;
}

export default function Orders() {
  const { isAdmin } = useAuth();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [filter, setFilter] = useState(searchParams.get("status") || "all");
  const [editTarget, setEditTarget] = useState(null);
  const { state: confirmState, confirm, close: closeConfirm } = useConfirm();

  const load = async () => {
    setLoading(true);
    try {
      const params = filter !== "all" ? { status_filter: filter } : {};
      const { data } = await api.get("/orders", { params });
      setOrders(data);
    } catch (e) {
      toast.error(t("orders.loadFailed"));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filter]);

  const filtered = orders.filter((o) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return o.customer_name.toLowerCase().includes(s) ||
           o.items?.some((it) =>
             (it.item_name || "").toLowerCase().includes(s) ||
             (it.product_name || "").toLowerCase().includes(s)
           );
  });

  const updateStatus = async (id, status) => {
    try {
      await api.patch(`/orders/${id}/status`, { status });
      toast.success(t("orders.markedStatus", { status: t(`orders.status.${status}`, status) }));
      load();
    } catch (e) { toast.error(t("common.failed")); }
  };

  const del = (id) => {
    confirm({
      title: t("orders.confirmDeleteTitle"),
      description: t("orders.confirmDelete"),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      onConfirm: async () => {
        closeConfirm();
        try {
          await api.delete(`/orders/${id}`);
          toast.success(t("orders.deleted"));
          load();
        } catch (e) { toast.error(t("common.failed")); }
      },
    });
  };

  return (
    <div className="space-y-5" data-testid="orders-page">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#E65100] font-bold">{t("orders.overline")}</div>
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900">{t("orders.title")}</h1>
        </div>
        <Link to="/orders/new" data-testid="orders-new-btn"
              className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm h-10 px-4 font-bold inline-flex items-center transition active:scale-[0.98]">
          <Plus className="w-4 h-4 mr-1.5" /> {t("orders.newBtn")}
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input data-testid="orders-search" placeholder={t("orders.searchPlaceholder")}
                   value={q} onChange={(e) => setQ(e.target.value)}
                   className="pl-9 h-10 rounded-sm" />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger data-testid="orders-filter" className="w-full sm:w-44 h-10 rounded-sm">
              <Filter className="w-3 h-3 mr-1" />
              <SelectValue placeholder={t("common.status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("orders.allStatus")}</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`orders.status.${s}`, s)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-400">{t("common.loading")}</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            <div className="text-sm">{t("orders.noMatch")}</div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((o) => (
              <div key={o.id} className={`p-4 sm:p-5 hover:bg-slate-50 transition-colors ${o.is_overdue ? "bg-rose-50/40 border-l-2 border-l-rose-400" : ""}`} data-testid={`order-row-${o.id}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900">{o.customer_name}</span>
                      <StatusBadge status={o.status} />
                      {o.is_overdue && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded-sm"
                              data-testid={`overdue-badge-${o.id}`}>
                          <AlertTriangle className="w-3 h-3" />
                          {t("orders.overdueBadge", { days: o.days_open })}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 font-mono-num">
                      #{o.id.slice(0, 8)} · {new Date(o.order_date || o.created_at).toLocaleDateString()}
                      {o.delivery_date && <> · {t("orders.delivery")}: {new Date(o.delivery_date).toLocaleDateString()}</>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {o.items?.map((it, i) => (
                        <span key={i}
                              title={it.product_name || ""}
                              className="text-xs bg-slate-100 text-slate-800 px-2 py-1 rounded-sm border border-slate-200">
                          <span className="font-semibold">{it.item_name || it.product_name}</span>
                          {it.variant ? ` (${it.variant})` : ""}: <span className="font-mono-num font-bold">{it.quantity}</span>
                          {it.product_name && it.item_name && it.product_name !== it.item_name && (
                            <span className="text-[10px] text-slate-400 ml-1">· {it.product_name}</span>
                          )}
                        </span>
                      ))}
                    </div>
                    {o.notes && <div className="mt-2 text-xs text-slate-500 italic">&ldquo;{o.notes}&rdquo;</div>}
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Select value={o.status} onValueChange={(v) => updateStatus(o.id, v)}>
                      <SelectTrigger data-testid={`status-select-${o.id}`} className="h-10 flex-1 sm:flex-none sm:w-36 rounded-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`orders.status.${s}`, s)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {isAdmin && (
                      <Button variant="ghost" size="sm" onClick={() => setEditTarget(o)}
                              data-testid={`order-edit-${o.id}`}
                              className="h-10 w-10 p-0 rounded-sm text-slate-500 hover:text-[#E65100] hover:bg-orange-50 shrink-0">
                        <Edit3 className="w-4 h-4" />
                      </Button>
                    )}
                    {isAdmin && (
                      <Button variant="ghost" size="sm" onClick={() => del(o.id)}
                              data-testid={`order-delete-${o.id}`}
                              className="h-10 w-10 p-0 rounded-sm text-slate-500 hover:text-red-600 hover:bg-red-50 shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <OrderEditDialog
        open={!!editTarget}
        order={editTarget}
        onOpenChange={(o) => { if (!o) setEditTarget(null); }}
        onSaved={load}
      />

      <ConfirmDialog
        open={!!confirmState}
        onOpenChange={(o) => { if (!o) closeConfirm(); }}
        {...(confirmState || {})}
      />
    </div>
  );
}
