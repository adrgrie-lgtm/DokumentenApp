import {
  Home,
  Wallet,
  Baby,
  HeartPulse,
  Stethoscope,
  Landmark,
  Briefcase,
  ShieldCheck,
  Folder,
  type LucideIcon,
} from "lucide-react";

export type DocumentCategory =
  | "wohngeld"
  | "buergergeld"
  | "kindergeld"
  | "pflege"
  | "krankenkasse"
  | "finanzen"
  | "arbeit"
  | "versicherungen"
  | "sonstiges";

export interface CategoryConfig {
  value: DocumentCategory;
  label: string;
  icon: LucideIcon;
}

export const CATEGORIES: CategoryConfig[] = [
  { value: "wohngeld", label: "Wohngeld", icon: Home },
  { value: "buergergeld", label: "Bürgergeld", icon: Wallet },
  { value: "kindergeld", label: "Kindergeld", icon: Baby },
  { value: "pflege", label: "Pflege", icon: HeartPulse },
  { value: "krankenkasse", label: "Krankenkasse", icon: Stethoscope },
  { value: "finanzen", label: "Finanzen", icon: Landmark },
  { value: "arbeit", label: "Arbeit", icon: Briefcase },
  { value: "versicherungen", label: "Versicherungen", icon: ShieldCheck },
  { value: "sonstiges", label: "Sonstiges", icon: Folder },
];

export const CATEGORY_MAP: Record<DocumentCategory, CategoryConfig> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c]),
) as Record<DocumentCategory, CategoryConfig>;

export function categoryLabel(value: string): string {
  return CATEGORY_MAP[value as DocumentCategory]?.label ?? "Sonstiges";
}

export type DocumentStatus = "hochgeladen" | "wird_analysiert" | "analysiert" | "fehler";

export const STATUS_LABEL: Record<DocumentStatus, string> = {
  hochgeladen: "Hochgeladen",
  wird_analysiert: "Wird analysiert…",
  analysiert: "Analysiert",
  fehler: "Fehler",
};
