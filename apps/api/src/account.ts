import { schema } from "@geopolitik/db";
import { updateProfileBody, updateProfileResponse } from "@geopolitik/shared/api";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth } from "./auth-helper";
import { db } from "./db";
import { logger } from "./logger";
import { rateLimit } from "./rate-limit";

export function createAccountRouter() {
	const account = new Hono();

	// ── PATCH /account/profile ────────────────────────────────────────────────
	account.patch("/account/profile", async (c) => {
		const authResult = await requireAuth(c.req.raw);
		if (authResult instanceof Response) return authResult;
		const { userId } = authResult;

		const limit = await rateLimit({
			key: `rl:account-profile:${userId}`,
			max: 30,
			windowSeconds: 60,
		});
		if (!limit.ok) return c.json({ error: "rate_limited" }, 429);

		const parsed = updateProfileBody.safeParse(await c.req.json().catch(() => null));
		if (!parsed.success) {
			return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
		}
		const name = parsed.data.name;

		await db
			.update(schema.user)
			.set({ name, updatedAt: new Date() })
			.where(eq(schema.user.id, userId));

		logger.info({ userId, name }, "account.profile.update");

		return c.json(updateProfileResponse.parse({ user: { id: userId, name } }));
	});

	return account;
}
