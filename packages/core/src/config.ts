/**
 * Typed configuration, loaded and validated from environment variables.
 *
 * We do NOT read `process.env` scattered across the codebase. Instead every variable
 * is declared once here, validated with Zod, and handed back as a typed object. Two
 * deliberate choices:
 *
 *  1. Most keys are `.optional()` — importing `@lykos/core` should never crash just
 *     because (say) a Tavily key isn't set. You only need a given key when you run the
 *     package that uses it. Enforce presence at the point of use with `required()`.
 *  2. `POLYMARKET_GAMMA_URL` has a sane default, so the common case needs no config.
 *
 * Loading the `.env` file itself is the *app's* job (e.g. `node --env-file=.env ...`),
 * not core's — a library shouldn't have hidden side effects on import.
 */
import { z } from "zod";

const EnvSchema = z.object({
	ANTHROPIC_API_KEY: z.string().optional(),
	VOYAGE_API_KEY: z.string().optional(),
	TAVILY_API_KEY: z.string().optional(),
	DATABASE_URL: z.string().optional(),
	POLYMARKET_GAMMA_URL: z
		.string()
		.url()
		.default("https://gamma-api.polymarket.com"),
});

export type Config = z.infer<typeof EnvSchema>;

/** Parse + validate environment variables into a typed Config. */
export function loadConfig(
	env: Record<string, string | undefined> = process.env,
): Config {
	const parsed = EnvSchema.safeParse(env);
	if (!parsed.success) {
		const issues = parsed.error.issues
			.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
			.join("\n");
		throw new Error(`[CORE] Invalid environment configuration:\n${issues}`);
	}
	return parsed.data;
}

/**
 * Assert that an optional config value is actually present.
 * Throws a friendly, actionable error naming the missing variable.
 *
 *   const key = required(config.TAVILY_API_KEY, "TAVILY_API_KEY");
 */
export function required<T>(value: T | undefined | null, name: string): T {
	if (value === undefined || value === null || value === "") {
		throw new Error(
			`[CORE] Missing required config: ${name}. Add it to your .env (see .env.example).`,
		);
	}
	return value;
}
