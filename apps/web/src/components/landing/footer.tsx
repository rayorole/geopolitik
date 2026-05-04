import { siteSettings } from "@/lib/site-settings";
import Link from "next/link";

export function Footer() {
	return (
		<footer className="border-t border-border py-10">
			<div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-center sm:flex-row sm:px-10 sm:text-left">
				<span className="font-display font-semibold text-foreground text-sm tracking-[0.18em]">
					{siteSettings.brand}
				</span>
				<nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
					<Link href="/tos" className="hover:text-foreground">
						TOS
					</Link>
					<Link href="/privacy" className="hover:text-foreground">
						Privacy
					</Link>
					<a
						href={siteSettings.discordUrl}
						target="_blank"
						rel="noreferrer"
						className="hover:text-foreground"
					>
						Discord
					</a>
					<span>
						© {siteSettings.copyrightYear} {siteSettings.copyrightHolder}
					</span>
				</nav>
			</div>
			<p className="mt-6 px-6 text-center font-mono text-[10px] text-muted-foreground/60 uppercase tracking-[0.18em]">
				Original work. Not affiliated with any existing title.
			</p>
		</footer>
	);
}
