export type ScheduleConfig =
  | { kind: "interval"; every: number; unit: "minute" | "hour" | "day" }
  | { kind: "daily"; time: string }
  | { kind: "once"; at: string };
export type FlowSchedule = {
  id: string; workflowId: string; config: ScheduleConfig; enabled: boolean;
  nextAt: number; started: number; skipped: number; lastAt?: number; lastStatus?: string;
};
export const scheduleKey = "mcp-workflow.schedules.v1";
const periods = { minute: 60000, hour: 3600000, day: 86400000 };
export function validateSchedule(config: ScheduleConfig) {
  if (!config || !["interval", "daily", "once"].includes(config.kind)) throw Error("Choose a schedule type.");
  if (config.kind === "interval" && (!Object.hasOwn(periods, config.unit) || !Number.isInteger(config.every) || config.every < 1 || config.every > 1000000)) throw Error("Choose a whole interval between 1 and 1,000,000.");
  if (config.kind === "daily" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(config.time)) throw Error("Choose a valid daily time.");
  if (config.kind === "once" && !Number.isFinite(Date.parse(config.at))) throw Error("Choose a valid date and time.");
}
export function nextScheduledTime(config: ScheduleConfig, now: number) {
  validateSchedule(config);
  if (config.kind === "interval") return now + periods[config.unit] * config.every;
  if (config.kind === "once") return Date.parse(config.at);
  const date = new Date(now);
  const [hours, minutes] = config.time.split(":").map(Number);
  date.setHours(hours, minutes, 0, 0);
  if (date.getTime() <= now) date.setDate(date.getDate() + 1);
  return date.getTime();
}
export function createSchedule(workflowId: string, config: ScheduleConfig, now = Date.now()): FlowSchedule {
  const nextAt = nextScheduledTime(config, now);
  if (nextAt <= now) throw Error("Choose a future date and time.");
  return { id: crypto.randomUUID(), workflowId, config, enabled: true, nextAt, started: 0, skipped: 0 };
}
export function scheduleDescription(config: ScheduleConfig) {
  if (config.kind === "interval") return `Every ${config.every} ${config.unit}${config.every === 1 ? "" : "s"}`;
  if (config.kind === "daily") return `Every day at ${config.time}`;
  return `Once at ${new Date(config.at).toLocaleString()}`;
}
// Consume the time slot before execution. Missed slots never form a run backlog.
export function consumeSchedule(schedule: FlowSchedule, now: number, available: boolean): { schedule: FlowSchedule; launch: boolean } {
  if (!schedule.enabled || schedule.nextAt > now) return { schedule, launch: false };
  const config = schedule.config;
  const late = now - schedule.nextAt;
  const slots = config.kind === "interval" ? Math.floor(late / (periods[config.unit] * config.every)) + 1 : 1;
  const launch = available && late <= 30000;
  const nextAt = config.kind === "interval" ? schedule.nextAt + slots * periods[config.unit] * config.every : config.kind === "daily" ? nextScheduledTime(config, now) : schedule.nextAt;
  return { launch, schedule: { ...schedule, nextAt, enabled: config.kind !== "once", started: schedule.started + Number(launch), skipped: schedule.skipped + slots - Number(launch), lastAt: now, lastStatus: launch ? "Started" : available ? "Skipped missed time" : "Skipped while another operation was active" } };
}
export function loadSchedules(raw: string | null): FlowSchedule[] {
  if (!raw) return [];
  const data = JSON.parse(raw);
  if (!Array.isArray(data) || data.length > 1000) throw Error("Invalid saved schedules.");
  const ids = new Set<string>();
  for (const s of data) {
    // The unreleased rate-based prototype must never restart automatically.
    if (s?.config?.kind === "rate") {
      s.config = { kind: "interval", every: 1, unit: "minute" };
      s.enabled = false;
      s.lastStatus = "Previous rate schedule paused; replace it with an interval.";
    }
    validateSchedule(s.config);
    if (typeof s.id !== "string" || ids.has(s.id) || typeof s.workflowId !== "string" || typeof s.enabled !== "boolean" || !Number.isFinite(s.nextAt) || !Number.isInteger(s.started) || s.started < 0 || !Number.isInteger(s.skipped) || s.skipped < 0) throw Error("Invalid saved schedule.");
    ids.add(s.id);
  }
  return data;
}
