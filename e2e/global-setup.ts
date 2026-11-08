import { chromium, type FullConfig } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const STATE_PATH = "e2e/.auth/state.json";

/**
 * Stellt einen angemeldeten Browser-Zustand her.
 *
 * Dazu wird per E2E_EMAIL / E2E_PASSWORD ein echter Login über das
 * Formular auf /auth ausgeführt. Ist beides nicht gesetzt, wird ein
 * leerer Zustand geschrieben – die authentifizierten Tests überspringen
 * sich dann selbst.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL =
    config.projects.find((p) => p.use?.baseURL)?.use?.baseURL ??
    process.env["E2E_BASE_URL"] ??
    "http://localhost:8080";

  mkdirSync(dirname(STATE_PATH), { recursive: true });

  const email = process.env["E2E_EMAIL"];
  const password = process.env["E2E_PASSWORD"];

  if (!email || !password) {
    writeFileSync(STATE_PATH, JSON.stringify({ cookies: [], origins: [] }));
    console.warn(
      "[e2e] Keine E2E_EMAIL/E2E_PASSWORD gesetzt – angemeldete Tests werden übersprungen.",
    );
    return;
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    await page.goto(`${baseURL}/auth`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("E-Mail").fill(email);
    await page.getByLabel("Passwort").fill(password);
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    await context.storageState({ path: STATE_PATH });
  } finally {
    await browser.close();
  }
}
