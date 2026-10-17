export type Candidate = readonly [address: string, blockNumber: number];

// ConsensusMain.isGhostContract(address), verified against the ABI shipped by
// genlayer-js 0.28.4. This is not GhostFactory.ghostContracts(address).
export const GHOST_SELECTOR = "0xaa923c02";

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

export function candidateClassificationUnresolved(evidence: {
  schemaFailed: boolean;
  ghostCheckFailed: boolean;
  isGhost: boolean;
}): boolean {
  if (evidence.ghostCheckFailed) return true;
  // A positive ghost check is authoritative even when schema retrieval is not
  // supported. A negative ghost check only establishes a non-contract when the
  // schema lookup itself completed successfully.
  return evidence.schemaFailed && !evidence.isGhost;
}

type Continuation = { cursor: number; candidateCursor: number };

export function planContinuations(options: {
  failedChunks: number;
  candidateFailures: number;
  candidateCursor: number;
  nextCandidateCursor: number | null;
  toBlock: number;
  olderCursor: number | null;
}): { continuation: Continuation | null; retryContinuation: Continuation | null } {
  if (options.failedChunks > 0) {
    return {
      continuation: { cursor: options.toBlock, candidateCursor: 0 },
      retryContinuation: { cursor: options.toBlock, candidateCursor: 0 },
    };
  }
  const continuation = options.nextCandidateCursor !== null
    ? { cursor: options.toBlock, candidateCursor: options.nextCandidateCursor }
    : options.olderCursor !== null
      ? { cursor: options.olderCursor, candidateCursor: 0 }
      : null;
  return {
    continuation,
    retryContinuation: options.candidateFailures > 0
      ? { cursor: options.toBlock, candidateCursor: options.candidateCursor }
      : null,
  };
}
