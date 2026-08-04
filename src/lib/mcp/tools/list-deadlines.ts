import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

interface Deadline {
  label?: string;
  date?: string | null;
  description?: string;
}

export default defineTool({
  name: "list_deadlines",
  title: "Fristen auflisten",
  description:
    "Sammelt alle in den analysierten Dokumenten des angemeldeten Nutzers erkannten Fristen und Termine, sortiert nach Datum.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Nicht angemeldet." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);

    const { data, error } = await supabase
      .from("document_analyses")
      .select("document_id, deadlines, documents(title)")
      .order("created_at", { ascending: false });
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }

    const deadlines: {
      document_id: string;
      document_title: string | null;
      label: string;
      date: string | null;
      description: string;
    }[] = [];

    for (const row of data ?? []) {
      const list = Array.isArray(row.deadlines) ? (row.deadlines as Deadline[]) : [];
      const title =
        (row.documents as { title?: string } | null)?.title ?? null;
      for (const d of list) {
        deadlines.push({
          document_id: row.document_id,
          document_title: title,
          label: d.label ?? "",
          date: d.date ?? null,
          description: d.description ?? "",
        });
      }
    }

    deadlines.sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });

    return {
      content: [{ type: "text", text: JSON.stringify(deadlines, null, 2) }],
      structuredContent: { deadlines },
    };
  },
});
