import { afterEach, describe, expect, it, vi } from "vitest";
import { createReminder, startReminder } from "@relay/domain";
import { MemoryStorage, StorageReminderRemote, SyncEngine, type SyncLogger } from "@relay/sync";
import type { Reminder } from "@relay/types";
import { ReminderController, type SystemPort } from "../src/app/controller";
import { DEFAULT_SETTINGS } from "../src/app/settings";

const USER = "00000000-0000-4000-8000-000000000001";
const T0 = new Date("2026-03-10T12:00:00.000Z").getTime();
const quiet: SyncLogger = { info() {}, warn() {}, error() {} };

let n = 0;
const capture = (text: string, minutesAgo = 0) =>
  createReminder({
    id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    userId: USER,
    text,
    source: "text",
    now: new Date(T0 - minutesAgo * 60_000),
  });

class FakeSystem implements SystemPort {
  modes: string[] = [];
  notifications: string[] = [];
  hidden = 0;
  async setWindowMode(mode: string) {
    this.modes.push(mode);
  }
  async hideWindow() {
    this.hidden += 1;
  }
  async notify(_t: string, body: string) {
    this.notifications.push(body);
  }
  async setTrayPending() {}
}

type Harness = { controller: ReminderController; system: FakeSystem; engine: SyncEngine };
const running: Harness[] = [];

async function boot(
  seed: Reminder[] = [],
  shared = { local: new MemoryStorage(), server: new MemoryStorage() },
): Promise<Harness & { shared: typeof shared }> {
  const remote = new StorageReminderRemote(shared.server);
  if (seed.length) await remote.upsert(seed);
  const engine = new SyncEngine({
    userId: USER,
    remote,
    storage: shared.local,
    logger: quiet,
    reconcileIntervalMs: 0,
  });
  const system = new FakeSystem();
  const controller = new ReminderController(engine, system, DEFAULT_SETTINGS, () => new Date());
  await controller.start();
  await vi.advanceTimersByTimeAsync(10); // let the initial sync land
  const h = { controller, system, engine, shared };
  running.push(h);
  return h;
}

const view = (h: Harness) => h.controller.getState().view;
const minutes = (m: number) => vi.advanceTimersByTimeAsync(m * 60_000);

afterEach(() => {
  running.splice(0).forEach((h) => {
    h.controller.stop();
    h.engine.stop();
  });
  vi.useRealTimers();
});

function useClock() {
  vi.useFakeTimers({ now: T0 });
}

describe("ReminderController", () => {
  it("Flow A: capture → overlay → Agora não → returns as a follow-up 2h later", async () => {
    useClock();
    const item = capture("Preparar a proposta para Daniela.");
    const h = await boot([item]);

    expect(view(h)).toMatchObject({
      kind: "prompt",
      reminderId: item.id,
      prompt: "initial",
      presentation: "overlay",
    });
    expect(h.system.modes.at(-1)).toBe("overlay");

    await h.controller.dismiss(item.id);
    expect(view(h).kind).toBe("home");
    expect(h.system.hidden).toBe(1);
    expect(h.engine.get(item.id)?.status).toBe("pending");

    await minutes(119);
    expect(view(h).kind).toBe("home");
    await minutes(2);
    expect(view(h)).toMatchObject({ kind: "prompt", prompt: "follow-up", presentation: "compact" });
    expect(h.system.notifications).toContain(item.text);

    await h.controller.notYet(item.id);
    expect(Date.parse(h.engine.get(item.id)!.nextReminderAt!)).toBe(Date.now() + 90 * 60_000);
    expect(view(h).kind).toBe("home");
  });

  it("returns to the list after deciding on a reminder opened from it", async () => {
    useClock();
    const item = capture("Revisar contrato");
    const h = await boot([item]);
    await h.controller.dismiss(item.id);
    await h.controller.navigate("home");
    await h.controller.open(item.id);
    expect(view(h)).toMatchObject({ kind: "prompt", presentation: "window" });
    await h.controller.notYet(item.id);
    expect(view(h)).toEqual({ kind: "home", tab: "open" });
  });

  it("Flow B: Farei agora → Focus Mode → Concluir", async () => {
    useClock();
    const item = capture("Enviar contrato");
    const h = await boot([item]);
    await h.controller.begin(item.id);
    expect(view(h)).toEqual({ kind: "focus", reminderId: item.id });
    expect(h.engine.get(item.id)?.status).toBe("active");

    await h.controller.complete(item.id);
    expect(h.engine.get(item.id)?.status).toBe("done");
    expect(view(h).kind).toBe("home");
  });

  it("restores an active task after restart", async () => {
    useClock();
    const shared = { local: new MemoryStorage(), server: new MemoryStorage() };
    const item = capture("Revisar orçamento");
    const first = await boot([item], shared);
    await first.controller.begin(item.id);
    first.controller.stop();
    first.engine.stop();

    const second = await boot([], shared);
    expect(view(second)).toEqual({ kind: "focus", reminderId: item.id });
  });

  it("shows one reminder at a time, oldest first", async () => {
    useClock();
    const older = capture("Primeiro", 30);
    const newer = capture("Segundo", 5);
    const h = await boot([newer, older]);
    expect(view(h)).toMatchObject({ reminderId: older.id });
    await h.controller.dismiss(older.id);
    expect(view(h)).toMatchObject({ reminderId: newer.id, presentation: "overlay" });
    await h.controller.dismiss(newer.id);
    expect(view(h).kind).toBe("home");
  });

  it("does not interrupt for a mid-session capture; surfaces it on unlock", async () => {
    useClock();
    const h = await boot([]);
    await minutes(5); // intentional window from start has passed
    const item = capture("Ligar para o contador");
    await h.engine.save(item); // as if it arrived via sync
    await h.controller.evaluate("sync");
    expect(view(h).kind).toBe("home");

    h.controller.onUnlock();
    await vi.advanceTimersByTimeAsync(0);
    expect(view(h)).toMatchObject({ kind: "prompt", reminderId: item.id, presentation: "overlay" });
  });

  it("closing the window during a reminder counts as 'Agora não'", async () => {
    useClock();
    const item = capture("Responder e-mail");
    const h = await boot([item]);
    await h.controller.onWindowHidden();
    const r = h.engine.get(item.id)!;
    expect(r.status).toBe("pending");
    expect(Date.parse(r.nextReminderAt!)).toBe(Date.now() + 120 * 60_000);
  });

  it("leaves the prompt when the reminder is handled on another device", async () => {
    useClock();
    const item = capture("Pagar boleto");
    const h = await boot([item]);
    expect(view(h).kind).toBe("prompt");
    // Another device starts and completes it; arrives via sync.
    const elsewhere = { ...startReminder(item, new Date()), status: "done" as const };
    await new StorageReminderRemote(h.shared.server).upsert([elsewhere]);
    await h.engine.sync("manual");
    await vi.advanceTimersByTimeAsync(0);
    expect(view(h).kind).toBe("home");
  });
});
