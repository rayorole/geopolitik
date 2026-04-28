"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/auth-client";
import { publicEnv } from "@/lib/env";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Line = { dir: "out" | "in"; text: string; ts: number };

export default function PlayPage() {
	const params = useParams<{ worldId: string }>();
	const router = useRouter();
	const { data, isPending } = useSession();
	const wsRef = useRef<WebSocket | null>(null);
	const [status, setStatus] = useState<"idle" | "connecting" | "open" | "closed">("idle");
	const [lines, setLines] = useState<Line[]>([]);

	useEffect(() => {
		if (!isPending && !data) router.replace("/sign-in");
	}, [data, isPending, router]);

	useEffect(() => {
		if (!data) return;
		setStatus("connecting");
		const ws = new WebSocket(publicEnv.NEXT_PUBLIC_WS_URL);
		wsRef.current = ws;
		ws.onopen = () => setStatus("open");
		ws.onclose = () => setStatus("closed");
		ws.onmessage = (ev) => {
			setLines((prev) => [...prev, { dir: "in", text: String(ev.data), ts: Date.now() }]);
		};
		return () => ws.close();
	}, [data]);

	function sendPing() {
		const ws = wsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN) return;
		const msg = JSON.stringify({ type: "ping", nonce: crypto.randomUUID() });
		ws.send(msg);
		setLines((prev) => [...prev, { dir: "out", text: msg, ts: Date.now() }]);
	}

	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
			<Card className="w-full max-w-2xl">
				<CardHeader>
					<CardTitle className="font-mono uppercase">World: {params.worldId}</CardTitle>
					<CardDescription>
						Phase 0 WebSocket round-trip. Status: <span className="font-mono">{status}</span>
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<div className="flex gap-2">
						<Button onClick={sendPing} disabled={status !== "open"}>
							Send ping
						</Button>
						<Button variant="ghost" onClick={() => setLines([])}>
							Clear
						</Button>
					</div>
					<div className="rounded-md border border-border bg-card p-3 font-mono text-xs">
						{lines.length === 0 ? (
							<span className="text-muted-foreground">No messages yet.</span>
						) : (
							lines.map((l) => (
								<div key={l.ts} className={l.dir === "out" ? "text-primary" : ""}>
									<span className="text-muted-foreground">{l.dir === "out" ? "→ " : "← "}</span>
									{l.text}
								</div>
							))
						)}
					</div>
				</CardContent>
			</Card>
		</main>
	);
}
