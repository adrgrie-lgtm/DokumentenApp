import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const STATE_PATH = "e2e/.auth/state.json";

/**
 * Die App ist lokal-first und kennt keine Anmeldung mehr. Es wird lediglich
 * ein leerer Browser-Zustand geschrieben, damit die Playwright-Projekte mit
 * `storageState` weiterhin starten.
 */
export default async function globalSetup() {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify({ cookies: [], origins: [] }));
}
