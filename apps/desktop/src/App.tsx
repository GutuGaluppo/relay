import { useEffect, useSyncExternalStore } from "react";
import { session, supabase } from "./app/session";
import type { Runtime } from "./app/runtime";
import { FocusMode } from "./ui/FocusMode";
import { Home } from "./ui/Home";
import { ReminderPrompt } from "./ui/ReminderPrompt";
import { Settings } from "./ui/Settings";
import { SignIn } from "./ui/SignIn";
import { useControllerState } from "./ui/useController";

export function App() {
  return (
    <>
      <div className="drag" data-tauri-drag-region />
      <Root />
    </>
  );
}

function Root() {
  const state = useSyncExternalStore(session.subscribe, session.get);
  useEffect(() => {
    void session.boot();
  }, []);

  switch (state.phase) {
    case "loading":
      return <main className="blank" />;
    case "error":
      return (
        <main className="signin">
          <p className="error">{state.message}</p>
        </main>
      );
    case "signin":
      return (
        <SignIn
          client={supabase}
          onLocalMode={supabase ? undefined : () => void session.useLocalMode()}
        />
      );
    case "ready":
      return <Ready runtime={state.runtime} />;
  }
}

function Ready({ runtime }: { runtime: Runtime }) {
  const { controller } = runtime;
  const state = useControllerState(controller);
  const { view } = state;

  if (view.kind === "prompt" || view.kind === "focus") {
    const reminder = state.sync.reminders.find((r) => r.id === view.reminderId);
    if (reminder && view.kind === "prompt") {
      return (
        <ReminderPrompt
          key={`${reminder.id}:${view.prompt}`}
          controller={controller}
          reminder={reminder}
          view={view}
        />
      );
    }
    if (reminder && view.kind === "focus") {
      return (
        <FocusMode
          key={reminder.id}
          controller={controller}
          reminder={reminder}
          showTimer={state.settings.showTimer}
        />
      );
    }
  }
  if (view.kind === "settings") {
    return (
      <Settings
        runtime={runtime}
        settings={state.settings}
        onBack={() => controller.show({ kind: "home", tab: "open" })}
      />
    );
  }
  return (
    <Home controller={controller} state={state} tab={view.kind === "home" ? view.tab : "open"} />
  );
}
