import React, { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ShieldCheck, MapPin, Camera, X, AlertTriangle, LogOut, Smartphone } from "lucide-react";

/**
 * Post-login security verification.
 *
 * Two modes:
 *  - SOFT (enforced=false, desktop): user must still click Allow or Skip.
 *    If capture fails or user skips, login still proceeds. The event is
 *    recorded with consent=false so admins can see who skipped.
 *  - ENFORCED (enforced=true, mobile/tablet): capture is mandatory.
 *    If either the photo or location can't be captured (permission
 *    denied, hardware missing, user cancels), the user is signed out
 *    and shown an instructive error. They cannot reach the dashboard
 *    without a successful capture.
 *
 * Props:
 *   open       — show the dialog
 *   enforced   — true on mobile / tablet
 *   onDone     — called with ({allowed, signOut}) when the user has
 *                either succeeded ({allowed:true}) or hard-cancelled
 *                ({allowed:false, signOut:true}). On desktop "Skip"
 *                the parent gets ({allowed:false, signOut:false}) and
 *                should navigate to the dashboard.
 */
export default function LoginAttestationDialog({ open, enforced = false, onDone }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState("ask"); // ask | capturing | error
  const [msg, setMsg] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const stopStream = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      try { s.getTracks().forEach((t) => t.stop()); } catch (e) { console.warn(e); }
      streamRef.current = null;
    }
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  // Reset internal state every time the dialog re-opens (so user can retry).
  useEffect(() => {
    if (open) {
      setPhase("ask");
      setErrMsg("");
      setMsg("");
    }
  }, [open]);

  /** Best-effort POST — never throws to caller. */
  const submitRecord = async (payload) => {
    try {
      await api.post("/auth/attestation", payload);
    } catch (e) {
      console.warn("Login attestation submit failed", e);
    }
  };

  const captureLocation = () =>
    new Promise((resolve) => {
      if (!("geolocation" in navigator)) {
        resolve({ location_skipped: true, error: "geolocation_unavailable" });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy_meters: pos.coords.accuracy,
        }),
        (err) => resolve({ location_skipped: true, error: `geo:${err.code}:${err.message}` }),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
      );
    });

  const capturePhoto = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      return { photo_skipped: true, error: "no_camera_api" };
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 360 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return { photo_skipped: true, error: "no_video_el" };
      video.srcObject = stream;
      await new Promise((res) => {
        if (video.readyState >= 2) return res();
        video.onloadeddata = () => res();
      });
      await video.play().catch(() => {});
      await new Promise((r) => setTimeout(r, 350));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 480;
      canvas.height = video.videoHeight || 360;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
      stopStream();
      return { photo_b64: dataUrl };
    } catch (e) {
      stopStream();
      return { photo_skipped: true, error: `cam:${e.name || ""}:${e.message || e}` };
    }
  };

  const handleAllow = async () => {
    setPhase("capturing");
    setErrMsg("");
    setMsg(t("attestation.capturing"));
    const loc = await captureLocation();
    setMsg(t("attestation.capturingPhoto"));
    const photo = await capturePhoto();

    const payload = {
      consent: true,
      latitude: loc.latitude ?? null,
      longitude: loc.longitude ?? null,
      accuracy_meters: loc.accuracy_meters ?? null,
      photo_b64: photo.photo_b64 || null,
      photo_skipped: Boolean(photo.photo_skipped),
      location_skipped: Boolean(loc.location_skipped),
      error: [loc.error, photo.error].filter(Boolean).join(" | ") || null,
    };

    // ----- Enforced mode (mobile / tablet): BOTH photo and location required -----
    if (enforced) {
      const missingPhoto = !payload.photo_b64;
      const missingLoc = payload.latitude == null || payload.longitude == null;
      if (missingPhoto || missingLoc) {
        // Still log the failed-capture attempt so admins see who tried
        await submitRecord({ ...payload, consent: false });
        setPhase("error");
        const reasons = [];
        if (missingPhoto) reasons.push(t("attestation.errPhoto"));
        if (missingLoc) reasons.push(t("attestation.errLocation"));
        setErrMsg(`${t("attestation.errEnforced")} ${reasons.join(" · ")}`);
        return;
      }
    }

    await submitRecord(payload);
    stopStream();
    onDone?.({ allowed: true, signOut: false });
  };

  const handleSkip = async () => {
    // Soft mode only — record + proceed
    setPhase("capturing");
    await submitRecord({
      consent: false,
      photo_skipped: true,
      location_skipped: true,
      error: "user_skipped",
    });
    stopStream();
    onDone?.({ allowed: false, signOut: false });
  };

  const handleSignOut = () => {
    stopStream();
    onDone?.({ allowed: false, signOut: true });
  };

  const handleRetry = () => {
    setPhase("ask");
    setErrMsg("");
  };

  if (!open) return null;

  const inProgress = phase === "capturing";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 px-4" data-testid="attestation-dialog">
      <div className="bg-white rounded-md w-full max-w-md shadow-2xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-sm bg-[#E65100]/10 text-[#E65100] flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-heading font-extrabold text-slate-900 text-base leading-none">{t("attestation.title")}</h2>
            <p className="text-[11px] text-slate-500 mt-1">{t("attestation.subtitle")}</p>
          </div>
          {enforced && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-800 rounded-sm text-[10px] font-bold uppercase tracking-wider" data-testid="attestation-required-badge">
              <Smartphone className="w-3 h-3" /> {t("attestation.requiredBadge")}
            </span>
          )}
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-700 leading-relaxed">
            {enforced ? t("attestation.noticeEnforced") : t("attestation.notice")}
          </p>

          <ul className="text-xs text-slate-600 space-y-1.5">
            <li className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-slate-400" /> {t("attestation.bulletLocation")}</li>
            <li className="flex items-center gap-2"><Camera className="w-3.5 h-3.5 text-slate-400" /> {t("attestation.bulletPhoto")}</li>
            <li className="flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5 text-slate-400" /> {t("attestation.bulletAdminOnly")}</li>
          </ul>

          {/* hidden video element used only as the frame source */}
          <video ref={videoRef} className="hidden" playsInline muted />

          {phase === "capturing" && (
            <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-sm px-3 py-2">
              {msg || t("attestation.capturing")}
            </div>
          )}

          {phase === "error" && (
            <div className="text-xs bg-red-50 border border-red-200 text-red-800 rounded-sm px-3 py-2 flex items-start gap-2" data-testid="attestation-error">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">{t("attestation.blockedTitle")}</div>
                <div className="mt-1 leading-relaxed">{errMsg}</div>
                <div className="mt-2 text-[11px] text-red-700">{t("attestation.howToFix")}</div>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex flex-wrap justify-end gap-2">
          {phase === "error" ? (
            <>
              <Button
                variant="outline"
                onClick={handleSignOut}
                data-testid="attestation-signout"
                className="rounded-sm h-10"
              >
                <LogOut className="w-4 h-4 mr-1" /> {t("attestation.signOut")}
              </Button>
              <Button
                onClick={handleRetry}
                data-testid="attestation-retry"
                className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm h-10 font-bold"
              >
                <ShieldCheck className="w-4 h-4 mr-1" /> {t("attestation.retry")}
              </Button>
            </>
          ) : enforced ? (
            <>
              <Button
                variant="outline"
                onClick={handleSignOut}
                disabled={inProgress}
                data-testid="attestation-signout"
                className="rounded-sm h-10"
              >
                <LogOut className="w-4 h-4 mr-1" /> {t("attestation.signOut")}
              </Button>
              <Button
                onClick={handleAllow}
                disabled={inProgress}
                data-testid="attestation-allow"
                className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm h-10 font-bold"
              >
                <ShieldCheck className="w-4 h-4 mr-1" /> {t("attestation.allow")}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleSkip}
                disabled={inProgress}
                data-testid="attestation-skip"
                className="rounded-sm h-10"
              >
                <X className="w-4 h-4 mr-1" /> {t("attestation.skip")}
              </Button>
              <Button
                onClick={handleAllow}
                disabled={inProgress}
                data-testid="attestation-allow"
                className="bg-[#E65100] hover:bg-[#CC4800] text-white rounded-sm h-10 font-bold"
              >
                <ShieldCheck className="w-4 h-4 mr-1" /> {t("attestation.allow")}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
