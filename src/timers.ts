export const delayUnits = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
  days: 86400,
} as const;
export type DelayUnit = keyof typeof delayUnits;
export const maxDelaySeconds = 365 * 86400;
export function formatCountdown(ms: number) {
  const total = Math.ceil(Math.max(0, ms) / 1000),
    days = Math.floor(total / 86400),
    hours = Math.floor((total % 86400) / 3600),
    minutes = Math.floor((total % 3600) / 60),
    seconds = total % 60;
  const clock = [...(total >= 3600 ? [hours] : []), minutes, seconds]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  return days ? `${days}d ${clock}` : clock;
}
