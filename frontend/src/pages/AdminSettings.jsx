import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, AlertTriangle, Clock } from "lucide-react";

export default function AdminSettings() {
  const { t } = useTranslation();
  const [overdueDays, setOverdueDays] = useState("15");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/settings");
      setOverdueDays(String(data.overdue_days ?? 15));
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("common.failed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    const n = Number(overdueDays);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      toast.error(t("settings.errors.invalidDays"));
      return;
    }
    setSaving(true);
    try {
      await api.patch("/settings", { overdue_days: n });
      toast.success(t("settings.saved"));
    } catch (e) {
      toast.error(e?.response?.data?.detail || t("common.failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="admin-settings-page">
      <div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-[#E65100] font-bold">{t("settings.overline")}</div>
        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900">{t("settings.title")}</h1>
        <p className="text-slate-500 text-sm mt-1">{t("settings.subtitle")}</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm max-w-2xl">
        <div className="p-5 border-b border-slate-200 flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm bg-rose-50 border border-rose-200 grid place-items-center text-rose-600">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-slate-900">{t("settings.overdueTitle")}</div>
            <div className="text-xs text-slate-500">{t("settings.overdueSub")}</div>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">{t("settings.overdueDaysLabel")}</Label>
            <div className="mt-1.5 flex items-center gap-3">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                value={overdueDays}
                onChange={(e) => setOverdueDays(e.target.value.replace(/[^0-9]/g, ""))}
                onFocus={(e) => e.target.select()}
                data-testid="overdue-days-input"
                disabled={loading}
                className="h-11 w-32 rounded-sm font-mono-num text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-sm text-slate-500">{t("settings.daysSuffix")}</span>
            </div>
            <div className="mt-2 flex items-start gap-2 text-xs text-slate-500">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-rose-500 shrink-0" />
              <span>{t("settings.overdueHint")}</span>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 flex justify-end">
            <Button
              onClick={save}
              disabled={saving || loading}
              data-testid="overdue-days-save"
              className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm h-10 px-4 font-bold"
            >
              <Save className="w-4 h-4 mr-1.5" />
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
