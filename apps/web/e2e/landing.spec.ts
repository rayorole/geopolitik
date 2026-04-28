import { expect, test } from "@playwright/test";

test("landing page renders", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("heading", { name: /GEOPOLITIK/i })).toBeVisible();
	await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
});
