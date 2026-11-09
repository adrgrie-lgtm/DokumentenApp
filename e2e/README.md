# End-to-End-Tests

Playwright-Suite, die die Kernpfade der App im echten Browser prüft:

| Datei                 | Prüft                                                          |
| --------------------- | -------------------------------------------------------------- |
| `landing.spec.ts`     | Startseite: Titel, Hero, Metadaten, Navigation zum Dashboard    |
| `dashboard.spec.ts`   | Uploadzone, Suche/Filter, Navigation zu den Stammdaten          |
| `upload.spec.ts`      | Formatvalidierung und echter PDF-Upload inkl. Statusanzeige     |
| `pdf-preview.spec.ts` | Ausgefülltes PDF: Rendering, Seitenwahl, Zoom, Download         |

Die App ist lokal-first (IndexedDB) und kennt keine Anmeldung – alle Tests
laufen ohne Login und ohne Secrets.

## Ausführen

```bash
bun run test:e2e                 # alle Tests
bunx playwright test --project=public          # nur öffentliche Seiten
bunx playwright test --project=authenticated   # nur App-Bereich
```

Die App muss unter `http://localhost:8080` laufen (`bun run dev`).
Eine andere Adresse lässt sich per `E2E_BASE_URL` setzen.

## CI (GitHub Actions)

`.github/workflows/e2e.yml` startet die Suite bei jedem Pull Request, bei Pushes
auf `main` und manuell. Die Projekte `public` und `authenticated` laufen parallel
als Matrix; Playwright startet den Dev-Server selbst (`webServer` in
`playwright.config.ts`). Reports und Traces landen als Artefakte im Job.

Es werden keine Repository-Secrets benötigt. Ohne KI-Schlüssel sind Analyse,
Chat und Formular-Ausfüllung in den Tests deaktiviert – geprüft werden die
Pfade, die ohne Schlüssel funktionieren (Upload, Liste, Suche, PDF-Vorschau).
