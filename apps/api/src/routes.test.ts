import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();

vi.mock("./auth.ts", () => ({
	auth: {
		handler: () => new Response("auth", { status: 200 }),
		api: { getSession: getSessionMock },
	},
}));
vi.mock("./db.ts", () => ({ db: {} }));
vi.mock("./redis.ts", () => ({
	redis: {
		incr: vi.fn().mockResolvedValue(1),
		expire: vi.fn().mockResolvedValue(1),
	},
}));
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

describe("auth boundaries", () => {
	beforeEach(() => {
		getSessionMock.mockReset();
	});

	it("POST /games requires auth", async () => {
		getSessionMock.mockResolvedValue(null);
		const app = createApp();
		const res = await app.request("/games", { method: "POST" });
		expect(res.status).toBe(401);
	});

	it("GET /games/mine requires auth", async () => {
		getSessionMock.mockResolvedValue(null);
		const app = createApp();
		const res = await app.request("/games/mine");
		expect(res.status).toBe(401);
	});

	it("PATCH /account/profile requires auth", async () => {
		getSessionMock.mockResolvedValue(null);
		const app = createApp();
		const res = await app.request("/account/profile", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "x" }),
		});
		expect(res.status).toBe(401);
	});
});

describe("PATCH /account/profile body validation", () => {
	const fakeUser = {
		user: { id: "00000000-0000-0000-0000-000000000001", name: "Old" },
	};

	beforeEach(() => {
		getSessionMock.mockReset();
		getSessionMock.mockResolvedValue(fakeUser);
	});

	it("rejects empty name", async () => {
		const app = createApp();
		const res = await app.request("/account/profile", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "   " }),
		});
		expect(res.status).toBe(400);
	});

	it("rejects too-long name (>32 chars)", async () => {
		const app = createApp();
		const res = await app.request("/account/profile", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "a".repeat(33) }),
		});
		expect(res.status).toBe(400);
	});

	it("rejects missing body", async () => {
		const app = createApp();
		const res = await app.request("/account/profile", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
		});
		expect(res.status).toBe(400);
	});

	it("rejects malformed JSON", async () => {
		const app = createApp();
		const res = await app.request("/account/profile", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: "{not json",
		});
		expect(res.status).toBe(400);
	});
});

describe("GET /world/factions", () => {
	it("returns the factions catalog without auth", async () => {
		const app = createApp();
		const res = await app.request("/world/factions");
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			version: number;
			factions: Record<string, unknown>;
			countryToFaction: Record<string, string>;
		};
		expect(body.version).toBe(1);
		expect(Object.keys(body.factions).sort()).toEqual(["china", "nato_eu", "russia", "us"]);
		expect(body.countryToFaction.USA).toBe("us");
		expect(body.countryToFaction.ITA).toBe("nato_eu");
	});
});

describe("GET /world/research/:faction", () => {
	it("returns 7 trees for a known faction", async () => {
		const app = createApp();
		const res = await app.request("/world/research/us");
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			faction: string;
			trees: { tree: string; nodes: unknown[] }[];
		};
		expect(body.faction).toBe("us");
		expect(body.trees).toHaveLength(7);
		const treeIds = body.trees.map((t) => t.tree).sort();
		expect(treeIds).toEqual([
			"air",
			"deep_water",
			"ground",
			"helicopters",
			"mechanized",
			"naval",
			"space",
		]);
	});

	it("returns 404 for unknown faction", async () => {
		const app = createApp();
		const res = await app.request("/world/research/atlantis");
		expect(res.status).toBe(404);
	});
});
