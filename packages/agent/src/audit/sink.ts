import type { AuditRecord } from "./record.js";

/**
 * Append-only audit log. The `log` node appends; callers (and verifiers) read back. Abstracted so
 * v1 can keep it in memory and a later version can persist to a file or DB without touching nodes.
 */
export interface AuditSink {
	/** Append one record to the end of the log. */
	append(record: AuditRecord): Promise<void>;
	/** Return all records, oldest first (a copy — callers can't mutate the log). */
	records(): Promise<AuditRecord[]>;
}

/** In-memory audit log for v1 — lives as long as the graph instance that owns it. */
export class InMemoryAuditLog implements AuditSink {
	private readonly entries: AuditRecord[] = [];

	async append(record: AuditRecord): Promise<void> {
		this.entries.push(record);
	}

	async records(): Promise<AuditRecord[]> {
		return [...this.entries];
	}
}
