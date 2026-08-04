import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listDocumentsTool from "./tools/list-documents";
import getDocumentTool from "./tools/get-document";
import listDeadlinesTool from "./tools/list-deadlines";
import getMasterDataTool from "./tools/get-master-data";

// The OAuth issuer MUST be the direct Supabase host. On publish, SUPABASE_URL is
// rewritten to the `.lovable.cloud` proxy, which mcp-js rejects (issuer
// mismatch). The project ref survives publish unchanged. Read it via
// import.meta.env (inlined at build time), never process.env.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "oneclick-mcp",
  title: "OneClick Dokumenten-Assistent",
  version: "0.1.0",
  instructions:
    "Werkzeuge für den OneClick Dokumenten-Assistenten. Damit kann ein Assistent die Behördendokumente, KI-Analysen, Fristen und Stammdaten des angemeldeten Nutzers lesen. Nutze `list_documents`, um Dokumente zu finden, `get_document` für Details samt Analyse, `list_deadlines` für anstehende Fristen und `get_master_data` für die Stammdaten.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listDocumentsTool, getDocumentTool, listDeadlinesTool, getMasterDataTool],
});
