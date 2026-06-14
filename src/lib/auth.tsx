import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

// Role-related helpers now live in @/lib/business and are re-exported here
// for backward compatibility with components that still import from @/lib/auth.
export type { Role } from "./business";
export { useCanWrite, useIsAdmin, useBusiness } from "./business";

type AuthCtx = {
  session: Session | null;
  user: User | null;
  displayName: string;
  loading: boolean;
};

const Ctx = React.createContext<AuthCtx>({
  session: null,
  user: null,
  displayName: "",
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [displayName, setDisplayName] = React.useState("");

  React.useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  React.useEffect(() => {
    if (!session?.user) {
      setDisplayName("");
      return;
    }
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setDisplayName(data?.display_name ?? session.user.email?.split("@")[0] ?? "User");
      });
  }, [session?.user?.id]);

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, displayName, loading }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => React.useContext(Ctx);

export async function signOut() {
  await supabase.auth.signOut();
  if (typeof window !== "undefined") window.localStorage.removeItem("activeBusinessId");
}
