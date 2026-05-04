"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accountApi } from "@/lib/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

export function ProfileSection({
	user,
}: {
	user: { id: string; name: string; image?: string | null };
}) {
	const [name, setName] = useState(user.name);
	const queryClient = useQueryClient();

	const update = useMutation({
		mutationFn: accountApi.updateProfile,
		onSuccess: (res) => {
			toast.success("Display name updated.");
			setName(res.user.name);
			queryClient.invalidateQueries({ queryKey: ["session"] });
		},
		onError: (err) => {
			toast.error(err.message ?? "Could not update profile.");
		},
	});

	const trimmed = name.trim();
	const dirty = trimmed !== user.name && trimmed.length >= 1 && trimmed.length <= 32;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="font-mono text-[11px] uppercase tracking-[0.18em]">Profile</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				<div className="flex items-center gap-4">
					<Avatar className="h-14 w-14">
						{user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
						<AvatarFallback className="text-base">
							{user.name.slice(0, 2).toUpperCase()}
						</AvatarFallback>
					</Avatar>
					<div className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
						Avatar managed by your sign-in provider.
					</div>
				</div>

				<form
					className="flex flex-col gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						if (dirty && !update.isPending) update.mutate({ name: trimmed });
					}}
				>
					<Label
						htmlFor="display-name"
						className="font-mono text-[11px] uppercase tracking-[0.14em]"
					>
						Display name
					</Label>
					<div className="flex gap-2">
						<Input
							id="display-name"
							value={name}
							maxLength={32}
							onChange={(e) => setName(e.target.value)}
							className="font-mono"
						/>
						<Button type="submit" disabled={!dirty || update.isPending}>
							{update.isPending ? "Saving…" : "Save"}
						</Button>
					</div>
					<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
						{trimmed.length} / 32
					</p>
				</form>
			</CardContent>
		</Card>
	);
}
