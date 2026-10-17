export type Candidate = readonly [address: string, blockNumber: number];

export function parseNonNegativeCursor(value: string | null, code: string): number | null {
  if (value === null) return null;
  if (!/^\d{1,12}$/.test(value)) throw new Error(code);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(code);
  return parsed;
}

export function sortCandidates(entries: Iterable<Candidate>): Candidate[] {
  return Array.from(entries).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
}

export function candidatePage(
  candidates: Candidate[],
  offset: number,
  remainingSubrequests: number,
): { candidates: Candidate[]; nextCandidateCursor: number | null } {
  const capacity = Math.max(0, Math.floor(remainingSubrequests / 3));
  const page = candidates.slice(offset, offset + capacity);
  const next = offset + page.length;
  return { candidates: page, nextCandidateCursor: next < candidates.length ? next : null };
}
