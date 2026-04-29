import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getServerSession } from "@/lib/server-session";
import { siteSettings } from "@/lib/site-settings";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function LandingPage() {
	const session = await getServerSession();
	if (session) redirect("/games");

	return (
		<>
			<SiteHeader />
			<main className="relative flex min-h-screen flex-col items-center justify-center gap-8 p-8">
				<div className="text-center">
					<h1 className="font-display text-5xl font-semibold tracking-tight">
						{siteSettings.brand}
					</h1>
					<p className="mt-3 text-muted-foreground">{siteSettings.description}</p>
				</div>
				<div className="flex gap-3">
					<Button asChild>
						<Link href="/sign-in">Sign in</Link>
					</Button>
					<Button asChild variant="secondary">
						<Link href="/sign-up">Create account</Link>
					</Button>
				</div>
				<p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
					Pre-alpha · landing in PR2
				</p>
			</main>
		</>
	);
}
