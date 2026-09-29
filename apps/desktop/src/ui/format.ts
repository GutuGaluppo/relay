import type { SnoozeOption } from "@relay/domain";

const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "hoje, 14:30" / "amanhã, 09:00" / "qua., 12 de mar., 09:00" */
export function formatWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
  const time = timeFmt.format(d);
  if (days === 0) return `hoje, ${time}`;
  if (days === 1) return `amanhã, ${time}`;
  if (days === -1) return `ontem, ${time}`;
  return `${dayFmt.format(d)}, ${time}`;
}

export function snoozeLabel(option: SnoozeOption): string {
  switch (option.kind) {
    case "duration":
      return option.minutes < 60 ? `${option.minutes} min` : `${option.minutes / 60} h`;
    case "tomorrow":
      return "Amanhã";
    case "until":
      return formatWhen(option.at);
  }
}
