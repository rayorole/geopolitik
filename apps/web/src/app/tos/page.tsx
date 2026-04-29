import { LegalLayout } from "@/components/landing/legal-layout";
import { siteSettings } from "@/lib/site-settings";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Terms of Service",
	description: `Terms of service for the ${siteSettings.brand} closed alpha.`,
};

export default function TermsPage() {
	return (
		<LegalLayout
			title="Terms of Service"
			intro={`These terms govern your use of the ${siteSettings.brand} closed alpha. Plain language. Alpha-honest.`}
		>
			<Section heading="1. The short version">
				<p>
					{siteSettings.brand} is a closed alpha. It is unfinished, occasionally broken, and run by
					one person ({siteSettings.copyrightHolder}) out of {siteSettings.legal.jurisdiction}.
					Treat your account as disposable and your in-game progress as ephemeral. We may wipe
					worlds, reset balance, or shut the alpha down with little notice.
				</p>
			</Section>

			<Section heading="2. Alpha disclaimer">
				<p>
					You're playing a pre-release build. There is no service-level agreement, no uptime
					guarantee, no support hotline. Bugs may delete your queued orders, miscount resources, or
					end matches early. Save nothing important here.
				</p>
				<p>
					Game balance, mechanics, the tech tree, the country roster, the tick cadence — anything
					can change between deploys. If you sign up expecting the experience to be stable,
					polished, or final, this is not for you yet.
				</p>
			</Section>

			<Section heading="3. Your account">
				<p>
					You may create one account. One human, one account. No bots, no scripts, no automation.
				</p>
				<p>
					You sign in with Discord OAuth (recommended) or email + password. You're responsible for
					keeping your credentials safe; if someone else uses your account, that's on you.
				</p>
				<p>
					You must be at least 13 years old to play, matching Discord's own minimum. If you live in
					a jurisdiction where the digital-consent age is higher, follow your local rules.
				</p>
			</Section>

			<Section heading="4. Acceptable use">
				<p>Don't:</p>
				<ul className="ml-5 flex list-disc flex-col gap-2">
					<li>harass other players, in-game or out-of-game;</li>
					<li>post slurs, threats, sexual content, or content that's illegal where we operate;</li>
					<li>attempt to break authentication, impersonate other players, or scrape data;</li>
					<li>
						exploit bugs you discover instead of reporting them — if you find one, email{" "}
						<a
							className="text-primary hover:underline"
							href={`mailto:${siteSettings.contactEmail}`}
						>
							{siteSettings.contactEmail}
						</a>
						;
					</li>
					<li>resell, sublicense, or attempt to commercialize access to the alpha.</li>
				</ul>
				<p>
					Bannable behavior gets a warning the first time and an account termination the second.
					Severe cases (real-world threats, doxxing, attempting to compromise the service) skip the
					warning.
				</p>
			</Section>

			<Section heading="5. Deleting your account">
				<p>
					Self-serve deletion isn't built yet. To delete your account, email{" "}
					<a className="text-primary hover:underline" href={`mailto:${siteSettings.contactEmail}`}>
						{siteSettings.contactEmail}
					</a>{" "}
					from your registered address. We'll process the request within 30 days. Your in-game data
					(player rows, owned cities) is removed; tick logs are anonymized but retained for
					integrity.
				</p>
			</Section>

			<Section heading="6. We can end the alpha">
				<p>
					We may suspend, restart, or close any match, world, or the alpha as a whole at our
					discretion — usually because something is broken, sometimes because we want to wipe and
					iterate. This isn't a service you've paid for; we owe you no notice period.
				</p>
			</Section>

			<Section heading="7. Intellectual property">
				<p>
					{siteSettings.brand}, the source code, the artwork, and the game design are owned by{" "}
					{siteSettings.copyrightHolder}. Country names, real-world geography, and references to
					real military hardware are factual references; no affiliation, sponsorship, or endorsement
					by any state or manufacturer is implied.
				</p>
				<p>
					Player-generated content — your nation's name, treaty messages, alliance names — remains
					yours; you grant us a non-exclusive license to display it inside the game and use
					anonymized excerpts for development. Don't post anything you wouldn't want a stranger to
					read.
				</p>
			</Section>

			<Section heading="8. No payments yet">
				<p>
					{siteSettings.brand} does not charge for anything during the alpha. There is no premium
					currency, no subscription, no battle pass. If you see a payment screen, you're either on
					the wrong site or something is very wrong on ours — let us know.
				</p>
				<p>
					Payments will be added in a later phase, with separate, lawyer-reviewed terms and full EU
					consumer rights. None of those terms apply yet because none of those features exist yet.
				</p>
			</Section>

			<Section heading="9. Limitation of liability">
				<p>
					To the extent permitted by law, {siteSettings.copyrightHolder} is not liable for damage
					arising from your use of the alpha — lost game progress, leaked feelings, time spent on a
					draft tech tree that gets rebalanced, anything else. EU consumer rights that cannot be
					excluded are preserved.
				</p>
			</Section>

			<Section heading="10. Governing law">
				<p>
					These terms are governed by the law of {siteSettings.legal.jurisdiction}. Disputes that
					cannot be resolved by email go to the competent courts of{" "}
					{siteSettings.legal.jurisdiction}, without prejudice to mandatory consumer-protection
					rights you may have in your country of residence.
				</p>
			</Section>

			<Section heading="11. Changes">
				<p>
					We'll update these terms as the project changes — especially when payments and lawyer
					review land. Material changes will be flagged via the email tied to your account or a
					notice on this page. Continued use after changes means you accept the new terms.
				</p>
			</Section>

			<Section heading="12. Contact">
				<p>
					Questions, deletion requests, bug reports, or "are you really running this from Belgium?":
					email{" "}
					<a className="text-primary hover:underline" href={`mailto:${siteSettings.contactEmail}`}>
						{siteSettings.contactEmail}
					</a>
					.
				</p>
			</Section>
		</LegalLayout>
	);
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
	return (
		<section className="flex flex-col gap-3">
			<h2 className="font-display font-medium text-foreground text-xl tracking-tight">{heading}</h2>
			<div className="flex flex-col gap-3 text-muted-foreground">{children}</div>
		</section>
	);
}
