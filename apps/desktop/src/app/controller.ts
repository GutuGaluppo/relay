/**
 * Application layer for Relay Desktop: decides which single reminder (if any)
 * to present, how prominently, and applies user decisions through the domain.
 * React only renders `ControllerState` and calls the action methods.
 */
import {
  archiveReminder,
  completeReminder,
  dismissInitial,
  findActive,
  nextScheduledAt,
  notYet,
  promptKind,
  restoreReminder,
  returnToPending,
  selectNextDue,
  snoozeReminder,
  startReminder,
  type ReminderPrompt,
  type SnoozeOption,
} from "@relay/domain";
import type { SyncEngine, SyncState } from "@relay/sync";
import type { Reminder } from "@relay/types";
import { rulesFromSettings, type Settings } from "./settings";

export type Presentation = "overlay" | "compact" | "window";

export type View =
  | { kind: "home"; tab: "open" | "history" }
  | { kind: "settings" }
  | { kind: "prompt"; reminderId: string; prompt: ReminderPrompt; presentation: Presentation }
  | { kind: "focus"; reminderId: string };

export type ControllerState = {
  view: View;
  sync: SyncState;
  settings: Settings;
};

export interface SystemPort {
  setWindowMode(mode: "overlay" | "compact" | "normal", focus: boolean): Promise<void>;
  hideWindow(): Promise<void>;
  notify(title: string, body: string): Promise<void>;
  setTrayPending(pending: boolean): Promise<void>;
}

export type Trigger =
  "start" | "unlock" | "resume" | "tray" | "tick" | "sync" | "timer" | "after-action";

/** Moments when the user has deliberately arrived at the computer. */
const INTENTIONAL: ReadonlySet<Trigger> = new Set(["start", "unlock", "resume", "tray"]);
/** An intentional moment stays open briefly so late-arriving syncs are included. */
const INTENT_WINDOW_MS = 2 * 60_000;
const TICK_MS = 20_000;
/** A tick arriving much later than scheduled means the machine slept. */
const SLEEP_GAP_MS = 60_000;
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

type Listener = (state: ControllerState) => void;

export class ReminderController {
  private view: View = { kind: "home", tab: "open" };
  /** Whether the window is currently shown to the user. */
  private windowVisible = false;
  /** View to go back to after a reminder interrupts something the user opened. */
  private returnView: View | null = null;
  private intentUntil = 0;
  private syncState: SyncState;
  /** Stable snapshot for React's useSyncExternalStore; replaced on every emit. */
  private snapshot: ControllerState;
  private readonly listeners = new Set<Listener>();
  private readonly announced = new Set<string>();
  private initialized = false;
  /** Set while a user action is being applied, so sync echoes don't re-evaluate mid-way. */
  private acting = false;
  private tickId: ReturnType<typeof setInterval> | null = null;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private lastTick = 0;
  private unsubscribeEngine: (() => void) | null = null;

  constructor(
    private readonly engine: SyncEngine,
    private readonly system: SystemPort,
    private settings: Settings,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.syncState = engine.getState();
    this.snapshot = this.buildState();
  }

  // ---------------------------------------------------------------- lifecycle

  async start(): Promise<void> {
    this.unsubscribeEngine = this.engine.subscribe((state) => this.onSyncState(state));
    await this.engine.start();
    this.initialized = true;
    for (const r of this.reminders()) this.announced.add(r.id);
    this.lastTick = this.now().getTime();
    this.tickId = setInterval(() => this.onTick(), TICK_MS);
    await this.evaluate("start");
  }

  stop(): void {
    this.unsubscribeEngine?.();
    if (this.tickId) clearInterval(this.tickId);
    if (this.timerId) clearTimeout(this.timerId);
    this.tickId = null;
    this.timerId = null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  getState(): ControllerState {
    return this.snapshot;
  }

  private buildState(): ControllerState {
    return { view: this.view, sync: this.syncState, settings: this.settings };
  }

  updateSettings(settings: Settings): void {
    this.settings = settings;
    this.emit();
  }

  // ------------------------------------------------------------------ triggers

  /** OS / tray entry points. */
  onUnlock = () => void this.evaluate("unlock");
  onResume = () => {
    void this.engine.sync("resume");
    void this.evaluate("resume");
  };

  /** Tray menu navigation. */
  async navigate(route: "home" | "pending" | "settings"): Promise<void> {
    if (route === "pending") {
      const presented = await this.evaluate("tray");
      if (!presented) await this.openWindow({ kind: "home", tab: "open" });
      return;
    }
    if (this.isInterrupting()) return; // finish the current decision first
    const active = findActive(this.reminders());
    if (route === "home" && active) {
      await this.openWindow({ kind: "focus", reminderId: active.id });
      return;
    }
    await this.openWindow(
      route === "settings" ? { kind: "settings" } : { kind: "home", tab: "open" },
    );
  }

  show(view: View): void {
    this.view = view;
    this.emit();
  }

  /**
   * The OS window was closed by the user. Closing a reminder without choosing
   * counts as the gentle default ("Agora não" / "Ainda não"); Focus Mode stays active.
   */
  async onWindowHidden(): Promise<void> {
    this.windowVisible = false;
    const v = this.view;
    this.returnView = null;
    this.view = { kind: "home", tab: "open" };
    this.emit();
    if (v.kind === "prompt") {
      const r = this.engine.get(v.reminderId);
      if (r && (r.status === "inbox" || r.status === "pending")) {
        const next =
          v.prompt === "initial"
            ? dismissInitial(r, this.now(), this.rules())
            : notYet(r, this.now(), this.rules());
        await this.engine.save(next);
      }
    }
  }

  /** Hide the window and return to the background. */
  async closeWindow(): Promise<void> {
    this.windowVisible = false;
    this.returnView = null;
    await this.system.hideWindow();
    this.view = { kind: "home", tab: "open" };
    this.emit();
  }

  /**
   * Decide whether a reminder should be presented now. Returns true when a
   * prompt or Focus Mode is (or already was) on screen.
   */
  async evaluate(trigger: Trigger): Promise<boolean> {
    if (!this.initialized) return false;
    const now = this.now();
    if (INTENTIONAL.has(trigger)) this.intentUntil = now.getTime() + INTENT_WINDOW_MS;
    const intentional = now.getTime() < this.intentUntil;

    this.scheduleTimer();
    void this.system.setTrayPending(this.hasWaiting(now));

    // Never stack: an open decision or focus session stays until the user acts.
    if (trigger !== "after-action" && this.isInterrupting() && this.currentStillValid()) {
      return true;
    }

    const reminders = this.reminders();
    const active = findActive(reminders);
    if (active) {
      // Don't interrupt work in progress; bring it back at deliberate moments.
      if (intentional) {
        await this.present({ kind: "focus", reminderId: active.id }, "normal", true);
        return true;
      }
      if (this.view.kind === "focus" || this.view.kind === "prompt") await this.leaveInterruption();
      return false;
    }

    const due = selectNextDue(reminders, { now, intentionalMoment: intentional });
    if (!due) {
      if (this.isInterrupting()) await this.leaveInterruption();
      return false;
    }

    const presentation: Presentation =
      trigger === "after-action" && this.view.kind === "prompt"
        ? this.view.presentation
        : intentional
          ? "overlay"
          : "compact";
    if (presentation === "compact" && this.settings.notificationsEnabled) {
      void this.system.notify("Relay", due.text);
    }
    if (intentional) this.intentUntil = now.getTime() + INTENT_WINDOW_MS;
    await this.present(
      { kind: "prompt", reminderId: due.id, prompt: promptKind(due), presentation },
      presentation === "overlay" ? "overlay" : presentation === "compact" ? "compact" : "normal",
      presentation !== "compact",
    );
    return true;
  }

  // ------------------------------------------------------------------- actions

  /** Initial reminder: "Agora não". */
  dismiss = (id: string) => this.apply(id, (r, now) => dismissInitial(r, now, this.rules()));
  /** Follow-up reminder: "Ainda não". */
  notYet = (id: string) => this.apply(id, (r, now) => notYet(r, now, this.rules()));
  /** Follow-up reminder: "Prorrogar". */
  snooze = (id: string, option: SnoozeOption) =>
    this.apply(id, (r, now) => snoozeReminder(r, option, now, this.rules()));
  /** Focus Mode: "Adiar". */
  postpone = (id: string, option: SnoozeOption) =>
    this.apply(id, (r, now) => returnToPending(r, option, now, this.rules()));
  complete = (id: string) => this.apply(id, completeReminder);
  archive = (id: string) => this.apply(id, archiveReminder, { stay: true });
  restore = (id: string) => this.apply(id, restoreReminder, { stay: true });

  /** "Farei agora" / "Iniciar tarefa". */
  async begin(id: string): Promise<void> {
    await this.apply(id, startReminder, { stay: true });
    this.returnView = null;
    await this.present({ kind: "focus", reminderId: id }, "normal", true);
  }

  /** Open a reminder from the list as a regular (windowed) decision. */
  async open(id: string): Promise<void> {
    const r = this.engine.get(id);
    if (!r) return;
    if (r.status === "active") {
      this.view = { kind: "focus", reminderId: id };
    } else if (r.status === "inbox" || r.status === "pending") {
      this.returnView = this.view;
      this.view = { kind: "prompt", reminderId: id, prompt: promptKind(r), presentation: "window" };
    }
    this.emit();
  }

  // ------------------------------------------------------------------ internals

  private async apply(
    id: string,
    action: (r: Reminder, now: Date) => Reminder,
    opts: { stay?: boolean } = {},
  ): Promise<void> {
    const current = this.engine.get(id);
    if (!current) return;
    const updated = action(current, this.now());
    this.acting = true;
    try {
      await this.engine.save(updated);
    } finally {
      this.acting = false;
    }
    if (!opts.stay) await this.afterDecision();
  }

  /** After a decision, show the next due reminder or step out of the way. */
  private async afterDecision(): Promise<void> {
    await this.evaluate("after-action");
  }

  /** Close the reminder surface and return the user to what they were doing. */
  private async leaveInterruption(): Promise<void> {
    if (this.returnView) {
      const back = this.returnView;
      this.returnView = null;
      this.view = back;
      await this.system.setWindowMode("normal", true);
      this.emit();
      return;
    }
    await this.closeWindow();
  }

  private async present(view: View, mode: "overlay" | "compact" | "normal", focus: boolean) {
    if (!this.isInterrupting() && this.windowVisible && !this.returnView) {
      this.returnView = this.view;
    }
    this.view = view;
    this.windowVisible = true;
    this.emit();
    await this.system.setWindowMode(mode, focus);
  }

  private async openWindow(view: View): Promise<void> {
    this.view = view;
    this.windowVisible = true;
    this.emit();
    await this.system.setWindowMode("normal", true);
  }

  private isInterrupting(): boolean {
    return this.view.kind === "prompt" || this.view.kind === "focus";
  }

  /** The reminder on screen may have been changed by another device. */
  private currentStillValid(): boolean {
    const v = this.view;
    if (v.kind !== "prompt" && v.kind !== "focus") return false;
    const r = this.engine.get(v.reminderId);
    if (!r) return false;
    if (v.kind === "focus") return r.status === "active";
    return (r.status === "inbox" || r.status === "pending") && promptKind(r) === v.prompt;
  }

  private onSyncState(state: SyncState): void {
    this.syncState = state;
    this.emit();
    if (!this.initialized || this.acting) return;
    this.announceArrivals();
    void this.evaluate("sync");
  }

  /** A quiet notification when something new arrives from the phone mid-session. */
  private announceArrivals(): void {
    const now = this.now().getTime();
    for (const r of this.syncState.reminders) {
      if (this.announced.has(r.id)) continue;
      this.announced.add(r.id);
      if (r.status === "inbox" && now >= this.intentUntil && this.settings.notificationsEnabled) {
        void this.system.notify("Relay", r.text);
      }
    }
  }

  private onTick(): void {
    const now = this.now().getTime();
    const gap = now - this.lastTick;
    this.lastTick = now;
    if (gap > TICK_MS + SLEEP_GAP_MS) this.onResume();
    else void this.evaluate("tick");
  }

  /** Timers are only an optimisation; persisted `nextReminderAt` is the truth. */
  private scheduleTimer(): void {
    if (this.timerId) clearTimeout(this.timerId);
    this.timerId = null;
    const next = nextScheduledAt(this.reminders(), this.now());
    if (!next) return;
    const delay = Math.min(MAX_TIMEOUT_MS, Math.max(0, Date.parse(next) - this.now().getTime()));
    this.timerId = setTimeout(() => void this.evaluate("timer"), delay + 250);
  }

  private hasWaiting(now: Date): boolean {
    return selectNextDue(this.reminders(), { now, intentionalMoment: true }) !== undefined;
  }

  private reminders(): Reminder[] {
    return this.syncState.reminders;
  }

  private rules() {
    return rulesFromSettings(this.settings);
  }

  private emit(): void {
    const state = (this.snapshot = this.buildState());
    for (const l of this.listeners) l(state);
  }
}
