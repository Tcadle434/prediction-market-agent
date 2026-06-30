/**
 * Postgres + pgvector implementation of {@link VectorStore} — the durable Stage-2 store.
 *
 * Prisma has no native vector type, so the `embedding` column is `Unsupported("vector(1024)")`
 * and is read/written ONLY through raw SQL ($executeRaw/$queryRaw); Prisma owns the connection,
 * schema, and migrations. Behaviour matches InMemoryVectorStore exactly:
 *   • upsert → INSERT ... ON CONFLICT ("id") DO UPDATE (idempotent replace, keyed by chunk.id)
 *   • query  → cosine KNN: similarity = 1 - (embedding <=> $vec); ORDER BY <=> ASC LIMIT topK,
 *             best-first; marketId filters, omit = whole corpus. (Voyage vectors are unit-norm,
 *             so this is numerically the same cosine the in-memory store computes.)
 *
 * All values are bound as tagged-template params; the `::vector` cast on a bound text literal is
 * injection-safe. The embedding column is never SELECTed back (Unsupported columns don't
 * deserialize cleanly). Validation throws [RAG]-prefixed errors, matching the rest of the package.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import type {
	VectorHit,
	VectorQuery,
	VectorRecord,
	VectorStore,
} from "./vector-store.js";

export const EMBEDDING_DIM = 1024;

/** Validate an embedding and format it as a pgvector text literal "[a,b,c]". */
export function toVectorLiteral(embedding: number[]): string {
	if (embedding.length !== EMBEDDING_DIM) {
		throw new Error(
			`[RAG] PgVectorStore: embedding must be ${EMBEDDING_DIM}-dim, got ${embedding.length}`,
		);
	}
	for (let i = 0; i < embedding.length; i++) {
		if (!Number.isFinite(embedding[i])) {
			throw new Error(
				`[RAG] PgVectorStore: non-finite value in embedding at index ${i}`,
			);
		}
	}
	return `[${embedding.join(",")}]`;
}

/** Row shape returned by the KNN query (the chunk columns + computed cosine similarity). */
interface ChunkHitRow {
	id: string;
	evidenceId: string;
	text: string;
	index: number;
	tokenCount: number;
	publishedAt: string | null;
	similarity: number;
}

function rowToHit(row: ChunkHitRow): VectorHit {
	return {
		chunk: {
			id: row.id,
			evidenceId: row.evidenceId,
			text: row.text,
			index: Number(row.index),
			tokenCount: Number(row.tokenCount),
			publishedAt: row.publishedAt ?? null,
		},
		similarity: Number(row.similarity),
	};
}

function isPrismaClient(value: unknown): value is PrismaClient {
	return typeof value === "object" && value !== null && "$executeRaw" in value;
}

export class PgVectorStore implements VectorStore {
	private readonly prisma: PrismaClient;
	private readonly ownsClient: boolean;

	/**
	 * Pass a shared PrismaClient (the store borrows it — preferred for tests/apps that pool a
	 * single connection), or `{ databaseUrl }` / nothing to let the store own a client built from
	 * the URL (or DATABASE_URL). Only an owned client is disconnected by {@link close}.
	 */
	constructor(arg?: PrismaClient | { databaseUrl?: string }) {
		if (isPrismaClient(arg)) {
			this.prisma = arg;
			this.ownsClient = false;
		} else {
			const url = arg?.databaseUrl ?? process.env.DATABASE_URL;
			if (!url) throw new Error("[RAG] PgVectorStore: DATABASE_URL is not set");
			this.prisma = new PrismaClient({
				adapter: new PrismaPg({ connectionString: url }),
			});
			this.ownsClient = true;
		}
	}

	async upsert(records: VectorRecord[]): Promise<void> {
		if (records.length === 0) return;
		// Validate every embedding BEFORE opening the transaction (throws on bad dim/non-finite).
		const statements = records.map((rec) => {
			const literal = toVectorLiteral(rec.embedding);
			const { chunk } = rec;
			return this.prisma.$executeRaw`
				INSERT INTO "chunks"
					("id", "evidenceId", "text", "index", "tokenCount", "publishedAt", "marketId", "embedding")
				VALUES (${chunk.id}, ${chunk.evidenceId}, ${chunk.text}, ${chunk.index},
					${chunk.tokenCount}, ${chunk.publishedAt}, ${rec.marketId ?? null}, ${literal}::vector)
				ON CONFLICT ("id") DO UPDATE SET
					"evidenceId" = EXCLUDED."evidenceId",
					"text" = EXCLUDED."text",
					"index" = EXCLUDED."index",
					"tokenCount" = EXCLUDED."tokenCount",
					"publishedAt" = EXCLUDED."publishedAt",
					"marketId" = EXCLUDED."marketId",
					"embedding" = EXCLUDED."embedding"`;
		});
		await this.prisma.$transaction(statements);
	}

	async query({
		embedding,
		topK,
		marketId,
	}: VectorQuery): Promise<VectorHit[]> {
		const literal = toVectorLiteral(embedding);
		// Two statements (not one with an OR) so the planner can pair the marketId btree with HNSW.
		const rows =
			marketId === undefined
				? await this.prisma.$queryRaw<ChunkHitRow[]>`
						SELECT "id", "evidenceId", "text", "index", "tokenCount", "publishedAt",
							1 - ("embedding" <=> ${literal}::vector) AS "similarity"
						FROM "chunks"
						WHERE "embedding" IS NOT NULL
						ORDER BY "embedding" <=> ${literal}::vector ASC
						LIMIT ${topK}`
				: await this.prisma.$queryRaw<ChunkHitRow[]>`
						SELECT "id", "evidenceId", "text", "index", "tokenCount", "publishedAt",
							1 - ("embedding" <=> ${literal}::vector) AS "similarity"
						FROM "chunks"
						WHERE "embedding" IS NOT NULL AND "marketId" = ${marketId}
						ORDER BY "embedding" <=> ${literal}::vector ASC
						LIMIT ${topK}`;
		return rows.map(rowToHit);
	}

	async clear(): Promise<void> {
		await this.prisma.chunk.deleteMany({});
	}

	async count(): Promise<number> {
		const rows = await this.prisma.$queryRaw<
			{ n: number }[]
		>`SELECT count(*)::int AS "n" FROM "chunks"`;
		return Number(rows[0]?.n ?? 0);
	}

	/** Disconnect the Prisma client — only if this store created it. */
	async close(): Promise<void> {
		if (this.ownsClient) await this.prisma.$disconnect();
	}
}
