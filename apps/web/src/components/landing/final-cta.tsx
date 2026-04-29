import { Button } from "@/components/ui/button";
import { siteSettings } from "@/lib/site-settings";

export function FinalCta() {
	return (
		<section className="border-t border-border py-32">
			<div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 text-center sm:px-10">
				<h2 className="font-display font-semibold text-4xl tracking-tight sm:text-5xl">
					The alpha is closed.
					<br />
					<span className="text-muted-foreground">For now.</span>
				</h2>
				<p className="max-w-md font-mono text-muted-foreground text-sm">
					Built solo, opening it up gradually. Join the Discord and you'll be there when invites go
					out.
				</p>
				<Button asChild size="lg" className="mt-2">
					<a href={siteSettings.discordUrl} target="_blank" rel="noreferrer">
						Join the Discord →
					</a>
				</Button>
			</div>
		</section>
	);
}
