import { auth } from "./auth";

export type AuthedUser = { userId: string; userName: string };

/**
 * Verifies a Better Auth session for an inbound request. Returns either the
 * authed user identifiers or a 401 Response that the caller should return
 * directly. Shared between the games and account routers.
 */
export async function requireAuth(req: Request): Promise<AuthedUser | Response> {
	const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
	if (!session) return new Response("Unauthorized", { status: 401 });
	return { userId: session.user.id, userName: session.user.name };
}
