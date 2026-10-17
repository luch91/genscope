import { describe, expect, it } from "vitest";
import { extractGenLayerTxId, parseReceipt } from "../app/lib/parsers";
import type { RawReceipt } from "../app/lib/genlayer";

describe("GenLayer parsing", () => {
  // Protocol fixture mirrored from genlayer-js 0.28.4 transactionsStatusNumberToName.
  const authoritativeStatuses = [
    "UNINITIALIZED", "PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED",
    "UNDETERMINED", "FINALIZED", "CANCELED", "APPEAL_REVEALING", "APPEAL_COMMITTING",
    "READY_TO_FINALIZE", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT",
  ] as const;

  it("maps every authoritative GenLayer protocol status", () => {
    authoritativeStatuses.forEach((expected, status) => {
      const parsed = parseReceipt({ status } as RawReceipt, `0x${status}`);
      expect(parsed.status).toBe(expected);
      expect(parsed.statusCode).toBe(status);
    });
  });

  it("extracts the first ABI argument as the GenLayer transaction id", () => {
    const txId = "ab".repeat(32);
    expect(extractGenLayerTxId(`0x12345678${txId}00`)).toBe(`0x${txId}`);
    expect(extractGenLayerTxId("0x1234")).toBeNull();
  });

  it("normalizes authoritative receipt fields and consensus rounds", () => {
    const raw: RawReceipt = {
      id: "0x01",
      txOrigin: "0x02",
      sender: "0x0000000000000000000000000000000000000001",
      recipient: "0x0000000000000000000000000000000000000002",
      activator: "0x0000000000000000000000000000000000000003",
      status: 7,
      timestamps: { Created: 1, Pending: 2, Activated: 3, Proposed: 4, Committed: 5, LastVote: 6 },
      numOfInitialValidators: 1,
      roundData: [{
        round: 0,
        leaderIndex: 0,
        votesCommitted: 1,
        votesRevealed: 1,
        rotationsLeft: 0,
        result: 1,
        roundValidators: ["0xvalidator"],
        validatorVotes: "",
        validatorVotesHash: ["0xvote"],
      }],
      eqBlocksOutputs: "",
      txCallData: "abcdef01",
      readStateBlockRanges: [{ ActivationBlock: 10, ProcessingBlock: 11, ProposalBlock: 12 }],
    };
    const parsed = parseReceipt(raw, "0xhash", 42);
    expect(parsed.status).toBe("FINALIZED");
    expect(parsed.roundData[0].result).toBe("AGREE");
    expect(parsed.roundData[0].validatorVotesHash).toBe("0xvote");
    expect(parsed.eqBlocksOutputs).toBe("c0");
    expect(parsed.timestamps.Created).toBe("1970-01-01T00:00:01.000Z");
    expect(parsed.readStateBlockRange.ProposalBlock).toBe(12);
  });
});
