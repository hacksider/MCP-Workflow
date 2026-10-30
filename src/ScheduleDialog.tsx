import { useState } from "react";
import { X, CalendarClock } from "lucide-react";
import type { WorkflowLibrary } from "./library";
import { createSchedule, nextScheduledTime, scheduleDescription, type FlowSchedule, type ScheduleConfig } from "./scheduler";

export function ScheduleDialog({library,schedules,onChange,onClose}:{library:WorkflowLibrary;schedules:FlowSchedule[];onChange:(s:FlowSchedule[])=>void;onClose:()=>void}) {
  const [workflowId,setWorkflowId]=useState(library.activeId);
  const [kind,setKind]=useState<ScheduleConfig["kind"]>("interval");
  const [every,setEvery]=useState(1),[unit,setUnit]=useState<"minute"|"hour"|"day">("hour");
  const [time,setTime]=useState("09:00"),[at,setAt]=useState("");
  const [error,setError]=useState("");
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  const commit=(next:FlowSchedule[])=>{try{onChange(next);setError("");}catch(e){setError(String(e));}};
  function add(){try{const config:ScheduleConfig=kind==="interval"?{kind,every,unit}:kind==="daily"?{kind,time}:{kind,at:new Date(at).toISOString()};onChange([...schedules,createSchedule(workflowId,config)]);setError("");}catch(e){setError(String(e));}}
  return <div className="modal-backdrop"><section className="modal schedule-dialog" role="dialog" aria-modal="true" aria-labelledby="schedule-title">
    <div className="plugin-browser-title"><div><h2 id="schedule-title"><CalendarClock size={20}/> Workflow schedules</h2><p>Repeat a saved flow, or run it at a specific time.</p></div><button aria-label="Close schedules" onClick={onClose}><X size={17}/></button></div>
    <p>Keep this app open and the computer awake. Times use your computer's timezone: <strong>{zone}</strong>. Due runs may switch the active workflow. AI approvals still require you.</p>
    <div className="schedule-create">
      <label>Workflow<select value={workflowId} onChange={e=>setWorkflowId(e.target.value)}>{library.workflows.map(e=><option key={e.workflow.id} value={e.workflow.id}>{e.workflow.name}</option>)}</select></label>
      <label>Schedule type<select value={kind} onChange={e=>setKind(e.target.value as ScheduleConfig["kind"])}><option value="interval">Repeat every X minutes, hours or days</option><option value="daily">Every day at a specific time</option><option value="once">Once on a specific date and time</option></select></label>
      {kind==="interval"?<div className="schedule-interval"><label>Run every<input type="number" min={1} max={1000000} step={1} value={every} onChange={e=>setEvery(Number(e.target.value))}/></label><label>Time unit<select value={unit} onChange={e=>setUnit(e.target.value as typeof unit)}><option value="minute">Minutes</option><option value="hour">Hours</option><option value="day">Days</option></select></label></div>:kind==="daily"?<label>Time each day<input type="time" value={time} onChange={e=>setTime(e.target.value)}/></label>:<label>Date and time<input type="datetime-local" value={at} onChange={e=>setAt(e.target.value)}/></label>}
      <p>For example, every 15 minutes or every 2 hours. The first run starts after one full interval.</p>
      <button className="primary" onClick={add}>Add schedule</button>
    </div>
    {error&&<p role="alert" className="builder-error">{error}</p>}
    <h3>Saved schedules ({schedules.length})</h3>
    {!schedules.length&&<p>No schedules yet. Add one above.</p>}
    <div className="schedule-list">{schedules.map(s=><article key={s.id}><strong>{library.workflows.find(e=>e.workflow.id===s.workflowId)?.workflow.name??"Workflow removed"}</strong><p>{scheduleDescription(s.config)}</p><p>{s.enabled?`Next: ${new Date(s.nextAt).toLocaleString()}`:"Paused / finished"} · Started: {s.started} · Skipped: {s.skipped}</p>{s.lastStatus&&<p>{s.lastStatus} · {new Date(s.lastAt!).toLocaleString()}</p>}<div className="schedule-actions"><button onClick={()=>{try{const nextAt=s.enabled?s.nextAt:nextScheduledTime(s.config,Date.now());if(!s.enabled&&nextAt<=Date.now())throw Error("This one-time date has passed. Add a new schedule.");commit(schedules.map(x=>x.id===s.id?{...s,enabled:!s.enabled,nextAt}:x));}catch(e){setError(String(e));}}}>{s.enabled?"Pause":"Enable"}</button><button onClick={()=>commit(schedules.filter(x=>x.id!==s.id))}>Remove schedule</button></div></article>)}</div>
    <p>One workflow runs at a time in this app. Busy or missed slots are skipped, never queued in a burst. Schedules are saved on this device and are not included in workflow exports.</p>
  </section></div>;
}
