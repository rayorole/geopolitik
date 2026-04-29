import { Button } from "@/components/ui/button";
import { getLandingMarkers } from "@/lib/landing-data";
import { siteSettings } from "@/lib/site-settings";
import Link from "next/link";
import { Globe } from "./globe";

export function Hero() {
	const markers = getLandingMarkers();
	return (
		<section className="relative isolate overflow-hidden">
			<div className="mx-auto flex min-h-screen max-w-7xl flex-col items-center gap-12 px-6 pt-32 pb-20 sm:px-10 lg:flex-row lg:items-center lg:justify-between lg:gap-16 lg:pt-36">
				<div className="z-10 flex max-w-xl flex-col items-start gap-6 text-left">
					<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
						Pre-alpha · {siteSettings.copyrightYear}
					</p>
					<h1 className="font-display font-semibold text-5xl tracking-tight sm:text-6xl lg:text-7xl">
						Command the
						<br />
						cold map.
					</h1>
					<p className="max-w-md font-mono text-muted-foreground text-sm sm:text-base">
						Async grand strategy on the actual planet.
						<br />
						<span className="text-foreground">~140 countries</span> ·{" "}
						<span className="text-foreground">city-level management</span> ·{" "}
						<span className="text-foreground">30-second ticks</span> ·{" "}
						<span className="text-foreground">multi-week matches</span>.
					</p>
					<div className="flex flex-wrap gap-3 pt-2">
						<Button asChild size="lg">
							<a href={siteSettings.discordUrl} target="_blank" rel="noreferrer">
								Join the closed alpha →
							</a>
						</Button>
						<Button asChild variant="ghost" size="lg">
							<Link href="/sign-in">Sign in</Link>
						</Button>
					</div>
				</div>
				<div className="relative w-full lg:w-auto">
					<Globe markers={markers} />
				</div>
			</div>
		</section>
	);
}
