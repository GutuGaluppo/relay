export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;

export function toMs(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Invalid timestamp: ${iso}`);
  return ms;
}

export function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function addMs(now: Date, ms: number): string {
  return iso(now.getTime() + ms);
}

/**
 * `hour:00` on the calendar day after `now`, in the device's local time zone.
 * Uses local calendar arithmetic so DST transitions keep the wall-clock hour.
 */
export function tomorrowAt(now: Date, hour: number): string {
  const d = new Date(now.getTime());
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}
