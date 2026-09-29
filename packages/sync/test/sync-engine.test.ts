import { afterEach, describe, expect, it, vi } from "vitest";
import { createReminder, dismissInitial, startReminder, completeReminder } from "@relay/domain";
import { MemoryStorage, reconcile, SyncEngine, type SyncLogger } from "../src";
import { FakeRemote } from "./fake-remote";

const USER = "00000000-0000-4000-8000-000000000001";
const T0 = new Date("2026-03-10T12:00:00.000Z");
const at = (m: number) => new Date(T0.getTime() + m * 60_000);
const quiet: SyncLogger = { info() {}, warn() {}, error() {} };

let n = 0;
const newReminder = (now = T0) =>
  createReminder({
    id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    userId: USER,
    text: `Item ${n}`,
    source: "text",
    now,
  });

const engines: SyncEngine[] = [];
function engine(
  remote: FakeRemote,
  storage = new MemoryStorage(),
  mode: "full" | "push-only" = "full",
) {
  const e = new SyncEngine({
    userId: USER,
    remote,
    storage,
    logger: quiet,
    mode,
    reconcileIntervalMs: 0,
  });
  engines.push(e);
  return e;
}
const settle = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  engines.splice(0).forEach((e) => e.stop());
  vi.useRealTimers();
});

describe("reconcile", () => {
  it("adopts server items, keeps unsynced local items, drops stale local items", () => {
    const a = newReminder();
    const b = newReminder();
    const c = newReminder();
    const merged = reconcile([b, c], [a], new Set([b.id]));
    expect(merged.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("prefers the newer version on either side", () => {
    const base = newReminder();
    const newer = dismissInitial(base, at(5));
    expect(reconcile([base], [newer], new Set())[0]).toEqual(newer);
    expect(reconcile([newer], [base], new Set([newer.id]))[0]).toEqual(newer);
  });
});

describe("SyncEngine", () => {
  it("pushes a capture from one device and delivers it to another", async () => {
    const remote = new FakeRemote();
    const phone = engine(remote, new MemoryStorage(), "push-only");
    const desktop = engine(remote);
    await phone.start();
    await desktop.start();

    const r = newReminder();
    await phone.save(r);
    await settle();

    expect(remote.rows.get(r.id)).toEqual(r);
    expect(desktop.get(r.id)).toEqual(r);
    expect(phone.getState().pendingUploads).toBe(0);
  });

  it("keeps offline captures in the outbox and uploads them later", async () => {
    const remote = new FakeRemote();
    remote.online = false;
    const storage = new MemoryStorage();
    const phone = engine(remote, storage, "push-only");
    await phone.start();

    const r = newReminder();
    await phone.save(r);
    await settle();
    expect(phone.getState().pendingUploads).toBe(1);
    phone.stop();

    // App restart while still offline: the outbox survives.
    const restarted = engine(remote, storage, "push-only");
    await restarted.start();
    expect(restarted.getState().pendingUploads).toBe(1);

    remote.online = true;
    await restarted.sync("online");
    expect(remote.rows.get(r.id)).toEqual(r);
    expect(restarted.getState().pendingUploads).toBe(0);
  });

  it("is idempotent under duplicate submissions and duplicate realtime events", async () => {
    const remote = new FakeRemote();
    const desktop = engine(remote);
    await desktop.start();
    const r = newReminder();
    await remote.upsert([r]);
    await remote.upsert([r]);
    remote.emitRaw(r);
    remote.emitRaw(r);
    expect(remote.rows.size).toBe(1);
    expect(desktop.getState().reminders).toHaveLength(1);
  });

  it("ignores stale realtime events", async () => {
    const remote = new FakeRemote();
    const desktop = engine(remote);
    await desktop.start();
    const r = newReminder();
    const snoozed = dismissInitial(r, at(1));
    await desktop.save(snoozed);
    await settle();
    remote.emitRaw(r); // old version arrives late
    expect(desktop.get(r.id)).toEqual(snoozed);
  });

  it("converges when a reminder is completed on another desktop", async () => {
    const remote = new FakeRemote();
    const a = engine(remote);
    const b = engine(remote);
    await a.start();
    await b.start();
    const active = startReminder(newReminder(), at(1));
    await a.save(active);
    await settle();
    expect(b.get(active.id)?.status).toBe("active");

    await b.save(completeReminder(active, at(30)));
    await settle();
    expect(a.get(active.id)?.status).toBe("done");
  });

  it("does not lose a local change made while offline when the server has an older version", async () => {
    const remote = new FakeRemote();
    const desktop = engine(remote);
    await desktop.start();
    const r = newReminder();
    await desktop.save(r);
    await settle();

    remote.online = false;
    const started = startReminder(r, at(10));
    await desktop.save(started);
    await settle();
    remote.online = true;
    await desktop.sync("resume");
    expect(remote.rows.get(r.id)?.status).toBe("active");
    expect(desktop.get(r.id)?.status).toBe("active");
  });

  it("retries failed uploads with backoff", async () => {
    vi.useFakeTimers();
    const remote = new FakeRemote();
    remote.online = false;
    const phone = engine(remote, new MemoryStorage(), "push-only");
    await phone.start();
    await phone.save(newReminder());
    await vi.advanceTimersByTimeAsync(0);
    remote.online = true;
    await vi.advanceTimersByTimeAsync(2_500);
    expect(phone.getState().pendingUploads).toBe(0);
  });

  it("reset wipes local data (sign-out)", async () => {
    const storage = new MemoryStorage();
    const remote = new FakeRemote();
    const desktop = engine(remote, storage);
    await desktop.start();
    await desktop.save(newReminder());
    await desktop.reset();
    expect(await storage.getItem("relay.reminders.v1")).toBeNull();
  });
});
