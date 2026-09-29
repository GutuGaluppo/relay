import type { Reminder } from "@relay/types";

/**
 * Last-writer-wins on `updatedAt`. On an exact tie the incoming (server) copy wins,
 * so duplicate events are harmless and all devices converge on the same value.
 */
export function pickNewer(local: Reminder | undefined, incoming: Reminder): Reminder {
  if (!local) return incoming;
  return Date.parse(incoming.updatedAt) >= Date.parse(local.updatedAt) ? incoming : local;
}

export function isSameVersion(a: Reminder, b: Reminder): boolean {
  return (
    a.updatedAt === b.updatedAt &&
    a.status === b.status &&
    a.text === b.text &&
    (a.nextReminderAt ?? null) === (b.nextReminderAt ?? null)
  );
}

/**
 * Merge a full server snapshot into local state.
 * - Items on both sides: newer `updatedAt` wins.
 * - Items only on the server: adopted.
 * - Items only locally: kept only if they are still waiting in the outbox
 *   (not yet pushed); otherwise they were removed elsewhere and are dropped.
 */
export function reconcile(
  local: readonly Reminder[],
  remote: readonly Reminder[],
  unsyncedIds: ReadonlySet<string>,
): Reminder[] {
  const byId = new Map<string, Reminder>();
  for (const r of remote) byId.set(r.id, r);
  for (const l of local) {
    const server = byId.get(l.id);
    if (server) {
      byId.set(l.id, unsyncedIds.has(l.id) ? pickNewer(server, l) : pickNewer(l, server));
    } else if (unsyncedIds.has(l.id)) {
      byId.set(l.id, l);
    }
  }
  return [...byId.values()];
}
