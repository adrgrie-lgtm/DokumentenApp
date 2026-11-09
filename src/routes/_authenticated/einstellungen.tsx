import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Save,
  KeyRound,
  Database,
  Download,
  Upload,
  Trash2,
  HardDrive,
} from "lucide-react";
import {
  DEFAULT_AI_SETTINGS,
  loadAiSettings,
  saveAiSettings,
  type AiSettings,
} from "@/lib/ai-client";
import { clearAllData, exportBackup, importBackup } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/einstellungen")({
  head: () => ({
    meta: [
      { title: "Einstellungen – OneClick Dokumenten-Assistent" },
      { name: "description", content: "KI-Zugang einrichten und lokale Daten verwalten." },
    ],
  }),
  component: Einstellungen,
});

function Einstellungen() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<AiSettings>({ ...DEFAULT_AI_SETTINGS });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<string | null>(null);

  useEffect(() => {
    setForm(loadAiSettings());
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      navigator.storage
        .estimate()
        .then((e) => {
          if (typeof e.usage === "number") {
            const mb = e.usage / 1024 / 1024;
            setUsage(mb < 10 ? `${(e.usage / 1024).toFixed(0)} KB` : `${mb.toFixed(1)} MB`);
          }
        })
        .catch(() => undefined);
    }
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      saveAiSettings({ ...form, baseUrl: form.baseUrl.replace(/\/$/, "") });
      toast.success("Einstellungen gespeichert");
    } catch {
      toast.error("Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setBusy(true);
    try {
      const backup = await exportBackup();
      const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `oneclick-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("Sicherung heruntergeladen");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  const handleImportFile = async (file: File) => {
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text());
      await importBackup(parsed);
      await queryClient.invalidateQueries();
      toast.success("Sicherung wiederhergestellt");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAll = async () => {
    if (
      !window.confirm(
        "Wirklich alle lokalen Daten löschen? Dokumente, Analysen, Chats und Stammdaten werden unwiderruflich entfernt.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await clearAllData();
      await queryClient.invalidateQueries();
      toast.success("Alle lokalen Daten gelöscht");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Löschen fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-primary">
          <KeyRound className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold">Einstellungen</h1>
          <p className="text-sm text-muted-foreground">
            KI-Zugang einrichten und lokale Daten verwalten.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4 rounded-xl border bg-card p-6 shadow-soft">
        <h2 className="text-base font-semibold">KI-Zugang</h2>
        <p className="text-sm text-muted-foreground">
          Analyse, Chat und Formular-Ausfüllung nutzen einen OpenAI-kompatiblen Endpunkt. Der
          Schlüssel bleibt nur in diesem Browser gespeichert. Beispiele: OpenAI (
          <code>https://api.openai.com/v1</code>), Google Gemini OpenAI-kompatibel, oder ein lokales
          Modell (z.&nbsp;B. Ollama mit OpenAI-Schnittstelle).
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="baseUrl">Endpunkt-URL</Label>
            <Input
              id="baseUrl"
              value={form.baseUrl}
              onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
              placeholder="https://api.openai.com/v1"
              inputMode="url"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="apiKey">API-Schlüssel</Label>
            <Input
              id="apiKey"
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
              placeholder="sk-…"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="model">Modell</Label>
            <Input
              id="model"
              value={form.model}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              placeholder="gpt-4o-mini"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Speichern
          </Button>
        </div>
      </form>

      <div className="space-y-4 rounded-xl border bg-card p-6 shadow-soft">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Database className="h-4 w-4 text-primary" /> Lokale Daten
        </h2>
        <p className="text-sm text-muted-foreground">
          Alle Dokumente, Analysen, Chats und Stammdaten liegen ausschließlich in der IndexedDB
          dieses Browsers.
          {usage !== null && (
            <>
              {" "}
              Aktuell belegt: <strong>{usage}</strong>.
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={handleExport} disabled={busy}>
            <Download className="mr-2 h-4 w-4" /> Sicherung exportieren
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <Upload className="mr-2 h-4 w-4" /> Sicherung einspielen
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportFile(f);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="destructive" onClick={handleDeleteAll} disabled={busy}>
            <Trash2 className="mr-2 h-4 w-4" /> Alle Daten löschen
          </Button>
        </div>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <HardDrive className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Beim Löschen von Browserdaten (z.&nbsp;B. „Website-Daten löschen“) gehen auch diese Daten
          verloren – bitte regelmäßig eine Sicherung exportieren.
        </p>
      </div>
    </div>
  );
}
