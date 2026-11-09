// KI-Anbindung direkt im Browser: spricht einen frei konfigurierbaren
// OpenAI-kompatiblen Endpunkt an (z. B. OpenAI, Gemini, lokales Modell).
// Der Schlüssel liegt nur lokal (localStorage) und wird nie an einen
// eigenen Server oder an Supabase/Lovable übertragen.

import type { MasterData, RequiredField } from "./db";
import { bytesToBase64 } from "./db";

export interface AiSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const SETTINGS_KEY = "oneclick:ai-settings";

export const DEFAULT_AI_SETTINGS: AiSettings = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
};

export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_AI_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    return {
      baseUrl: (parsed.baseUrl || DEFAULT_AI_SETTINGS.baseUrl).replace(/\/$/, ""),
      apiKey: parsed.apiKey ?? "",
      model: parsed.model || DEFAULT_AI_SETTINGS.model,
    };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export function saveAiSettings(s: AiSettings): void {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ ...s, baseUrl: s.baseUrl.replace(/\/$/, "") }),
  );
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("Kein KI-Schlüssel hinterlegt. Bitte in den Einstellungen eintragen.");
    this.name = "AiNotConfiguredError";
  }
}

export class AiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "AiError";
  }
}

export type AiContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string | AiContentBlock[];
}

async function chatCompletion(
  settings: AiSettings,
  messages: AiMessage[],
  opts: { json?: boolean } = {},
): Promise<string> {
  if (!settings.apiKey.trim()) throw new AiNotConfiguredError();
  const res = await fetch(`${settings.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new AiError(res.status, "KI-Schlüssel wird abgelehnt. Bitte prüfen.");
    }
    if (res.status === 429) {
      throw new AiError(429, "Zu viele Anfragen. Bitte kurz warten und erneut versuchen.");
    }
    if (res.status === 402) {
      throw new AiError(402, "Das KI-Guthaben ist aufgebraucht.");
    }
    throw new AiError(res.status, `KI-Fehler (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}

function parseJson<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new AiError(502, "Die KI-Antwort konnte nicht verarbeitet werden.");
  }
}

export function masterDataText(m: MasterData | null): string {
  if (!m) return "(Keine Stammdaten hinterlegt.)";
  const entries: [string, unknown][] = [
    ["Vorname", m.first_name],
    ["Nachname", m.last_name],
    ["Straße", m.street],
    ["Hausnummer", m.house_number],
    ["PLZ", m.postal_code],
    ["Ort", m.city],
    ["Land", m.country],
    ["Geburtsdatum", m.birth_date],
    ["Telefon", m.phone],
    ["E-Mail", m.email],
    ["Familienstand", m.marital_status],
    ["Anzahl Kinder", m.children_count],
    ["IBAN", m.iban],
    ["BIC", m.bic],
    ["Bank", m.bank_name],
    ["Personalausweisnummer", m.id_card_number],
    ["Steuer-ID", m.tax_id],
  ];
  return entries
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

// Extrahiert Text aus einem PDF (clientseitig via pdf.js), damit die Analyse
// mit jedem OpenAI-kompatiblen Modell funktioniert – ganz ohne Datei-Upload.
async function extractPdfText(bytes: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (
    await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
  ).default;
  const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  const parts: string[] = [];
  const maxPages = Math.min(doc.numPages, 20);
  for (let n = 1; n <= maxPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    const text = tc.items.map((it) => ("str" in it ? (it.str as string) : "")).join(" ");
    parts.push(`--- Seite ${n} ---\n${text}`);
    if (parts.join("\n").length > 60000) break;
  }
  await doc.destroy().catch(() => undefined);
  return parts.join("\n").slice(0, 60000);
}

const ANALYSIS_SYSTEM = `Du bist ein Experte für deutsche Behördenformulare und Amtsdokumente.
Analysiere das beigefügte Dokument sorgfältig und antworte ausschließlich mit gültigem JSON in genau dieser Struktur:
{
  "doc_type": "kurze Bezeichnung des Dokumenttyps",
  "title": "prägnanter Titel (max. 8 Wörter)",
  "category": "einer dieser Werte: wohngeld, buergergeld, kindergeld, pflege, krankenkasse, finanzen, arbeit, versicherungen, sonstiges",
  "summary": "verständliche Zusammenfassung in einfachem Deutsch (3-5 Sätze)",
  "deadlines": [{ "label": "Bezeichnung", "date": "YYYY-MM-DD oder null", "description": "Erklärung in einfachem Deutsch" }],
  "contacts": [{ "name": "Behörde/Person", "role": "Funktion", "Adresse/Telefon/E-Mail" }],
  "required_fields": [{ "name": "Feldname", "explanation": "Was hier eingetragen werden muss, in einfachem Deutsch", "filled": true oder false, "value": "erkannter Wert oder null" }],
  "missing_info": ["fehlende Angabe 1", "fehlende Angabe 2"],
  "field_explanations": [{ "field": "Feldname", "explanation": "einfache Erklärung" }]
}
Regeln: Antworte immer auf Deutsch und in leicht verständlicher Sprache. Wenn eine Information fehlt, verwende leere Listen bzw. null. Erfinde keine Daten.`;

export interface AnalysisResult {
  doc_type: string;
  title: string;
  category: string;
  summary: string;
  deadlines: { label: string; date: string | null; description: string }[];
  contacts: { name: string; role: string; details: string }[];
  required_fields: RequiredField[];
  missing_info: string[];
  field_explanations: { field: string; explanation: string }[];
}

export async function analyzeDocument(
  fileBytes: ArrayBuffer,
  mime: string | null,
  fileName: string,
): Promise<AnalysisResult> {
  const settings = loadAiSettings();
  const userContent: AiContentBlock[] = [
    {
      type: "text",
      text: `Bitte analysiere dieses Dokument (Dateiname: ${fileName}) und antworte ausschließlich mit dem geforderten JSON.`,
    },
  ];

  if (mime && mime.startsWith("image/")) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${mime};base64,${bytesToBase64(fileBytes)}` },
    });
  } else if (mime === "application/pdf") {
    const text = await extractPdfText(fileBytes);
    userContent.push({
      type: "text",
      text: `Extrahierter Dokumenttext:\n${text || "(kein Text extrahierbar)"}`,
    });
  } else {
    userContent.push({
      type: "text",
      text: `(Dateiformat ${mime ?? "unbekannt"}: Inhalt kann nicht gelesen werden, nur der Dateiname ist bekannt.)`,
    });
  }

  const raw = await chatCompletion(
    settings,
    [
      { role: "system", content: ANALYSIS_SYSTEM },
      { role: "user", content: userContent },
    ],
    { json: true },
  );
  const result = parseJson<AnalysisResult>(raw);
  const valid = [
    "wohngeld",
    "buergergeld",
    "kindergeld",
    "pflege",
    "krankenkasse",
    "finanzen",
    "arbeit",
    "versicherungen",
    "sonstiges",
  ];
  if (!valid.includes(result.category)) result.category = "sonstiges";
  return result;
}

export async function askQuestion(
  question: string,
  docTitle: string,
  analysis: {
    doc_type: string | null;
    summary: string | null;
    deadlines: unknown;
    contacts: unknown;
    required_fields: unknown;
    missing_info: unknown;
  } | null,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const settings = loadAiSettings();
  const contextText = analysis
    ? `Kontext zum Dokument "${docTitle}":\n${JSON.stringify(
        {
          doc_type: analysis.doc_type,
          summary: analysis.summary,
          deadlines: analysis.deadlines,
          contacts: analysis.contacts,
          required_fields: analysis.required_fields,
          missing_info: analysis.missing_info,
        },
        null,
        2,
      )}`
    : `Zum Dokument "${docTitle}" liegt noch keine Analyse vor.`;
  return chatCompletion(settings, [
    {
      role: "system",
      content: `Du bist ein hilfsbereiter Assistent für deutsche Behördenformulare. Antworte immer in leicht verständlichem Deutsch, kurz und konkret. Nutze den folgenden Kontext.\n\n${contextText}`,
    },
    ...history,
    { role: "user", content: question },
  ]);
}

/** Ergänzt erkannte Pflichtfelder mit Werten aus den Stammdaten. */
export async function fillMissingFields(
  requiredFields: RequiredField[],
  master: MasterData | null,
): Promise<RequiredField[]> {
  if (requiredFields.length === 0) return [];
  const settings = loadAiSettings();
  const raw = await chatCompletion(
    settings,
    [
      {
        role: "system",
        content: `Du füllst deutsche Behördenformulare aus. Du erhältst eine Liste von Pflichtfeldern (teils bereits mit Wert) und die Stammdaten der Person.
Fülle leere Felder aus den Stammdaten, sofern eindeutig möglich. Behalte bereits vorhandene Werte bei. Erfinde keine Daten – wenn kein Wert vorhanden ist, gib null.
Antworte ausschließlich mit gültigem JSON: { "fields": [ { "name": "...", "value": "wert oder null" } ] }.`,
      },
      {
        role: "user",
        content: `Pflichtfelder:\n${requiredFields.map((f) => `- ${f.name}: ${f.value ?? "(leer)"}`).join("\n")}\n\nStammdaten:\n${masterDataText(master)}`,
      },
    ],
    { json: true },
  );
  const result = parseJson<{ fields?: { name: string; value: string | null }[] }>(raw);
  const map = new Map((result.fields ?? []).map((f) => [f.name, f.value]));
  return requiredFields.map((f) => ({
    ...f,
    value: f.value && f.value.trim() ? f.value : (map.get(f.name) ?? null),
  }));
}

/** Ordnet AcroForm-Feldnamen konkrete Werte zu (Original-PDF ausfüllen). */
export async function mapFormFields(
  fields: { name: string; type: string }[],
  requiredFields: RequiredField[],
  master: MasterData | null,
): Promise<Record<string, string>> {
  const settings = loadAiSettings();
  const raw = await chatCompletion(
    settings,
    [
      {
        role: "system",
        content: `Du füllst deutsche Behörden-PDF-Formulare aus. Du erhältst die technischen Formularfeldnamen des PDFs, die vom Dokument erkannten Pflichtfelder mit Werten sowie die Stammdaten der Person.
Ordne jedem Formularfeld – sofern sinnvoll möglich – den passenden Wert zu. Nutze die erkannten Werte und die Stammdaten. Für Ankreuzfelder gib "true" oder "false" zurück.
Antworte ausschließlich mit gültigem JSON in der Form { "feldname": "wert", ... }. Lasse Felder weg, die du nicht sicher zuordnen kannst. Erfinde keine Daten.`,
      },
      {
        role: "user",
        content: `Formularfelder (Name : Typ):\n${fields.map((f) => `- ${f.name} : ${f.type}`).join("\n")}\n\nErkannte Pflichtfelder:\n${requiredFields.map((f) => `- ${f.name}: ${f.value ?? "(leer)"}`).join("\n") || "(keine)"}\n\nStammdaten:\n${masterDataText(master)}`,
      },
    ],
    { json: true },
  );
  const result = parseJson<Record<string, unknown>>(raw);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(result)) {
    if (v !== null && v !== undefined) out[k] = String(v);
  }
  return out;
}
