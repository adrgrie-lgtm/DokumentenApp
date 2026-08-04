import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Save, IdCard, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/stammdaten")({
  head: () => ({
    meta: [
      { title: "Stammdaten – OneClick Dokumenten-Assistent" },
      { name: "description", content: "Persönliche Daten hinterlegen, damit Formulare automatisch vorausgefüllt werden können." },
      { property: "og:title", content: "Stammdaten – OneClick Dokumenten-Assistent" },
      { property: "og:description", content: "Persönliche Daten hinterlegen, damit Formulare automatisch vorausgefüllt werden können." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Stammdaten,
});

interface MasterData {
  first_name: string;
  last_name: string;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
  country: string;
  birth_date: string;
  phone: string;
  email: string;
  marital_status: string;
  children_count: number;
  iban: string;
  bic: string;
  bank_name: string;
  id_card_number: string;
  tax_id: string;
}

const EMPTY: MasterData = {
  first_name: "",
  last_name: "",
  street: "",
  house_number: "",
  postal_code: "",
  city: "",
  country: "Deutschland",
  birth_date: "",
  phone: "",
  email: "",
  marital_status: "",
  children_count: 0,
  iban: "",
  bic: "",
  bank_name: "",
  id_card_number: "",
  tax_id: "",
};

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  id: string;
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-soft">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Stammdaten() {
  const { user } = useAuth();
  const [form, setForm] = useState<MasterData>(EMPTY);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["master_data"],
    queryFn: async () => {
      const { data, error } = await supabase.from("master_data").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (data) {
      setForm({
        ...EMPTY,
        ...Object.fromEntries(
          Object.entries(data).filter(([, v]) => v !== null),
        ),
      } as MasterData);
    } else if (user?.email) {
      setForm((f) => ({ ...f, email: f.email || user.email || "" }));
    }
  }, [data, user?.email]);

  const set = (key: keyof MasterData) => (v: string) =>
    setForm((f) => ({ ...f, [key]: key === "children_count" ? Number(v) || 0 : v }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        birth_date: form.birth_date || null,
        children_count: Number(form.children_count) || 0,
        user_id: user.id,
      };
      const { error } = await supabase
        .from("master_data")
        .upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
      toast.success("Stammdaten gespeichert");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-primary">
          <IdCard className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold">Stammdaten</h1>
          <p className="text-sm text-muted-foreground">
            Einmal hinterlegen und bei zukünftigen Formularen automatisch nutzen.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-secondary/60 p-3 text-xs text-secondary-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        Ihre Daten werden verschlüsselt gespeichert und sind ausschließlich für Sie sichtbar.
      </div>

      <Section title="Persönliche Daten">
        <Field id="first_name" label="Vorname" value={form.first_name} onChange={set("first_name")} />
        <Field id="last_name" label="Nachname" value={form.last_name} onChange={set("last_name")} />
        <Field id="birth_date" label="Geburtsdatum" type="date" value={form.birth_date} onChange={set("birth_date")} />
        <Field id="marital_status" label="Familienstand" value={form.marital_status} onChange={set("marital_status")} placeholder="z. B. ledig, verheiratet" />
        <Field id="children_count" label="Anzahl Kinder" type="number" value={form.children_count} onChange={set("children_count")} />
      </Section>

      <Section title="Anschrift">
        <Field id="street" label="Straße" value={form.street} onChange={set("street")} />
        <Field id="house_number" label="Hausnummer" value={form.house_number} onChange={set("house_number")} />
        <Field id="postal_code" label="PLZ" value={form.postal_code} onChange={set("postal_code")} />
        <Field id="city" label="Ort" value={form.city} onChange={set("city")} />
        <Field id="country" label="Land" value={form.country} onChange={set("country")} />
      </Section>

      <Section title="Kontakt">
        <Field id="email" label="E-Mail" type="email" value={form.email} onChange={set("email")} />
        <Field id="phone" label="Telefonnummer" value={form.phone} onChange={set("phone")} />
      </Section>

      <Section title="Bankverbindung">
        <Field id="iban" label="IBAN" value={form.iban} onChange={set("iban")} />
        <Field id="bic" label="BIC" value={form.bic} onChange={set("bic")} />
        <Field id="bank_name" label="Bank" value={form.bank_name} onChange={set("bank_name")} />
      </Section>

      <Section title="Ausweis & Steuer">
        <Field id="id_card_number" label="Personalausweisnummer" value={form.id_card_number} onChange={set("id_card_number")} />
        <Field id="tax_id" label="Steuer-ID" value={form.tax_id} onChange={set("tax_id")} />
      </Section>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Speichern
        </Button>
      </div>
    </form>
  );
}
