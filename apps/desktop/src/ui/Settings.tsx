import { useState } from "react";
import type { Settings as SettingsModel } from "../app/settings";
import type { Runtime } from "../app/runtime";

type Props = {
  runtime: Runtime;
  settings: SettingsModel;
  onBack(): void;
};

const INITIAL_OPTIONS = [60, 120, 180, 240];
const NOT_YET_OPTIONS = [30, 60, 90, 120];
const label = (m: number) => (m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} h` : `${m} min`);

export function Settings({ runtime, settings, onBack }: Props) {
  const [error, setError] = useState<string | null>(null);
  const update = async (patch: Partial<SettingsModel>) => {
    setError(null);
    try {
      await runtime.saveSettings({ ...settings, ...patch });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };
  const account = runtime.account;

  return (
    <main className="settings">
      <header className="home-header">
        <h2>Ajustes</h2>
        <button className="link" onClick={onBack}>
          Voltar
        </button>
      </header>

      <label className="row">
        <span>Abrir ao iniciar sessão</span>
        <input
          type="checkbox"
          checked={settings.launchAtLogin}
          onChange={(e) => void update({ launchAtLogin: e.target.checked })}
        />
      </label>
      <label className="row">
        <span>Notificações</span>
        <input
          type="checkbox"
          checked={settings.notificationsEnabled}
          onChange={(e) => void update({ notificationsEnabled: e.target.checked })}
        />
      </label>
      <label className="row">
        <span>“Agora não” lembra novamente em</span>
        <select
          value={settings.initialDelayMinutes}
          onChange={(e) => void update({ initialDelayMinutes: Number(e.target.value) })}
        >
          {INITIAL_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {label(m)}
            </option>
          ))}
        </select>
      </label>
      <label className="row">
        <span>“Ainda não” lembra novamente em</span>
        <select
          value={settings.notYetMinutes}
          onChange={(e) => void update({ notYetMinutes: Number(e.target.value) })}
        >
          {NOT_YET_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {label(m)}
            </option>
          ))}
        </select>
      </label>
      <label className="row">
        <span>Mostrar tempo decorrido</span>
        <input
          type="checkbox"
          checked={settings.showTimer}
          onChange={(e) => void update({ showTimer: e.target.checked })}
        />
      </label>

      {error && <p className="error">{error}</p>}

      <div className="row account">
        <span>
          {account.mode === "cloud"
            ? (account.email ?? "Conectado")
            : "Modo local (sem sincronização)"}
        </span>
        <button
          className="link"
          onClick={() => void runtime.signOut().then(() => location.reload())}
        >
          Sair da conta
        </button>
      </div>
    </main>
  );
}
