-- Enable pgvector. Hand-added (Prisma can't express CREATE EXTENSION) so it lives in
-- migration history and runs identically on migrate dev / deploy / reset, dev + CI + prod.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "chunks" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "publishedAt" TEXT,
    "marketId" TEXT,
    "embedding" vector(1024),

    CONSTRAINT "chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chunks_marketId_idx" ON "chunks"("marketId");

-- HNSW cosine ANN index on the embedding column. Hand-added (Prisma can't express
-- USING hnsw / vector_cosine_ops). 1024 dims is well under pgvector's 2000-dim HNSW limit.
CREATE INDEX IF NOT EXISTS "chunks_embedding_hnsw_cosine"
    ON "chunks" USING hnsw ("embedding" vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
