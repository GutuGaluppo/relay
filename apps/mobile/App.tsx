import { useEffect, useState } from "react";
import { ActionSheetIOS, Alert, Platform, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { CaptureService } from "./src/lib/capture";
import { LOCAL_USER_ID, supabase } from "./src/lib/supabase";
import { CaptureScreen } from "./src/screens/CaptureScreen";
import { SignInScreen } from "./src/screens/SignInScreen";
import { useTheme } from "./src/theme";

type Auth = { phase: "loading" } | { phase: "signed-out" } | { phase: "ready"; userId: string };

function useAuth(): Auth {
  const [auth, setAuth] = useState<Auth>(
    supabase ? { phase: "loading" } : { phase: "ready", userId: LOCAL_USER_ID },
  );
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuth(
        session?.user ? { phase: "ready", userId: session.user.id } : { phase: "signed-out" },
      );
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return auth;
}

function useCaptureService(userId: string | null): CaptureService | null {
  const [service, setService] = useState<CaptureService | null>(null);
  useEffect(() => {
    if (!userId) return;
    const s = new CaptureService(userId);
    let cancelled = false;
    void s.start().then(() => !cancelled && setService(s));
    return () => {
      cancelled = true;
      s.stop();
      setService(null);
    };
  }, [userId]);
  return service;
}

export default function App() {
  const theme = useTheme();
  const auth = useAuth();
  const service = useCaptureService(auth.phase === "ready" ? auth.userId : null);

  const openAccount = () => {
    if (!supabase || !service) return;
    const signOut = async () => {
      await service.signOut();
      await supabase?.auth.signOut();
    };
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Sair da conta", "Cancelar"], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
        (i) => i === 0 && void signOut(),
      );
    } else {
      Alert.alert("Conta", undefined, [
        { text: "Cancelar", style: "cancel" },
        { text: "Sair da conta", style: "destructive", onPress: () => void signOut() },
      ]);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.paper }}>
      <StatusBar style="auto" />
      {auth.phase === "signed-out" && <SignInScreen />}
      {auth.phase === "ready" && service && (
        <CaptureScreen service={service} onOpenAccount={openAccount} />
      )}
    </View>
  );
}
