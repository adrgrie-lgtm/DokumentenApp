import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_documents",
  title: "Dokumente auflisten",
  description:
    "Listet die hochgeladenen Behördendokumente des angemeldeten Nutzers mit Titel, Kategorie, Status und Datum auf. Optional nach Kategorie filterbar.",
  inputSchema: {
    category: z
      .enum([
        "wohngeld",
        "buergergeld",
        "kindergeld",
        "pflege",
        "krankenkasse",
        "finanzen",
        "arbeit",
        "versicherungen",
        "sonstiges",
      ])
      .optional()
      .describe("Optionaler Kategoriefilter."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Maximale Anzahl der Ergebnisse (Standard 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ category, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Nicht angemeldet." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("documents")
      .select("id, title, category, status, file_name, created_at, updated_at, is_favorite")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (category) query = query.eq("category", category);

    const { data, error } = await query;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { documents: data ?? [] },
    };
  },
});
