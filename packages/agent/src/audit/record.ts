import { createHash } from "node:crypto";

/**
 * One audit entry's content — a flat snapshot of what the run decided. Kept small and serializable
 * because it's what gets hashed; the full state lives in the LangSmith trace, this is the
 * tamper-evident ledger of outcomes.
 */
export interface AuditPayload {
	seq: number;
	at: string;
	marketId: string;
	question: string;
	probabilityYes: number | null;
	abstained: boolean;
	side: "yes" | "no" | null;
	units: number;
	approved: boolean;
	positionId: string | null;
}

/** A payload plus its place in the hash chain. */
export interface AuditRecord extends AuditPayload {
	prevHash: string;
	hash: string;
}

/** The chain's anchor — the prevHash of the very first record. */
export const GENESIS_HASH = "0".repeat(64);

/**
 * Chain a record to the one before it: sha256 over the previous hash + this payload. Any edit to a
 * past record (or a reordering) breaks every hash after it, so the log is tamper-evident.
 */
export function chainHash(prevHash: string, payload: AuditPayload): string {
	return createHash("sha256")
		.update(`${prevHash}:${JSON.stringify(payload)}`)
		.digest("hex");
}
