import { useState } from "react";
import { SNOOZE_PRESETS, type SnoozeOption } from "@relay/domain";
import { snoozeLabel } from "./format";
import { useEscape } from "./useEscape";

type Props = {
  title: string;
  onPick(option: SnoozeOption): void;
  onCancel(): void;
};

/** Local "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SnoozePicker({ title, onPick, onCancel }: Props) {
  const [custom, setCustom] = useState<string | null>(null);
  const [customError, setCustomError] = useState(false);
  useEscape(onCancel);

  return (
    <div className="snooze">
      <p className="eyebrow">{title}</p>
      {custom === null ? (
        <div className="snooze-options">
          {SNOOZE_PRESETS.map((option, i) => (
            <button key={i} autoFocus={i === 0} onClick={() => onPick(option)}>
              {snoozeLabel(option)}
            </button>
          ))}
          <button onClick={() => setCustom(toLocalInput(new Date(Date.now() + 3 * 3_600_000)))}>
            Escolher horário
          </button>
        </div>
      ) : (
        <form
          className="snooze-custom"
          onSubmit={(e) => {
            e.preventDefault();
            const at = custom ? new Date(custom) : null;
            if (!at || Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) {
              setCustomError(true);
              return;
            }
            onPick({ kind: "until", at: at.toISOString() });
          }}
        >
          <input
            type="datetime-local"
            autoFocus
            value={custom}
            min={toLocalInput(new Date())}
            onChange={(e) => {
              setCustom(e.target.value);
              setCustomError(false);
            }}
          />
          <button type="submit" className="primary" disabled={!custom}>
            Confirmar
          </button>
        </form>
      )}
      {customError && <p className="error">Escolha um horário no futuro.</p>}
      <button className="link" onClick={onCancel}>
        Voltar
      </button>
    </div>
  );
}
