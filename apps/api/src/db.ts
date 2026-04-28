import { createDb } from "@geopolitik/db";
import { env } from "./env.ts";

export const db = createDb(env.DATABASE_URL);
