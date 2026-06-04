// Finalizes Google OAuth login: applies intent, ensures employer/candidate row,
// applies referral bonus, returns the target URL to navigate to.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "no_token" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: userRes, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userRes?.user) return json({ error: "invalid_token" }, 401);
    const user = userRes.user;

    const body = await req.json().catch(() => ({}));
    const intent: "employer" | "candidate" =
      body?.intent === "employer" ? "employer" : "candidate";
    const ref: string | null = (body?.ref || "").toString().trim() || null;
    const projectSlug: string | null = (body?.project_slug || "").toString().trim() || null;
    const companySlug: string | null = (body?.company_slug || "").toString().trim() || null;

    // Sync Google identity into profiles. Always refresh google_email/email/avatar
    // from the provider; only fill display_name when it's empty so we don't
    // overwrite user edits.
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    const googleAvatar =
      (meta.avatar_url as string) || (meta.picture as string) || null;
    const googleFullName =
      (meta.full_name as string) || (meta.name as string) || null;
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    const profileUpdate: Record<string, unknown> = {
      google_email: user.email ?? null,
      email: user.email ?? null,
    };
    if (!existingProfile?.display_name && googleFullName) {
      profileUpdate.display_name = googleFullName;
    }
    if (!existingProfile?.avatar_url && googleAvatar) {
      profileUpdate.avatar_url = googleAvatar;
    }
    // registered_via only on first Google login (keep "telegram" if user signed up there first)
    if (!existingProfile) {
      profileUpdate.registered_via = "google";
    }
    await admin.from("profiles").update(profileUpdate).eq("id", user.id);

    // Employer flow: ensure employer record
    let target = "/";
    if (intent === "employer") {
      const { data: existingEmp } = await admin
        .from("employers")
        .select("id, public_id")
        .eq("user_id", user.id)
        .maybeSingle();

      let publicId = existingEmp?.public_id as string | null | undefined;
      if (!existingEmp) {
        const { data: created } = await admin
          .from("employers")
          .insert({
            user_id: user.id,
            contact_name:
              (user.user_metadata?.full_name as string) ||
              (user.user_metadata?.name as string) ||
              null,
          })
          .select("id, public_id")
          .single();
        publicId = created?.public_id;

        // Ensure employer role
        await admin
          .from("user_roles")
          .upsert({ user_id: user.id, role: "employer" }, { onConflict: "user_id,role" });
      }
      target = publicId ? `/employer${publicId}/profile` : "/employer/profile";
    } else {
      // Candidate flow: if project context is known, ensure candidate row for it
      if (projectSlug) {
        const { data: project } = await admin
          .from("projects")
          .select("id, slug, company_id")
          .eq("slug", projectSlug)
          .maybeSingle();
        if (project?.id) {
          const { data: existingCand } = await admin
            .from("candidates")
            .select("id, public_id")
            .eq("user_id", user.id)
            .eq("project_id", project.id)
            .maybeSingle();
          let candPid = existingCand?.public_id as string | null | undefined;
          if (!existingCand) {
            const { data: createdCand } = await admin
              .from("candidates")
              .insert({
                user_id: user.id,
                project_id: project.id,
                registered_via: "google",
              })
              .select("id, public_id")
              .single();
            candPid = createdCand?.public_id;
          }
          if (companySlug && project.slug && candPid) {
            target = `/${companySlug}/${project.slug}/candidate${candPid}/profile`;
          } else if (candPid) {
            target = `/candidate${candPid}/profile`;
          }
        }
      }
      if (target === "/") {
        const { data: anyCand } = await admin
          .from("candidates")
          .select("public_id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        target = anyCand?.public_id ? `/candidate${anyCand.public_id}/profile` : "/main";
      }
    }

    // Referral bonus (idempotent inside the RPC)
    if (ref) {
      try {
        await admin.rpc("apply_referral_bonus", {
          _referrer_public_id: ref,
          _new_user: user.id,
          _intent: intent,
        });
      } catch (e) {
        console.warn("apply_referral_bonus failed", e);
      }
    }

    return json({ target });
  } catch (e: any) {
    console.error("auth-google-finalize error", e);
    return json({ error: e?.message || "internal_error" }, 500);
  }
});