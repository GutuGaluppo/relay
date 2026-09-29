import { partitionReminders } from "@relay/domain";
import type { Reminder } from "@relay/types";
import type { ControllerState, ReminderController } from "../app/controller";
import { formatWhen } from "./format";

type Props = {
  controller: ReminderController;
  state: ControllerState;
  tab: "open" | "history";
};

function describeOpen(r: Reminder): string {
  if (r.status === "active") return "Em andamento";
  if (r.status === "inbox") return "Novo";
  return r.nextReminderAt ? `Volta ${formatWhen(r.nextReminderAt)}` : "Aguardando";
}

function describeHistory(r: Reminder): string {
  return r.status === "done"
    ? `Concluído ${formatWhen(r.completedAt ?? r.updatedAt)}`
    : `Arquivado ${formatWhen(r.updatedAt)}`;
}

export function Home({ controller, state, tab }: Props) {
  const { open, history } = partitionReminders(state.sync.reminders);
  const items = tab === "open" ? open : history.slice(0, 50);

  return (
    <main className="home">
      <header className="home-header">
        <nav className="tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "open"}
            onClick={() => controller.show({ kind: "home", tab: "open" })}
          >
            Pendentes
          </button>
          <button
            role="tab"
            aria-selected={tab === "history"}
            onClick={() => controller.show({ kind: "home", tab: "history" })}
          >
            Histórico
          </button>
        </nav>
        <button className="link" onClick={() => controller.show({ kind: "settings" })}>
          Ajustes
        </button>
      </header>

      {items.length === 0 ? (
        <p className="empty">
          {tab === "open" ? "Nada esperando por você." : "Nada concluído ou arquivado ainda."}
        </p>
      ) : (
        <ul className="list">
          {items.map((r) => (
            <li key={r.id}>
              <div className="list-text">
                <span>{r.text}</span>
                <small>{tab === "open" ? describeOpen(r) : describeHistory(r)}</small>
              </div>
              <div className="list-actions">
                {tab === "open" ? (
                  <>
                    <button className="link" onClick={() => void controller.open(r.id)}>
                      Abrir
                    </button>
                    {r.status !== "active" && (
                      <button className="link" onClick={() => void controller.archive(r.id)}>
                        Arquivar
                      </button>
                    )}
                  </>
                ) : (
                  <button className="link" onClick={() => void controller.restore(r.id)}>
                    Restaurar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <SyncStatus state={state} />
    </main>
  );
}

function SyncStatus({ state }: { state: ControllerState }) {
  const { pendingUploads, lastError, realtime } = state.sync;
  let text = "Sincronizado";
  if (pendingUploads > 0) text = "Aguardando conexão para sincronizar";
  else if (lastError) text = "Sem conexão — as alterações ficam salvas neste computador";
  else if (realtime !== "connected") text = "Conectando…";
  return <footer className="status">{text}</footer>;
}
