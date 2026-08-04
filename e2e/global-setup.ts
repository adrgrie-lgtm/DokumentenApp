import { chromium, type FullConfig } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const STATE_PATH = "e2e/.auth/state.json";

/**
 * Stellt einen angemeldeten Browser-Zustand her.
 *
 * Bevorzugt wird eine bereits vorhandene Supabase-Session aus der Umgebung
 * (LOVABLE_BROWSER_SUPABASE_*). Alternativ kann per E2E_EMAIL / E2E_PASSWORD
 * ein echter Login über das Formular auf /auth ausgeführt werden.
 * Ist beides nicht gesetzt, wird ein leerer Zustand geschrieben – die
 * authentifizierten Tests überspringen sich dann selbst.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL =
    config.projects.find((p) => p.use?.baseURL)?.use?.baseURL ??
    process.env["E2E_BASE_URL"] ??
    "http://localhost:8080";

  mkdirSync(dirname(STATE_PATH), { recursive: true });

  const sessionJson = process.env["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"];
  const storageKey = process.env["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"];
  const cookiesJson = process.env["LOVABLE_BROWSER_SUPABASE_COOKIES_JSON"];
  const email = process.env["E2E_EMAIL"];
  const password = process.env["E2E_PASSWORD"];

  if (!sessionJson && !email) {
    writeFileSync(STATE_PATH, JSON.stringify({ cookies: [], origins: [] }));
    console.warn(
      "[e2e] Keine Session-Daten gefunden – angemeldete Tests werden übersprungen.",
    );
    return;
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    if (cookiesJson) {
      const cookies = JSON.parse(cookiesJson).map((c: Record<string, unknown>) => ({
        ...c,
        url: baseURL,
      }));
      await context.addCookies(cookies);
    }

    await page.goto(baseURL, { waitUntil: "domcontentloaded" });

    if (sessionJson && storageKey) {
      await page.evaluate(
        ([key, value]) => window.localStorage.setItem(key, value),
        [storageKey, sessionJson] as const,
      );
    } else if (email && password) {
      await page.goto(`${baseURL}/auth`, { waitUntil: "domcontentloaded" });
      await page.getByLabel("E-Mail").fill(email);
      await page.getByLabel("Passwort").fill(password);
      await page.getByRole("button", { name: "Anmelden", exact: true }).click();
      await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    }

    await context.storageState({ path: STATE_PATH });
  } finally {
    await browser.close();
  }
}
