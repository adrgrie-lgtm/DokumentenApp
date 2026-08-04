import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  FileText,
  ScanText,
  MessagesSquare,
  IdCard,
  ShieldCheck,
  Clock,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OneClick Dokumenten-Assistent – Behördenpost verstehen" },
      { name: "description", content: "KI-Assistent für Behördenformulare: Dokumente hochladen, Fristen erkennen, Pflichtfelder ausfüllen lassen." },
      { property: "og:title", content: "OneClick Dokumenten-Assistent – Behördenpost verstehen" },
      { property: "og:description", content: "KI-Assistent für Behördenformulare: Dokumente hochladen, Fristen erkennen, Pflichtfelder ausfüllen lassen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/dashboard" });
  },
  component: Landing,
});

const FEATURES = [
  {
    icon: ScanText,
    title: "Automatische Analyse",
    text: "Dokumenttyp, Pflichtfelder, Fristen und Ansprechpartner werden automatisch erkannt.",
  },
  {
    icon: MessagesSquare,
    title: "KI-Assistent",
    text: "Stellen Sie Fragen zu Ihrem Formular und erhalten Sie Antworten in einfachem Deutsch.",
  },
  {
    icon: IdCard,
    title: "Stammdaten speichern",
    text: "Persönliche Daten einmal hinterlegen und bei neuen Formularen wiederverwenden.",
  },
  {
    icon: ShieldCheck,
    title: "DSGVO-konform",
    text: "Verschlüsselte Speicherung und sichere Anmeldung – Ihre Daten bleiben privat.",
  },
];

const STEPS = [
  "Dokument per Drag & Drop hochladen",
  "KI erkennt Inhalt, Felder und Fristen",
  "Alles verständlich erklärt bekommen",
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileText className="h-5 w-5" />
          </span>
          <span className="font-heading text-lg font-bold">OneClick</span>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/auth" search={{ next: undefined }}>Anmelden</Link>
        </Button>
      </header>

      <section className="bg-hero text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-20 lg:py-28">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-medium">
              <ShieldCheck className="h-3.5 w-3.5" /> Spezialisiert auf deutsche Behördenformulare
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
              Behördenformulare endlich einfach verstehen
            </h1>
            <p className="mt-5 text-lg text-primary-foreground/85">
              Laden Sie PDFs, Fotos oder Scans hoch. Der OneClick Dokumenten-Assistent
              analysiert Ihr Dokument, erklärt jedes Feld verständlich und hilft beim
              Ausfüllen.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="secondary">
                <Link to="/auth" search={{ next: undefined }}>
                  Kostenlos starten <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-primary-foreground/85">
              {STEPS.map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
        <h2 className="text-center text-3xl font-bold">Alles, was Sie brauchen</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
          Von der Analyse bis zum ausgefüllten Formular – verständlich und sicher.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="rounded-xl border bg-card p-6 shadow-soft transition-shadow hover:shadow-card"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-t bg-secondary/40">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-16 text-center">
          <Clock className="h-10 w-10 text-primary" />
          <h2 className="text-3xl font-bold">Sparen Sie sich Behördenstress</h2>
          <p className="max-w-xl text-muted-foreground">
            Erstellen Sie Ihr kostenloses Konto und laden Sie Ihr erstes Dokument hoch.
          </p>
          <Button asChild size="lg">
            <Link to="/auth" search={{ next: undefined }}>
              Jetzt starten <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} OneClick Dokumenten-Assistent
      </footer>
    </div>
  );
}
