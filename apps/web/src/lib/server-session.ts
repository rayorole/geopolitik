import { headers as nextHeaders } from "next/headers";
import { publicEnv } from "./env";

export type ServerSession = {
	user: { id: string; name: string; email: string; image?: string | null };
	session: { id: string; expiresAt: string };
} | null;

/**
 * Server-side session lookup. Forwards the inbound cookie to the API's Better Auth
 * `/api/auth/get-session` endpoint. Returns null on any error or absence of session —
 * we never throw from this path because every server component on the site calls it.
 */
export async function getServerSession(): Promise<ServerSession> {
	const cookie = (await nextHeaders()).get("cookie") ?? "";
	if (!cookie) return null;
	try {
		const res = await fetch(`${publicEnv.NEXT_PUBLIC_API_URL}/api/auth/get-session`, {
			headers: { cookie },
			cache: "no-store",
		});
		if (!res.ok) return null;
		const data = (await res.json()) as ServerSession;
		return data?.user ? data : null;
	} catch {
		return null;
	}
}
