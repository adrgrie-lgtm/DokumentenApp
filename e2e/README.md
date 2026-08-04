# End-to-End-Tests

Playwright-Suite, die die Kernpfade der App im echten Browser prüft:

| Datei                 | Prüft                                                          |
| --------------------- | -------------------------------------------------------------- |
| `landing.spec.ts`     | Startseite: Titel, Hero, Metadaten, Navigation zur Anmeldung     |
| `login.spec.ts`       | Auth-Formular, Tabs, Fehlermeldung, Schutz des Dashboards        |
| `dashboard.spec.ts`   | Uploadzone, Suche/Filter, Navigation zu den Stammdaten           |
| `upload.spec.ts`      | Formatvalidierung und echter PDF-Upload inkl. Statusanzeige      |
| `pdf-preview.spec.ts` | Ausgefülltes PDF: Rendering, Seitenwahl, Zoom, Download          |

## Ausführen

```bash
bun run test:e2e                 # alle Tests
bunx playwright test --project=public          # nur öffentliche Seiten
bunx playwright test --project=authenticated   # nur angemeldete Bereiche
```

Die App muss unter `http://localhost:8080` laufen (`bun run dev`).
Eine andere Adresse lässt sich per `E2E_BASE_URL` setzen.

## Anmeldung

`global-setup.ts` erzeugt den angemeldeten Browser-Zustand:

1. aus einer vorhandenen Session in der Umgebung
   (`LOVABLE_BROWSER_SUPABASE_SESSION_JSON` / `_STORAGE_KEY` / `_COOKIES_JSON`), oder
2. über einen echten Login mit `E2E_EMAIL` und `E2E_PASSWORD`.

Ist nichts davon gesetzt, überspringen sich die angemeldeten Tests selbst.

Hinweis: Der Upload-Test legt echte Testdokumente (`e2e-…`) im Konto an.

## CI (GitHub Actions)

`.github/workflows/e2e.yml` startet die Suite bei jedem Pull Request, bei Pushes
auf `main` und manuell. Die Projekte `public` und `authenticated` laufen parallel
als Matrix; Playwright startet den Dev-Server selbst (`webServer` in
`playwright.config.ts`). Reports und Traces landen als Artefakte im Job.

Benötigte Repository-Secrets:

| Secret                                                                     | Zweck                                  |
| -------------------------------------------------------------------------- | -------------------------------------- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | Backend-Verbindung der App        |
| `LOVABLE_API_KEY`                                                          | KI-Funktionen                          |
| `E2E_EMAIL`, `E2E_PASSWORD`                                                | Login für die angemeldeten Tests       |

Ohne `E2E_EMAIL`/`E2E_PASSWORD` überspringen sich die angemeldeten Tests, der
`public`-Job läuft trotzdem.

