import type { z } from "zod";

/**
 * Validate a process.env-shaped object against a Zod schema.
 * Throws a readable error listing every missing/invalid key.
 */
export function parseEnv<T extends z.ZodTypeAny>(
	schema: T,
	source: Record<string, string | undefined>,
): z.infer<T> {
	const parsed = schema.safeParse(source);
	if (!parsed.success) {
		const issues = parsed.error.issues
			.map((i) => `  - ${i.path.join(".")}: ${i.message}`)
			.join("\n");
		throw new Error(`Invalid environment variables:\n${issues}`);
	}
	return parsed.data;
}
