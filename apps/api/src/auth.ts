import { newId, schema } from "@geopolitik/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import { env } from "./env";

export const auth = betterAuth({
	baseURL: env.BETTER_AUTH_URL,
	secret: env.BETTER_AUTH_SECRET,
	trustedOrigins: [env.WEB_ORIGIN],
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: {
			user: schema.user,
			session: schema.session,
			account: schema.account,
			verification: schema.verification,
		},
	}),
	emailAndPassword: {
		enabled: true,
		// Phase 0: no email verification flow; Mailpit catches dev sends. Phase 9 wires reset flows.
		requireEmailVerification: false,
	},
	socialProviders: {
		discord: {
			clientId: env.DISCORD_CLIENT_ID,
			clientSecret: env.DISCORD_CLIENT_SECRET,
			scope: ["identify", "email"],
		},
	},
	session: {
		expiresIn: 60 * 60 * 24 * 30, // 30 days
		updateAge: 60 * 60 * 24, // refresh on activity within 24h
	},
	advanced: {
		generateId: () => newId(),
	},
});

export type Auth = typeof auth;
