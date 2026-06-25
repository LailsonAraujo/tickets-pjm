// Edge Function: sso-session
// Provisiona/atualiza usuário e devolve tokens de sessão Supabase.
import { jwtVerify } from "https://deno.land/x/jose@v5.9.6/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_ROLES = new Set(["admin", "tecnico", "suporte", "user"]);

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
    const { token } = (await req.json()) as { token?: string };
    if (!token) return json({ error: "missing_token" }, 400);

    const secret = Deno.env.get("NOC_SSO_SECRET");
    if (!secret) return json({ error: "server_misconfigured" }, 500);

    // Revalida assinatura — replay-guard já foi feito em sso-verify.
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      {
        issuer: "pj-insight-hub",
        audience: "tickets-pjm",
        clockTolerance: 5,
      },
    );

    const email = (payload as { email?: string }).email;
    const full_name =
      (payload as { full_name?: string | null }).full_name ?? null;
    const rawRole = (payload as { role?: string }).role ?? "user";
    if (!email) return json({ error: "invalid_claims" }, 401);

    // Defesa contra escalation
    const role = ALLOWED_ROLES.has(rawRole) ? rawRole : "user";

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // 1) Localiza ou cria usuário
    let userId: string | undefined;
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) return json({ error: "provision_failed" }, 500);
    userId = list.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    )?.id;

    if (!userId) {
      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { full_name, sso_source: "pj-insight-hub" },
        });
      if (createErr || !created.user) {
        return json({ error: "provision_failed" }, 500);
      }
      userId = created.user.id;
    }

    // 2) Upsert profile — schema deste projeto: profiles(user_id, display_name)
    await admin.from("profiles").upsert(
      { user_id: userId, display_name: full_name ?? email },
      { onConflict: "user_id" },
    );

    // 3) Upsert role
    await admin
      .from("user_roles")
      .upsert(
        { user_id: userId, role },
        { onConflict: "user_id,role" },
      );

    // 4) Gera sessão via magiclink + verifyOtp (sem enviar e-mail)
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !link.properties?.hashed_token) {
      return json({ error: "session_failed" }, 500);
    }

    const { data: verify, error: vErr } = await admin.auth.verifyOtp({
      type: "magiclink",
      token_hash: link.properties.hashed_token,
    });
    if (vErr || !verify.session) {
      return json({ error: "session_verify_failed" }, 500);
    }

    return json({
      access_token: verify.session.access_token,
      refresh_token: verify.session.refresh_token,
    });
  } catch (e) {
    console.error("[sso-session] falha:", e instanceof Error ? e.message : "unknown");
    return json({ error: "invalid_token" }, 401);
  }
});
