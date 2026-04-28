import { env } from "./env";
import { logger } from "./logger";
import { createApp } from "./routes";
import { handleUpgrade, websocketHandlers } from "./ws";

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
