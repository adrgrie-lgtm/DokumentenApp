import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  idbGetThumb,
  idbSetThumb,
  idbPruneStale,
  idbClearDocThumbs,
  buildThumbKey,
} from "@/lib/thumb-cache";

// pdf.js wird nur clientseitig geladen (kein SSR)
type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<any>;
  fingerprints?: (string | null)[];
  fingerprint?: string;
};

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;
const DEFAULT_SCALE = 1.2;
const THUMB_WIDTH = 96;

// Modulweiter Cache der gerenderten Thumbnails (als PNG-Data-URL) pro
// Dokument+Seite. Bleibt über Dialog-Öffnungen hinweg erhalten, sodass beim
// erneuten Öffnen keine Render-Schübe mehr nötig sind.
const thumbCache = new Map<string, string>();
const MAX_THUMB_CACHE = 400;

function setThumbCache(key: string, dataUrl: string) {
  // Bei Überlauf den ältesten Eintrag verwerfen (Map hält Einfügereihenfolge)
  if (thumbCache.size >= MAX_THUMB_CACHE) {
    const oldest = thumbCache.keys().next().value;
    if (oldest !== undefined) thumbCache.delete(oldest);
  }
  thumbCache.set(key, dataUrl);
  // Zusätzlich persistent in IndexedDB ablegen (nach Reload sofort verfügbar)
  void idbSetThumb(key, dataUrl);
}

type ViewerState = { page: number; scale: number };

function readState(storageKey?: string): ViewerState {
  if (!storageKey || typeof window === "undefined") return { page: 1, scale: DEFAULT_SCALE };
  try {
    const raw = window.localStorage.getItem(`pdf-viewer:${storageKey}`);
    if (!raw) return { page: 1, scale: DEFAULT_SCALE };
    const parsed = JSON.parse(raw) as Partial<ViewerState>;
    const page = Number.isFinite(parsed.page) ? Math.max(1, Math.floor(parsed.page as number)) : 1;
    const scale = Number.isFinite(parsed.scale)
      ? Math.max(MIN_SCALE, Math.min(MAX_SCALE, parsed.scale as number))
      : DEFAULT_SCALE;
    return { page, scale };
  } catch {
    return { page: 1, scale: DEFAULT_SCALE };
  }
}

// Eine einzelne Thumbnail-Seite, die sich selbst rendert
function Thumbnail({
  pdf,
  pageNumber,
  active,
  onSelect,
  rootRef,
  cacheKey,
}: {
  pdf: PdfDoc;
  pageNumber: number;
  active: boolean;
  onSelect: (n: number) => void;
  rootRef: React.RefObject<HTMLDivElement | null>;
  cacheKey: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Bereits gerendertes Thumbnail aus dem Cache (Data-URL) – vermeidet Neu-Render
  const [cachedSrc, setCachedSrc] = useState<string | null>(
    () => thumbCache.get(cacheKey) ?? null,
  );
  // Erst rendern, wenn (nahezu) sichtbar – Lazy-Rendering für große PDFs
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  const ready = cachedSrc !== null || rendered;

  // Cache-Treffer bei Wechsel des Cache-Keys übernehmen
  useEffect(() => {
    let cancelled = false;
    const memHit = thumbCache.get(cacheKey) ?? null;
    setCachedSrc(memHit);
    setRendered(false);
    // Ohne In-Memory-Treffer: persistenten IndexedDB-Cache asynchron prüfen,
    // damit Miniaturen auch direkt nach einem Reload sofort erscheinen.
    if (!memHit) {
      void idbGetThumb(cacheKey).then((hit) => {
        if (cancelled || !hit) return;
        thumbCache.set(cacheKey, hit);
        setCachedSrc(hit);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  // Sichtbarkeit im Scroll-Container beobachten (nur ohne Cache-Treffer nötig)
  useEffect(() => {
    if (cachedSrc) return;
    const el = buttonRef.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      // Vorab laden, kurz bevor das Thumbnail in den Blick kommt
      { root: rootRef.current ?? null, rootMargin: "200px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootRef, visible, cachedSrc]);

  // Seite nur rendern, sobald sie sichtbar wurde und kein Cache-Treffer vorliegt
  useEffect(() => {
    if (!visible || cachedSrc) return;
    let cancelled = false;
    let task: any = null;
    (async () => {
      try {
        const pdfPage = await pdf.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const scale = THUMB_WIDTH / base.width;
        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d")!;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        task = pdfPage.render({ canvasContext: ctx, viewport });
        await task.promise;
        if (cancelled) return;
        setRendered(true);
        // Gerendertes Bild für spätere Öffnungen cachen
        try {
          setThumbCache(cacheKey, canvas.toDataURL("image/png"));
        } catch {
          /* toDataURL kann bei sehr großen Canvas fehlschlagen – ignorieren */
        }
      } catch {
        /* Render abgebrochen – ignorieren */
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel?.();
    };
  }, [visible, cachedSrc, pdf, pageNumber, cacheKey]);

  // Aktives Thumbnail in den sichtbaren Bereich scrollen
  useEffect(() => {
    if (active) {
      buttonRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [active]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => onSelect(pageNumber)}
      aria-label={`Seite ${pageNumber}`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex w-full flex-col items-center gap-1 rounded-md border p-1 transition-colors",
        active
          ? "border-primary bg-primary/10"
          : "border-transparent hover:border-border hover:bg-muted",
      )}
    >
      <div
        className={cn(
          "relative flex w-full items-center justify-center overflow-hidden rounded-sm bg-white shadow-sm ring-1 ring-border/50",
          active && "ring-2 ring-primary",
        )}
        // Platzhalterhöhe reservieren (A4-Verhältnis), bis das Thumbnail bereit ist
        style={ready ? undefined : { aspectRatio: "1 / 1.414" }}
      >
        {cachedSrc ? (
          <img src={cachedSrc} alt={`Seite ${pageNumber}`} className="w-full" />
        ) : (
          <canvas ref={canvasRef} className={cn("w-full", !rendered && "hidden")} />
        )}
        {!ready && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />}
      </div>
      <span
        className={cn(
          "text-xs tabular-nums",
          active ? "font-medium text-primary" : "text-muted-foreground",
        )}
      >
        {pageNumber}
      </span>
    </button>
  );
}

export function PdfViewer({
  url,
  className,
  storageKey,
}: {
  url: string;
  className?: string;
  storageKey?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbScrollRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  const initial = useRef<ViewerState>(readState(storageKey));
  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [numPages, setNumPages] = useState(0);
  // Inhaltsabhängiger Fingerprint des Dokuments – ändert sich bei PDF-Änderung
  // und sorgt so für eine korrekte Cache-Zuordnung/Invalidierung.
  const [docVersion, setDocVersion] = useState<string | null>(null);
  const [page, setPage] = useState(initial.current.page);
  const [scale, setScale] = useState(initial.current.scale);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Wird hochgezählt, wenn der Nutzer den Miniaturen-Cache für dieses Dokument
  // löscht – erzwingt neue Cache-Keys und damit ein vollständiges Neu-Rendern.
  const [thumbRefresh, setThumbRefresh] = useState(0);

  const docId = storageKey ?? url;

  // Miniaturen-Cache für dieses Dokument löschen und Neu-Rendern erzwingen.
  const reloadThumbs = () => {
    // In-Memory-Cache: alle Einträge mit dem Dokument-Präfix entfernen.
    const prefix = `${docId}:`;
    for (const key of [...thumbCache.keys()]) {
      if (key.includes(prefix)) thumbCache.delete(key);
    }
    // Persistenter IndexedDB-Cache: dokumentbezogene Einträge löschen.
    void idbClearDocThumbs(docId);
    setThumbRefresh((n) => n + 1);
  };

  // Dokument laden
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDocVersion(null);
    const restored = readState(storageKey);
    initial.current = restored;
    setPage(restored.page);
    setScale(restored.scale);
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = (
          await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
        ).default;
        const doc = await pdfjs.getDocument({
          url,
          // Ohne die Standard-Schriftdaten rendert pdf.js Helvetica & Co. leer.
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
        }).promise;
        if (cancelled) return;
        const typed = doc as unknown as PdfDoc;
        // Fingerprint aus pdf.js ableiten (neue API: fingerprints[0],
        // ältere API: fingerprint). Fallback verhindert Fehlzuordnung.
        const version =
          typed.fingerprints?.find((f): f is string => !!f) ??
          typed.fingerprint ??
          "unknown";
        setPdf(typed);
        setNumPages(doc.numPages);
        setDocVersion(version);
        // Veraltete Cache-Einträge (alte Version oder anderer Fingerprint) für
        // dieses Dokument entfernen, damit keine falschen Miniaturen erscheinen.
        void idbPruneStale(docId, version);
        // Wiederhergestellte Seite auf gültigen Bereich begrenzen
        setPage((p) => Math.max(1, Math.min(doc.numPages, p)));
      } catch (e) {
        if (!cancelled) setError("Vorschau konnte nicht geladen werden.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Aktuelle Seite rendern
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const pdfPage = await pdf.getPage(page);
        if (cancelled) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderTaskRef.current?.cancel?.();
        const task = pdfPage.render({ canvas, canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
      } catch (e) {
        if (!(e as Error)?.name?.includes("Rendering")) {
          console.error("PDF-Render-Fehler", e);
        }
      }
    })();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel?.();
    };
  }, [pdf, page, scale]);

  // Seite & Zoom pro Dokument speichern
  useEffect(() => {
    if (!storageKey || typeof window === "undefined" || numPages === 0) return;
    try {
      window.localStorage.setItem(
        `pdf-viewer:${storageKey}`,
        JSON.stringify({ page, scale }),
      );
    } catch {
      /* Speicher nicht verfügbar – ignorieren */
    }
  }, [storageKey, page, scale, numPages]);

  const [pageInput, setPageInput] = useState(String(initial.current.page));

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(numPages, p + 1));
  const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)));
  const zoomOut = () => setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)));
  const goToPage = (n: number) => setPage(Math.max(1, Math.min(numPages, n)));

  const applyPageInput = () => {
    const value = parseInt(pageInput, 10);
    if (!Number.isNaN(value)) {
      setPage(Math.max(1, Math.min(numPages, value)));
    } else {
      setPageInput(String(page));
    }
  };

  const handlePageKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyPageInput();
    }
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex flex-wrap items-center justify-center gap-2 border-b pb-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={goPrev}
            disabled={page <= 1}
            aria-label="Vorherige Seite"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={1}
              max={numPages || 1}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={handlePageKeyDown}
              onBlur={applyPageInput}
              className="h-8 w-16 text-center text-sm tabular-nums"
              aria-label="Seitenzahl eingeben"
            />
            <span className="text-sm text-muted-foreground">/ {numPages}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={goNext}
            disabled={page >= numPages}
            aria-label="Nächste Seite"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={zoomOut}
            disabled={scale <= MIN_SCALE}
            aria-label="Verkleinern"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="min-w-14 text-center text-sm tabular-nums text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={zoomIn}
            disabled={scale >= MAX_SCALE}
            aria-label="Vergrößern"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* Thumbnail-Leiste */}
        {pdf && numPages > 0 && docVersion && (
          <div
            ref={thumbScrollRef}
            className="hidden shrink-0 overflow-y-auto rounded-lg border bg-muted/40 p-2 sm:block"
            aria-label="Seitenübersicht"
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={reloadThumbs}
              className="mb-2 w-full justify-center gap-1.5 text-xs text-muted-foreground"
              aria-label="Miniaturen neu laden"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Neu laden
            </Button>
            <div className="flex w-24 flex-col gap-2">
              {Array.from({ length: numPages }, (_, i) => (
                <Thumbnail
                  key={`${i + 1}-${thumbRefresh}`}
                  pdf={pdf}
                  pageNumber={i + 1}
                  active={page === i + 1}
                  onSelect={goToPage}
                  rootRef={thumbScrollRef}
                  cacheKey={`${buildThumbKey(docId, docVersion, i + 1)}#${thumbRefresh}`}
                />
              ))}
            </div>
          </div>
        )}

        <div className="relative min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/40 p-4">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Vorschau wird geladen …
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-destructive">
              {error}
            </div>
          )}
          <div className="flex justify-center">
            <canvas ref={canvasRef} className="shadow-sm" />
          </div>
        </div>
      </div>
    </div>
  );
}
