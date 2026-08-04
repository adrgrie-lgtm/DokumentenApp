// Server-only helper for calling the Lovable AI Gateway.
// Never imported into client bundles (blocked by the .server.ts filename).
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

export type GatewayContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export interface GatewayMessage {
  role: "system" | "user" | "assistant";
  content: string | GatewayContentBlock[];
}

export class GatewayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "GatewayError";
  }
}

async function callGateway(
  messages: GatewayMessage[],
  opts: { json?: boolean } = {},
): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new GatewayError(500, "KI ist nicht konfiguriert (LOVABLE_API_KEY fehlt).");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429)
      throw new GatewayError(429, "Zu viele Anfragen. Bitte versuchen Sie es gleich erneut.");
    if (res.status === 402)
      throw new GatewayError(402, "Das KI-Guthaben ist aufgebraucht. Bitte laden Sie Ihr Guthaben auf.");
    throw new GatewayError(res.status, `KI-Fehler (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}

export async function gatewayJSON<T>(messages: GatewayMessage[]): Promise<T> {
  const raw = await callGateway(messages, { json: true });
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Best-effort extraction of the first JSON object.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new GatewayError(502, "Die KI-Antwort konnte nicht verarbeitet werden.");
  }
}

export async function gatewayText(messages: GatewayMessage[]): Promise<string> {
  return callGateway(messages);
}
