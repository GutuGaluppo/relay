import { useEffect, useState } from "react";
import { elapsedMs, formatElapsed } from "@relay/domain";
import type { Reminder } from "@relay/types";
import type { ReminderController } from "../app/controller";
import { SnoozePicker } from "./SnoozePicker";

type Props = {
  controller: ReminderController;
  reminder: Reminder;
  showTimer: boolean;
};

function useNow(intervalMs: number, enabled: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}

export function FocusMode({ controller, reminder, showTimer }: Props) {
  const now = useNow(1000, showTimer);
  const [postponing, setPostponing] = useState(false);

  return (
    <main className="focus">
      <p className="eyebrow">Em andamento</p>
      <h1 className="reminder-text">{reminder.text}</h1>
      {showTimer && (
        <p className="timer" aria-label="Tempo decorrido" role="timer">
          {formatElapsed(elapsedMs(reminder, now))}
        </p>
      )}
      {postponing ? (
        <SnoozePicker
          title="Retomar em"
          onCancel={() => setPostponing(false)}
          onPick={(option) => void controller.postpone(reminder.id, option)}
        />
      ) : (
        <div className="actions actions--split">
          <button onClick={() => setPostponing(true)}>Adiar</button>
          <button
            className="primary"
            autoFocus
            onClick={() => void controller.complete(reminder.id)}
          >
            Concluir
          </button>
        </div>
      )}
    </main>
  );
}
