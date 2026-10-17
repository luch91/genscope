import { describe, expect, it } from "vitest";
import { candidatePage, parseNonNegativeCursor, planContinuations, sortCandidates } from "../app/api/contracts/pagination";

describe("contract discovery pagination", () => {
  const candidates = sortCandidates(Array.from({ length: 20 }, (_, index) => [
    `0x${index.toString(16).padStart(40, "0")}`,
    100 + (index % 3),
  ] as const));

  it("continues every candidate without silent truncation", () => {
    const first = candidatePage(candidates, 0, 30);
    expect(first.candidates).toHaveLength(10);
    expect(first.nextCandidateCursor).toBe(10);

    const second = candidatePage(candidates, first.nextCandidateCursor!, 30);
    expect(second.candidates).toHaveLength(10);
    expect(second.nextCandidateCursor).toBeNull();
    expect([...first.candidates, ...second.candidates]).toEqual(candidates);
  });

  it("uses worst-case subrequest cost and validates continuation cursors", () => {
    expect(candidatePage(candidates, 0, 8).candidates).toHaveLength(2);
    expect(() => parseNonNegativeCursor("-1", "INVALID_CANDIDATE_CURSOR"))
      .toThrowError("INVALID_CANDIDATE_CURSOR");
  });

  it("advances after injected candidate failures and exposes a retry cursor", () => {
    expect(planContinuations({
      failedChunks: 0,
      candidateFailures: 2,
      candidateCursor: 10,
      nextCandidateCursor: 20,
      toBlock: 500,
      olderCursor: 100,
    })).toEqual({
      continuation: { cursor: 500, candidateCursor: 20 },
      retryContinuation: { cursor: 500, candidateCursor: 10 },
    });
  });

  it("retries the whole range after an injected log-page failure", () => {
    expect(planContinuations({
      failedChunks: 1,
      candidateFailures: 0,
      candidateCursor: 10,
      nextCandidateCursor: 20,
      toBlock: 500,
      olderCursor: 100,
    })).toEqual({
      continuation: { cursor: 500, candidateCursor: 0 },
      retryContinuation: { cursor: 500, candidateCursor: 0 },
    });
  });
});
