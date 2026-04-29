import { siteSettings } from "@/lib/site-settings";
import Link from "next/link";
import { Button } from "./ui/button";

export function SiteHeader() {
	return (
		<header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-4 sm:px-10">
			<Link
				href="/"
				className="font-display text-sm font-semibold tracking-[0.18em] text-foreground"
			>
				{siteSettings.brand}
			</Link>
			<Button asChild variant="ghost" size="sm">
				<Link href="/sign-in">Sign in</Link>
			</Button>
		</header>
	);
}
