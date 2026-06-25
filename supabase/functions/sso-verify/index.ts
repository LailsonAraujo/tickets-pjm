// Edge Function: sso-verify
// Valida assinatura HS256 + claims + replay-guard (jti single-use).
import { jwtVerify } from "https://deno.land/x/jose@v5.9.6/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      {
        issuer: "pj-insight-hub",
        audience: "tickets-pjm",
        clockTolerance: 5,
      },
    );

    const jti = payload.jti as string | undefined;
    const sub = payload.sub as string | undefined;
    const email = (payload as { email?: string }).email;
    const iat = payload.iat as number | undefined;
    const exp = payload.exp as number | undefined;
    if (!jti || !sub || !email || !iat || !exp) {
      return json({ error: "invalid_claims" }, 401);
    }
    if (exp - iat > 120) return json({ error: "ttl_too_long" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Best-effort cleanup
    await admin
      .from("sso_jti_used")
      .delete()
      .lt("expires_at", new Date().toISOString());

    // Replay-guard: PRIMARY KEY(jti) → segunda tentativa = 23505
    const { error: insErr } = await admin.from("sso_jti_used").insert({
      jti,
      user_id: sub,
      email,
      issued_at: new Date(iat * 1000).toISOString(),
      expires_at: new Date(exp * 1000).toISOString(),
      consumed_at: new Date().toISOString(),
    });
    if (insErr) {
      if ((insErr as { code?: string }).code === "23505") {
        return json({ error: "token_already_used" }, 401);
      }
      return json({ error: "replay_check_failed" }, 500);
    }

    return json({ ok: true });
  } catch (e) {
    console.error("[sso-verify] falha:", e instanceof Error ? e.message : "unknown");
    return json({ error: "invalid_token" }, 401);
  }
});
