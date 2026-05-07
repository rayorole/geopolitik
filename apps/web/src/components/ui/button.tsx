import { cn } from "@/lib/utils";
import { type VariantProps, cva } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

// Design-system buttons: mil-spec switch aesthetic. Mono caps, square edges,
// deliberate borders. Variants are color-keyed via shadcn theme tokens so
// `text-foreground`, `bg-primary`, `border-destructive` etc. all flow through.
//
//  default     — mil-spec neutral: panel bg, ink border, mono caps
//  primary     — sodium-vapor amber (signal). Use sparingly: confirm, your-turn
//  destructive — outlined crit; fills crit on hover (declare war / leave game)
//  outline     — neutral with explicit border (settings-style buttons)
//  secondary   — alias of default for shadcn back-compat
//  ghost       — transparent, muted. Inherits border on hover
//  link        — underline-on-hover for inline navigation
const buttonVariants = cva(
	"inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-sm font-mono text-[13px] uppercase tracking-[0.06em] whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default:
					"border border-border bg-card text-foreground hover:border-foreground/40 hover:bg-accent",
				primary: "border border-primary bg-primary text-primary-foreground hover:bg-primary/90",
				destructive:
					"border border-destructive bg-transparent text-destructive hover:bg-destructive hover:text-background",
				outline:
					"border border-border bg-transparent text-foreground hover:border-foreground/40 hover:bg-accent",
				secondary:
					"border border-border bg-card text-foreground hover:border-foreground/40 hover:bg-accent",
				ghost:
					"border border-transparent bg-transparent text-muted-foreground hover:border-border hover:text-foreground",
				link: "border-none bg-transparent text-primary normal-case tracking-normal underline-offset-4 hover:underline",
			},
			size: {
				default: "h-9 px-3.5 has-[>svg]:px-2.5",
				xs: "h-6 gap-1 px-2 text-[10px] has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
				sm: "h-7 gap-1.5 px-2.5 text-[11px] has-[>svg]:px-2",
				lg: "h-10 px-5 text-sm has-[>svg]:px-4",
				icon: "size-9 px-0",
				"icon-xs": "size-6 px-0 [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-7 px-0",
				"icon-lg": "size-10 px-0",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	asChild = false,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Comp = asChild ? Slot.Root : "button";

	return (
		<Comp
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
