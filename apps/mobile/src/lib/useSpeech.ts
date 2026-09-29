import { useState } from "react";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";

/**
 * Speech-to-text. Prefers on-device recognition and never persists audio
 * (`recordingOptions.persist` stays off).
 */
export function useSpeech(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useSpeechRecognitionEvent("start", () => setListening(true));
  useSpeechRecognitionEvent("end", () => setListening(false));
  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results[0]?.transcript;
    if (text) onTranscript(text);
  });
  useSpeechRecognitionEvent("error", (event) => {
    setListening(false);
    if (event.error !== "no-speech" && event.error !== "aborted") {
      setError("Não foi possível transcrever. Tente de novo ou escreva.");
    }
  });

  const start = async () => {
    setError(null);
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setError("Permita o microfone nos Ajustes para falar.");
      return;
    }
    ExpoSpeechRecognitionModule.start({
      lang: "pt-BR",
      interimResults: true,
      continuous: false,
      maxAlternatives: 1,
      requiresOnDeviceRecognition: ExpoSpeechRecognitionModule.supportsOnDeviceRecognition(),
      addsPunctuation: true,
    });
  };

  const stop = () => ExpoSpeechRecognitionModule.stop();

  return { listening, error, start, stop };
}
