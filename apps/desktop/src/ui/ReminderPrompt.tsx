import { useState } from "react";
import type { Reminder } from "@relay/types";
import type { ReminderController, View } from "../app/controller";
import { SnoozePicker } from "./SnoozePicker";
import { useEscape } from "./useEscape";

type Props = {
  controller: ReminderController;
  reminder: Reminder;
  view: Extract<View, { kind: "prompt" }>;
};

export function ReminderPrompt({ controller, reminder, view }: Props) {
  const [snoozing, setSnoozing] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const gentle =
    view.prompt === "initial"
      ? run(() => controller.dismiss(reminder.id))
      : run(() => controller.notYet(reminder.id));
  useEscape(() => void gentle(), !snoozing);

  return (
    <main className={`prompt prompt--${view.presentation}`}>
      <p className="eyebrow">
        {view.prompt === "initial" ? "Você pediu para lembrar" : "De volta"}
      </p>
      <h1 className="reminder-text">{reminder.text}</h1>

      {snoozing ? (
        <SnoozePicker
          title="Lembrar novamente em"
          onCancel={() => setSnoozing(false)}
          onPick={(option) => void run(() => controller.snooze(reminder.id, option))()}
        />
      ) : view.prompt === "initial" ? (
        <div className="actions actions--split">
          <button onClick={gentle} disabled={busy}>
            Agora não
          </button>
          <button
            className="primary"
            autoFocus
            disabled={busy}
            onClick={run(() => controller.begin(reminder.id))}
          >
            Farei agora
          </button>
        </div>
      ) : (
        <div className="actions actions--three">
          <button onClick={() => setSnoozing(true)} disabled={busy}>
            Prorrogar
          </button>
          <button
            className="primary"
            autoFocus
            disabled={busy}
            onClick={run(() => controller.begin(reminder.id))}
          >
            Iniciar tarefa
          </button>
          <button onClick={gentle} disabled={busy}>
            Ainda não
          </button>
        </div>
      )}
    </main>
  );
}
