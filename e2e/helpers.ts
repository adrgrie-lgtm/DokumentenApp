import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/** Überspringt einen Test, wenn kein angemeldeter Zustand vorhanden ist. */
export function requireAuth() {
  try {
    const state = JSON.parse(readFileSync("e2e/.auth/state.json", "utf8"));
    const hasSession =
      (state.origins?.length ?? 0) > 0 || (state.cookies?.length ?? 0) > 0;
    test.skip(!hasSession, "Keine angemeldete Session verfügbar.");
  } catch {
    test.skip(true, "Kein Auth-Zustand gefunden.");
  }
}

/** Sammelt Browser-Konsolenfehler für Assertions am Testende. */
export function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

/** Minimales, gültiges Ein-Seiten-PDF für Upload-Tests. */
export function tinyPdf(): Buffer {
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length 60>>stream
BT /F1 18 Tf 60 760 Td (E2E Testdokument Antrag) Tj ET
endstream
endobj
trailer<</Root 1 0 R>>
%%EOF`;
  return Buffer.from(pdf, "latin1");
}

/**
 * Wartet, bis React hydratisiert hat. Vor der Hydration gehen Klicks und
 * Eingaben in kontrollierten Feldern verloren.
 */
export async function waitForHydration(page: Page) {
  await page.waitForLoadState("load");
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const el = document.querySelector("[data-sonner-toaster], body");
          return !!el && document.readyState === "complete";
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
  // Kontrollierte Inputs reagieren erst nach der Hydration verlässlich.
  await page.waitForTimeout(1500);
}
