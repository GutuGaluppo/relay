import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmailCode, verifyEmailCode } from "../app/auth";

type Props = {
  client: SupabaseClient | null;
  onLocalMode?: () => void;
};

export function SignIn({ client, onLocalMode }: Props) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (step === "email") {
        await sendEmailCode(client, email.trim());
        setStep("code");
      } else {
        await verifyEmailCode(client, email.trim(), code.trim());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo deu errado. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="signin">
      <h1 className="wordmark">Relay</h1>
      <p className="tagline">Capture agora. Aja depois.</p>

      {client ? (
        <form onSubmit={submit} className="signin-form">
          {step === "email" ? (
            <input
              type="email"
              autoFocus
              required
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          ) : (
            <>
              <p className="hint">Enviamos um código para {email}.</p>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                placeholder="Código"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </>
          )}
          <button type="submit" className="primary" disabled={busy}>
            {step === "email" ? "Receber código" : "Entrar"}
          </button>
          {step === "code" && (
            <button type="button" className="link" onClick={() => setStep("email")}>
              Usar outro e-mail
            </button>
          )}
          {error && <p className="error">{error}</p>}
        </form>
      ) : (
        <div className="signin-form">
          <p className="hint">
            Sincronização não configurada. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para
            usar com o celular.
          </p>
          {onLocalMode && (
            <button className="primary" onClick={onLocalMode}>
              Usar neste computador
            </button>
          )}
        </div>
      )}
    </main>
  );
}
