import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "../generated/prisma/client.js";
import { EMBEDDING_DIM, PgVectorStore, toVectorLiteral } from "./pgvector.js";
import type { VectorRecord } from "./vector-store.js";

// ── Always-on unit tests (no database) ──────────────────────────────────────────
describe("toVectorLiteral", () => {
	it("formats a valid vector as a bracketed, comma-joined literal", () => {
		const v = new Array(EMBEDDING_DIM).fill(0);
		v[0] = 1;
		const literal = toVectorLiteral(v);
		expect(literal.startsWith("[")).toBe(true);
		expect(literal.endsWith("]")).toBe(true);
		expect(literal.split(",")).toHaveLength(EMBEDDING_DIM);
	});

	it("throws when the dimension is wrong", () => {
		expect(() => toVectorLiteral([1, 0, 0])).toThrow(/1024-dim/);
	});

	it("throws on a non-finite value", () => {
		const v = new Array(EMBEDDING_DIM).fill(0);
		v[5] = Number.NaN;
		expect(() => toVectorLiteral(v)).toThrow(/non-finite/);
	});
});

// ── DB-gated contract tests (mirror memory.test.ts against real Postgres) ────────
// Probe once at load: skip the whole block unless DATABASE_URL is set AND the chunks
// table is reachable+migrated — so `pnpm test` stays green offline / in CI without a DB.
const DB_URL = process.env.DATABASE_URL;

async function probe(url: string): Promise<PrismaClient | null> {
	const client = new PrismaClient({
		adapter: new PrismaPg({ connectionString: url }),
	});
	try {
		await client.$queryRaw`SELECT 1 FROM "chunks" LIMIT 1`;
		return client;
	} catch {
		await client.$disconnect().catch(() => {});
		return null;
	}
}

const prisma = DB_URL ? await probe(DB_URL) : null;

/** A 1024-dim unit vector with a single hot index (already length 1). */
function unit(hot: number): number[] {
	const v = new Array(EMBEDDING_DIM).fill(0);
	v[hot] = 1;
	return v;
}

/** A 1024-dim unit vector split between two indices (cosine ~0.707 to either unit). */
function twoHot(a: number, b: number): number[] {
	const v = new Array(EMBEDDING_DIM).fill(0);
	v[a] = Math.SQRT1_2;
	v[b] = Math.SQRT1_2;
	return v;
}

function makeRecord(
	id: string,
	embedding: number[],
	marketId?: string,
): VectorRecord {
	return {
		chunk: {
			id,
			evidenceId: `ev-${id}`,
			text: `text ${id}`,
			index: 0,
			tokenCount: 1,
			publishedAt: null,
		},
		embedding,
		marketId,
	};
}

describe.skipIf(!prisma)(
	"PgVectorStore (requires Postgres on DATABASE_URL)",
	() => {
		// Constructed in beforeAll, not here: a skipped describe still RUNS this callback to
		// register its (skipped) tests, but hooks don't run — so this never throws offline.
		let store: PgVectorStore;

		beforeAll(() => {
			store = new PgVectorStore(prisma!);
		});

		beforeEach(async () => {
			await store.clear();
		});

		afterAll(async () => {
			await prisma?.$disconnect();
		});

		it("returns the topK most similar chunks ordered best-first", async () => {
			// query unit(0) is closest to 'a' (unit 0), then 'b' (split 0/1), then 'c' (unit 1)
			await store.upsert([
				makeRecord("a", unit(0)),
				makeRecord("b", twoHot(0, 1)),
				makeRecord("c", unit(1)),
			]);

			const hits = await store.query({ embedding: unit(0), topK: 2 });

			expect(hits.map((h) => h.chunk.id)).toEqual(["a", "b"]);
			expect(hits[0]!.similarity).toBeGreaterThan(hits[1]!.similarity);
			expect(hits[0]!.similarity).toBeCloseTo(1, 5);
		});

		it("restricts results to a marketId when one is given", async () => {
			await store.upsert([
				makeRecord("a", unit(0), "mkt-1"),
				makeRecord("b", unit(0), "mkt-2"),
			]);

			const hits = await store.query({
				embedding: unit(0),
				topK: 10,
				marketId: "mkt-1",
			});

			expect(hits.map((h) => h.chunk.id)).toEqual(["a"]);
		});

		it("searches the whole corpus when no marketId is given", async () => {
			await store.upsert([
				makeRecord("a", unit(0), "mkt-1"),
				makeRecord("b", unit(0), "mkt-2"),
			]);

			const hits = await store.query({ embedding: unit(0), topK: 10 });

			expect(hits).toHaveLength(2);
		});

		it("replaces a chunk on re-upsert instead of duplicating it", async () => {
			await store.upsert([makeRecord("a", unit(0))]);
			await store.upsert([makeRecord("a", unit(1))]);

			expect(await store.count()).toBe(1);
			const hits = await store.query({ embedding: unit(1), topK: 1 });
			expect(hits[0]!.similarity).toBeCloseTo(1, 5);
		});

		it("clears all records", async () => {
			await store.upsert([makeRecord("a", unit(0)), makeRecord("b", unit(1))]);

			await store.clear();

			expect(await store.count()).toBe(0);
		});
	},
);
