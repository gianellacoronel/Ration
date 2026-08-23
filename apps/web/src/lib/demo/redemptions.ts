import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { join } from "node:path";

/**
 * Replay protection for paid transactions. A transaction hash may unlock the
 * protected resource exactly once per seller/token/network scope.
 *
 * Claims are tracked in process memory for atomicity (Node runs route handlers
 * on a single event loop, so check-and-set is race-free) and mirrored to a
 * JSON file so a server restart cannot resurrect an already-redeemed hash.
 */
export class RedemptionStore {
  private readonly redeemed: Set<string> = new Set();
  private readonly filePath: string | null;

  constructor(filePath: string | null) {
    this.filePath = filePath;
    this.load();
  }

  /**
   * Atomically claims the hash. Returns false when it was already redeemed.
   */
  claim(txHash: string): boolean {
    const key = txHash.toLowerCase();
    if (this.redeemed.has(key)) return false;
    this.redeemed.add(key);
    try {
      this.persist();
    } catch {
      // Best-effort durability; the in-memory claim still holds.
    }
    return true;
  }

  private load(): void {
    if (!this.filePath || !existsSync(this.filePath)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as unknown;
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (typeof entry === "string") this.redeemed.add(entry.toLowerCase());
        }
      }
    } catch {
      // A corrupted ledger falls back to memory-only tracking.
    }
  }

  private persist(): void {
    if (!this.filePath) return;
    const directory = join(this.filePath, "..");
    mkdirSync(directory, { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify([...this.redeemed], null, 2)}\n`);
    renameSync(tempPath, this.filePath);
  }
}

let globalStore: RedemptionStore | undefined;

export function getRedemptionStore(scope: string): RedemptionStore {
  const override = process.env.RATION_DEMO_REDEMPTIONS_PATH?.trim();
  const fileName = `ration-demo-redemptions-${createHash("sha256").update(scope).digest("hex").slice(0, 16)}.json`;
  const filePath =
    override || join(tmpdir(), "ration-demo", fileName);
  globalStore ??= new RedemptionStore(filePath);
  return globalStore;
}
