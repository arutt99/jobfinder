import he from "he";
export function text(value: string): string {
  return he
    .decode(
      value
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]*>/g, " "),
    )
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}
export function key(value: string): string {
  return text(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
export function date(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    !/^\d{4}-\d\d-\d\d/.test(value)
  )
    return null;
  const n = Date.parse(value);
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
}
export function canonicalUrl(value: string): string {
  const u = new URL(value);
  if (!/^https?:$/.test(u.protocol) || u.username || u.password)
    throw new Error("Unsafe job link");
  for (const p of [...u.searchParams.keys()])
    if (
      /^utm_/i.test(p) ||
      ["gclid", "fbclid", "msclkid"].includes(p.toLowerCase())
    )
      u.searchParams.delete(p);
  u.hash = "";
  u.searchParams.sort();
  return u.toString();
}
// Stable non-cryptographic identifier; snapshots use SHA-256 integrity checks separately.
export function hash(value: string): string {
  let a = 2166136261;
  let b = 5381;
  for (const c of value) {
    a = Math.imul(a ^ c.charCodeAt(0), 16777619);
    b = Math.imul(b, 33) ^ c.charCodeAt(0);
  }
  return (
    (a >>> 0).toString(16).padStart(8, "0") +
    (b >>> 0).toString(16).padStart(8, "0")
  );
}
export function identity(type: string, board: string, id: string): string {
  return `job-${hash(JSON.stringify([type, board, id]))}`;
}
