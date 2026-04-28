import { redis } from "./redis";

/*
 * Fixed-window rate limiter on Redis.
 * Phase 2 keeps it simple — INCR a key, set TTL on first hit, allow if count <= max.
 * Phase 11 swaps in a true sliding window via Lua script if abuse becomes real.
 */
export async function rateLimit(opts: {
	key: string;
	max: number;
	windowSeconds: number;
}): Promise<{ ok: boolean; count: number }> {
	const { key, max, windowSeconds } = opts;
	const count = await redis.incr(key);
	if (count === 1) {
		await redis.expire(key, windowSeconds);
	}
	return { ok: count <= max, count };
}
