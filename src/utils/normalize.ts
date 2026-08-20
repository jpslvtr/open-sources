const SUFFIXES = new Set([
  "JR", "SR", "II", "III", "IV", "V",
  "MD", "PHD", "ESQ", "DDS", "DO", "RN",
  "CPA", "MBA", "PE", "DVM",
]);

const PREFIXES = new Set([
  "MR", "MRS", "MS", "DR", "REV", "HON", "SGT", "CPL",
  "LT", "CAPT", "MAJ", "COL", "GEN", "ADM",
]);

function parseName(raw: string): { first: string; last: string } {
  if (raw.includes(",")) {
    const [last, ...rest] = raw.split(",");
    const first = rest.join(" ").trim();
    return { first, last: last.trim() };
  }
  const parts = raw.trim().split(/\s+/);
  if (parts.length === 1) return { first: "", last: parts[0] };
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(" ");
  return { first, last };
}

function stripMiddleInitials(name: string): string {
  const parts = name.split(/\s+/);
  if (parts.length <= 1) return name;
  // Keep the first token (first name). From the rest, drop single-letter tokens
  // (with optional trailing period) since those are middle initials.
  return [parts[0], ...parts.slice(1).filter((p) => p.replace(/\.$/, "").length > 1)].join(" ");
}

// Normalize a personal name into a canonical "FIRST LAST" form for matching.
// Strips prefixes (Dr, Mr, etc.), suffixes (Jr, III, MD, etc.), and middle initials.
export function normalizeName(raw: string): string {
  let name = raw.toUpperCase().trim();
  name = name.replace(/[^A-Z\s,\-]/g, "");

  const { first, last } = parseName(name);

  const firstParts = first.split(/\s+/).filter((p) => !PREFIXES.has(p) && !SUFFIXES.has(p));
  const lastParts = last.split(/\s+/).filter((p) => !SUFFIXES.has(p));

  let cleanFirst = firstParts.join(" ");
  const cleanLast = lastParts.join(" ");

  cleanFirst = stripMiddleInitials(cleanFirst);

  const canonical = [cleanFirst, cleanLast].filter(Boolean).join(" ").trim();
  return canonical.replace(/\s+/g, " ");
}

// Normalize an entity name, choosing strategy by type.
// Personal names get full normalization. Organizational names (committees)
// only get whitespace/punctuation cleanup without LAST,FIRST reordering.
export function normalizeEntityName(raw: string, type: string): string {
  if (type === "committee" || type === "organization") {
    return raw.toUpperCase().trim().replace(/[^A-Z0-9\s\-&]/g, "").replace(/\s+/g, " ");
  }
  return normalizeName(raw);
}

// Stable key for cache/index lookups - letters only, lowercase
export function nameKey(normalized: string): string {
  return normalized.toLowerCase().replace(/[^a-z]/g, "");
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Similarity score between two names, 0 to 1. Normalizes both before comparing.
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}

// Score how likely two records refer to the same entity. Returns 0-1.
// Combines name similarity with metadata boosts for state, employer, occupation, zip.
export function entityMatchScore(
  a: { name: string; state?: string; employer?: string; occupation?: string; zip?: string },
  b: { name: string; state?: string; employer?: string; occupation?: string; zip?: string },
): number {
  let score = nameSimilarity(a.name, b.name);

  if (a.state && b.state && a.state === b.state) score += 0.05;
  if (a.employer && b.employer) {
    const empSim = nameSimilarity(a.employer, b.employer);
    score += empSim * 0.03;
  }
  if (a.occupation && b.occupation) {
    const occNorm = (s: string) => s.toUpperCase().trim();
    if (occNorm(a.occupation) === occNorm(b.occupation)) score += 0.02;
  }
  if (a.zip && b.zip && a.zip.slice(0, 3) === b.zip.slice(0, 3)) score += 0.02;

  return Math.min(score, 1);
}
