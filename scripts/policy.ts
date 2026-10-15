import type { Source } from "../shared/schema";
export const coreFields = [
  "title",
  "company",
  "canonicalUrl",
  "applyUrl",
  "derivedMetadata",
];
export function sourceGate(source: Source, now = new Date()): string | null {
  if (!source.enabled) return "Source is disabled";
  const a = source.approval;
  if (a.status !== "approved") return `Permission status: ${a.status}`;
  if (
    !a.reviewedAt ||
    !a.reviewAfter ||
    Date.parse(a.reviewAfter) <= +now ||
    Date.parse(a.reviewedAt) > +now
  )
    return "Permission review is missing or expired";
  if (
    !a.documentationUrl ||
    !a.termsUrl ||
    !a.permissionBasis?.trim() ||
    !a.attribution?.trim()
  )
    return "Permission evidence or attribution is incomplete";
  if (!coreFields.every((f) => a.publicFields.includes(f)))
    return "Required public metadata is not permitted";
  if (!a.allowGitHistory || a.maxRetentionDays !== null)
    return "Git history storage is not approved; finite deletion requirements need a different storage backend";
  if (
    ["greenhouse", "lever", "ashby"].includes(source.type) &&
    !/^[a-zA-Z0-9_-]+$/.test(source.board)
  )
    return "Invalid board identifier";
  if (["feed", "career-page"].includes(source.type) && !source.url)
    return "Reviewed source URL is missing";
  return null;
}
