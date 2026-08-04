import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Register the listener first, then read the current session.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);

      // Keep the profile row in sync (no auth-table triggers used).
      if (newSession?.user) {
        const u = newSession.user;
        setTimeout(() => {
          void supabase.from("profiles").upsert(
            {
              id: u.id,
              email: u.email ?? null,
              full_name:
                (u.user_metadata?.full_name as string | undefined) ??
                (u.user_metadata?.name as string | undefined) ??
                null,
              avatar_url: (u.user_metadata?.avatar_url as string | undefined) ?? null,
            },
            { onConflict: "id" },
          );
        }, 0);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth muss innerhalb von AuthProvider verwendet werden");
  return ctx;
}
