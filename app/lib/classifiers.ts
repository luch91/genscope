import type { GenLayerTransaction } from "../types";

export function isIntelligentContract(tx: GenLayerTransaction): boolean {
  // A tx is intelligent if it required AI consensus
  const hasRounds = tx.roundData && tx.roundData.length > 0;
  const hasValidators = tx.numOfInitialValidators > 0;
  const hasEqOutputs =
    tx.eqBlocksOutputs &&
    tx.eqBlocksOutputs !== "c0" &&
    tx.eqBlocksOutputs !== "0xc0";
  const hasRecipient =
    tx.recipient &&
    tx.recipient !== "" &&
    tx.recipient !== "0x0000000000000000000000000000000000000000";

  return !!(hasRounds && hasValidators) || !!(hasEqOutputs && hasRecipient);
}

export function getBlockColorType(
  hasIntelligent: boolean,
  hasStandard: boolean,
  isEmpty: boolean
): "empty" | "standard" | "intelligent" | "mixed" {
  if (isEmpty) return "empty";
  if (hasIntelligent && hasStandard) return "mixed";
  if (hasIntelligent) return "intelligent";
  return "standard";
}
