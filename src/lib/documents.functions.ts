import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { GatewayContentBlock, GatewayMessage } from "@/lib/ai.server";

export interface AnalysisResult {
  doc_type: string;
  title: string;
  category: string;
  summary: string;
  deadlines: { label: string; date: string | null; description: string }[];
  contacts: { name: string; role: string; details: string }[];
  required_fields: {
    name: string;
    explanation: string;
    filled: boolean;
    value: string | null;
  }[];
  missing_info: string[];
  field_explanations: { field: string; explanation: string }[];
}

const CATEGORY_VALUES = [
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

function fileBlock(mime: string | null, filename: string, dataUrl: string): GatewayContentBlock {
  if (mime && mime.startsWith("image/")) {
    return { type: "image_url", image_url: { url: dataUrl } };
  }
  return { type: "file", file: { filename, file_data: dataUrl } };
}

const ANALYSIS_SYSTEM = `Du bist ein Experte für deutsche Behördenformulare und Amtsdokumente.
Analysiere das beigefügte Dokument sorgfältig und antworte ausschließlich mit gültigem JSON in genau dieser Struktur:
{
  "doc_type": "kurze Bezeichnung des Dokumenttyps",
  "title": "prägnanter Titel (max. 8 Wörter)",
  "category": "einer dieser Werte: wohngeld, buergergeld, kindergeld, pflege, krankenkasse, finanzen, arbeit, versicherungen, sonstiges",
  "summary": "verständliche Zusammenfassung in einfachem Deutsch (3-5 Sätze)",
  "deadlines": [{ "label": "Bezeichnung", "date": "YYYY-MM-DD oder null", "description": "Erklärung in einfachem Deutsch" }],
  "contacts": [{ "name": "Behörde/Person", "role": "Funktion", "details": "Adresse/Telefon/E-Mail" }],
  "required_fields": [{ "name": "Feldname", "explanation": "Was hier eingetragen werden muss, in einfachem Deutsch", "filled": true oder false, "value": "erkannter Wert oder null" }],
  "missing_info": ["fehlende Angabe 1", "fehlende Angabe 2"],
  "field_explanations": [{ "field": "Feldname", "explanation": "einfache Erklärung" }]
}
Regeln: Antworte immer auf Deutsch und in leicht verständlicher Sprache. Wenn eine Information fehlt, verwende leere Listen bzw. null. Erfinde keine Daten.`;

export const analyzeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ documentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("*")
      .eq("id", data.documentId)
      .single();
    if (docErr || !doc) throw new Error("Dokument nicht gefunden.");

    await supabase
      .from("documents")
      .update({ status: "wird_analysiert" })
      .eq("id", doc.id);

    try {
      const { data: fileData, error: dlErr } = await supabase.storage
        .from("documents")
        .download(doc.file_path);
      if (dlErr || !fileData) throw new Error("Datei konnte nicht geladen werden.");

      const buffer = Buffer.from(await fileData.arrayBuffer());
      const mime = doc.mime_type ?? "application/octet-stream";
      const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;

      const { gatewayJSON } = await import("@/lib/ai.server");
      const messages: GatewayMessage[] = [
        { role: "system", content: ANALYSIS_SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Bitte analysiere dieses Dokument (Dateiname: ${doc.file_name}) und antworte ausschließlich mit dem geforderten JSON.`,
            },
            fileBlock(mime, doc.file_name, dataUrl),
          ],
        },
      ];

      const result = await gatewayJSON<AnalysisResult>(messages);
      const category = CATEGORY_VALUES.includes(result.category)
        ? result.category
        : "sonstiges";

      await supabase.from("document_analyses").insert({
        document_id: doc.id,
        user_id: userId,
        doc_type: result.doc_type ?? null,
        summary: result.summary ?? null,
        deadlines: result.deadlines ?? [],
        contacts: result.contacts ?? [],
        required_fields: result.required_fields ?? [],
        missing_info: result.missing_info ?? [],
        field_explanations: result.field_explanations ?? [],
        raw: result as unknown as never,
      });

      await supabase
        .from("documents")
        .update({
          status: "analysiert",
          category: category as never,
          title: result.title?.trim() ? result.title.trim() : doc.title,
        })
        .eq("id", doc.id);

      return { ok: true };
    } catch (err) {
      await supabase.from("documents").update({ status: "fehler" }).eq("id", doc.id);
      throw err instanceof Error ? err : new Error("Analyse fehlgeschlagen.");
    }
  });

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        documentId: z.string().uuid(),
        question: z.string().trim().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, title, file_name")
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

    const { data: history } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("document_id", doc.id)
      .order("created_at", { ascending: true })
      .limit(30);

    const context_text = analysis
      ? `Kontext zum Dokument "${doc.title}":\n${JSON.stringify(
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
      : `Zum Dokument "${doc.title}" liegt noch keine Analyse vor.`;

    const { gatewayText } = await import("@/lib/ai.server");
    const messages: GatewayMessage[] = [
      {
        role: "system",
        content: `Du bist ein hilfsbereiter Assistent für deutsche Behördenformulare. Antworte immer in leicht verständlichem Deutsch, kurz und konkret. Nutze den folgenden Kontext.\n\n${context_text}`,
      },
      ...((history ?? []).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })) satisfies GatewayMessage[]),
      { role: "user", content: data.question },
    ];

    const answer = await gatewayText(messages);

    await supabase.from("chat_messages").insert([
      { document_id: doc.id, user_id: userId, role: "user", content: data.question },
      { document_id: doc.id, user_id: userId, role: "assistant", content: answer },
    ]);

    return { answer };
  });
