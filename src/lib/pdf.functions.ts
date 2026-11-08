import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { GatewayMessage } from "@/lib/ai.server";

export interface GeneratedPdf {
  fileBase64: string;
  fileName: string;
  /** "original" = das Original-PDF-Layout wurde ausgefuellt, "generated" = neues Formular erstellt */
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

// Zeilengenaues leeres Blatt (A4) mit festem Zeilenraster (15pt).
// y = SEITEN_HOEHE - RAND_OBEN - zeilenIndex * ZEILEN_HOEHE

const PT_PER_MM = 72 / 25.4;
const SEITE_BREITE = 595.28;
const SEITE_HOEHE = 841.89;
const RAND_OBEN = 72;
const RAND_UNTEN = 72;
const RAND_LINKS = 64;
const RAND_RECHTS = 56;
const NUTZ_BREITE = SEITE_BREITE - RAND_LINKS - RAND_RECHTS;
const ZEILEN_HOEHE = 15;
const ZEILEN_PRO_SEITE = Math.floor((SEITE_HOEHE - RAND_OBEN - RAND_UNTEN) / ZEILEN_HOEHE);
const S_TITEL = 20;
const S_DOK_TITEL = 13;
const S_META = 9;
const S_RUBRIK = 13;
const S_LABEL = 10.5;
const S_WERT = 10.5;
const S_ERKLAERUNG = 8.5;
const S_FUSS = 7.5;

function masterDataText(m: MasterData | null): string {
  if (!m) return "(Keine Stammdaten hinterlegt.)";
  const entries: [string, unknown][] = [
    ["Vorname", m.first_name],
    ["Nachname", m.last_name],
    ["Strasse", m.street],
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

function sanitize(text: string): string {
  return (text ?? "")
    .replace(/\u20AC/g, "EUR")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x00-\xFF]/g, "");
}

function buildFileName(title: string): string {
  const base = (title || "dokument").toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${base || "dokument"}-ausgefuellt.pdf`;
}

export const generateFilledPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ documentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<GeneratedPdf> => {
    const { supabase } = context;
    const { data: doc, error: docErr } = await supabase.from("documents").select("*").eq("id", data.documentId).single();
    if (docErr || !doc) throw new Error("Dokument nicht gefunden.");
    const { data: analysis } = await supabase.from("document_analyses").select("*").eq("document_id", doc.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: master } = await supabase.from("master_data").select("*").maybeSingle();
    const requiredFields: RequiredField[] = Array.isArray(analysis?.required_fields) ? (analysis!.required_fields as unknown as RequiredField[]) : [];
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    if (doc.mime_type === "application/pdf") {
      try {
        const { data: fileData, error: dlErr } = await supabase.storage.from("documents").download(doc.file_path);
        if (dlErr || !fileData) throw new Error("Datei konnte nicht geladen werden.");
        const bytes = new Uint8Array(await fileData.arrayBuffer());
        const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const form = pdfDoc.getForm();
        const fields = form.getFields();
        if (fields.length > 0) {
          const fieldInfo = fields.map((f) => ({ name: f.getName(), type: f.constructor.name.replace("PDF", "") }));
          const mapping = await mapFieldsWithAI(fieldInfo, requiredFields, master);
          for (const f of fields) {
            const value = mapping[f.getName()];
            if (value === undefined || value === null || value === "") continue;
            try {
              const type = f.constructor.name;
              if (type.includes("TextField")) form.getTextField(f.getName()).setText(sanitize(String(value)));
              else if (type.includes("CheckBox")) {
                const truthy = /^(true|ja|yes|x|1)$/i.test(String(value).trim());
                const cb = form.getCheckBox(f.getName());
                if (truthy) cb.check(); else cb.uncheck();
              } else if (type.includes("Dropdown")) { try { form.getDropdown(f.getName()).select(sanitize(String(value))); } catch { } }
              else if (type.includes("RadioGroup")) { try { form.getRadioGroup(f.getName()).select(sanitize(String(value))); } catch { } }
              else if (type.includes("OptionList")) { try { form.getOptionList(f.getName()).select(sanitize(String(value))); } catch { } }
            } catch { }
          }
          const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
          form.updateFieldAppearances(helv);
          form.flatten();
          const out = await pdfDoc.save();
          return { fileBase64: Buffer.from(out).toString("base64"), fileName: buildFileName(doc.title), mode: "original" };
        }
      } catch { }
    }
    const filledFields = await fillFieldsWithAI(requiredFields, master);
    const out = await leeresBlattZeilengenau({ titel: doc.title, docType: analysis?.doc_type ? String(analysis.doc_type) : null, felder: filledFields });
    return { fileBase64: Buffer.from(out).toString("base64"), fileName: buildFileName(doc.title), mode: "generated" };
  });

interface BlattFeld { name: string; explanation: string; value: string | null; }

async function leeresBlattZeilengenau(args: { titel: string; docType: string | null; felder: BlattFeld[] }): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const FARBE_PRIMAER = rgb(0.043, 0.239, 0.569);
  const FARBE_DUNKEL = rgb(0.06, 0.09, 0.16);
  const FARBE_GRAU = rgb(0.4, 0.44, 0.52);
  const FARBE_LINIE = rgb(0.78, 0.82, 0.88);
  const FARBE_FELD_BG = rgb(0.96, 0.97, 0.99);
  const umbrechen = (text: string, size: number, f: typeof font = font): string[] => {
    const sauber = sanitize(text);
    if (!sauber.trim()) return [""];
    const zeilen: string[] = [];
    const woerter = sauber.split(/\s+/);
    let zeile = "";
    const passt = (t: string) => f.widthOfTextAtSize(t, size) <= NUTZ_BREITE;
    for (const wort of woerter) {
      const kandidat = zeile ? `${zeile} ${wort}` : wort;
      if (passt(kandidat)) { zeile = kandidat; continue; }
      if (!zeile && !passt(wort)) {
        let stueck = "";
        for (const zeichen of wort) {
          if (passt(stueck + zeichen)) stueck += zeichen;
          else { zeilen.push(stueck + "-"); stueck = zeichen; }
        }
        zeile = stueck; continue;
      }
      if (zeile) zeilen.push(zeile);
      zeile = wort;
    }
    if (zeile) zeilen.push(zeile);
    return zeilen.length ? zeilen : [""];
  };
  type Seite = ReturnType<typeof pdfDoc.addPage>;
  let seite: Seite = pdfDoc.addPage([SEITE_BREITE, SEITE_HOEHE]);
  let zeile = 0;
  const yVonZeile = (z: number) => SEITE_HOEHE - RAND_OBEN - z * ZEILEN_HOEHE;
  const alleSeiten: Seite[] = [seite];
  const neueSeite = () => { seite = pdfDoc.addPage([SEITE_BREITE, SEITE_HOEHE]); alleSeiten.push(seite); zeile = 0; };
  const platzFuer = (n: number) => ZEILEN_PRO_SEITE - zeile >= n;
  const fusszeileZeichnen = (s: Seite, nr: number, total: string) => {
    const fussY = RAND_UNTEN - 28;
    s.drawText(`Seite ${nr} ${total}`, { x: RAND_LINKS, y: fussY, size: S_FUSS, font, color: FARBE_GRAU });
    const hinweis = "Druck: A4, 100 % / Tatsaechliche Groesse.";
    const breite = font.widthOfTextAtSize(hinweis, S_FUSS);
    s.drawText(hinweis, { x: SEITE_BREITE - RAND_RECHTS - breite, y: fussY, size: S_FUSS, font, color: FARBE_GRAU });
    s.drawLine({ start: { x: RAND_LINKS, y: RAND_UNTEN - 14 }, end: { x: SEITE_BREITE - RAND_RECHTS, y: RAND_UNTEN - 14 }, thickness: 0.5, color: FARBE_LINIE });
  };
  const zeichneZeile = (text: string, size: number, opts: { f?: typeof font; farbe?: ReturnType<typeof rgb>; unterstreichen?: boolean; hintergrund?: boolean } = {}) => {
    if (!platzFuer(1)) neueSeite();
    const f = opts.f ?? font;
    const farbe = opts.farbe ?? FARBE_DUNKEL;
    const y = yVonZeile(zeile) - size;
    if (opts.hintergrund) seite.drawRectangle({ x: RAND_LINKS - 6, y: y - 3, width: NUTZ_BREITE + 12, height: ZEILEN_HOEHE, color: FARBE_FELD_BG, borderColor: undefined });
    if (text) seite.drawText(text, { x: RAND_LINKS, y, size, font: f, color: farbe });
    if (opts.unterstreichen) seite.drawLine({ start: { x: RAND_LINKS, y: y - 2 }, end: { x: SEITE_BREITE - RAND_RECHTS, y: y - 2 }, thickness: 0.5, color: FARBE_LINIE });
    zeile += 1;
  };
  const leerzeilen = (n: number) => { for (let i = 0; i < n; i++) { if (!platzFuer(1)) neueSeite(); zeile += 1; } };
  zeichneZeile("Ausgefuelltes Formular", S_TITEL, { f: fontBold, farbe: FARBE_PRIMAER });
  for (const z of umbrechen(args.titel || "Dokument", S_DOK_TITEL, fontBold)) zeichneZeile(z, S_DOK_TITEL, { f: fontBold });
  if (args.docType) for (const z of umbrechen(args.docType, S_META)) zeichneZeile(z, S_META, { farbe: FARBE_GRAU });
  const datum = new Date().toLocaleDateString("de-DE");
  zeichneZeile(`Erstellt am ${datum} - OneClick Dokumenten-Assistent`, S_META, { farbe: FARBE_GRAU });
  leerzeilen(1);
  zeichneZeile("Angaben", S_RUBRIK, { f: fontBold, farbe: FARBE_PRIMAER });
  leerzeilen(1);
  if (args.felder.length === 0) zeichneZeile("Fuer dieses Dokument wurden keine Pflichtfelder erkannt.", S_WERT, { farbe: FARBE_GRAU });
  args.felder.forEach((feld, index) => {
    const nummer = String(index + 1).padStart(2, "0");
    const wert = feld.value && feld.value.trim() ? feld.value.trim() : "-";
    const istLeer = wert === "-";
    const wertZeilen = umbrechen(wert, S_WERT);
    const erklaerungsZeilen = feld.explanation ? umbrechen(feld.explanation, S_ERKLAERUNG, fontOblique) : [];
    const blockHoehe = 1 + wertZeilen.length + erklaerungsZeilen.length + 1;
    if (!platzFuer(blockHoehe)) neueSeite();
    zeichneZeile(`${nummer} - ${sanitize(feld.name)}`, S_LABEL, { f: fontBold });
    wertZeilen.forEach((z) => zeichneZeile(z || " ", S_WERT, { farbe: istLeer ? FARBE_GRAU : FARBE_DUNKEL, unterstreichen: !istLeer, hintergrund: !istLeer }));
    erklaerungsZeilen.forEach((z) => zeichneZeile(z, S_ERKLAERUNG, { f: fontOblique, farbe: FARBE_GRAU }));
    leerzeilen(1);
  });
  leerzeilen(1);
  const hinweis = "Hinweis: Bitte alle Angaben vor dem Absenden pruefen und fehlende Felder von Hand ergaenzen.";
  for (const z of umbrechen(hinweis, S_ERKLAERUNG, fontOblique)) { if (!platzFuer(1)) neueSeite(); zeichneZeile(z, S_ERKLAERUNG, { f: fontOblique, farbe: FARBE_GRAU }); }
  const gesamt = alleSeiten.length;
  alleSeiten.forEach((s, i) => fusszeileZeichnen(s, i + 1, `von ${gesamt}`));
  pdfDoc.setTitle(sanitize(args.titel));
  pdfDoc.setSubject("Ausgefuelltes Formular - zeilengenaues leeres Blatt (A4)");
  pdfDoc.setProducer("OneClick Dokumenten-Assistent");
  pdfDoc.setCreationDate(new Date());
  void PT_PER_MM;
  return await pdfDoc.save();
}

async function mapFieldsWithAI(fields: { name: string; type: string }[], requiredFields: RequiredField[], master: MasterData | null): Promise<Record<string, string>> {
  const { gatewayJSON } = await import("@/lib/ai.server");
  const messages: GatewayMessage[] = [
    { role: "system", content: "Du fuellst deutsche Behoerden-PDF-Formulare aus. Antworte nur mit JSON { feldname: wert }." },
    { role: "user", content: `Felder:\n${fields.map((f) => `- ${f.name} : ${f.type}`).join("\n")}\nWerte:\n${requiredFields.map((f) => `- ${f.name}: ${f.value ?? "(leer)"}`).join("\n")}\nStammdaten:\n${masterDataText(master)}` },
  ];
  try {
    const result = await gatewayJSON<Record<string, unknown>>(messages);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(result)) if (v !== null && v !== undefined) out[k] = String(v);
    return out;
  } catch { return {}; }
}

async function fillFieldsWithAI(requiredFields: RequiredField[], master: MasterData | null): Promise<RequiredField[]> {
  if (requiredFields.length === 0) return [];
  const { gatewayJSON } = await import("@/lib/ai.server");
  const messages: GatewayMessage[] = [
    { role: "system", content: "Du fuellst Behoerdenformulare aus. Antworte nur mit JSON { fields: [{ name, value }] }." },
    { role: "user", content: `Felder:\n${requiredFields.map((f) => `- ${f.name}: ${f.value ?? "(leer)"}`).join("\n")}\nStammdaten:\n${masterDataText(master)}` },
  ];
  try {
    const result = await gatewayJSON<{ fields?: { name: string; value: string | null }[] }>(messages);
    const map = new Map((result.fields ?? []).map((f) => [f.name, f.value]));
    return requiredFields.map((f) => ({ ...f, value: f.value && f.value.trim() ? f.value : (map.get(f.name) ?? null) }));
  } catch { return requiredFields; }
}
