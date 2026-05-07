import { cn } from "@/lib/utils";
import { type VariantProps, cva } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

/**
 * Tag / Badge — design-system status pill.
 *
 * Mil-spec aesthetic: mono uppercase, 0.06–0.18em tracking, square corners
 * (rounded-sm). Variants are color-keyed by intent — the same palette the
 * design system exposes (ok / warn / crit / info / signal). Use a `dot` or
 * `pulseDot` for live status indicators, or `solid` for filled panel chips.
 *
 *   <Badge>NEUTRAL</Badge>
 *   <Badge variant="ok" dot>TREATY SIGNED</Badge>
 *   <Badge variant="warn" dot>UNREST RISING</Badge>
 *   <Badge variant="crit" dot>UNDER ATTACK</Badge>
 *   <Badge variant="info" dot>SCOPE ACTIVE</Badge>
 *   <Badge variant="signal" pulseDot>YOUR TURN</Badge>
 *   <Badge variant="solid">B-50</Badge>
 */
const badgeVariants = cva(
	"inline-flex shrink-0 items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase leading-none tracking-[0.18em] transition-colors [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3",
	{
		variants: {
			variant: {
				default: "border-border bg-transparent text-muted-foreground",
				solid: "border-border bg-card text-foreground",
				signal: "border-primary bg-transparent text-primary",
				ok: "border-[var(--color-ok)] bg-transparent text-[var(--color-ok)]",
				warn: "border-[var(--color-warn)] bg-transparent text-[var(--color-warn)]",
				crit: "border-destructive bg-transparent text-destructive",
				info: "border-[var(--color-info)] bg-transparent text-[var(--color-info)]",
			},
			size: {
				default: "px-2 py-0.5 text-[10px]",
				sm: "px-1.5 py-0.5 text-[9px] tracking-[0.12em]",
				lg: "px-2.5 py-1 text-[11px]",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

export interface BadgeProps
	extends React.ComponentProps<"span">,
		VariantProps<typeof badgeVariants> {
	asChild?: boolean;
	/** Render a static colored dot before the children. */
	dot?: boolean;
	/** Render a pulsing colored dot before the children — for live state. */
	pulseDot?: boolean;
}

function Badge({
	className,
	variant = "default",
	size = "default",
	asChild = false,
	dot = false,
	pulseDot = false,
	children,
	...props
}: BadgeProps) {
	const Comp = asChild ? Slot.Root : "span";
	return (
		<Comp
			data-slot="badge"
			data-variant={variant}
			data-size={size}
			className={cn(badgeVariants({ variant, size, className }))}
			{...props}
		>
			{pulseDot ? (
				<span aria-hidden className="relative inline-flex size-1.5 rounded-full bg-current">
					<span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60" />
				</span>
			) : dot ? (
				<span aria-hidden className="inline-block size-1.5 rounded-full bg-current" />
			) : null}
			{children}
		</Comp>
	);
}

export { Badge, badgeVariants };
