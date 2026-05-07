import { z } from "zod";
import { buildingType } from "./buildings-catalog";

/*
 * Order payload schemas — Phase 3.
 *
 * Each `kind` discriminant carries a typed payload. The REST submit-order
 * endpoint Zod-parses against this discriminated union; the tick worker
 * re-parses on drain (server-authoritative belt + suspenders per CLAUDE.md).
 */

export const sliderName = z.enum(["taxation", "welfare", "healthcare", "propaganda"]);
export type SliderName = z.infer<typeof sliderName>;

export const noopOrder = z
	.object({
		kind: z.literal("noop"),
		payload: z.unknown().optional(),
	})
	.strict();

export const buildOrder = z
	.object({
		kind: z.literal("build"),
		payload: z
			.object({
				cityId: z.string().uuid(),
				type: buildingType,
			})
			.strict(),
	})
	.strict();

export const cancelBuildOrder = z
	.object({
		kind: z.literal("cancel_build"),
		payload: z
			.object({
				buildingId: z.string().uuid(),
			})
			.strict(),
	})
	.strict();

export const setSliderOrder = z
	.object({
		kind: z.literal("set_slider"),
		payload: z
			.object({
				slider: sliderName,
				value: z.number().int().min(0).max(100),
			})
			.strict(),
	})
	.strict();

export const startResearchOrder = z
	.object({
		kind: z.literal("start_research"),
		payload: z
			.object({
				nodeId: z.string().min(1).max(64),
			})
			.strict(),
	})
	.strict();

export const cancelResearchOrder = z
	.object({
		kind: z.literal("cancel_research"),
		payload: z
			.object({
				projectId: z.string().uuid(),
			})
			.strict(),
	})
	.strict();

// ── Phase 6 alliance orders ──────────────────────────────────────────────────

export const allianceTag = z
	.string()
	.min(3)
	.max(5)
	.regex(/^[A-Z0-9]+$/, "tag must be uppercase letters/numbers");
export const allianceColor = z.string().min(1).max(32);
export const allianceName = z.string().min(1).max(40);
export const allianceDescription = z.string().max(280).optional();

export const createAllianceOrder = z
	.object({
		kind: z.literal("create_alliance"),
		payload: z
			.object({
				name: allianceName,
				tag: allianceTag,
				color: allianceColor,
				description: allianceDescription,
			})
			.strict(),
	})
	.strict();

export const applyAllianceOrder = z
	.object({
		kind: z.literal("apply_alliance"),
		payload: z.object({ allianceId: z.string().uuid() }).strict(),
	})
	.strict();

export const voteAllianceOrder = z
	.object({
		kind: z.literal("vote_alliance"),
		payload: z
			.object({
				applicationId: z.string().uuid(),
				vote: z.enum(["approve", "reject"]),
			})
			.strict(),
	})
	.strict();

export const respondAllianceAppOrder = z
	.object({
		kind: z.literal("respond_alliance_app"),
		payload: z
			.object({
				applicationId: z.string().uuid(),
				action: z.enum(["accept", "reject"]),
			})
			.strict(),
	})
	.strict();

export const promoteMemberOrder = z
	.object({
		kind: z.literal("promote_member"),
		payload: z.object({ allianceId: z.string().uuid(), playerId: z.string().uuid() }).strict(),
	})
	.strict();

export const demoteLeaderOrder = z
	.object({
		kind: z.literal("demote_leader"),
		payload: z.object({ allianceId: z.string().uuid(), playerId: z.string().uuid() }).strict(),
	})
	.strict();

export const kickMemberOrder = z
	.object({
		kind: z.literal("kick_member"),
		payload: z.object({ allianceId: z.string().uuid(), playerId: z.string().uuid() }).strict(),
	})
	.strict();

export const leaveAllianceOrder = z
	.object({
		kind: z.literal("leave_alliance"),
		payload: z.object({ allianceId: z.string().uuid() }).strict(),
	})
	.strict();

export const dissolveAllianceOrder = z
	.object({
		kind: z.literal("dissolve_alliance"),
		payload: z.object({ allianceId: z.string().uuid() }).strict(),
	})
	.strict();

// ── Phase 6 treaty + war orders ──────────────────────────────────────────────

export const treatyTypeEnum = z.enum([
	"non_aggression",
	"defensive_pact",
	"trade_route",
	"military_access",
	"coalition_war",
]);

export const proposeTreatyOrder = z
	.object({
		kind: z.literal("propose_treaty"),
		payload: z
			.object({
				targetId: z.string().uuid(),
				type: treatyTypeEnum,
				note: z.string().max(280).optional(),
			})
			.strict(),
	})
	.strict();

export const respondTreatyOrder = z
	.object({
		kind: z.literal("respond_treaty"),
		payload: z
			.object({
				treatyId: z.string().uuid(),
				action: z.enum(["accept", "reject"]),
			})
			.strict(),
	})
	.strict();

export const breakTreatyOrder = z
	.object({
		kind: z.literal("break_treaty"),
		payload: z.object({ treatyId: z.string().uuid() }).strict(),
	})
	.strict();

export const declareWarOrder = z
	.object({
		kind: z.literal("declare_war"),
		payload: z.object({ targetId: z.string().uuid() }).strict(),
	})
	.strict();

// ── Phase 6 trade orders ─────────────────────────────────────────────────────

export const resourceBundle = z
	.object({
		money: z.number().int().nonnegative().default(0),
		oil: z.number().int().nonnegative().default(0),
		steel: z.number().int().nonnegative().default(0),
		electronics: z.number().int().nonnegative().default(0),
	})
	.strict();
export type ResourceBundle = z.infer<typeof resourceBundle>;

export const proposeTradeOrder = z
	.object({
		kind: z.literal("propose_trade"),
		payload: z
			.object({
				targetId: z.string().uuid(),
				give: resourceBundle,
				receive: resourceBundle,
				note: z.string().max(280).optional(),
			})
			.strict(),
	})
	.strict();

export const respondTradeOrder = z
	.object({
		kind: z.literal("respond_trade"),
		payload: z
			.object({
				proposalId: z.string().uuid(),
				action: z.enum(["accept", "reject"]),
			})
			.strict(),
	})
	.strict();

// ── Phase 6 messaging orders ─────────────────────────────────────────────────

export const messageChannelEnum = z.enum(["dm", "alliance", "broadcast"]);

export const sendMessageOrder = z
	.object({
		kind: z.literal("send_message"),
		payload: z
			.object({
				channel: messageChannelEnum,
				recipientPlayerId: z.string().uuid().optional(),
				recipientAllianceId: z.string().uuid().optional(),
				body: z.string().min(1).max(2000),
			})
			.strict(),
	})
	.strict();

export const markReadOrder = z
	.object({
		kind: z.literal("mark_read"),
		payload: z
			.object({
				channel: messageChannelEnum,
				peerKey: z.string().min(1).max(64),
				lastMessageId: z.string().uuid(),
			})
			.strict(),
	})
	.strict();

export const submitOrderBodyV3 = z.discriminatedUnion("kind", [
	noopOrder,
	buildOrder,
	cancelBuildOrder,
	setSliderOrder,
	startResearchOrder,
	cancelResearchOrder,
	createAllianceOrder,
	applyAllianceOrder,
	voteAllianceOrder,
	respondAllianceAppOrder,
	promoteMemberOrder,
	demoteLeaderOrder,
	kickMemberOrder,
	leaveAllianceOrder,
	dissolveAllianceOrder,
	proposeTreatyOrder,
	respondTreatyOrder,
	breakTreatyOrder,
	declareWarOrder,
	proposeTradeOrder,
	respondTradeOrder,
	sendMessageOrder,
	markReadOrder,
]);
export type SubmitOrderBodyV3 = z.infer<typeof submitOrderBodyV3>;
