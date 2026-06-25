import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function SsoConsume() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Validando acesso...");

  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const token = params.get("token");
        const next = params.get("next") ?? "/tickets";
        if (!token) throw new Error("missing_token");

        // Remove o token da URL imediatamente — não fica em histórico/Referer.
        window.history.replaceState({}, "", window.location.pathname);

        // 1) Verifica assinatura + replay-guard.
        const verifyRes = await supabase.functions.invoke("sso-verify", {
          body: { token },
        });
        if (verifyRes.error || (verifyRes.data && verifyRes.data.error)) {
          throw new Error(verifyRes.data?.error ?? "invalid_token");
        }

        // 2) Provisiona/atualiza usuário e devolve tokens de sessão.
        const sessionRes = await supabase.functions.invoke("sso-session", {
          body: { token },
        });
        if (sessionRes.error || (sessionRes.data && sessionRes.data.error)) {
          throw new Error(sessionRes.data?.error ?? "session_failed");
        }
        const { access_token, refresh_token } = sessionRes.data as {
          access_token: string;
          refresh_token: string;
        };

        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (error) throw new Error("set_session_failed");

        setStatus("Acesso liberado.");
        navigate(next, { replace: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown_error";
        // NUNCA logar o token. Só a causa.
        console.error("[SSO] falha:", msg);
        setStatus(`Acesso negado: ${msg}`);
      }
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="font-mono text-sm text-primary noc-glow">{status}</div>
    </div>
  );
}
