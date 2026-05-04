"use client";

import { signOut, useSession } from "@/lib/auth-client";
import { siteSettings } from "@/lib/site-settings";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function AppNav() {
	const { data: session, isPending } = useSession();
	const pathname = usePathname();
	const router = useRouter();

	const signOutMutation = useMutation({
		mutationFn: async () => {
			await signOut();
		},
		onSuccess: () => router.replace("/"),
	});

	if (isPending || !session) return null;

	const isGames = pathname?.startsWith("/games") ?? false;

	return (
		<header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6">
			<div className="flex items-center gap-6">
				<Link
					href="/games"
					className="font-display text-sm font-semibold tracking-[0.18em] text-foreground"
				>
					{siteSettings.brand}
				</Link>
				<nav className="flex items-center gap-5 font-mono text-[11px] uppercase tracking-[0.14em]">
					<Link
						href="/games"
						className={isGames ? "text-primary" : "text-muted-foreground hover:text-foreground"}
					>
						Games
					</Link>
				</nav>
			</div>

			<DropdownMenu>
				<DropdownMenuTrigger
					aria-label="Account menu"
					className="flex items-center gap-2 rounded-full p-0.5 outline-none focus-visible:ring-1 focus-visible:ring-ring"
				>
					<Avatar className="h-8 w-8">
						{session.user.image ? (
							<AvatarImage src={session.user.image} alt={session.user.name} />
						) : null}
						<AvatarFallback className="text-[11px]">
							{session.user.name.slice(0, 2).toUpperCase()}
						</AvatarFallback>
					</Avatar>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="min-w-52">
					<DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
						<span className="text-sm font-medium leading-tight">{session.user.name}</span>
						<span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
							{session.user.email}
						</span>
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem asChild>
						<Link href="/account">Account</Link>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className="text-destructive focus:text-destructive"
						disabled={signOutMutation.isPending}
						onSelect={(e) => {
							e.preventDefault();
							signOutMutation.mutate();
						}}
					>
						{signOutMutation.isPending ? "Signing out…" : "Sign out"}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</header>
	);
}
