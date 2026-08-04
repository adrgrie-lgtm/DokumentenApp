import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_master_data",
  title: "Stammdaten abrufen",
  description:
    "Ruft die gespeicherten Stammdaten des angemeldeten Nutzers ab (Name, Adresse, Kontaktdaten). Sensible Finanz- und Ausweisdaten (IBAN, BIC, Steuer-ID, Ausweisnummer) werden aus Datenschutzgründen nicht ausgegeben.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Nicht angemeldet." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);

    const { data, error } = await supabase
      .from("master_data")
      .select(
        "first_name, last_name, birth_date, marital_status, children_count, email, phone, street, house_number, postal_code, city, country, updated_at",
      )
      .maybeSingle();
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    if (!data) {
      return {
        content: [{ type: "text", text: "Es sind noch keine Stammdaten hinterlegt." }],
        structuredContent: { master_data: null },
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { master_data: data },
    };
  },
});
