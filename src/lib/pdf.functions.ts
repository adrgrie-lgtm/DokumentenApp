import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { GatewayMessage } from "@/lib/ai.server";

export interface GeneratedPdf {
  fileBase64: string;
  fileName: string;
  /** "original" = das Original-PDF-Layout wurde ausgefüllt, "generated" = neues Formular erstellt */
  mode: "original" | "generated";
}

interface MasterData {
  first_name: string | null;
  last_name: string | null;
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  marital_status: string | null;
  children_count: number | null;
  iban: string | null;
  bic: string | null;
  bank_name: string | null;
  id_card_number: string | null;
  tax_id: string | null;
}

interface RequiredField {
  name: string;
  explanation: string;
  filled: boolean;
  value: string | null;
}

function masterDataText(m: MasterData | null): string {
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

/** WinAnsi (Helvetica) unterstützt kein € und einige Sonderzeichen – ersetzen. */
function sanitize(text: string): string {
  return (text ?? "")
    .replace(/€/g, "EUR")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x00-\xFF]/g, "");
}

export const generateFilledPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ documentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<GeneratedPdf> => {
    const { supabase } = context;

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("*")
      .eq("id", data.documentId)
      .single();
    if (docErr || !doc) throw new Error("Dokument nicht gefunden.");

    const { data: analysis } = await supabase
      .from("document_analyses")
      .select("*")
      .eq("document_id", doc.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: master } = await supabase
      .from("master_data")
      .select("*")
      .maybeSingle();

    const requiredFields: RequiredField[] = Array.isArray(analysis?.required_fields)
      ? (analysis!.required_fields as unknown as RequiredField[])
      : [];

    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

    // ---- 1. Versuch: Original-PDF mit Formularfeldern ausfüllen (Layout bleibt erhalten) ----
    if (doc.mime_type === "application/pdf") {
      try {
        const { data: fileData, error: dlErr } = await supabase.storage
          .from("documents")
          .download(doc.file_path);
        if (dlErr || !fileData) throw new Error("Datei konnte nicht geladen werden.");

        const bytes = new Uint8Array(await fileData.arrayBuffer());
        const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const form = pdfDoc.getForm();
        const fields = form.getFields();

        if (fields.length > 0) {
          const fieldInfo = fields.map((f) => ({
            name: f.getName(),
            type: f.constructor.name.replace("PDF", ""),
          }));

          const mapping = await mapFieldsWithAI(fieldInfo, requiredFields, master);

          for (const f of fields) {
            const value = mapping[f.getName()];
            if (value === undefined || value === null || value === "") continue;
            try {
              const type = f.constructor.name;
              if (type.includes("TextField")) {
                form.getTextField(f.getName()).setText(sanitize(String(value)));
              } else if (type.includes("CheckBox")) {
                const truthy = /^(true|ja|yes|x|1|✓)$/i.test(String(value).trim());
                const cb = form.getCheckBox(f.getName());
                if (truthy) cb.check();
                else cb.uncheck();
              } else if (type.includes("Dropdown")) {
                try {
                  form.getDropdown(f.getName()).select(sanitize(String(value)));
                } catch {
                  /* Option nicht vorhanden */
                }
              } else if (type.includes("RadioGroup")) {
                try {
                  form.getRadioGroup(f.getName()).select(sanitize(String(value)));
                } catch {
                  /* Option nicht vorhanden */
                }
              } else if (type.includes("OptionList")) {
                try {
                  form.getOptionList(f.getName()).select(sanitize(String(value)));
                } catch {
                  /* Option nicht vorhanden */
                }
              }
            } catch {
              /* einzelnes Feld überspringen */
            }
          }

          const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
          form.updateFieldAppearances(helv);
          form.flatten();

          const out = await pdfDoc.save();
          return {
            fileBase64: Buffer.from(out).toString("base64"),
            fileName: buildFileName(doc.title),
            mode: "original",
          };
        }
      } catch {
        // Fällt auf generiertes Formular zurück
      }
    }

    // ---- 2. Fallback: sauberes ausgefülltes Formular erzeugen ----
    const filledFields = await fillFieldsWithAI(requiredFields, master);

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 56;
    const contentWidth = pageWidth - margin * 2;
    const primary = rgb(0.043, 0.239, 0.569);
    const dark = rgb(0.06, 0.09, 0.16);
    const gray = rgb(0.4, 0.44, 0.52);

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const ensureSpace = (needed: number) => {
      if (y - needed < margin) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
    };

    const wrap = (text: string, size: number, f = font): string[] => {
      const words = sanitize(text).split(/\s+/);
      const lines: string[] = [];
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(test, size) > contentWidth) {
          if (line) lines.push(line);
          line = w;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
      return lines.length ? lines : [""];
    };

    const drawText = (
      text: string,
      size: number,
      opts: { f?: typeof font; color?: typeof dark; gap?: number } = {},
    ) => {
      const f = opts.f ?? font;
      const color = opts.color ?? dark;
      for (const ln of wrap(text, size, f)) {
        ensureSpace(size + 4);
        page.drawText(ln, { x: margin, y, size, font: f, color });
        y -= size + 4;
      }
      if (opts.gap) y -= opts.gap;
    };

    // Kopf
    drawText("Ausgefülltes Formular", 20, { f: fontBold, color: primary, gap: 4 });
    drawText(doc.title, 13, { f: fontBold, color: dark, gap: 2 });
    if (analysis?.doc_type) drawText(String(analysis.doc_type), 10, { color: gray });
    drawText(
      `Erstellt am ${new Date().toLocaleDateString("de-DE")} · OneClick Dokumenten-Assistent`,
      9,
      { color: gray, gap: 14 },
    );

    // Felder
    drawText("Angaben", 13, { f: fontBold, color: primary, gap: 6 });
    if (filledFields.length === 0) {
      drawText("Für dieses Dokument wurden keine Pflichtfelder erkannt.", 10, { color: gray, gap: 6 });
    }
    for (const fld of filledFields) {
      ensureSpace(40);
      drawText(fld.name, 10.5, { f: fontBold, color: dark });
      const value = fld.value && fld.value.trim() ? fld.value : "—";
      drawText(value, 10.5, { color: value === "—" ? gray : dark });
      if (fld.explanation) drawText(fld.explanation, 8.5, { color: gray });
      y -= 6;
    }

    // Hinweis
    y -= 6;
    ensureSpace(60);
    drawText(
      "Hinweis: Bitte prüfen Sie alle Angaben vor dem Absenden und ergänzen Sie fehlende Felder von Hand.",
      8.5,
      { color: gray },
    );

    const out = await pdfDoc.save();
    return {
      fileBase64: Buffer.from(out).toString("base64"),
      fileName: buildFileName(doc.title),
      mode: "generated",
    };
  });

function buildFileName(title: string): string {
  const base = (title || "dokument")
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "dokument"}-ausgefuellt.pdf`;
}

/** Ordnet AcroForm-Feldnamen konkrete Werte zu (Original-PDF ausfüllen). */
async function mapFieldsWithAI(
  fields: { name: string; type: string }[],
  requiredFields: RequiredField[],
  master: MasterData | null,
): Promise<Record<string, string>> {
  const { gatewayJSON } = await import("@/lib/ai.server");
  const messages: GatewayMessage[] = [
    {
      role: "system",
      content: `Du füllst deutsche Behörden-PDF-Formulare aus. Du erhältst die technischen Formularfeldnamen des PDFs, die vom Dokument erkannten Pflichtfelder mit Werten sowie die Stammdaten der Person.
Ordne jedem Formularfeld – sofern sinnvoll möglich – den passenden Wert zu. Nutze die erkannten Werte und die Stammdaten. Für Ankreuzfelder gib "true" oder "false" zurück.
Antworte ausschließlich mit gültigem JSON in der Form { "feldname": "wert", ... }. Lasse Felder weg, die du nicht sicher zuordnen kannst. Erfinde keine Daten.`,
    },
    {
      role: "user",
      content: `Formularfelder (Name : Typ):
${fields.map((f) => `- ${f.name} : ${f.type}`).join("\n")}

Erkannte Pflichtfelder:
${requiredFields.map((f) => `- ${f.name}: ${f.value ?? "(leer)"}`).join("\n") || "(keine)"}

Stammdaten:
${masterDataText(master)}`,
    },
  ];
  try {
    const result = await gatewayJSON<Record<string, unknown>>(messages);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(result)) {
      if (v !== null && v !== undefined) out[k] = String(v);
    }
    return out;
  } catch {
    return {};
  }
}

/** Ergänzt erkannte Pflichtfelder mit Werten aus den Stammdaten (Fallback-PDF). */
async function fillFieldsWithAI(
  requiredFields: RequiredField[],
  master: MasterData | null,
): Promise<RequiredField[]> {
  if (requiredFields.length === 0) return [];
  const { gatewayJSON } = await import("@/lib/ai.server");
  const messages: GatewayMessage[] = [
    {
      role: "system",
      content: `Du füllst deutsche Behördenformulare aus. Du erhältst eine Liste von Pflichtfeldern (teils bereits mit Wert) und die Stammdaten der Person.
Fülle leere Felder aus den Stammdaten, sofern eindeutig möglich. Behalte bereits vorhandene Werte bei. Erfinde keine Daten – wenn kein Wert vorhanden ist, gib null.
Antworte ausschließlich mit gültigem JSON: { "fields": [ { "name": "...", "value": "wert oder null" } ] }.`,
    },
    {
      role: "user",
      content: `Pflichtfelder:
${requiredFields.map((f) => `- ${f.name}: ${f.value ?? "(leer)"}`).join("\n")}

Stammdaten:
${masterDataText(master)}`,
    },
  ];
  try {
    const result = await gatewayJSON<{ fields?: { name: string; value: string | null }[] }>(
      messages,
    );
    const map = new Map((result.fields ?? []).map((f) => [f.name, f.value]));
    return requiredFields.map((f) => ({
      ...f,
      value: f.value && f.value.trim() ? f.value : map.get(f.name) ?? null,
    }));
  } catch {
    return requiredFields;
  }
}
