"use client";

import { Button } from "@/components/ui/button";
import { gamesApi, queryKeys } from "@/lib/api-client";
import { useQuery } from "@tanstack/react-query";
import { Zap } from "lucide-react";
import { useRouter } from "next/navigation";

export function QuickJoinButton() {
	const router = useRouter();
	const { data } = useQuery({
		queryKey: queryKeys.gamesBrowse,
		queryFn: gamesApi.browse,
	});

	const openLobbies = data ?? [];
	const disabled = openLobbies.length === 0;

	function onClick() {
		const pick = openLobbies[Math.floor(Math.random() * openLobbies.length)];
		if (!pick) return;
		router.push(`/games/${pick.id}/join`);
	}

	return (
		<Button onClick={onClick} disabled={disabled} className="gap-2">
			<Zap className="h-4 w-4" />
			Quick join
		</Button>
	);
}
