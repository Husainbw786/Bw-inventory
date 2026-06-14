import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";

export type Role = "admin" | "editor" | "viewer";

export type Business = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
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

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [memberships, setMemberships] = React.useState<Membership[]>([]);
  const [currentId, setCurrentId] = React.useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(LS_KEY);
  });

  const load = React.useCallback(async () => {
    if (!user) {
      setMemberships([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("business_members")
      .select("role, business:businesses(id, name, phone, address, owner_id, sheets_spreadsheet_id)")
      .eq("user_id", user.id);
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
  }, [user?.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Pick a default current business
  React.useEffect(() => {
    if (loading) return;
    if (memberships.length === 0) {
      setCurrentId(null);
      if (typeof window !== "undefined") window.localStorage.removeItem(LS_KEY);
      return;
    }
    const stillValid = currentId && memberships.some((m) => m.business.id === currentId);
    if (!stillValid) {
      const first = memberships[0].business.id;
      setCurrentId(first);
      if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, first);
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
