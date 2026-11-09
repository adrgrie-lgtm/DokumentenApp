// Clientseitige PDF-Erzeugung: läuft vollständig im Browser (pdf-lib),
// ohne Server und ohne Supabase. Enthält den zeilengenauen Renderer für
// das leere A4-Blatt mit festem 15-pt-Zeilenraster.

import type { MasterData, RequiredField } from "./db";
import { fillMissingFields, mapFormFields } from "./ai-client";

export interface GeneratedPdf {
  blob: Blob;
  fileName: string;
  /** "original" = das Original-PDF-Layout wurde ausgefüllt, "generated" = neues Formular erstellt */
  mode: "original" | "generated";
}

// ---------------------------------------------------------------------------
// Zeilengenaues leeres Blatt (A4)
// ---------------------------------------------------------------------------
// Idee: Statt freier Y-Positionen gibt es ein festes Zeilenraster.
// Jede Textzeile liegt exakt auf einer Rasterlinie:
//   y = SEITEN_HOEHE - RAND_OBEN - zeilenIndex * ZEILEN_HOEHE
// Dadurch verrutscht beim Drucken nichts: Label, Wert und Erklärung
// belegen immer ganze, vorher berechenbare Zeilen. Lange Werte werden
// vor dem Zeichnen exakt nach gemessener Textbreite umbrochen, inkl.
// Trennung zu langer Wörter per Zeichenumbruch. Seitenumbrüche passieren
// nur zwischen ganzen Zeilen, Feldblöcke werden zusammengehalten.
//
// Druck-Tipp für den Nutzer: im Druckdialog "Tatsächliche Größe / 100 %"
// wählen, keine Anpassung an Seitenränder. Dafür steht auch ein Hinweis
// in der Fußzeile jeder Seite.
// ---------------------------------------------------------------------------

// Exaktes A4 in Punkt (pdf-lib Standard)
const SEITE_BREITE = 595.28;
const SEITE_HOEHE = 841.89;

// Ränder in Punkt – bewusst als glatte Werte, damit das Raster aufgeht
const RAND_OBEN = 72; // 25,4 mm
const RAND_UNTEN = 72; // Platz für Fußzeile + Hinweis
const RAND_LINKS = 64; // ca. 22,6 mm
const RAND_RECHTS = 56; // ca. 19,8 mm
const NUTZ_BREITE = SEITE_BREITE - RAND_LINKS - RAND_RECHTS;

// Zeilenraster: alle Schriftgrößen teilen sich dieselbe Zeilenhöhe.
// 10,5 pt Schrift auf 15 pt Zeile = gut lesbar + exakt stapelbar.
const ZEILEN_HOEHE = 15;
const ZEILEN_PRO_SEITE = Math.floor((SEITE_HOEHE - RAND_OBEN - RAND_UNTEN) / ZEILEN_HOEHE);

// Schriftgrößen (alle < ZEILEN_HOEHE, damit kein Überlapp entsteht)
const S_TITEL = 20;
const S_DOK_TITEL = 13;
const S_META = 9;
const S_RUBRIK = 13;
const S_LABEL = 10.5;
const S_WERT = 10.5;
const S_ERKLAERUNG = 8.5;
const S_FUSS = 7.5;

/** WinAnsi (Helvetica) unterstützt kein € und einige Sonderzeichen – ersetzen. */
function sanitize(text: string): string {
  return (text ?? "")
    .replace(/€/g, "EUR")
    .replace(/[‚‘’]/g, "'")
    .replace(/[„“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\u0020-\u00FF]/g, "");
}

function buildFileName(title: string): string {
  const base = (title || "dokument")
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "dokument"}-ausgefuellt.pdf`;
}

interface BlattFeld {
  name: string;
  explanation: string;
  value: string | null;
}

async function leeresBlattZeilengenau(args: {
  titel: string;
  docType: string | null;
  felder: BlattFeld[];
}): Promise<Uint8Array> {
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

  // ---- exakter Umbruch nach gemessener Breite (inkl. Worttrennung) ----
  const umbrechen = (text: string, size: number, f: typeof font = font): string[] => {
    const sauber = sanitize(text);
    if (!sauber.trim()) return [""];
    const zeilen: string[] = [];
    const woerter = sauber.split(/\s+/);
    let zeile = "";
    const passt = (t: string) => f.widthOfTextAtSize(t, size) <= NUTZ_BREITE;

    for (const wort of woerter) {
      const kandidat = zeile ? `${zeile} ${wort}` : wort;
      if (passt(kandidat)) {
        zeile = kandidat;
        continue;
      }
      // Wort allein zu lang -> zeichenweise umbrechen (zeilengenau!)
      if (!zeile && !passt(wort)) {
        const rest = wort;
        let stueck = "";
        for (const zeichen of rest) {
          if (passt(stueck + zeichen)) {
            stueck += zeichen;
          } else {
            zeilen.push(stueck + "-");
            stueck = zeichen;
          }
        }
        zeile = stueck;
        continue;
      }
      // normale Zeile voll -> ablegen, neues Wort beginnt nächste Zeile
      if (zeile) zeilen.push(zeile);
      zeile = wort;
    }
    if (zeile) zeilen.push(zeile);
    return zeilen.length ? zeilen : [""];
  };

  // ---- Seiten- und Zeilenverwaltung ----
  type Seite = ReturnType<typeof pdfDoc.addPage>;
  let seite: Seite = pdfDoc.addPage([SEITE_BREITE, SEITE_HOEHE]);
  let zeile = 0; // 0 = oberste Rasterzeile

  const yVonZeile = (z: number) => SEITE_HOEHE - RAND_OBEN - z * ZEILEN_HOEHE;

  const fusszeileZeichnen = (s: Seite, nr: number, totalPlatzhalter: string) => {
    const fussY = RAND_UNTEN - 28;
    s.drawText(`Seite ${nr} ${totalPlatzhalter}`, {
      x: RAND_LINKS,
      y: fussY,
      size: S_FUSS,
      font,
      color: FARBE_GRAU,
    });
    const hinweis = "Druck: A4, 100 % / Tatsaechliche Groesse – kein Anpassen an Seite.";
    const breite = font.widthOfTextAtSize(hinweis, S_FUSS);
    s.drawText(hinweis, {
      x: SEITE_BREITE - RAND_RECHTS - breite,
      y: fussY,
      size: S_FUSS,
      font,
      color: FARBE_GRAU,
    });
    // dünne Trennlinie über der Fußzeile (fixe Position)
    s.drawLine({
      start: { x: RAND_LINKS, y: RAND_UNTEN - 14 },
      end: { x: SEITE_BREITE - RAND_RECHTS, y: RAND_UNTEN - 14 },
      thickness: 0.5,
      color: FARBE_LINIE,
    });
  };

  // Alle erzeugten Seiten tracken, um am Ende die Fußzeilen mit
  // korrekter Gesamtseitenzahl zu zeichnen.
  const alleSeiten: Seite[] = [seite];
  const neueSeite = () => {
    seite = pdfDoc.addPage([SEITE_BREITE, SEITE_HOEHE]);
    alleSeiten.push(seite);
    zeile = 0;
  };

  const platzFuer = (n: number) => ZEILEN_PRO_SEITE - zeile >= n;

  // Eine Rasterzeile zeichnen.
  const zeichneZeile = (
    text: string,
    size: number,
    opts: {
      f?: typeof font;
      farbe?: ReturnType<typeof rgb>;
      einzug?: number;
      unterstreichen?: boolean;
      hintergrund?: boolean;
    } = {},
  ) => {
    if (!platzFuer(1)) neueSeite();
    const f = opts.f ?? font;
    const farbe = opts.farbe ?? FARBE_DUNKEL;
    const x = RAND_LINKS + (opts.einzug ?? 0);
    const y = yVonZeile(zeile) - size; // Baseline unter Rasterlinie
    if (opts.hintergrund) {
      seite.drawRectangle({
        x: RAND_LINKS - 6,
        y: y - 3,
        width: NUTZ_BREITE + 12,
        height: ZEILEN_HOEHE,
        color: FARBE_FELD_BG,
        borderColor: undefined,
      });
    }
    if (text) {
      seite.drawText(text, { x, y, size, font: f, color: farbe });
    }
    if (opts.unterstreichen) {
      seite.drawLine({
        start: { x, y: y - 2 },
        end: { x: SEITE_BREITE - RAND_RECHTS, y: y - 2 },
        thickness: 0.5,
        color: FARBE_LINIE,
      });
    }
    zeile += 1;
  };

  const leerzeilen = (n: number) => {
    for (let i = 0; i < n; i++) {
      if (!platzFuer(1)) neueSeite();
      zeile += 1;
    }
  };

  // ---- Kopf ----
  zeichneZeile("Ausgefuelltes Formular", S_TITEL, {
    f: fontBold,
    farbe: FARBE_PRIMAER,
  });
  // Dokumenttitel kann 1–2 Zeilen brauchen – exakt vorab berechnen
  for (const z of umbrechen(args.titel || "Dokument", S_DOK_TITEL, fontBold)) {
    zeichneZeile(z, S_DOK_TITEL, { f: fontBold });
  }
  if (args.docType) {
    for (const z of umbrechen(args.docType, S_META)) {
      zeichneZeile(z, S_META, { farbe: FARBE_GRAU });
    }
  }
  const datum = new Date().toLocaleDateString("de-DE");
  zeichneZeile(`Erstellt am ${datum} - OneClick Dokumenten-Assistent`, S_META, {
    farbe: FARBE_GRAU,
  });
  leerzeilen(1);

  // Rubrik
  zeichneZeile("Angaben", S_RUBRIK, { f: fontBold, farbe: FARBE_PRIMAER });
  leerzeilen(1);

  // ---- Felder: jedes Feld = Labelzeile + Wertzeilen + ggf. Erklärung ----
  if (args.felder.length === 0) {
    zeichneZeile("Fuer dieses Dokument wurden keine Pflichtfelder erkannt.", S_WERT, {
      farbe: FARBE_GRAU,
    });
  }

  args.felder.forEach((feld, index) => {
    const nummer = String(index + 1).padStart(2, "0");
    const wert = feld.value && feld.value.trim() ? feld.value.trim() : "—";
    const istLeer = wert === "—";
    const wertZeilen = umbrechen(wert, S_WERT);
    const erklaerungsZeilen = feld.explanation
      ? umbrechen(feld.explanation, S_ERKLAERUNG, fontOblique)
      : [];
    // Blockhöhe exakt vorab: 1 Label + N Wert + M Erklärung + 1 Leerzeile
    const blockHoehe = 1 + wertZeilen.length + erklaerungsZeilen.length + 1;

    // Zusammenhalten: passt der Block nicht mehr, ganz auf nächste Seite
    if (!platzFuer(blockHoehe)) neueSeite();

    // Labelzeile: "01 · Feldname"
    zeichneZeile(`${nummer} · ${sanitize(feld.name)}`, S_LABEL, {
      f: fontBold,
    });

    // Wertzeilen mit Schreiblinie (wie auf Papierformular)
    wertZeilen.forEach((z) => {
      zeichneZeile(z || " ", S_WERT, {
        farbe: istLeer ? FARBE_GRAU : FARBE_DUNKEL,
        unterstreichen: !istLeer,
        hintergrund: !istLeer,
      });
    });

    // Erklärung in kleiner Kursivschrift, grau – belegt eigene Rasterzeilen
    erklaerungsZeilen.forEach((z) => {
      zeichneZeile(z, S_ERKLAERUNG, {
        f: fontOblique,
        farbe: FARBE_GRAU,
      });
    });

    leerzeilen(1);
  });

  // ---- Hinweisblock (wird ebenfalls zeilengenau umbrochen) ----
  leerzeilen(1);
  const hinweis =
    "Hinweis: Bitte alle Angaben vor dem Absenden pruefen und fehlende Felder von Hand ergaenzen. Leere Zeilen sind mit — markiert.";
  for (const z of umbrechen(hinweis, S_ERKLAERUNG, fontOblique)) {
    if (!platzFuer(1)) neueSeite();
    zeichneZeile(z, S_ERKLAERUNG, {
      f: fontOblique,
      farbe: FARBE_GRAU,
    });
  }

  // ---- Fußzeilen auf allen Seiten (exakte Seitenzahl erst jetzt bekannt) ----
  const gesamt = alleSeiten.length;
  alleSeiten.forEach((s, i) => {
    fusszeileZeichnen(s, i + 1, `von ${gesamt}`);
  });

  // Druck ohne Skalierung: PDF-Katalog auf A4 festnageln
  pdfDoc.setTitle(sanitize(args.titel));
  pdfDoc.setSubject("Ausgefuelltes Formular – zeilengenaues leeres Blatt (A4)");
  pdfDoc.setProducer("OneClick Dokumenten-Assistent");
  pdfDoc.setCreationDate(new Date());

  return await pdfDoc.save();
}

// ---------------------------------------------------------------------------
// Hauptfunktion: ausgefülltes PDF erzeugen (Original-Layout oder leeres Blatt)
// ---------------------------------------------------------------------------

export async function generateFilledPdf(args: {
  fileBytes: ArrayBuffer;
  mime: string | null;
  title: string;
  docType: string | null;
  requiredFields: RequiredField[];
  master: MasterData | null;
}): Promise<GeneratedPdf> {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");

  // ---- 1. Versuch: Original-PDF mit Formularfeldern ausfüllen ----
  if (args.mime === "application/pdf") {
    try {
      const pdfDoc = await PDFDocument.load(args.fileBytes.slice(0), {
        ignoreEncryption: true,
      });
      const form = pdfDoc.getForm();
      const fields = form.getFields();

      if (fields.length > 0) {
        // Feldzuordnung per KI (Best Effort – ohne Schlüssel bleibt das
        // Formular unverändert, wird aber trotzdem übernommen).
        let mapping: Record<string, string> = {};
        try {
          mapping = await mapFormFields(
            fields.map((f) => ({
              name: f.getName(),
              type: f.constructor.name.replace("PDF", ""),
            })),
            args.requiredFields,
            args.master,
          );
        } catch {
          mapping = {};
        }

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
          blob: new Blob([out as unknown as BlobPart], { type: "application/pdf" }),
          fileName: buildFileName(args.title),
          mode: "original",
        };
      }
    } catch {
      // Fällt auf das leere Blatt mit Zeilenraster zurück
    }
  }

  // ---- 2. Leeres Blatt, zeilengenau beschriften ----
  // Werte aus Stammdaten ergänzen (Best Effort – ohne KI-Schlüssel
  // werden die erkannten Werte unverändert übernommen).
  let felder = args.requiredFields;
  try {
    felder = await fillMissingFields(args.requiredFields, args.master);
  } catch {
    felder = args.requiredFields;
  }
  const out = await leeresBlattZeilengenau({
    titel: args.titel,
    docType: args.docType,
    felder,
  });

  return {
    blob: new Blob([out as unknown as BlobPart], { type: "application/pdf" }),
    fileName: buildFileName(args.title),
    mode: "generated",
  };
}
