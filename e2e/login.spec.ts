import { test, expect } from "@playwright/test";
import { waitForHydration } from "./helpers";

test.describe("Anmeldung", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
  });

  test("zeigt Formular, Tabs und Social-Login", async ({ page }) => {
    await expect(page).toHaveTitle(/Anmelden/);
    await expect(page.getByRole("tab", { name: "Anmelden" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Registrieren" })).toBeVisible();
    await expect(page.getByLabel("E-Mail")).toBeVisible();
    await expect(page.getByLabel("Passwort")).toBeVisible();
    await expect(page.getByRole("button", { name: /Mit Google anmelden/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Mit Microsoft anmelden/ })).toBeVisible();
  });

  test("blendet im Registrieren-Tab das Namensfeld ein", async ({ page }) => {
    await expect(async () => {
      await page.getByRole("tab", { name: "Registrieren" }).click();
      await expect(page.getByLabel("Vollständiger Name")).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Konto erstellen" })).toBeVisible();
  });

  test("lehnt falsche Zugangsdaten mit Fehlermeldung ab", async ({ page }) => {
    await page.getByLabel("E-Mail").fill(`e2e-invalid-${Date.now()}@example.com`);
    await page.getByLabel("Passwort").fill("falschesPasswort123");
    await expect(page.getByLabel("E-Mail")).not.toHaveValue("");

    await page.getByRole("button", { name: "Anmelden", exact: true }).click();

    await expect(page.locator("[data-sonner-toast]").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/\/auth/);
  });

  test("schützt das Dashboard vor nicht angemeldeten Nutzern", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/auth/, { timeout: 30_000 });
  });
});
