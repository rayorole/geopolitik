import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { siteSettings } from "@/lib/site-settings";

export function DangerZoneSection() {
	return (
		<Card className="border-destructive/40">
			<CardHeader>
				<CardTitle className="font-mono text-[11px] text-destructive uppercase tracking-[0.18em]">
					Danger zone
				</CardTitle>
				<CardDescription>Irreversible. Read carefully.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3 text-muted-foreground text-sm">
				<p className="text-foreground">Delete your account.</p>
				<p>
					Self-serve deletion isn't built yet. To delete your account, email{" "}
					<a
						className="text-primary hover:underline"
						href={`mailto:${siteSettings.contactEmail}?subject=Account%20deletion%20request`}
					>
						{siteSettings.contactEmail}
					</a>{" "}
					from your registered address. We process requests within 30 days. Player rows and
					owned-city rows are removed; tick logs are anonymized but retained for game integrity.
				</p>
				<p className="font-mono text-[11px] uppercase tracking-[0.14em]">
					See{" "}
					<a className="text-primary hover:underline" href="/tos">
						Terms § 5
					</a>{" "}
					and{" "}
					<a className="text-primary hover:underline" href="/privacy">
						Privacy § 7
					</a>{" "}
					for the full procedure.
				</p>
			</CardContent>
		</Card>
	);
}
