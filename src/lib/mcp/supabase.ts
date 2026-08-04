import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";
import type { Database } from "@/integrations/supabase/types";

// Build a Supabase client scoped to the signed-in MCP user by forwarding the
// verified bearer token. RLS then runs as that user, so every query is
// automatically limited to their own rows. Never derive the user id from tool
// input, and never return or log the token.
export function supabaseForUser(ctx: ToolContext): SupabaseClient<Database> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase-Konfiguration fehlt.");
  }
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
