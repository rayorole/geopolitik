/*
 * Bulk-add the rest of the shadcn/ui registry on top of the essentials we ship by hand.
 * Run after `bun install` to populate the full kit per CLAUDE.md.
 *
 * Already shipped in src/components/ui (don't re-add):
 *   button, input, label, card, separator, skeleton, sonner, avatar, dropdown-menu
 */

const ALREADY_SHIPPED = new Set([
	"button",
	"input",
	"label",
	"card",
	"separator",
	"skeleton",
	"sonner",
	"avatar",
	"dropdown-menu",
]);

const FULL_KIT = [
	"accordion",
	"alert",
	"alert-dialog",
	"aspect-ratio",
	"badge",
	"breadcrumb",
	"calendar",
	"carousel",
	"chart",
	"checkbox",
	"collapsible",
	"command",
	"context-menu",
	"dialog",
	"drawer",
	"form",
	"hover-card",
	"input-otp",
	"menubar",
	"navigation-menu",
	"pagination",
	"popover",
	"progress",
	"radio-group",
	"resizable",
	"scroll-area",
	"select",
	"sheet",
	"sidebar",
	"slider",
	"switch",
	"table",
	"tabs",
	"textarea",
	"toggle",
	"toggle-group",
	"tooltip",
];

const toAdd = FULL_KIT.filter((c) => !ALREADY_SHIPPED.has(c));

console.log(`Installing ${toAdd.length} shadcn/ui components…`);
const proc = Bun.spawn(["bunx", "shadcn@latest", "add", ...toAdd, "--yes", "--overwrite"], {
	cwd: process.cwd(),
	stdout: "inherit",
	stderr: "inherit",
});
const code = await proc.exited;
process.exit(code);
