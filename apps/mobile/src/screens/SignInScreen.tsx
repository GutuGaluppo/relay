import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { sendEmailCode, verifyEmailCode } from "../lib/supabase";
import { useTheme } from "../theme";

export function SignInScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (step === "email") {
        await sendEmailCode(email.trim());
        setStep("code");
      } else {
        await verifyEmailCode(email.trim(), code.trim());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  const s = styles(theme);
  return (
    <View style={s.root}>
      <Text style={s.wordmark}>Relay</Text>
      <Text style={s.tagline}>Capture agora. Aja depois.</Text>
      {step === "email" ? (
        <TextInput
          style={s.input}
          value={email}
          onChangeText={setEmail}
          placeholder="seu@email.com"
          placeholderTextColor={theme.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          autoFocus
          onSubmitEditing={submit}
        />
      ) : (
        <>
          <Text style={s.hint}>Enviamos um código para {email}.</Text>
          <TextInput
            style={s.input}
            value={code}
            onChangeText={setCode}
            placeholder="Código"
            placeholderTextColor={theme.muted}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            autoFocus
            onSubmitEditing={submit}
          />
        </>
      )}
      <Pressable style={[s.primary, busy && { opacity: 0.5 }]} onPress={submit} disabled={busy}>
        <Text style={s.primaryText}>{step === "email" ? "Receber código" : "Entrar"}</Text>
      </Pressable>
      {step === "code" && (
        <Pressable onPress={() => setStep("email")} hitSlop={8}>
          <Text style={s.hint}>Usar outro e-mail</Text>
        </Pressable>
      )}
      {error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

const styles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.paper, justifyContent: "center", padding: 32, gap: 14 },
    wordmark: {
      color: t.ink,
      fontSize: 40,
      fontWeight: "700",
      letterSpacing: -1,
      textAlign: "center",
    },
    tagline: { color: t.muted, textAlign: "center", marginBottom: 24 },
    input: {
      color: t.ink,
      fontSize: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.muted,
      borderRadius: 12,
      padding: 14,
      textAlign: "center",
    },
    primary: {
      backgroundColor: t.ink,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: "center",
    },
    primaryText: { color: t.paper, fontSize: 17, fontWeight: "600" },
    hint: { color: t.muted, textAlign: "center", fontSize: 14 },
    error: { color: t.danger, textAlign: "center", fontSize: 14 },
  });
