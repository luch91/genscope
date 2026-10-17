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

  it("interprets the verified Bradbury receipt fixture", () => {
    const txId = "0x3cc6da768d07b64bfb9ce27130215abaf3731d503ec603adeeb70320ac7e3fad";
    const validators = [
      "0x7538369a22a176affccb6b273eedfbb92780bf22",
      "0xa856ae1b278f030082c66fa50a5f51f485d1f940",
      "0x183217483618c4ebd34c987de400e01beffe5860",
      "0xf01877b6ac60861ca3b134e0e483c482679b4682",
      "0xb4fb7adc6877a6a16bd131c7c9270834bd3def34",
    ];
    const parsed = parseReceipt({
      id: txId,
      txOrigin: "0x74ff0c760fedaeaaf8f0ece16ab43327ee57c463",
      sender: "0x74ff0c760fedaeaaf8f0ece16ab43327ee57c463",
      recipient: "0x87a3e3cd3aabe3b119511ee4d5c247f43cf286f1",
      activator: "0x470aaa7de37ff3e1c2b38ed9096263ca0d541f21",
      status: 7,
      timestamps: { Created: 1792272573, Pending: 1792272573, Activated: 1792272574, Proposed: 1792272576, Committed: 1792272580, LastVote: 1792272582 },
      numOfInitialValidators: 5,
      roundData: [{ round: 0, leaderIndex: 4, votesCommitted: 5, votesRevealed: 5, rotationsLeft: 1, result: 1, roundValidators: validators, validatorVotes: "AQEBAQE=", validatorVotesHash: [] }],
      eqBlocksOutputs: "c786706164646564",
      txCallData: "f2b01604",
      readStateBlockRanges: [{ ActivationBlock: 25406147, ProcessingBlock: 25406147, ProposalBlock: 25406149 }],
    }, txId);

    expect(parsed.id).toBe(txId);
    expect(parsed.statusCode).toBe(7);
    expect(parsed.status).toBe("FINALIZED");
    expect(parsed.roundData).toHaveLength(1);
    expect(parsed.roundData[0]).toMatchObject({ round: 0, result: "AGREE", roundValidators: validators });
    expect(parsed.consumedValidators).toEqual(validators);
  });
});
