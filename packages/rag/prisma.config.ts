import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer auto-loads .env for the CLI, and these commands run with packages/rag as
// the cwd — so point dotenv at the monorepo-root .env explicitly. (Passing DATABASE_URL inline
// on the command also works and overrides this.)
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

export default defineConfig({
	schema: "prisma/schema.prisma",
	migrations: { path: "prisma/migrations" },
	datasource: { url: env("DATABASE_URL") },
});
