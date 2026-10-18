export const MAX_RECONCILE_BLOCKS_PER_POLL = 50;

/**
 * Tracks only the unresolved reconciliation window. Successfully contiguous
 * heights are compacted into checkpoint instead of retained forever.
 */
export class BlockRecoveryTracker {
  checkpoint: number;
  private readonly pendingSuccess = new Set<number>();
  private readonly failed = new Set<number>();

  constructor(checkpoint = 0) {
    this.checkpoint = checkpoint;
  }

  plan(latest: number, limit = MAX_RECONCILE_BLOCKS_PER_POLL): number[] {
    const boundedLimit = Math.max(0, Math.min(limit, MAX_RECONCILE_BLOCKS_PER_POLL));
    if (boundedLimit === 0) return [];

    // Do not extend the window while a gap blocks checkpoint advancement. This
    // bounds both pending successes and failures even during long outages.
    if (this.failed.size > 0 || this.pendingSuccess.size > 0) {
      return [...this.failed].sort((a, b) => a - b).slice(0, boundedLimit);
    }

    const result: number[] = [];
    for (let height = this.checkpoint + 1; height <= latest && result.length < boundedLimit; height++) {
      result.push(height);
    }
    return result;
  }

  record(succeeded: Iterable<number>, failed: Iterable<number>): void {
    for (const height of succeeded) {
      if (height <= this.checkpoint) continue;
      this.failed.delete(height);
      this.pendingSuccess.add(height);
    }
    for (const height of failed) {
      if (height <= this.checkpoint) continue;
      this.pendingSuccess.delete(height);
      this.failed.add(height);
    }
    while (this.pendingSuccess.delete(this.checkpoint + 1)) {
      this.checkpoint += 1;
      this.failed.delete(this.checkpoint);
    }
  }

  rewind(firstHeight: number): void {
    this.checkpoint = Math.min(this.checkpoint, firstHeight - 1);
    this.pendingSuccess.clear();
    this.failed.clear();
  }

  get pendingCount(): number {
    return this.pendingSuccess.size;
  }

  get failedCount(): number {
    return this.failed.size;
  }
}
