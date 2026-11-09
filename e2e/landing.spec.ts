import { test, expect } from "@playwright/test";
import { collectConsoleErrors } from "./helpers";

test.describe("Startseite", () => {
  test("lädt mit Titel, Hero und App-Link", async ({ page }) => {
    const errors = collectConsoleErrors(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveTitle(/OneClick Dokumenten-Assistent/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "App öffnen" }).first()).toBeVisible();

    // Kernnutzen wird kommuniziert
    await expect(page.getByText("Automatische Analyse")).toBeVisible();
    await expect(page.getByText("100 % lokal")).toBeVisible();

    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute("content", /.{40,}/);

    expect(errors.filter((e) => !/favicon|ResizeObserver/i.test(e))).toEqual([]);
  });

  test("führt vom App-Link direkt zum Dashboard", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "App öffnen" }).first().click();
    await page.waitForURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });
});
