import { test, expect } from "@playwright/test";
import { requireAuth, tinyPdf } from "./helpers";

/** Lädt ein Test-PDF hoch und öffnet dessen Detailseite. */
async function openTestDocument(page: import("@playwright/test").Page) {
  const fileName = `e2e-vorschau-${Date.now()}.pdf`;
  const title = fileName.replace(/\.pdf$/, "");

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.setInputFiles('input[type="file"]', {
    name: fileName,
    mimeType: "application/pdf",
    buffer: tinyPdf(),
  });
  await expect(page.getByRole("heading", { name: title })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("heading", { name: title }).click();
  await page.waitForURL(/\/documents\//, { timeout: 30_000 });
  return title;
}

test.describe("PDF-Vorschau", () => {
  test.beforeEach(() => requireAuth());

  test("rendert das ausgefüllte PDF mit Navigation und Zoom", async ({ page }) => {
    test.setTimeout(240_000);
    await openTestDocument(page);

    await page.getByRole("button", { name: /Ausgefülltes PDF anzeigen/ }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 120_000 });
    await expect(dialog.getByText(/Vorschau: Ausgefülltes PDF/)).toBeVisible();

    // Canvas wird tatsächlich gerendert (nicht leer)
    const canvas = dialog.locator("canvas").first();
    await expect(canvas).toBeVisible({ timeout: 60_000 });
    const painted = await canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const ctx = c.getContext("2d");
      if (!ctx || c.width === 0) return false;
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      let nonWhite = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240) nonWhite++;
      }
      return nonWhite > 50;
    });
    expect(painted, "PDF-Canvas darf nicht leer sein").toBe(true);

    // Seitenwahl und Zoom sind bedienbar
    const pageInput = dialog.getByLabel("Seitenzahl eingeben");
    await expect(pageInput).toBeVisible();
    await expect(pageInput).toHaveValue("1");
    await expect(dialog.getByLabel("Vorherige Seite")).toBeDisabled();

    await dialog.getByLabel("Vergrößern").click();
    await dialog.getByLabel("Verkleinern").click();

    // Aktionen im Dialog
    await expect(dialog.getByRole("button", { name: /PDF herunterladen/ })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Drucken/ })).toBeVisible();
  });

  test("bietet den Download des ausgefüllten PDFs an", async ({ page }) => {
    test.setTimeout(240_000);
    await openTestDocument(page);

    await page.getByRole("button", { name: /Ausgefülltes PDF anzeigen/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 120_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      dialog.getByRole("button", { name: /PDF herunterladen/ }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});
