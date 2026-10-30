import { describe, it, expect } from "vitest";
import { createSchedule, consumeSchedule, loadSchedules, nextScheduledTime } from "../src/scheduler";

describe("workflow scheduler",()=>{
  const now=new Date(2026,9,30,10,0).getTime();
  it("repeats every X minutes, hours or days",()=>{
    expect(nextScheduledTime({kind:"interval",every:1,unit:"minute"},now)-now).toBe(60000);
    expect(nextScheduledTime({kind:"interval",every:2,unit:"hour"},now)-now).toBe(7200000);
    expect(nextScheduledTime({kind:"interval",every:3,unit:"day"},now)-now).toBe(259200000);
  });
  it("chooses today's or tomorrow's daily time in local time",()=>{
    expect(new Date(nextScheduledTime({kind:"daily",time:"11:00"},now)).getHours()).toBe(11);
    expect(new Date(nextScheduledTime({kind:"daily",time:"09:00"},now)).getDate()).toBe(31);
  });
  it("fires a one-time slot once and disables it",()=>{
    const s=createSchedule("flow",{kind:"once",at:new Date(now+10000).toISOString()},now);
    const result=consumeSchedule(s,now+10000,true);
    expect(result.launch).toBe(true);expect(result.schedule.enabled).toBe(false);
    expect(consumeSchedule(result.schedule,now+11000,true).launch).toBe(false);
  });
  it("does not overlap a busy run and does not build a catch-up backlog",()=>{
    const s=createSchedule("flow",{kind:"interval",every:1,unit:"minute"},now);
    const busy=consumeSchedule(s,now+60000,false);
    expect(busy.launch).toBe(false);expect(busy.schedule.skipped).toBe(1);
    const sleep=consumeSchedule(s,now+600000,true);
    expect(sleep.launch).toBe(false);expect(sleep.schedule.skipped).toBe(10);
    expect(sleep.schedule.nextAt).toBe(now+660000);
  });
  it("does not fire early or while paused; consumes due slots before repeat ticks",()=>{
    const s=createSchedule("flow",{kind:"interval",every:1,unit:"minute"},now);
    expect(consumeSchedule(s,now+59000,true).launch).toBe(false);
    expect(consumeSchedule({...s,enabled:false},now+60000,true).launch).toBe(false);
    const first=consumeSchedule(s,now+60000,true);
    expect(first.launch).toBe(true);expect(first.schedule.started).toBe(1);
    expect(consumeSchedule(first.schedule,now+60001,true).launch).toBe(false);
  });
  it("validates configuration and reloads saved schedules",()=>{
    expect(()=>createSchedule("flow",{kind:"interval",every:0,unit:"minute"},now)).toThrow();
    expect(()=>createSchedule("flow",{kind:"interval",every:1.5,unit:"minute"},now)).toThrow();
    expect(()=>createSchedule("flow",{kind:"daily",time:"25:00"},now)).toThrow();
    expect(()=>createSchedule("flow",{kind:"once",at:new Date(now-1).toISOString()},now)).toThrow();
    const s=createSchedule("flow",{kind:"interval",every:2,unit:"day"},now);
    expect(loadSchedules(JSON.stringify([s]))).toEqual([s]);
    expect(()=>loadSchedules(JSON.stringify([s,s]))).toThrow();
    expect(()=>loadSchedules('broken')).toThrow();
  });
  it("pauses earlier prototype rate schedules instead of silently starting them",()=>{
    const s=createSchedule("flow",{kind:"interval",every:1,unit:"minute"},now);
    const restored=loadSchedules(JSON.stringify([{...s,config:{kind:"rate",runs:12,unit:"minute"}}]));
    expect(restored[0].enabled).toBe(false);
    expect(restored[0].lastStatus).toContain("replace it with an interval");
  });
});
