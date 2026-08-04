import { useCallback, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  UploadCloud,
  Search,
  Star,
  Loader2,
  FileText,
  AlertCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { analyzeDocument } from "@/lib/documents.functions";
import {
  CATEGORIES,
  CATEGORY_MAP,
  STATUS_LABEL,
  type DocumentStatus,
} from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard – OneClick Dokumenten-Assistent" },
      { name: "description", content: "Alle Dokumente, Status und anstehende Fristen auf einen Blick verwalten." },
      { property: "og:title", content: "Dashboard – OneClick Dokumenten-Assistent" },
      { property: "og:description", content: "Alle Dokumente, Status und anstehende Fristen auf einen Blick verwalten." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

interface DocRow {
  id: string;
  title: string;
  file_name: string;
  mime_type: string | null;
  category: string;
  status: DocumentStatus;
  is_favorite: boolean;
  created_at: string;
}

const ACCEPTED = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/jpg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_SIZE = 20 * 1024 * 1024;

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "bin";
}

function StatusPill({ status }: { status: DocumentStatus }) {
  const map = {
    hochgeladen: { icon: Clock, cls: "bg-secondary text-secondary-foreground" },
    wird_analysiert: { icon: Loader2, cls: "bg-secondary text-secondary-foreground" },
    analysiert: { icon: CheckCircle2, cls: "bg-success/15 text-success" },
    fehler: { icon: AlertCircle, cls: "bg-destructive/15 text-destructive" },
  } as const;
  const { icon: Icon, cls } = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", cls)}>
      <Icon className={cn("h-3 w-3", status === "wird_analysiert" && "animate-spin")} />
      {STATUS_LABEL[status]}
    </span>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const runAnalyze = useServerFn(analyzeDocument);
  const inputRef = useRef<HTMLInputElement>(null);

  const [dragOver, setDragOver] = useState(false);
  const [uploads, setUploads] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | "alle">("alle");

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, title, file_name, mime_type, category, status, is_favorite, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as DocRow[];
    },
  });

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!user) return;
      const list = Array.from(files);
      for (const file of list) {
        if (!ACCEPTED.includes(file.type)) {
          toast.error(`${file.name}: nicht unterstütztes Format`);
          continue;
        }
        if (file.size > MAX_SIZE) {
          toast.error(`${file.name}: Datei ist größer als 20 MB`);
          continue;
        }
        const docId = crypto.randomUUID();
        const path = `${user.id}/${docId}.${extOf(file.name)}`;
        setUploads((u) => ({ ...u, [docId]: 10 }));
        try {
          const { error: upErr } = await supabase.storage
            .from("documents")
            .upload(path, file, { contentType: file.type, upsert: false });
          if (upErr) throw upErr;
          setUploads((u) => ({ ...u, [docId]: 60 }));

          const { error: insErr } = await supabase.from("documents").insert({
            id: docId,
            user_id: user.id,
            title: file.name.replace(/\.[^.]+$/, ""),
            file_name: file.name,
            file_path: path,
            mime_type: file.type,
            file_size: file.size,
            status: "hochgeladen",
          });
          if (insErr) throw insErr;

          setUploads((u) => ({ ...u, [docId]: 100 }));
          await queryClient.invalidateQueries({ queryKey: ["documents"] });

          // Kick off AI analysis (non-blocking for the UI).
          runAnalyze({ data: { documentId: docId } })
            .then(() => queryClient.invalidateQueries({ queryKey: ["documents"] }))
            .catch((err) => {
              toast.error(err instanceof Error ? err.message : "Analyse fehlgeschlagen");
              queryClient.invalidateQueries({ queryKey: ["documents"] });
            });
        } catch (err) {
          toast.error(
            `${file.name}: ${err instanceof Error ? err.message : "Upload fehlgeschlagen"}`,
          );
        } finally {
          setUploads((u) => {
            const { [docId]: _, ...rest } = u;
            return rest;
          });
        }
      }
    },
    [user, queryClient, runAnalyze],
  );

  const toggleFavorite = async (doc: DocRow) => {
    await supabase
      .from("documents")
      .update({ is_favorite: !doc.is_favorite })
      .eq("id", doc.id);
    queryClient.invalidateQueries({ queryKey: ["documents"] });
  };

  const filtered = useMemo(
    () =>
      documents.filter((d) => {
        const matchesSearch =
          !search ||
          d.title.toLowerCase().includes(search.toLowerCase()) ||
          d.file_name.toLowerCase().includes(search.toLowerCase());
        const matchesCat = category === "alle" || d.category === category;
        return matchesSearch && matchesCat;
      }),
    [documents, search, category],
  );

  const uploadingCount = Object.keys(uploads).length;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Laden Sie Behördenformulare, PDFs oder Fotos hoch – die KI analysiert sie automatisch.
        </p>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-colors",
          dragOver ? "border-primary bg-secondary/60" : "border-border bg-card",
        )}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-primary">
          <UploadCloud className="h-7 w-7" />
        </span>
        <h2 className="mt-4 text-lg font-semibold">Dateien hierher ziehen</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          PDF, JPG, PNG oder DOCX – mehrere Dateien gleichzeitig möglich (max. 20 MB)
        </p>
        <Button className="mt-5" onClick={() => inputRef.current?.click()}>
          Dateien auswählen
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.docx"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {uploadingCount > 0 && (
          <div className="mt-6 w-full max-w-sm space-y-2">
            {Object.entries(uploads).map(([id, pct]) => (
              <div key={id} className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              {uploadingCount} Datei(en) werden hochgeladen …
            </p>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Dokumente durchsuchen …"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategory("alle")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              category === "alle"
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:bg-accent",
            )}
          >
            Alle
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                category === c.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card hover:bg-accent",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Document list */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border bg-card py-16 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-medium">Noch keine Dokumente</p>
          <p className="text-sm text-muted-foreground">
            Laden Sie Ihr erstes Dokument hoch, um zu starten.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((doc) => {
            const cat = CATEGORY_MAP[doc.category as keyof typeof CATEGORY_MAP] ?? CATEGORY_MAP.sonstiges;
            const Icon = cat.icon;
            return (
              <div
                key={doc.id}
                className="group relative flex flex-col rounded-xl border bg-card p-5 shadow-soft transition-shadow hover:shadow-card"
              >
                <button
                  onClick={() => toggleFavorite(doc)}
                  className="absolute right-4 top-4 text-muted-foreground hover:text-warning"
                  aria-label="Als Favorit markieren"
                >
                  <Star
                    className={cn(
                      "h-5 w-5",
                      doc.is_favorite && "fill-warning text-warning",
                    )}
                  />
                </button>
                <Link to="/documents/$documentId" params={{ documentId: doc.id }} className="flex flex-1 flex-col">
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 line-clamp-2 pr-6 font-semibold">{doc.title}</h3>
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                    {doc.file_name}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{cat.label}</Badge>
                    <StatusPill status={doc.status} />
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
