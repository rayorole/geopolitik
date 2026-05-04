import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SessionUser = {
	id: string;
	email: string;
	image?: string | null;
	createdAt?: string | Date;
};

export function IdentitySection({ user }: { user: SessionUser }) {
	const isDiscord = (user.image ?? "").startsWith("https://cdn.discordapp.com/");
	const memberSince = user.createdAt ? formatMemberSince(user.createdAt) : null;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-mono text-[11px] uppercase tracking-[0.18em]">
					Identity
				</CardTitle>
			</CardHeader>
			<CardContent>
				<dl className="flex flex-col gap-4">
					<Row label="Email">
						<span className="font-mono">{user.email}</span>
					</Row>
					<Row label="Sign-in method">
						<span className="font-mono">{isDiscord ? "Discord" : "Email + password"}</span>
					</Row>
					{memberSince ? (
						<Row label="Member since">
							<span className="font-mono">{memberSince}</span>
						</Row>
					) : null}
				</dl>
			</CardContent>
		</Card>
	);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
			<dt className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
				{label}
			</dt>
			<dd className="text-foreground text-sm">{children}</dd>
		</div>
	);
}

function formatMemberSince(value: string | Date): string {
	const d = typeof value === "string" ? new Date(value) : value;
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}
