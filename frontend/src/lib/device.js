/**
 * Lightweight device classification used to decide whether the login
 * attestation (photo + location) is MANDATORY (mobile / tablet) or
 * SOFT (desktop — the user still sees the prompt and clicks Allow,
 * but is not blocked if capture fails or is skipped).
 *
 * Detection rules:
 *  - Any UA matching the standard mobile/tablet token list → mobile
 *  - iPad on iPadOS 13+ which masquerades as "Macintosh" + has touch → mobile
 *  - Tablets where UA reports the word "Tablet" → mobile
 *  - Everything else (desktop browsers, headless / SSR) → desktop
 */
export function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobi/i.test(ua)) {
    return true;
  }
  // iPad on iPadOS 13+ reports as "Macintosh" — distinguish via touch
  if (/Mac/i.test(ua) && navigator.maxTouchPoints > 1) {
    return true;
  }
  if (/Tablet|iPad/i.test(ua)) return true;
  return false;
}

/** Human-readable label, useful for logging / audit messages. */
export function deviceClass() {
  return isMobileDevice() ? "mobile" : "desktop";
}
