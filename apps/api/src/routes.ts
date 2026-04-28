import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./auth";
import { env } from "./env";
import { createGamesRouter } from "./games";
import { logger } from "./logger";
import { createWorldRouter } from "./world";

export function createApp() {
	const app = new Hono();

	app.use(
		"*",
		cors({
			origin: env.WEB_ORIGIN,
			allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
			allowHeaders: ["Content-Type", "Authorization"],
			credentials: true,
		}),
	);

	app.use("*", async (c, next) => {
		const start = performance.now();
		await next();
		const ms = (performance.now() - start).toFixed(1);
		logger.info({ method: c.req.method, path: c.req.path, status: c.res.status, ms }, "request");
	});

	app.get("/health", (c) =>
		c.json({
			ok: true,
			service: "geopolitik-api",
			env: env.NODE_ENV,
			uptime: process.uptime(),
		}),
	);

	app.on(["GET", "POST"], "/api/auth/**", (c) => auth.handler(c.req.raw));

	app.route("/", createGamesRouter());
	app.route("/", createWorldRouter());

	return app;
}
