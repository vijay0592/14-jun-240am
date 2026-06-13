import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, KeyRound, Trash2, Shield, User as UserIcon } from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useConfirm } from "@/lib/useConfirm";

export default function AdminUsers() {
  const { user: me } = useAuth();
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "user", username: "" });
  const [resetTarget, setResetTarget] = useState(null);
  const [newPwd, setNewPwd] = useState("");
  const { state: confirmState, confirm, close: closeConfirm } = useConfirm();

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/users");
      setUsers(data);
    } catch (e) { toast.error(e?.response?.data?.detail || t("common.failed")); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const submitAdd = async () => {
    if (!form.email.trim() || !form.password.trim() || !form.name.trim()) {
      toast.error(t("adminUsers.errors.allFields")); return;
    }
    if (form.password.length < 6) {
      toast.error(t("adminUsers.errors.passwordShort")); return;
    }
    try {
      await api.post("/users", form);
      toast.success(t("adminUsers.added", { email: form.username || form.email }));
      setShowAdd(false);
      setForm({ email: "", name: "", password: "", role: "user", username: "" });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || t("common.failed")); }
  };

  const del = (u) => {
    if (u.id === me?.id) { toast.error(t("adminUsers.errors.selfDelete")); return; }
    confirm({
      title: t("adminUsers.confirmDeleteTitle"),
      description: t("adminUsers.confirmDelete", { email: u.username || u.email }),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      onConfirm: async () => {
        closeConfirm();
        try {
          await api.delete(`/users/${u.id}`);
          toast.success(t("adminUsers.deleted"));
          load();
        } catch (e) { toast.error(e?.response?.data?.detail || t("common.failed")); }
      },
    });
  };

  const submitReset = async () => {
    if (!newPwd || newPwd.length < 6) { toast.error(t("adminUsers.errors.passwordShort")); return; }
    try {
      await api.post(`/users/${resetTarget.id}/reset-password`, { password: newPwd });
      toast.success(t("adminUsers.passwordReset", { email: resetTarget.email }));
      setResetTarget(null); setNewPwd("");
    } catch (e) { toast.error(e?.response?.data?.detail || t("common.failed")); }
  };

  return (
    <div className="space-y-5" data-testid="admin-users-page">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#E65100] font-bold">{t("adminUsers.overline")}</div>
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-slate-900">{t("adminUsers.title")}</h1>
          <p className="text-slate-500 text-sm mt-1">{t("adminUsers.subtitle")}</p>
        </div>
        <Button onClick={() => setShowAdd(true)} data-testid="add-user-btn"
                className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm h-10 px-4 font-bold">
          <UserPlus className="w-4 h-4 mr-1.5" /> {t("adminUsers.newUser")}
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-sm">
        {loading ? <div className="p-10 text-center text-slate-400">{t("common.loading")}</div> :
         users.length === 0 ? <div className="p-10 text-center text-slate-400">{t("adminUsers.empty")}</div> :
         <div className="divide-y divide-slate-100">
           {users.map((u) => (
             <div key={u.id} data-testid={`user-row-${u.id}`}
                  className="p-4 sm:p-5 flex items-center justify-between gap-3 hover:bg-slate-50">
               <div className="flex items-center gap-3 min-w-0">
                 <div className={`w-10 h-10 rounded-sm grid place-items-center ${u.role === "admin" ? "bg-orange-50 border border-orange-200 text-[#E65100]" : "bg-slate-100 border border-slate-200 text-slate-600"}`}>
                   {u.role === "admin" ? <Shield className="w-5 h-5" /> : <UserIcon className="w-5 h-5" />}
                 </div>
                 <div className="min-w-0">
                   <div className="font-bold text-slate-900 flex items-center gap-2">
                     <span className="font-mono-num">{u.username || (u.email || "").split("@")[0]}</span>
                     {u.id === me?.id && (
                       <span className="text-[10px] uppercase tracking-wider font-bold bg-slate-900 text-white px-1.5 py-0.5 rounded-sm">
                         {t("adminUsers.you")}
                       </span>
                     )}
                   </div>
                   <div className="text-xs text-slate-500">{u.name || u.email}</div>
                   <div className="text-[10px] uppercase tracking-wider mt-1 inline-block px-1.5 py-0.5 rounded-sm font-bold bg-slate-100 text-slate-700">
                     {u.role}
                   </div>
                 </div>
               </div>
               <div className="flex items-center gap-2">
                 <Button size="sm" variant="outline"
                         data-testid={`reset-password-${u.id}`}
                         onClick={() => { setResetTarget(u); setNewPwd(""); }}
                         className="rounded-sm border-slate-300">
                   <KeyRound className="w-3.5 h-3.5 mr-1" /> {t("adminUsers.resetBtn")}
                 </Button>
                 <Button size="sm" variant="outline"
                         data-testid={`delete-user-${u.id}`}
                         disabled={u.id === me?.id}
                         onClick={() => del(u)}
                         className="rounded-sm border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40">
                   <Trash2 className="w-3.5 h-3.5" />
                 </Button>
               </div>
             </div>
           ))}
         </div>}
      </div>

      {/* Add User Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">{t("adminUsers.addTitle")}</DialogTitle>
            <DialogDescription>{t("adminUsers.addSub")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-bold uppercase">{t("adminUsers.username")}</Label>
              <Input value={form.username}
                     onChange={(e) => setForm((p) => ({ ...p, username: e.target.value.toLowerCase().replace(/\s/g, "") }))}
                     data-testid="add-user-username" className="h-11 rounded-sm mt-1 font-mono-num"
                     placeholder={t("adminUsers.usernamePlaceholder")} />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">{t("common.name")}</Label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                     data-testid="add-user-name" className="h-11 rounded-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">{t("common.email")}</Label>
              <Input type="email" value={form.email}
                     onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                     data-testid="add-user-email" className="h-11 rounded-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">{t("adminUsers.password")}</Label>
              <Input type="text" value={form.password}
                     onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                     data-testid="add-user-password" className="h-11 rounded-sm mt-1 font-mono-num"
                     placeholder={t("adminUsers.passwordHint")} />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase">{t("adminUsers.role")}</Label>
              <Select value={form.role} onValueChange={(v) => setForm((p) => ({ ...p, role: v }))}>
                <SelectTrigger data-testid="add-user-role" className="h-11 rounded-sm mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">{t("adminUsers.roles.user")}</SelectItem>
                  <SelectItem value="admin">{t("adminUsers.roles.admin")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} className="rounded-sm">{t("common.cancel")}</Button>
            <Button onClick={submitAdd} data-testid="add-user-save"
                    className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm">{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent className="rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">{t("adminUsers.resetTitle")}</DialogTitle>
            <DialogDescription>{t("adminUsers.resetSub", { email: resetTarget?.email })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-bold uppercase">{t("adminUsers.newPassword")}</Label>
              <Input type="text" value={newPwd}
                     onChange={(e) => setNewPwd(e.target.value)}
                     data-testid="reset-password-input" className="h-11 rounded-sm mt-1 font-mono-num"
                     placeholder={t("adminUsers.passwordHint")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)} className="rounded-sm">{t("common.cancel")}</Button>
            <Button onClick={submitReset} data-testid="reset-password-save"
                    className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm">
              <KeyRound className="w-4 h-4 mr-1" /> {t("adminUsers.resetBtn")}
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
