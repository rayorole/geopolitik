import { parseEnv } from "@geopolitik/shared/env";
import { z } from "zod";

const schema = z.object({
	NEXT_PUBLIC_API_URL: z.string().url(),
	NEXT_PUBLIC_WS_URL: z.string().url(),
});

export const publicEnv = parseEnv(schema, {
	NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
	NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
} as NodeJS.ProcessEnv);
