import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileText, Loader2, Mail, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Anmelden – OneClick Dokumenten-Assistent" },
      { name: "description", content: "Melden Sie sich an oder erstellen Sie ein kostenloses Konto für Ihren digitalen Dokumenten-Assistenten." },
      { property: "og:title", content: "Anmelden – OneClick Dokumenten-Assistent" },
      { property: "og:description", content: "Melden Sie sich an oder erstellen Sie ein kostenloses Konto für Ihren digitalen Dokumenten-Assistenten." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//")
      ? s.next
      : undefined,
  }),
  component: AuthPage,
});

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
    />
  </svg>
);

const MicrosoftIcon = () => (
  <svg viewBox="0 0 23 23" className="h-4 w-4" aria-hidden="true">
    <path fill="#F25022" d="M1 1h10v10H1z" />
    <path fill="#7FBA00" d="M12 1h10v10H12z" />
    <path fill="#00A4EF" d="M1 12h10v10H1z" />
    <path fill="#FFB900" d="M12 12h10v10H12z" />
  </svg>
);

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const goAfterAuth = () => {
    if (next) {
      window.location.assign(next);
    } else {
      navigate({ to: "/dashboard", replace: true });
    }
  };

  useEffect(() => {
    if (!loading && user) goAfterAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${next ?? "/dashboard"}`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Konto erstellt. Sie werden angemeldet …");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      goAfterAuth();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  const handleOAuth = async (provider: "google" | "microsoft") => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: `${window.location.origin}${next ?? "/dashboard"}`,
      });
      if (result.error) {
        toast.error("Anmeldung fehlgeschlagen. Bitte erneut versuchen.");
        setBusy(false);
        return;
      }
      if (result.redirected) return;
      goAfterAuth();
    } catch {
      toast.error("Anmeldung fehlgeschlagen.");
      setBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error("Bitte geben Sie zuerst Ihre E-Mail-Adresse ein.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("E-Mail zum Zurücksetzen wurde versendet.");
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-hero p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-foreground/15">
            <FileText className="h-5 w-5" />
          </span>
          <span className="font-heading text-lg font-bold">OneClick</span>
        </div>
        <div>
          <h1 className="text-3xl font-extrabold leading-tight">
            Behördenformulare einfach verstehen
          </h1>
          <p className="mt-4 max-w-md text-primary-foreground/85">
            Dokumente hochladen, automatisch analysieren lassen und in einfachem Deutsch
            erklärt bekommen – sicher und DSGVO-konform.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/70">
          © {new Date().getFullYear()} OneClick Dokumenten-Assistent
        </p>
      </div>

      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FileText className="h-5 w-5" />
            </span>
            <span className="font-heading text-lg font-bold">OneClick</span>
          </div>

          <h2 className="text-2xl font-bold">Willkommen</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Melden Sie sich an oder erstellen Sie ein Konto.
          </p>

          <div className="mt-6 space-y-3">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => handleOAuth("google")}
            >
              <GoogleIcon />
              <span className="ml-2">Mit Google anmelden</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => handleOAuth("microsoft")}
            >
              <MicrosoftIcon />
              <span className="ml-2">Mit Microsoft anmelden</span>
            </Button>
          </div>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            oder mit E-Mail
            <span className="h-px flex-1 bg-border" />
          </div>

          <Tabs value={mode} onValueChange={(v) => setMode(v as "login" | "signup")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Anmelden</TabsTrigger>
              <TabsTrigger value="signup">Registrieren</TabsTrigger>
            </TabsList>

            <form onSubmit={handleEmailAuth} className="mt-5 space-y-4">
              <TabsContent value="signup" className="m-0">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Vollständiger Name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Max Mustermann"
                    autoComplete="name"
                  />
                </div>
              </TabsContent>

              <div className="space-y-2">
                <Label htmlFor="email">E-Mail</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@beispiel.de"
                    autoComplete="email"
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Passwort</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    className="pl-9"
                  />
                </div>
              </div>

              {mode === "login" && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-sm text-primary hover:underline"
                >
                  Passwort vergessen?
                </button>
              )}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "signup" ? "Konto erstellen" : "Anmelden"}
              </Button>
            </form>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
