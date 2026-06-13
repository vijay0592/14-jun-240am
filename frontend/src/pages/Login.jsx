import React, { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, Wrench } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import BrandMark from "@/components/BrandMark";
import LoginAttestationDialog from "@/components/LoginAttestationDialog";
import { isMobileDevice } from "@/lib/device";

const BG = "https://images.unsplash.com/photo-1496247749665-49cf5b1022e9?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2Mzl8MHwxfHNlYXJjaHwyfHxtZXRhbCUyMG1hbnVmYWN0dXJpbmclMjBtYWNoaW5lcnl8ZW58MHx8fHwxNzgwNzQ5Njg5fDA&ixlib=rb-4.1.0&q=85";

export default function Login() {
  const { login, logout, user } = useAuth();
  const { t } = useTranslation();
  const nav = useNavigate();
  const [email, setEmail] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [busy, setBusy] = useState(false);
  const [showAttestation, setShowAttestation] = useState(false);
  // Capture once on mount — the device type doesn't change during a session.
  const enforced = React.useMemo(() => isMobileDevice(), []);

  React.useEffect(() => {
    if (user && !showAttestation) nav("/");
  }, [user, nav, showAttestation]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      toast.success(t("login.loggedIn"));
      // Show security verification dialog BEFORE navigating to dashboard.
      // On mobile this is mandatory (enforced=true). On desktop the user
      // still sees the prompt and clicks Allow / Skip, but cannot be
      // blocked from logging in.
      setShowAttestation(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("login.loginFailed"));
    } finally {
      setBusy(false);
    }
  };

  const onAttestationDone = ({ allowed, signOut } = {}) => {
    setShowAttestation(false);
    if (signOut) {
      // Enforced mobile flow: capture failed / user cancelled → sign out
      // and stay on /login so they don't reach the dashboard.
      logout();
      toast.error(t("attestation.signedOut"));
      return;
    }
    // Either Allow succeeded (mobile or desktop) OR desktop Skip — proceed
    if (allowed === false && enforced) {
      // Defensive: should never happen, but if enforced + not allowed, sign out
      logout();
      return;
    }
    nav("/");
  };

  const quickFill = (role) => {
    if (role === "admin") { setEmail("admin"); setPassword("admin123"); }
    else { setEmail("user"); setPassword("user123"); }
  };

  const heroTitle = t("login.heroTitle").split("\n");

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left visual */}
      <div className="hidden md:flex md:w-1/2 relative" style={{ backgroundImage: `url(${BG})`, backgroundSize: "cover", backgroundPosition: "center" }}>
        <div className="absolute inset-0 bg-slate-900/80" />
        <div className="relative z-10 flex flex-col justify-between p-10 text-white w-full">
          <div className="flex items-center gap-3">
            <BrandMark size={40} variant="dark" />
            <span className="font-heading font-bold text-lg tracking-wide">{t("nav.brand")}</span>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#E65100] mb-2">{t("login.heroOverline")}</div>
            <h1 className="font-heading text-4xl lg:text-5xl font-extrabold leading-[1.05]">
              {heroTitle.map((line, i) => (
                <React.Fragment key={i}>
                  {line}
                  {i < heroTitle.length - 1 && <br />}
                </React.Fragment>
              ))}
            </h1>
            <p className="mt-4 text-slate-300 max-w-md">
              {t("login.heroSubtitle")}
            </p>
          </div>
          <div className="flex gap-6 text-xs text-slate-400">
            <div><div className="text-white font-bold text-2xl font-mono-num">15</div>{t("login.heroStat1")}</div>
            <div><div className="text-white font-bold text-2xl font-mono-num">∞</div>{t("login.heroStat2")}</div>
            <div><div className="text-white font-bold text-2xl font-mono-num">2</div>{t("login.heroStat3")}</div>
          </div>
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-[#F8FAFC]">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between mb-8">
            <div className="md:hidden flex items-center gap-3">
              <BrandMark size={40} variant="dark" />
              <span className="font-heading font-bold text-lg">{t("nav.brand")}</span>
            </div>
            <div className="ml-auto">
              <LanguageSwitcher />
            </div>
          </div>

          <div className="text-[10px] uppercase tracking-[0.2em] text-[#E65100] font-bold mb-3">{t("login.overline")}</div>
          <h2 className="font-heading text-3xl sm:text-4xl font-extrabold text-slate-900 leading-tight">
            {t("login.title")}
          </h2>
          <p className="text-slate-500 mt-2 text-sm">{t("login.subtitle")}</p>

          <form onSubmit={submit} className="mt-8 space-y-4" data-testid="login-form">
            <div>
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-slate-700">{t("login.username")}</Label>
              <Input id="email" data-testid="login-email" type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={email}
                     onChange={(e) => setEmail(e.target.value)} required
                     className="mt-1.5 h-12 rounded-sm border-slate-300 font-mono-num" />
            </div>
            <div>
              <Label htmlFor="password" className="text-xs font-bold uppercase tracking-wider text-slate-700">{t("login.password")}</Label>
              <Input id="password" data-testid="login-password" type="password" value={password}
                     onChange={(e) => setPassword(e.target.value)} required
                     className="mt-1.5 h-12 rounded-sm border-slate-300" />
            </div>
            <Button type="submit" disabled={busy} data-testid="login-submit"
                    className="w-full h-12 rounded-sm bg-[#E65100] hover:bg-[#CC4800] text-white font-bold tracking-wide active:scale-[0.98] transition">
              {busy ? t("login.signingIn") : <>{t("login.submit")} <Lock className="w-4 h-4 ml-2" /></>}
            </Button>
          </form>

          <div className="mt-8 p-4 bg-white border border-slate-200 rounded-sm">
            <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-bold mb-2">{t("login.quickAccess")}</div>
            <div className="flex gap-2">
              <button data-testid="quick-admin" type="button" onClick={() => quickFill("admin")}
                      className="flex-1 text-left text-xs p-2 border border-slate-200 hover:border-[#E65100] hover:bg-orange-50 rounded-sm transition">
                <div className="font-bold text-slate-900">{t("login.admin")}</div>
                <div className="text-slate-500 font-mono-num">admin</div>
              </button>
              <button data-testid="quick-user" type="button" onClick={() => quickFill("user")}
                      className="flex-1 text-left text-xs p-2 border border-slate-200 hover:border-[#E65100] hover:bg-orange-50 rounded-sm transition">
                <div className="font-bold text-slate-900">{t("login.operator")}</div>
                <div className="text-slate-500 font-mono-num">user</div>
              </button>
            </div>
          </div>

          <div className="mt-6 text-xs text-slate-400 flex items-center gap-2">
            <Wrench className="w-3 h-3" /> {t("login.tagline")}
          </div>
        </div>
      </div>
      <LoginAttestationDialog open={showAttestation} enforced={enforced} onDone={onAttestationDone} />
    </div>
  );
}
