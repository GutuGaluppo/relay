import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { SyncState } from "@relay/sync";
import type { ReminderSource } from "@relay/types";
import type { CaptureService } from "../lib/capture";
import { useSpeech } from "../lib/useSpeech";
import { useTheme } from "../theme";

type Props = { service: CaptureService; onOpenAccount(): void };

export function CaptureScreen({ service, onOpenAccount }: Props) {
  const theme = useTheme();
  const [text, setText] = useState("");
  const [source, setSource] = useState<ReminderSource>("text");
  const [sending, setSending] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [fade] = useState(() => new Animated.Value(0));
  const inputRef = useRef<TextInput>(null);

  useEffect(() => service.subscribe((s: SyncState) => setPending(s.pendingUploads)), [service]);

  const speech = useSpeech((transcript) => {
    setText(transcript);
    setSource("voice");
  });

  const flash = (message: string) => {
    setConfirmation(message);
    fade.setValue(1);
    Animated.timing(fade, {
      toValue: 0,
      duration: 600,
      delay: 1400,
      useNativeDriver: true,
    }).start();
  };

  const canSend = text.trim().length > 0 && !sending;

  const send = async () => {
    if (!canSend) return;
    if (speech.listening) speech.stop();
    setSending(true);
    try {
      const { uploaded } = await service.capture(text, source);
      setText("");
      setSource("text");
      flash(uploaded ? "Guardado." : "Guardado. Envia quando houver conexão.");
      inputRef.current?.focus();
    } catch {
      flash("Não foi possível guardar. Tente de novo.");
    } finally {
      setSending(false);
    }
  };

  const s = styles(theme);
  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={s.header}>
        <Pressable onPress={onOpenAccount} hitSlop={12} accessibilityRole="button">
          <Text style={s.wordmark}>Relay</Text>
        </Pressable>
        {pending > 0 && <Text style={s.muted}>{pending} aguardando envio</Text>}
      </View>

      <View style={s.body}>
        <Text style={s.title}>O que você quer lembrar?</Text>
        <TextInput
          ref={inputRef}
          style={s.input}
          value={text}
          onChangeText={(value) => {
            setText(value);
            if (value.length === 0) setSource("text");
          }}
          placeholder="Escreva algo…"
          placeholderTextColor={theme.muted}
          multiline
          autoFocus
          maxLength={2000}
          accessibilityLabel="Texto do lembrete"
        />
        {speech.error && <Text style={s.error}>{speech.error}</Text>}
      </View>

      <View style={s.footer}>
        <Pressable
          style={({ pressed }) => [s.secondary, (pressed || speech.listening) && s.secondaryActive]}
          onPress={() => (speech.listening ? speech.stop() : void speech.start())}
          accessibilityRole="button"
          accessibilityLabel={speech.listening ? "Parar de ouvir" : "Falar"}
        >
          <Text style={s.secondaryText}>
            {speech.listening ? "Ouvindo… toque para parar" : "Falar"}
          </Text>
        </Pressable>

        <Animated.Text style={[s.muted, { opacity: fade }]}>{confirmation ?? " "}</Animated.Text>

        <Pressable
          style={({ pressed }) => [s.primary, !canSend && s.disabled, pressed && s.pressed]}
          onPress={send}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Enviar"
        >
          {sending ? (
            <ActivityIndicator color={theme.paper} />
          ) : (
            <Text style={s.primaryText}>Enviar</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = (t: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.paper, paddingHorizontal: 24 },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingTop: 64,
    },
    wordmark: { color: t.ink, fontSize: 17, fontWeight: "700", letterSpacing: -0.3 },
    body: { flex: 1, paddingTop: 40 },
    title: { color: t.ink, fontSize: 28, fontWeight: "600", letterSpacing: -0.5, marginBottom: 20 },
    input: {
      color: t.ink,
      fontSize: 20,
      lineHeight: 28,
      minHeight: 120,
      textAlignVertical: "top",
      paddingVertical: 8,
    },
    footer: { paddingBottom: 32, gap: 14 },
    secondary: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.muted,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
    },
    secondaryActive: { backgroundColor: t.line },
    secondaryText: { color: t.ink, fontSize: 16 },
    primary: {
      backgroundColor: t.ink,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: "center",
    },
    primaryText: { color: t.paper, fontSize: 17, fontWeight: "600" },
    disabled: { opacity: 0.35 },
    pressed: { opacity: 0.85 },
    muted: { color: t.muted, fontSize: 14, textAlign: "center" },
    error: { color: t.danger, fontSize: 14, marginTop: 8 },
  });
