import { test, expect } from "@playwright/test";
import { requireAuth, waitForHydration } from "./helpers";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    requireAuth();
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  test("zeigt Uploadzone, Suche und Kategoriefilter", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dateien hierher ziehen" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dateien auswählen" })).toBeVisible();
    await expect(page.getByPlaceholder("Dokumente durchsuchen")).toBeVisible();
    await expect(page.getByRole("button", { name: "Alle", exact: true })).toBeVisible();
  });

  test("filtert die Liste über die Suche", async ({ page }) => {
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 30_000 });
    await page.getByPlaceholder("Dokumente durchsuchen").fill("zzz-kein-treffer-zzz");
    await expect(page.getByText("Noch keine Dokumente")).toBeVisible();
  });

  test("navigiert zu den Stammdaten", async ({ page }) => {
    await page.goto("/stammdaten", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/Stammdaten/);
  });
});
