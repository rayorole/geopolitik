import { createAuthClient } from "better-auth/react";
import { publicEnv } from "./env.ts";

export const authClient = createAuthClient({
	baseURL: publicEnv.NEXT_PUBLIC_API_URL,
});

export const { useSession, signIn, signOut, signUp } = authClient;
