// Shared HTML escaping for untrusted text interpolated into innerHTML /
// template-string markup. Non-strings are coerced with String();
// null / undefined become "".
export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
