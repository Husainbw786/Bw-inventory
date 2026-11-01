import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";

export type Role = "admin" | "editor" | "viewer";

export type Business = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  owner_id: string;
  sheets_spreadsheet_id: string | null;
};

export type Membership = {
  business: Business;
  role: Role;
};

type Ctx = {
  loading: boolean;
  memberships: Membership[];
  current: Business | null;
  role: Role | null;
  switchTo: (id: string) => void;
  refresh: () => Promise<void>;
};

const BusinessCtx = React.createContext<Ctx>({
  loading: true,
  memberships: [],
  current: null,
  role: null,
  switchTo: () => {},
  refresh: async () => {},
});

const LS_KEY = "activeBusinessId";

function storedBusinessId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [memberships, setMemberships] = React.useState<Membership[]>([]);
  const [currentId, setCurrentId] = React.useState<string | null>(storedBusinessId);

  const load = React.useCallback(async () => {
    // Session is still being restored on page load: treating that as "signed
    // out" would wipe the saved business and fall back to the first one.
    if (authLoading) return;
    if (!user) {
      setMemberships([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let { data, error } = await supabase
      .from("business_members")
      .select(
        "role, business:businesses(id, name, phone, address, gstin, owner_id, sheets_spreadsheet_id)",
      )
      .eq("user_id", user.id);
    if (error?.code === "42703") {
      // gstin column missing = migrations not applied yet. Retry without it so
      // users can still open their business mid-rollout.
      const retry = await supabase
        .from("business_members")
        .select(
          "role, business:businesses(id, name, phone, address, owner_id, sheets_spreadsheet_id)",
        )
        .eq("user_id", user.id);
      error = retry.error;
      data = (retry.data ?? []).map((r: any) => ({
        ...r,
        business: r.business ? { ...r.business, gstin: null } : r.business,
      })) as typeof data;
    }
    if (error) {
      console.error("[business] load", error);
      setMemberships([]);
      setLoading(false);
      return;
    }
    const list: Membership[] = (data ?? [])
      .filter((r: any) => r.business)
      .map((r: any) => ({ role: r.role as Role, business: r.business as Business }));
    list.sort((a, b) => a.business.name.localeCompare(b.business.name));
    setMemberships(list);
    setLoading(false);
  }, [user?.id, authLoading]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Pick a default current business
  React.useEffect(() => {
    if (loading) return;
    // Keep the saved id when there are no memberships (signOut clears it).
    if (memberships.length === 0) {
      setCurrentId(null);
      return;
    }
    const isMember = (id: string | null) => !!id && memberships.some((m) => m.business.id === id);
    if (!isMember(currentId)) {
      const saved = storedBusinessId();
      const next = isMember(saved) ? saved! : memberships[0].business.id;
      setCurrentId(next);
      if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, next);
    }
  }, [memberships, loading, currentId]);

  const switchTo = React.useCallback((id: string) => {
    setCurrentId(id);
    if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, id);
  }, []);

  const current = React.useMemo(
    () => memberships.find((m) => m.business.id === currentId)?.business ?? null,
    [memberships, currentId],
  );
  const role = React.useMemo(
    () => memberships.find((m) => m.business.id === currentId)?.role ?? null,
    [memberships, currentId],
  );

  return (
    <BusinessCtx.Provider value={{ loading, memberships, current, role, switchTo, refresh: load }}>
      {children}
    </BusinessCtx.Provider>
  );
}

export const useBusiness = () => React.useContext(BusinessCtx);
export const useCanWrite = () => {
  const r = useBusiness().role;
  return r === "admin" || r === "editor";
};
export const useIsAdmin = () => useBusiness().role === "admin";
