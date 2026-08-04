import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Send,
  CalendarClock,
  Users,
  ListChecks,
  AlertTriangle,
  BookOpen,
  FileText,
  Sparkles,
  Bot,
  Download,
  Printer,
  Eye,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { analyzeDocument, askAssistant } from "@/lib/documents.functions";
import { generateFilledPdf } from "@/lib/pdf.functions";
import { CATEGORY_MAP, STATUS_LABEL, type DocumentStatus } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PdfViewer } from "@/components/PdfViewer";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/documents/$documentId")({
  head: () => ({
    meta: [
      { title: "Dokument-Details – OneClick Dokumenten-Assistent" },
      { name: "description", content: "KI-Analyse, Fristen, Pflichtfelder und Chat-Assistent zu Ihrem Dokument." },
      { property: "og:title", content: "Dokument-Details – OneClick Dokumenten-Assistent" },
      { property: "og:description", content: "KI-Analyse, Fristen, Pflichtfelder und Chat-Assistent zu Ihrem Dokument." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DocumentDetail,
});

interface Analysis {
  doc_type: string | null;
  summary: string | null;
  deadlines: { label: string; date: string | null; description: string }[];
  contacts: { name: string; role: string; details: string }[];
  required_fields: { name: string; explanation: string; filled: boolean; value: string | null }[];
  missing_info: string[];
  field_explanations: { field: string; explanation: string }[];
}

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Was muss ich jetzt tun?",
  "Welche Unterlagen fehlen?",
  "Welche Fristen gelten?",
  "Erkläre das einfach.",
];

function DocumentDetail() {
  const { documentId } = useParams({ from: "/_authenticated/documents/$documentId" });
  const queryClient = useQueryClient();
  const runAnalyze = useServerFn(analyzeDocument);
  const ask = useServerFn(askAssistant);
  const makePdf = useServerFn(generateFilledPdf);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [pdfAction, setPdfAction] = useState<"download" | "print" | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{
    url: string;
    fileName: string;
    mode: "original" | "generated";
  } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);


  const { data: doc, isLoading } = useQuery({
    queryKey: ["document", documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("id", documentId)
        .single();
      if (error) throw error;
      return data;
    },
    refetchInterval: (q) =>
      q.state.data?.status === "wird_analysiert" ? 3000 : false,
  });

  const { data: analysis } = useQuery({
    queryKey: ["analysis", documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_analyses")
        .select("*")
        .eq("document_id", documentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as Analysis | null) ?? null;
    },
    enabled: doc?.status === "analysiert",
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["chat", documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, role, content")
        .eq("document_id", documentId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as ChatMsg[];
    },
  });

  useEffect(() => {
    let active = true;
    if (doc?.file_path) {
      supabase.storage
        .from("documents")
        .createSignedUrl(doc.file_path, 3600)
        .then(({ data }) => {
          if (active) setPreviewUrl(data?.signedUrl ?? null);
        });
    }
    return () => {
      active = false;
    };
  }, [doc?.file_path]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  const isImage = doc?.mime_type?.startsWith("image/");
  const isPdf = doc?.mime_type === "application/pdf";

  const cat = useMemo(
    () =>
      doc
        ? CATEGORY_MAP[doc.category as keyof typeof CATEGORY_MAP] ?? CATEGORY_MAP.sonstiges
        : CATEGORY_MAP.sonstiges,
    [doc],
  );

  const handleReanalyze = async () => {
    setAnalyzing(true);
    try {
      await runAnalyze({ data: { documentId } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["document", documentId] }),
        queryClient.invalidateQueries({ queryKey: ["analysis", documentId] }),
      ]);
      toast.success("Analyse abgeschlossen");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analyse fehlgeschlagen");
    } finally {
      setAnalyzing(false);
    }
  };

  const openPdfPreview = async () => {
    if (generatingPdf) return;
    setGeneratingPdf(true);
    const toastId = toast.loading("Ausgefülltes PDF wird erstellt …");
    try {
      const { fileBase64, fileName, mode } = await makePdf({ data: { documentId } });
      const bytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      // vorherige Vorschau aufräumen
      setPdfPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url, fileName, mode };
      });
      toast.success(
        mode === "original"
          ? "PDF im Original-Layout ausgefüllt"
          : "Ausgefülltes Formular erstellt",
        { id: toastId },
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF konnte nicht erstellt werden", {
        id: toastId,
      });
    } finally {
      setGeneratingPdf(false);
    }
  };

  const closePdfPreview = () => {
    setPdfPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  const handlePdf = (action: "download" | "print") => {
    if (!pdfPreview) return;
    setPdfAction(action);
    try {
      if (action === "download") {
        const a = document.createElement("a");
        a.href = pdfPreview.url;
        a.download = pdfPreview.fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        const iframe = document.createElement("iframe");
        iframe.style.position = "fixed";
        iframe.style.right = "0";
        iframe.style.bottom = "0";
        iframe.style.width = "0";
        iframe.style.height = "0";
        iframe.style.border = "0";
        iframe.src = pdfPreview.url;
        iframe.onload = () => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch {
            window.open(pdfPreview.url, "_blank");
          }
          setTimeout(() => iframe.remove(), 60000);
        };
        document.body.appendChild(iframe);
      }
    } finally {
      setPdfAction(null);
    }
  };

  useEffect(() => {
    return () => {
      if (pdfPreview) URL.revokeObjectURL(pdfPreview.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  const send = async (text: string) => {
    const q = text.trim();
    if (!q || sending) return;
    setSending(true);
    setQuestion("");
    // Optimistic user message
    queryClient.setQueryData<ChatMsg[]>(["chat", documentId], (old = []) => [
      ...old,
      { id: `tmp-${Date.now()}`, role: "user", content: q },
    ]);
    try {
      await ask({ data: { documentId, question: q } });
      await queryClient.invalidateQueries({ queryKey: ["chat", documentId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Antwort fehlgeschlagen");
      await queryClient.invalidateQueries({ queryKey: ["chat", documentId] });
    } finally {
      setSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="font-medium">Dokument nicht gefunden</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/dashboard">Zurück zum Dashboard</Link>
        </Button>
      </div>
    );
  }

  const CatIcon = cat.icon;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/dashboard" aria-label="Zurück">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold">{doc.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                <CatIcon className="mr-1 h-3 w-3" />
                {cat.label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {STATUS_LABEL[doc.status as DocumentStatus]}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={openPdfPreview} disabled={generatingPdf}>
            {generatingPdf ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Eye className="mr-2 h-4 w-4" />
            )}
            Ausgefülltes PDF anzeigen
          </Button>
          <Button variant="outline" onClick={handleReanalyze} disabled={analyzing}>
            {analyzing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Erneut analysieren
          </Button>
        </div>
      </div>


      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: preview + analysis */}
        <div className="space-y-6 lg:col-span-3">
          <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
            <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium">
              <FileText className="h-4 w-4 text-muted-foreground" /> Vorschau
            </div>
            <div className="max-h-[420px] overflow-auto bg-muted/40 p-3">
              {!previewUrl ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : isImage ? (
                <img src={previewUrl} alt={doc.title} className="mx-auto rounded-lg" />
              ) : isPdf ? (
                <iframe src={previewUrl} title={doc.title} className="h-[400px] w-full rounded-lg" />
              ) : (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Vorschau nicht verfügbar.{" "}
                  <a href={previewUrl} className="text-primary hover:underline" download>
                    Datei herunterladen
                  </a>
                </div>
              )}
            </div>
          </div>

          {doc.status === "wird_analysiert" && (
            <div className="flex items-center gap-3 rounded-xl border bg-card p-5 text-sm">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Das Dokument wird gerade analysiert …
            </div>
          )}

          {doc.status === "fehler" && (
            <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Die Analyse ist fehlgeschlagen. Bitte versuchen Sie es erneut.
            </div>
          )}

          {analysis && (
            <>
              {analysis.summary && (
                <div className="rounded-xl border bg-card p-5 shadow-soft">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Sparkles className="h-4 w-4 text-primary" /> Zusammenfassung
                  </div>
                  {analysis.doc_type && (
                    <Badge variant="secondary" className="mt-3">
                      {analysis.doc_type}
                    </Badge>
                  )}
                  <p className="mt-3 text-sm leading-relaxed text-foreground/90">
                    {analysis.summary}
                  </p>
                </div>
              )}

              <div className="rounded-xl border bg-card shadow-soft">
                <Accordion type="multiple" defaultValue={["fields", "deadlines"]}>
                  {analysis.deadlines?.length > 0 && (
                    <AccordionItem value="deadlines" className="px-5">
                      <AccordionTrigger className="text-sm font-semibold">
                        <span className="flex items-center gap-2">
                          <CalendarClock className="h-4 w-4 text-primary" /> Fristen (
                          {analysis.deadlines.length})
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <ul className="space-y-3">
                          {analysis.deadlines.map((d, i) => (
                            <li key={i} className="rounded-lg bg-muted/50 p-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">{d.label}</span>
                                {d.date && (
                                  <Badge variant="secondary">{d.date}</Badge>
                                )}
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {d.description}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {analysis.required_fields?.length > 0 && (
                    <AccordionItem value="fields" className="px-5">
                      <AccordionTrigger className="text-sm font-semibold">
                        <span className="flex items-center gap-2">
                          <ListChecks className="h-4 w-4 text-primary" /> Pflichtfelder (
                          {analysis.required_fields.length})
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <ul className="space-y-3">
                          {analysis.required_fields.map((f, i) => (
                            <li key={i} className="rounded-lg bg-muted/50 p-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">{f.name}</span>
                                <Badge
                                  className={cn(
                                    f.filled
                                      ? "bg-success/15 text-success"
                                      : "bg-warning/20 text-warning-foreground",
                                  )}
                                >
                                  {f.filled ? "ausgefüllt" : "offen"}
                                </Badge>
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {f.explanation}
                              </p>
                              {f.value && (
                                <p className="mt-1 text-sm">
                                  <span className="text-muted-foreground">Wert: </span>
                                  {f.value}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {analysis.contacts?.length > 0 && (
                    <AccordionItem value="contacts" className="px-5">
                      <AccordionTrigger className="text-sm font-semibold">
                        <span className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-primary" /> Ansprechpartner (
                          {analysis.contacts.length})
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <ul className="space-y-3">
                          {analysis.contacts.map((c, i) => (
                            <li key={i} className="rounded-lg bg-muted/50 p-3">
                              <span className="font-medium">{c.name}</span>
                              {c.role && (
                                <span className="text-sm text-muted-foreground">
                                  {" "}
                                  · {c.role}
                                </span>
                              )}
                              <p className="mt-1 text-sm text-muted-foreground">{c.details}</p>
                            </li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {analysis.missing_info?.length > 0 && (
                    <AccordionItem value="missing" className="px-5">
                      <AccordionTrigger className="text-sm font-semibold">
                        <span className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-warning" /> Fehlende Angaben (
                          {analysis.missing_info.length})
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                          {analysis.missing_info.map((m, i) => (
                            <li key={i}>{m}</li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {analysis.field_explanations?.length > 0 && (
                    <AccordionItem value="explain" className="px-5">
                      <AccordionTrigger className="text-sm font-semibold">
                        <span className="flex items-center gap-2">
                          <BookOpen className="h-4 w-4 text-primary" /> Felder erklärt (
                          {analysis.field_explanations.length})
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <ul className="space-y-2">
                          {analysis.field_explanations.map((f, i) => (
                            <li key={i} className="text-sm">
                              <span className="font-medium">{f.field}: </span>
                              <span className="text-muted-foreground">{f.explanation}</span>
                            </li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  )}
                </Accordion>
              </div>
            </>
          )}
        </div>

        {/* Right: chat */}
        <div className="lg:col-span-2">
          <div className="flex h-[600px] flex-col rounded-xl border bg-card shadow-soft lg:sticky lg:top-20">
            <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
              <Bot className="h-4 w-4 text-primary" /> KI-Assistent
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {messages.length === 0 && (
                <div className="text-center text-sm text-muted-foreground">
                  <p>Stellen Sie eine Frage zu diesem Dokument.</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="rounded-full border bg-background px-3 py-1.5 text-xs hover:bg-accent"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex",
                    m.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground",
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {sending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> denkt nach …
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(question);
              }}
              className="flex items-center gap-2 border-t p-3"
            >
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Frage eingeben …"
                disabled={sending}
              />
              <Button type="submit" size="icon" disabled={sending || !question.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </div>

      <Dialog
        open={pdfPreview !== null}
        onOpenChange={(open) => {
          if (!open) closePdfPreview();
        }}
      >
        <DialogContent className="flex h-[90vh] max-w-4xl flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Vorschau: Ausgefülltes PDF
            </DialogTitle>
            <DialogDescription>
              {pdfPreview?.mode === "original"
                ? "Das Original-Layout wurde automatisch ausgefüllt. Prüfen Sie die Angaben vor dem Herunterladen oder Drucken."
                : "Es wurde ein ausgefülltes Formular erstellt. Prüfen Sie die Angaben vor dem Herunterladen oder Drucken."}
            </DialogDescription>
          </DialogHeader>

          {pdfPreview && (
            <PdfViewer
              url={pdfPreview.url}
              storageKey={`${documentId}:${pdfPreview.mode}`}
            />
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => handlePdf("print")}
              disabled={!pdfPreview || pdfAction !== null}
            >
              <Printer className="mr-2 h-4 w-4" />
              Drucken
            </Button>
            <Button
              onClick={() => handlePdf("download")}
              disabled={!pdfPreview || pdfAction !== null}
            >
              <Download className="mr-2 h-4 w-4" />
              PDF herunterladen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
