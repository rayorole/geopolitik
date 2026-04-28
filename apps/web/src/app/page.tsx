import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function LandingPage() {
	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
			<div className="text-center">
				<h1 className="font-mono text-5xl font-bold tracking-tight">GEOPOLITIK</h1>
				<p className="mt-3 text-muted-foreground">
					Async, persistent, real-world-map grand strategy.
				</p>
			</div>
			<div className="flex gap-3">
				<Button asChild>
					<Link href="/sign-in">Sign in</Link>
				</Button>
				<Button asChild variant="secondary">
					<Link href="/sign-up">Create account</Link>
				</Button>
			</div>
			<p className="text-xs text-muted-foreground">Phase 0 build · pre-alpha</p>
		</main>
	);
}
