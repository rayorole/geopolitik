import { describe, expect, it, vi } from "vitest";

vi.mock("./auth.ts", () => ({
	auth: { handler: () => new Response("auth", { status: 200 }) },
}));
vi.mock("./db.ts", () => ({ db: {} }));
vi.mock("./env.ts", () => ({
	env: {
		NODE_ENV: "test",
		API_PORT: 3001,
		WEB_ORIGIN: "http://localhost:3000",
		BETTER_AUTH_URL: "http://localhost:3001",
		BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
		DATABASE_URL: "postgres://test",
		REDIS_URL: "redis://test",
		DISCORD_CLIENT_ID: "x",
		DISCORD_CLIENT_SECRET: "x",
		LOG_LEVEL: "silent",
	},
}));
vi.mock("./logger.ts", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

const { createApp } = await import("./routes.ts");

describe("/health", () => {
	it("returns ok", async () => {
		const app = createApp();
		const res = await app.request("/health");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: boolean; service: string };
		expect(body.ok).toBe(true);
		expect(body.service).toBe("geopolitik-api");
	});
});
