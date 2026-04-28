"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/auth-client";
import {
	type WsLine,
	type WsStatus,
	clearLog,
	getGameSocket,
	sendPing,
	wsLogKey,
	wsStatusKey,
} from "@/lib/game-socket";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function PlayPage() {
	const params = useParams<{ gameId: string }>();
	const gameId = params.gameId;
	const queryClient = useQueryClient();
	const { data: session, isPending: sessionPending } = useSession();

	const { data: status = "connecting" } = useQuery<WsStatus>({
		queryKey: wsStatusKey(gameId),
		queryFn: () => {
			getGameSocket(gameId, queryClient);
			return (queryClient.getQueryData<WsStatus>(wsStatusKey(gameId)) ?? "connecting") as WsStatus;
		},
		enabled: !!session,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
	});

	const { data: log = [] } = useQuery<WsLine[]>({
		queryKey: wsLogKey(gameId),
		queryFn: () => queryClient.getQueryData<WsLine[]>(wsLogKey(gameId)) ?? [],
		enabled: !!session,
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
	});

	const ping = useMutation({ mutationFn: () => Promise.resolve(sendPing(gameId, queryClient)) });

	if (sessionPending) {
		return null;
	}

	if (!session) {
		return (
			<main className="flex min-h-screen items-center justify-center p-6">
				<Card className="w-full max-w-sm">
					<CardHeader>
						<CardTitle>Sign in required</CardTitle>
						<CardDescription>
							The WebSocket upgrade rejects unauthenticated connections.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button asChild>
							<Link href="/sign-in">Sign in</Link>
						</Button>
					</CardContent>
				</Card>
			</main>
		);
	}

	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
			<Card className="w-full max-w-2xl">
				<CardHeader>
					<CardTitle className="font-mono uppercase">Game: {gameId}</CardTitle>
					<CardDescription>
						Phase 0 WebSocket round-trip. Status: <span className="font-mono">{status}</span>
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<div className="flex gap-2">
						<Button onClick={() => ping.mutate()} disabled={status !== "open" || ping.isPending}>
							Send ping
						</Button>
						<Button variant="ghost" onClick={() => clearLog(gameId, queryClient)}>
							Clear
						</Button>
					</div>
					<div className="rounded-md border border-border bg-card p-3 font-mono text-xs">
						{log.length === 0 ? (
							<span className="text-muted-foreground">No messages yet.</span>
						) : (
							log.map((line) => (
								<div key={line.ts} className={line.dir === "out" ? "text-primary" : ""}>
									<span className="text-muted-foreground">{line.dir === "out" ? "→ " : "← "}</span>
									{line.text}
								</div>
							))
						)}
					</div>
				</CardContent>
			</Card>
		</main>
	);
}
