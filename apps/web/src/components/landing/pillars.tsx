import { Globe as GlobeIcon, SlidersHorizontal, Swords, Truck } from "lucide-react";

const pillars = [
	{
		icon: GlobeIcon,
		title: "Real geography",
		body: "Plays on the actual map of Earth, generated from OpenStreetMap. Real cities, real borders, real distances.",
	},
	{
		icon: Swords,
		title: "Combat takes hours",
		body: "Battles resolve across many ticks. Watch unit health change. Reinforce or retreat — both windows are real.",
	},
	{
		icon: SlidersHorizontal,
		title: "Run your nation",
		body: "Welfare, taxation, propaganda — manage them or your cities defect. Bad governance has consequences.",
	},
	{
		icon: Truck,
		title: "Convoy speed = slowest unit",
		body: "Mix a tank with a supply truck and the truck is your speed. Composition matters. Routing matters.",
	},
];

export function Pillars() {
	return (
		<section className="border-y border-border bg-card/40">
			<div className="mx-auto max-w-7xl px-6 sm:px-10">
				<div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
					{pillars.map((p) => {
						const Icon = p.icon;
						return (
							<div
								key={p.title}
								className="flex flex-col gap-4 bg-background p-8 transition-colors hover:bg-card"
							>
								<Icon className="h-6 w-6 text-primary" strokeWidth={1.5} />
								<h3 className="font-display font-medium text-xl tracking-tight">{p.title}</h3>
								<p className="text-muted-foreground text-sm leading-relaxed">{p.body}</p>
							</div>
						);
					})}
				</div>
			</div>
		</section>
	);
}
