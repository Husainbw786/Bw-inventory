// WhatsApp via a self-hosted OpenWA gateway — one session per business,
// stored in businesses.wa_session_id. All gateway calls happen here so the
// X-API-Key secret never reaches the client.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type WaSessionStatus =
  | "none"
  | "created"
  | "initializing"
  | "qr_ready"
  | "authenticating"
  | "ready"
  | "disconnected"
  | "failed";

function owaHeaders() {
  const key = process.env.OPENWA_API_KEY;
  if (!key) throw new Error("OPENWA_API_KEY missing");
  return { "X-API-Key": key, "Content-Type": "application/json" };
}

async function owaFetch(path: string, init: RequestInit = {}) {
  const base = process.env.OPENWA_BASE_URL;
  if (!base) throw new Error("OPENWA_BASE_URL missing");
  const res = await fetch(`${base.replace(/\/$/, "")}${path}`, { ...init, headers: owaHeaders() });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`WhatsApp gateway ${res.status}: ${text.slice(0, 300)}`);
    (err as any).status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

// Indian-shop default, same rule the wa.me links use: 10 digits → prefix 91.
function chatIdFromPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  if (withCountry.length < 11 || withCountry.length > 15) {
    throw new Error("Invalid phone number for WhatsApp");
  }
  return `${withCountry}@c.us`;
}

async function requireMember(supabase: any, userId: string, businessId: string) {
  const { data } = await supabase.rpc("is_business_member", {
    _user_id: userId, _business_id: businessId,
  });
  if (!data) throw new Error("Not a member of this business");
}

async function requireAdmin(supabase: any, userId: string, businessId: string) {
  const { data } = await supabase.rpc("is_business_admin", {
    _user_id: userId, _business_id: businessId,
  });
  if (!data) throw new Error("Admin only");
}

async function getSessionId(supabase: any, businessId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("businesses")
    .select("wa_session_id")
    .eq("id", businessId)
    .maybeSingle();
  if (error?.code === "42703") {
    throw new Error("Database upgrade pending — apply the latest Supabase migrations to use WhatsApp.");
  }
  return data?.wa_session_id ?? null;
}

const bizInput = z.object({ businessId: z.string().uuid() });

// ---------- Status ----------
export const waStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { businessId: string }) => bizInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireMember(supabase, userId, data.businessId);

    const sessionId = await getSessionId(supabase, data.businessId);
    if (!sessionId) return { connected: false, status: "none" as WaSessionStatus, phone: null, pushName: null };
    try {
      const s = await owaFetch(`/api/sessions/${sessionId}`);
      return {
        connected: s.status === "ready",
        status: (s.status ?? "none") as WaSessionStatus,
        phone: s.phone ?? null,
        pushName: s.pushName ?? null,
      };
    } catch (e: any) {
      if (e?.status === 404) {
        // Session was removed on the gateway; treat as never connected.
        return { connected: false, status: "none" as WaSessionStatus, phone: null, pushName: null };
      }
      throw e;
    }
  });

// ---------- Connect (create if needed + start) ----------
export const waConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { businessId: string }) => bizInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId, data.businessId);

    let sessionId = await getSessionId(supabase, data.businessId);

    // Validate a stored id still exists on the gateway.
    let existing: any = null;
    if (sessionId) {
      try {
        existing = await owaFetch(`/api/sessions/${sessionId}`);
      } catch (e: any) {
        if (e?.status !== 404) throw e;
        sessionId = null;
      }
    }

    if (!sessionId) {
      const created = await owaFetch(`/api/sessions`, {
        method: "POST",
        body: JSON.stringify({ name: `bw-${data.businessId}` }),
      });
      sessionId = created.id as string;
      const { error } = await supabase
        .from("businesses")
        .update({ wa_session_id: sessionId })
        .eq("id", data.businessId);
      if (error) throw new Error(error.message);
      existing = created;
    }

    if (existing?.status === "ready") return { status: "ready" as WaSessionStatus };

    // A previously failed session must be killed before it can start again.
    if (existing?.status === "failed") {
      try {
        await owaFetch(`/api/sessions/${sessionId}/force-kill`, { method: "POST" });
      } catch {
        // best effort — start below will surface a real problem
      }
    }

    if (existing?.status !== "initializing" && existing?.status !== "qr_ready" && existing?.status !== "authenticating") {
      await owaFetch(`/api/sessions/${sessionId}/start`, { method: "POST" });
    }
    return { status: "initializing" as WaSessionStatus };
  });

// ---------- QR poll (returns code + live status in one call) ----------
export const waQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { businessId: string }) => bizInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId, data.businessId);

    const sessionId = await getSessionId(supabase, data.businessId);
    if (!sessionId) throw new Error("WhatsApp not set up — connect first");
    try {
      const r = await owaFetch(`/api/sessions/${sessionId}/qr`);
      return { qrCode: (r.qrCode ?? null) as string | null, status: (r.status ?? "initializing") as WaSessionStatus };
    } catch {
      // The QR endpoint errors once scanning succeeds / while transitioning;
      // fall back to the session status so the dialog can finish cleanly.
      const s = await owaFetch(`/api/sessions/${sessionId}`);
      return { qrCode: null, status: (s.status ?? "initializing") as WaSessionStatus };
    }
  });

// ---------- Disconnect ----------
export const waDisconnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { businessId: string }) => bizInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId, data.businessId);

    const sessionId = await getSessionId(supabase, data.businessId);
    if (sessionId) {
      try { await owaFetch(`/api/sessions/${sessionId}/stop`, { method: "POST" }); } catch { /* best effort */ }
      try { await owaFetch(`/api/sessions/${sessionId}`, { method: "DELETE" }); } catch { /* best effort */ }
    }
    const { error } = await supabase
      .from("businesses")
      .update({ wa_session_id: null })
      .eq("id", data.businessId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Send a bill PDF ----------
const sendInput = z.object({
  businessId: z.string().uuid(),
  phone: z.string().min(7).max(20),
  base64: z.string().min(1).max(2_800_000), // ~2 MB of PDF
  filename: z.string().min(1).max(120),
  caption: z.string().max(1000).optional(),
});

export const waSendBillPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof sendInput>) => sendInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireMember(supabase, userId, data.businessId);

    const sessionId = await getSessionId(supabase, data.businessId);
    if (!sessionId) throw new Error("WhatsApp not connected for this business");

    const chatId = chatIdFromPhone(data.phone);
    const r = await owaFetch(`/api/sessions/${sessionId}/messages/send-document`, {
      method: "POST",
      body: JSON.stringify({
        chatId,
        base64: data.base64,
        mimetype: "application/pdf",
        filename: data.filename,
        caption: data.caption ?? "",
      }),
    });
    return { ok: true, messageId: r.messageId ?? null };
  });
