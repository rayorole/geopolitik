import { parseEnv } from "@geopolitik/shared/env";
import { z } from "zod";

const envSchema = z.object({
	NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
	API_PORT: z.coerce.number().int().positive().default(3001),

	WEB_ORIGIN: z.string().url(),
	BETTER_AUTH_URL: z.string().url(),
	BETTER_AUTH_SECRET: z.string().min(32),

	DATABASE_URL: z.string().url(),
	REDIS_URL: z.string().url(),

	DISCORD_CLIENT_ID: z.string().min(1),
	DISCORD_CLIENT_SECRET: z.string().min(1),

	LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export const env = parseEnv(envSchema, process.env);
export type Env = typeof env;
