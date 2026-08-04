import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  IdCard,
  FileText,
  Menu,
  Moon,
  Sun,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/stammdaten", label: "Stammdaten", icon: IdCard },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link to="/dashboard" className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <FileText className="h-5 w-5" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-heading text-[15px] font-bold text-sidebar-foreground">
          OneClick
        </span>
        <span className="text-[11px] text-sidebar-foreground/70">Dokumenten-Assistent</span>
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    toast.success("Abgemeldet");
    navigate({ to: "/auth", replace: true, search: { next: undefined } });
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar p-4 lg:flex">
        <div className="px-2 py-3">
          <Brand />
        </div>
        <div className="mt-4 flex-1">
          <NavLinks />
        </div>
        <div className="rounded-lg bg-sidebar-accent/50 p-3 text-xs text-sidebar-foreground/80">
          <div className="flex items-center gap-2 font-medium text-sidebar-foreground">
            <ShieldCheck className="h-4 w-4" /> DSGVO-konform
          </div>
          <p className="mt-1 leading-relaxed">
            Ihre Dokumente werden verschlüsselt gespeichert und nur Ihnen angezeigt.
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-background/80 px-4 backdrop-blur lg:px-8">
          <div className="flex items-center gap-2 lg:hidden">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Menü öffnen">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-sidebar p-4">
                <div className="px-2 py-3">
                  <Brand />
                </div>
                <div className="mt-6">
                  <NavLinks onNavigate={() => setOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
            <span className="font-heading text-sm font-bold">OneClick</span>
          </div>

          <div className="hidden lg:block" />

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Hellmodus" : "Dunkelmodus"}
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <span className="hidden max-w-[180px] truncate text-sm text-muted-foreground sm:inline">
              {user?.email}
            </span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" /> Abmelden
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
