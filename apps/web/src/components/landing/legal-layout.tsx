import { Footer } from "@/components/landing/footer";
import { SiteHeader } from "@/components/site-header";
import { siteSettings } from "@/lib/site-settings";
import type { ReactNode } from "react";

export function LegalLayout({
	title,
	intro,
	children,
}: {
	title: string;
	intro: string;
	children: ReactNode;
}) {
	return (
		<>
			<SiteHeader />
			<main className="mx-auto max-w-3xl px-6 pt-32 pb-20 sm:px-10">
				<header className="mb-12 border-border border-b pb-8">
					<p className="font-mono text-[11px] text-primary uppercase tracking-[0.18em]">Legal</p>
					<h1 className="mt-3 font-display font-semibold text-4xl tracking-tight sm:text-5xl">
						{title}
					</h1>
					<p className="mt-4 max-w-2xl text-muted-foreground">{intro}</p>
					<p className="mt-6 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
						Last updated · {siteSettings.legal.lastUpdated} · {siteSettings.legal.jurisdiction}
					</p>
				</header>
				<article className="legal-prose flex flex-col gap-8 text-foreground/90 leading-relaxed">
					{children}
				</article>
			</main>
			<Footer />
		</>
	);
}
