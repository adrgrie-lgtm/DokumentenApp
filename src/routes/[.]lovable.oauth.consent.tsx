import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

// The Supabase `oauth` namespace is beta; type it locally so we don't depend on
// generated typings.
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{
    data?: {
      client?: { name?: string } | null;
      redirect_url?: string;
      redirect_to?: string;
    } | null;
    error?: { message: string } | null;
  }>;
  approveAuthorization: (id: string) => Promise<{
    data?: { redirect_url?: string; redirect_to?: string } | null;
    error?: { message: string } | null;
  }>;
  denyAuthorization: (id: string) => Promise<{
    data?: { redirect_url?: string; redirect_to?: string } | null;
    error?: { message: string } | null;
  }>;
};

const oauth = (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

function safeNext(pathname: string, search: string): string {
  const next = pathname + search;
  // only allow same-origin relative paths
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser-only: the Supabase client reads its session from localStorage,
  // which is absent during SSR.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({
        to: "/auth",
        search: { next: safeNext(location.pathname, location.searchStr) },
      });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">
          Anfrage konnte nicht geladen werden
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {String((error as Error)?.message ?? error)}
        </p>
      </div>
    </div>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name ?? "eine Anwendung";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorization_id)
      : await oauth.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("Der Autorisierungsserver hat keine Weiterleitung zurückgegeben.");
      return;
    }
    window.location.href = target;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileText className="h-5 w-5" />
          </span>
          <span className="font-heading text-lg font-bold">OneClick</span>
        </div>

        <h1 className="text-xl font-bold text-foreground">
          {clientName} mit Ihrem Konto verbinden
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Dadurch kann <span className="font-medium text-foreground">{clientName}</span> in
          Ihrem Namen auf Ihre Dokumente, Analysen, Fristen und Stammdaten zugreifen. Sie
          können den Zugriff jederzeit widerrufen.
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => decide(false)}
          >
            Ablehnen
          </Button>
          <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Zulassen
          </Button>
        </div>
      </div>
    </div>
  );
}
