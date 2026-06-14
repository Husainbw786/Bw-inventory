import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const RoleSchema = z.enum(["admin", "editor", "viewer"]);

export const createInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { businessId: string; email: string; role: "admin" | "editor" | "viewer" }) =>
    z.object({
      businessId: z.string().uuid(),
      email: z.string().email().max(255).toLowerCase(),
      role: RoleSchema,
    }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("is_business_admin", {
      _user_id: userId, _business_id: data.businessId,
    });
    if (!isAdmin) throw new Error("Admin only");

    const token = crypto.randomUUID() + "-" + Math.random().toString(36).slice(2, 10);
    const { error } = await supabase.from("business_invites").insert({
      business_id: data.businessId,
      email: data.email,
      role: data.role,
      token,
      invited_by: userId,
    });
    if (error) throw new Error(error.message);
    return { token };
  });

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string }) =>
    z.object({ token: z.string().min(8).max(128) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const email = (claims as any)?.email?.toLowerCase() ?? null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invite, error } = await supabaseAdmin
      .from("business_invites")
      .select("id, business_id, email, role, expires_at, accepted_at")
      .eq("token", data.token)
      .maybeSingle();
    if (error || !invite) throw new Error("Invite not found");
    if (invite.accepted_at) throw new Error("Invite already used");
    if (new Date(invite.expires_at) < new Date()) throw new Error("Invite expired");
    if (!email || invite.email.toLowerCase() !== email) {
      throw new Error(`This invite was sent to ${invite.email}. Sign in with that email to accept.`);
    }

    const { error: insErr } = await supabaseAdmin
      .from("business_members")
      .insert({ business_id: invite.business_id, user_id: userId, role: invite.role })
      .select()
      .maybeSingle();
    if (insErr && !insErr.message.includes("duplicate")) throw new Error(insErr.message);

    await supabaseAdmin
      .from("business_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    return { businessId: invite.business_id };
  });
