import { test, expect } from "@playwright/test";
import { requireAuth, tinyPdf } from "./helpers";

test.describe("Dokumenten-Upload", () => {
  test.beforeEach(() => requireAuth());

  test("lehnt nicht unterstützte Dateiformate ab", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.setInputFiles('input[type="file"]', {
      name: "notizen.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("kein erlaubtes Format"),
    });
    await expect(page.locator("[data-sonner-toast]")).toContainText(
      /nicht unterstütztes Format/,
      { timeout: 20_000 },
    );
  });

  test("lädt ein PDF hoch und zeigt es in der Liste", async ({ page }) => {
    test.setTimeout(150_000);
    const fileName = `e2e-antrag-${Date.now()}.pdf`;

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.setInputFiles('input[type="file"]', {
      name: fileName,
      mimeType: "application/pdf",
      buffer: tinyPdf(),
    });

    const title = fileName.replace(/\.pdf$/, "");
    const card = page.getByRole("heading", { name: title });
    await expect(card).toBeVisible({ timeout: 60_000 });

    // Status-Pill wird angezeigt (hochgeladen / wird analysiert / analysiert)
    await expect(
      page.getByText(/Hochgeladen|Wird analysiert|Analysiert|Fehler/i).first(),
    ).toBeVisible({ timeout: 30_000 });

    // Suche findet das frisch hochgeladene Dokument
    await page.getByPlaceholder("Dokumente durchsuchen").fill(title);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    // Detailseite ist erreichbar
    await page.getByRole("heading", { name: title }).click();
    await page.waitForURL(/\/documents\//, { timeout: 30_000 });
    await expect(page.getByText(title).first()).toBeVisible();
  });
});
