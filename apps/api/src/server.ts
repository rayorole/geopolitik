import { env } from "./env.ts";
import { logger } from "./logger.ts";
import { createApp } from "./routes.ts";
import { handleUpgrade, websocketHandlers } from "./ws.ts";

const app = createApp();

const server = Bun.serve({
	port: env.API_PORT,
	async fetch(req, server) {
		const url = new URL(req.url);
		if (url.pathname === "/ws") {
			return handleUpgrade(req, server);
		}
		return app.fetch(req);
	},
	websocket: websocketHandlers,
});

logger.info(
	{ url: `http://localhost:${server.port}`, env: env.NODE_ENV },
	"geopolitik-api listening",
);
