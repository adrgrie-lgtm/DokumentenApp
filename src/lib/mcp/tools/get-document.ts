import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_document",
  title: "Dokument mit Analyse abrufen",
  description:
    "Ruft ein einzelnes Dokument des angemeldeten Nutzers samt der neuesten KI-Analyse ab (Zusammenfassung, Fristen, Ansprechpartner, benötigte Felder, fehlende Angaben).",
  inputSchema: {
    document_id: z.string().uuid().describe("Die ID des Dokuments (aus list_documents)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ document_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Nicht angemeldet." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, title, category, status, file_name, created_at, updated_at, is_favorite")
      .eq("id", document_id)
      .maybeSingle();
    if (docErr) {
      return { content: [{ type: "text", text: docErr.message }], isError: true };
    }
    if (!doc) {
      return { content: [{ type: "text", text: "Dokument nicht gefunden." }], isError: true };
    }

    const { data: analysis } = await supabase
      .from("document_analyses")
      .select(
        "doc_type, summary, deadlines, contacts, required_fields, missing_info, field_explanations, created_at",
      )
      .eq("document_id", document_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const result = { document: doc, analysis: analysis ?? null };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});
