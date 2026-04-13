import { useState, useEffect, useRef, useCallback } from "react";

const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=Tenor+Sans&family=Lato:wght@300;400;700&display=swap";
document.head.appendChild(fontLink);

// ── Supabase ──────────────────────────────────────────────────────
const SB_URL = "https://rcaluapxwmmvbccqynxv.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjYWx1YXB4d21tdmJjY3F5bnh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwODY3MzAsImV4cCI6MjA5MTY2MjczMH0.iWV8DUCwB-pS3PyT-FdxPFcryCyi0294trnn1Ioenm0";
const sbH = { "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Prefer": "return=representation" };
const sbGet = async t => { try { const r = await fetch(`${SB_URL}/rest/v1/${t}?select=*`, { headers: sbH }); return await r.json(); } catch { return []; } };
const sbUpsert = async (t, row) => { try { await fetch(`${SB_URL}/rest/v1/${t}`, { method: "POST", headers: { ...sbH, "Prefer": "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row) }); } catch {} };
const sbDelete = async (t, id) => { try { await fetch(`${SB_URL}/rest/v1/${t}?id=eq.${id}`, { method: "DELETE", headers: sbH }); } catch {} };
const sbGetSetting = async key => { try { const r = await fetch(`${SB_URL}/rest/v1/settings?key=eq.${key}&select=value`, { headers: sbH }); const d = await r.json(); return d?.[0]?.value ?? null; } catch { return null; } };
const sbSetSetting = async (key, value) => { try { await fetch(`${SB_URL}/rest/v1/settings`, { method: "POST", headers: { ...sbH, "Prefer": "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ key, value }) }); } catch {} };

// ── Claude ────────────────────────────────────────────────────────
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY || "";
const askClaude = async prompt => { const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1200, messages: [{ role: "user", content: prompt }] }) }); const d = await res.json(); return d.content?.map(b => b.text || "").join("") || ""; };

// ── Helpers ───────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);
const nowISO = () => new Date().toISOString();
const fmtTime = iso => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtDate = iso => new Date(iso).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
const fmtShort = iso => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
const todayStr = () => new Date().toDateString();
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PRIORITIES = { high: { label: "High", color: "#c55" }, medium: { label: "Medium", color: "#c8a84b" }, low: { label: "Low", color: "#666" } };
const DEFAULT_SCHEDULE = { days: [1,2,3,4,5], startHour: 6, startMin: 0, endHour: 19, endMin: 0, intervalMin: 45 };
const DEFAULT_PROF_CATS = ["Planning", "Site Visit", "Procurement", "Scheduling", "Approvals", "Safety", "Stakeholder", "Admin", "Other"];
const DEFAULT_PERS_CATS = ["Health", "Finance", "Home", "Family", "Learning", "Errands", "Other"];

const isWithinSchedule = sc => { const now = new Date(); if (!sc.days.includes(now.getDay())) return false; const m = now.getHours() * 60 + now.getMinutes(); return m >= sc.startHour * 60 + sc.startMin && m <= sc.endHour * 60 + sc.endMin; };

// ── Converters ────────────────────────────────────────────────────
const taskToRow = t => ({ id: t.id, text: t.text, mode: t.mode, job_id: t.jobId, job_label: t.jobLabel, category: t.category, deadline: t.deadline || null, status: t.status, follow_up: t.followUp || false, follow_up_note: t.followUpNote || "", subtasks: t.subtasks || [], created_at: t.createdAt, completed_at: t.completedAt || null, priority: t.priority || "medium", recurring: t.recurring || null });
const rowToTask = r => ({ id: r.id, text: r.text, mode: r.mode, jobId: r.job_id, jobLabel: r.job_label, category: r.category, deadline: r.deadline, status: r.status, followUp: r.follow_up, followUpNote: r.follow_up_note, subtasks: r.subtasks || [], createdAt: r.created_at, completedAt: r.completed_at, priority: r.priority || "medium", recurring: r.recurring || null });
const logToRow = l => ({ id: l.id, time: l.time, job_id: l.jobId, job_label: l.jobLabel, mode: l.mode, text: l.text, type: l.type });
const rowToLog = r => ({ id: r.id, time: r.time, jobId: r.job_id, jobLabel: r.job_label, mode: r.mode, text: r.text, type: r.type });
const archiveToRow = t => ({ id: t.id, text: t.text, mode: t.mode, job_id: t.jobId, job_label: t.jobLabel, category: t.category, deadline: t.deadline || null, status: t.status, follow_up: t.followUp || false, follow_up_note: t.followUpNote || "", subtasks: t.subtasks || [], created_at: t.createdAt, completed_at: t.completedAt || null, archived_at: t.archivedAt || nowISO(), priority: t.priority || "medium" });
const rowToArchive = r => ({ id: r.id, text: r.text, mode: r.mode, jobId: r.job_id, jobLabel: r.job_label, category: r.category, deadline: r.deadline, status: r.status, followUp: r.follow_up, followUpNote: r.follow_up_note, subtasks: r.subtasks || [], createdAt: r.created_at, completedAt: r.completed_at, archivedAt: r.archived_at, priority: r.priority || "medium" });

// ── Export ────────────────────────────────────────────────────────
function buildExportHTML(tasks, logs, tab, jobs, reportNotes = "") {
  const date = fmtDate(nowISO());
  const cur = tasks.filter(t => t.mode === tab);
  const done = cur.filter(t => t.completedAt && new Date(t.completedAt).toDateString() === todayStr());
  const inProg = cur.filter(t => t.status === "open");
  const fu = cur.filter(t => t.followUp && t.status !== "done");
  const todayLogs = logs.filter(l => new Date(l.time).toDateString() === todayStr() && l.mode === tab);
  const jKeys = tab === "professional" ? jobs.filter(j => !j.inactive).map(j => j.id) : ["personal"];
  const jDisplay = jid => { const j = jobs.find(x => x.id === jid); return j ? (j.number ? `#${j.number} — ${j.title}` : j.title) : (jid === "personal" ? "Personal" : jid); };
  const renderSec = (title, list, showReason = false) => {
    if (!list.length) return `<p style="color:#888;font-style:italic;">None</p>`;
    return jKeys.map(jid => { const items = list.filter(t => t.jobId === jid); if (!items.length) return "";
      return `<p style="font-weight:bold;color:#333;margin:10px 0 4px;">${jDisplay(jid)}</p><table style="width:100%;border-collapse:collapse;margin-bottom:8px;"><thead><tr style="background:#f0f0f0;"><th style="text-align:left;padding:6px 10px;font-size:12px;border:1px solid #ddd;">Task</th><th style="text-align:left;padding:6px 10px;font-size:12px;border:1px solid #ddd;">Category</th><th style="text-align:left;padding:6px 10px;font-size:12px;border:1px solid #ddd;">Priority</th><th style="text-align:left;padding:6px 10px;font-size:12px;border:1px solid #ddd;">Deadline</th>${showReason?`<th style="text-align:left;padding:6px 10px;font-size:12px;border:1px solid #ddd;">Status</th>`:""} ${title==="Follow-Ups Required"?`<th style="text-align:left;padding:6px 10px;font-size:12px;border:1px solid #ddd;">Note</th>`:""}</tr></thead><tbody>${items.map((t,i)=>`<tr style="background:${i%2===0?"#fff":"#f9f9f9"};"><td style="padding:6px 10px;font-size:12px;border:1px solid #ddd;">${t.text}</td><td style="padding:6px 10px;font-size:12px;border:1px solid #ddd;">${t.category}</td><td style="padding:6px 10px;font-size:12px;border:1px solid #ddd;">${t.priority||"medium"}</td><td style="padding:6px 10px;font-size:12px;border:1px solid #ddd;">${t.deadline||"—"}</td>${showReason?`<td style="padding:6px 10px;font-size:12px;border:1px solid #ddd;">In Progress</td>`:""}${title==="Follow-Ups Required"?`<td style="padding:6px 10px;font-size:12px;border:1px solid #ddd;">${t.followUpNote||"—"}</td>`:""}</tr>`).join("")}</tbody></table>`;
    }).join("");
  };
  const logsHtml = todayLogs.length ? todayLogs.map(l => `<p style="margin:4px 0;font-size:12px;"><span style="color:#888;">[${fmtTime(l.time)}]</span> <strong>${l.jobLabel||""}</strong>${l.type==="visitor"?" 👤":""} — ${l.text}</p>`).join("") : `<p style="color:#888;font-style:italic;">None</p>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Docket — ${date}</title></head><body style="font-family:'Segoe UI',Arial,sans-serif;max-width:900px;margin:0 auto;padding:32px;color:#222;"><p style="font-size:13px;color:#888;margin-bottom:${reportNotes?"8px":"28px"};">${date}</p>${reportNotes?`<p style="font-size:13px;color:#333;margin-bottom:24px;font-style:italic;">${reportNotes}</p>`:""}<h2 style="font-size:15px;color:#333;border-bottom:1px solid #ddd;padding-bottom:6px;margin-top:24px;">✓ Completed Today</h2>${renderSec("Completed",done)}<h2 style="font-size:15px;color:#333;border-bottom:1px solid #ddd;padding-bottom:6px;margin-top:24px;">⟳ In Progress</h2>${renderSec("In Progress",inProg,true)}<h2 style="font-size:15px;color:#333;border-bottom:1px solid #ddd;padding-bottom:6px;margin-top:24px;">⚑ Follow-Ups Required</h2>${renderSec("Follow-Ups",fu)}<h2 style="font-size:15px;color:#333;border-bottom:1px solid #ddd;padding-bottom:6px;margin-top:24px;">📋 Activity Log</h2>${logsHtml}<p style="margin-top:40px;font-size:11px;color:#bbb;">Generated by Docket · ${new Date().toLocaleString()}</p></body></html>`;
}

function mdToHtml(md = "") {
  return md.replace(/^### (.+)$/gm,"<h3>$1</h3>").replace(/^## (.+)$/gm,"<h2>$1</h2>").replace(/^# (.+)$/gm,"<h1>$1</h1>").replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>").replace(/^- (.+)$/gm,"<li>$1</li>").replace(/(<li>.*<\/li>\n?)+/gs,m=>`<ul>${m}</ul>`).replace(/\n{2,}/g,"<br/><br/>").replace(/\n/g,"<br/>");
}

// ── Main ──────────────────────────────────────────────────────────
export default function Docket() {
  const [tab, setTab] = useState("professional");
  const [view, setView] = useState("dashboard");
  const [selectedJob, setSelectedJob] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [archive, setArchive] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [activeJob, setActiveJob] = useState(null);
  const [profCats, setProfCats] = useState(DEFAULT_PROF_CATS);
  const [persCats, setPersCats] = useState(DEFAULT_PERS_CATS);
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const [newTask, setNewTask] = useState({ text: "", jobId: "", category: DEFAULT_PROF_CATS[0], deadline: "", priority: "medium", recurring: "" });
  const [newPersonalTask, setNewPersonalTask] = useState({ text: "", category: DEFAULT_PERS_CATS[0], deadline: "", priority: "medium" });
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newJobNumber, setNewJobNumber] = useState("");
  const [showAddJob, setShowAddJob] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [report, setReport] = useState("");
  const [reportNotes, setReportNotes] = useState("");
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0,10));
  const [loadingReport, setLoadingReport] = useState(false);
  const [prompt45, setPrompt45] = useState(null);
  const [promptInput, setPromptInput] = useState("");
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportContent, setExportContent] = useState("");
  const [scheduleEdit, setScheduleEdit] = useState(null);
  const [withinSchedule, setWithinSchedule] = useState(false);
  const [nextCheckin, setNextCheckin] = useState("");
  const [checkinStage, setCheckinStage] = useState("input");
  const [checkinMatched, setCheckinMatched] = useState(null);
  const [checkinSuggested, setCheckinSuggested] = useState(null);
  const [checkinProcessing, setCheckinProcessing] = useState(false);
  const [archiveFilter, setArchiveFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showManualLog, setShowManualLog] = useState(false);
  const [manualLogText, setManualLogText] = useState("");
  const [manualLogJob, setManualLogJob] = useState("");
  const [manualLogType, setManualLogType] = useState("manual");
  const [showMorningSummary, setShowMorningSummary] = useState(false);
  const [morningSummary, setMorningSummary] = useState("");
  const [loadingMorning, setLoadingMorning] = useState(false);
  const [companyLogo, setCompanyLogo] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  // Timesheet
  const [timeEntries, setTimeEntries] = useState([]);
  const [editingTimeEntry, setEditingTimeEntry] = useState(null);
  const [generatingTimesheet, setGeneratingTimesheet] = useState(false);
  const [timesheetDate, setTimesheetDate] = useState(new Date().toISOString().slice(0,10));
  // Mileage
  const [mileageEntries, setMileageEntries] = useState([]);
  const [savedLocations, setSavedLocations] = useState([]);
  const [showMileage, setShowMileage] = useState(false);
  const [mileageForm, setMileageForm] = useState({ fromId: "", toId: "", jobId: "", date: new Date().toISOString().slice(0,10), notes: "", km: null });
  const [lookingUpKm, setLookingUpKm] = useState(false);
  const [addingLocation, setAddingLocation] = useState(null); // "from" | "to" | null
  const [newLocName, setNewLocName] = useState("");
  const [newLocAddress, setNewLocAddress] = useState("");
  // Voice
  const [isRecording, setIsRecording] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const recognitionRef = useRef(null);
  const lastPromptRef = useRef(Date.now());

  // ── Load ──────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [taskRows, logRows, jobRows, archiveRows] = await Promise.all([sbGet("tasks"), sbGet("logs"), sbGet("jobs"), sbGet("archive")]);
      const loadedJobs = jobRows.map(r => ({ id: r.id, title: r.title, number: r.number || "", inactive: r.inactive || false }));
      setTasks(taskRows.map(rowToTask));
      setLogs(logRows.map(rowToLog));
      setArchive(archiveRows.map(rowToArchive));
      setJobs(loadedJobs);
      const savedActive = await sbGetSetting("activeJob");
      if (loadedJobs.length > 0) {
        const valid = loadedJobs.find(j => j.id === savedActive);
        const aj = valid ? savedActive : loadedJobs[0].id;
        setActiveJob(aj); setNewTask(nt => ({ ...nt, jobId: aj })); setManualLogJob(aj);
      }
      const sc = await sbGetSetting("schedule"); if (sc) setSchedule(sc);
      const pc = await sbGetSetting("profCats"); if (pc) setProfCats(pc);
      const prc = await sbGetSetting("persCats"); if (prc) setPersCats(prc);
      const logo = await sbGetSetting("companyLogo"); if (logo) setCompanyLogo(logo);
      const te = await sbGetSetting("timeEntries"); if (te) setTimeEntries(te);
      const me = await sbGetSetting("mileageEntries"); if (me) setMileageEntries(me);
      const sl = await sbGetSetting("savedLocations"); if (sl) setSavedLocations(sl);
      setLoading(false);
    })();
  }, []);

  // ── Auto-archive ──────────────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const toArchive = tasks.filter(t => t.status === "done" && t.completedAt && new Date(t.completedAt).getTime() < cutoff);
    if (!toArchive.length) return;
    toArchive.forEach(async t => { await sbUpsert("archive", archiveToRow({ ...t, archivedAt: nowISO() })); await sbDelete("tasks", t.id); });
    setArchive(a => { const ids = new Set(a.map(x => x.id)); return [...a, ...toArchive.filter(t => !ids.has(t.id)).map(t => ({ ...t, archivedAt: nowISO() }))]; });
    setTasks(ts => ts.filter(t => !toArchive.find(a => a.id === t.id)));
  }, [tasks, loading]);

  // ── Recurring tasks: check daily ─────────────────────────────
  useEffect(() => {
    if (loading || !tasks.length) return;
    const today = new Date().toISOString().slice(0,10);
    tasks.filter(t => t.recurring && t.status === "done" && t.completedAt).forEach(async t => {
      const completed = new Date(t.completedAt).toISOString().slice(0,10);
      if (completed < today) {
        const newT = { ...t, id: uid(), status: "open", completedAt: null, createdAt: nowISO() };
        setTasks(ts => [...ts, newT]);
        await sbUpsert("tasks", taskToRow(newT));
      }
    });
  }, [loading]);

  // ── Schedule ticker ───────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const inSched = isWithinSchedule(schedule);
      setWithinSchedule(inSched);
      const elapsed = (Date.now() - lastPromptRef.current) / 60000;
      const remaining = Math.max(0, schedule.intervalMin - Math.floor(elapsed));
      setNextCheckin(remaining <= 1 ? "< 1 min" : `${remaining} min`);
      if (inSched && elapsed >= schedule.intervalMin) { lastPromptRef.current = Date.now(); trigger45(); }
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [schedule, activeJob, tasks]);

  const trigger45 = useCallback(async () => {
    setLoadingPrompt(true);
    const open = tasks.filter(t => t.mode === "professional" && t.status !== "done");
    const job = jobs.find(j => j.id === activeJob);
    const label = job ? (job.number ? `#${job.number} — ${job.title}` : job.title) : activeJob;
    const msg = await askClaude(`You are a PM assistant. It has been ${schedule.intervalMin} minutes. Ask a brief, specific check-in about the user's current work on job site "${label}". Their open tasks: ${open.map(t => `"${t.text}" [${t.category}]`).join(", ") || "none"}. 1–2 sentences, direct and actionable.`);
    setPrompt45(msg); setLoadingPrompt(false);
  }, [activeJob, jobs, tasks, schedule.intervalMin]);

  // ── Morning summary ───────────────────────────────────────────
  const generateMorningSummary = async () => {
    setLoadingMorning(true); setShowMorningSummary(true);
    const open = tasks.filter(t => t.status === "open" && t.mode === "professional");
    const overdue = open.filter(t => t.deadline && new Date(t.deadline + "T00:00:00") < new Date());
    const dueToday = open.filter(t => t.deadline && new Date(t.deadline + "T00:00:00").toDateString() === todayStr());
    const fu = tasks.filter(t => t.followUp && t.status !== "done");
    const highPriority = open.filter(t => t.priority === "high");
    // High priority subtasks with due dates
    const highPriSubs = [];
    open.forEach(t => { (t.subtasks||[]).filter(s => !s.done && s.priority === "high" && s.deadline).forEach(s => highPriSubs.push({ task: t.text, sub: s.text, deadline: s.deadline, job: t.jobLabel })); });
    // 7-day look ahead
    const weekAhead = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const dStr = d.toISOString().slice(0,10);
      const due = open.filter(t => t.deadline === dStr);
      const subsDue = [];
      open.forEach(t => { (t.subtasks||[]).filter(s => !s.done && s.deadline === dStr).forEach(s => subsDue.push({ task: t.text, sub: s.text, job: t.jobLabel })); });
      if (due.length || subsDue.length) weekAhead.push({ date: d.toLocaleDateString([],{weekday:"short",month:"short",day:"numeric"}), tasks: due, subs: subsDue });
    }
    const msg = await askClaude(`You are a construction PM assistant. Generate a morning briefing for ${fmtDate(nowISO())}.

TODAY'S TASKS (due today):
${dueToday.map(t=>`- [${t.priority}] [${t.jobLabel}] ${t.text}`).join("\n")||"None"}

HIGH PRIORITY TASKS:
${highPriority.map(t=>`- [${t.jobLabel}] ${t.text}${t.deadline?" due "+t.deadline:""}`).join("\n")||"None"}

HIGH PRIORITY SUBTASKS DUE:
${highPriSubs.map(s=>`- [${s.job}] ${s.task} → ${s.sub} (due ${s.deadline})`).join("\n")||"None"}

OVERDUE:
${overdue.map(t=>`- [${t.jobLabel}] ${t.text} (was due ${t.deadline})`).join("\n")||"None"}

OPEN FOLLOW-UPS:
${fu.map(t=>`- [${t.jobLabel}] ${t.text}`).join("\n")||"None"}

ALL OPEN: ${open.length} tasks across ${[...new Set(open.map(t=>t.jobLabel))].join(", ")||"no active jobs"}

Format with these sections:
1. **Today's Priorities** — what needs to happen today, most urgent first (max 6 bullet points)
2. **Follow-Ups Requiring Action** — only if there are any
3. **7-Day Look Ahead** — list upcoming deadlines day by day for the next week:
${weekAhead.map(d=>`${d.date}: ${d.tasks.map(t=>t.text).concat(d.subs.map(s=>s.sub)).join(", ")}`).join("\n")||"Nothing scheduled in the next 7 days"}

Keep it tight and actionable. Professional tone. Markdown.`);
    setMorningSummary(msg); setLoadingMorning(false);
  };

  // ── Check-in ──────────────────────────────────────────────────
  const logEntry = async (text, jobId, type = "checkin") => {
    const job = jobs.find(j => j.id === jobId) || jobs.find(j => j.id === activeJob);
    const label = job ? (job.number ? `#${job.number} — ${job.title}` : job.title) : "";
    const entry = { id: uid(), time: nowISO(), jobId: jobId || activeJob, jobLabel: label, mode: "professional", text: text.trim(), type };
    setLogs(l => [...l, entry]);
    await sbUpsert("logs", logToRow(entry));
  };

  const resetCheckin = () => { setPrompt45(null); setPromptInput(""); setCheckinStage("input"); setCheckinMatched(null); setCheckinSuggested(null); setCheckinProcessing(false); };

  const submitCheckin = async () => {
    if (!promptInput.trim()) return;
    setCheckinProcessing(true); setCheckinStage("matching");
    const openJobTasks = tasks.filter(t => t.mode === "professional" && t.status === "open" && t.jobId === activeJob);
    const raw = promptInput.trim();
    let match = null, rewrite = raw, category = "Planning";
    try {
      const resp = await askClaude(`Construction PM assistant. Analyse this check-in and open tasks.
CHECK-IN: "${raw}"
OPEN TASKS: ${openJobTasks.length > 0 ? openJobTasks.map((t,i) => `${i}: ${t.text} [${t.category}]`).join("\n") : "none"}
Respond ONLY with JSON: {"matchIndex":<index or null>,"matchConfidence":"high"|"low","rewrite":"<concise professional task under 12 words>","category":"<Planning|Site Visit|Procurement|Scheduling|Approvals|Safety|Stakeholder|Admin|Other>"}`);
      const parsed = JSON.parse(resp.replace(/```json|```/g,"").trim());
      if (parsed.matchIndex !== null && parsed.matchConfidence === "high" && openJobTasks[parsed.matchIndex]) match = openJobTasks[parsed.matchIndex];
      rewrite = parsed.rewrite || raw; category = parsed.category || "Planning";
    } catch {}
    setCheckinProcessing(false);
    if (match) { setCheckinMatched(match); setCheckinSuggested({ text: rewrite, category }); setCheckinStage("confirm-existing"); }
    else { setCheckinSuggested({ text: rewrite, category }); setCheckinStage("suggest-new"); }
  };

  const confirmExistingTask = async () => { await logEntry(promptInput, activeJob); resetCheckin(); };
  const rejectExistingTask = () => { setCheckinMatched(null); setCheckinStage("suggest-new"); };
  const acceptNewTask = async () => {
    if (!checkinSuggested) return;
    const job = jobs.find(j => j.id === activeJob) || jobs[0]; if (!job) return;
    const t = { id: uid(), text: checkinSuggested.text, mode: "professional", jobId: job.id, jobLabel: jLabel(job), category: checkinSuggested.category, deadline: null, status: "open", followUp: false, followUpNote: "", subtasks: [], createdAt: nowISO(), completedAt: null, priority: "medium", recurring: null };
    setTasks(ts => [...ts, t]); await sbUpsert("tasks", taskToRow(t));
    await logEntry(promptInput, activeJob); resetCheckin();
  };
  const dismissNewTask = async () => { await logEntry(promptInput, activeJob); resetCheckin(); };

  const submitManualLog = async () => {
    if (!manualLogText.trim()) return;
    await logEntry(manualLogText, manualLogJob || activeJob, manualLogType);
    setManualLogText(""); setShowManualLog(false);
  };

  // ── Tasks ─────────────────────────────────────────────────────
  const addProfTask = async () => {
    if (!newTask.text.trim() || !newTask.jobId) return;
    const job = jobs.find(j => j.id === newTask.jobId) || jobs[0]; if (!job) return;
    const t = { id: uid(), text: newTask.text.trim(), mode: "professional", jobId: job.id, jobLabel: jLabel(job), category: newTask.category, deadline: newTask.deadline || null, status: "open", followUp: false, followUpNote: "", subtasks: [], createdAt: nowISO(), completedAt: null, priority: newTask.priority || "medium", recurring: newTask.recurring || null };
    setTasks(ts => [...ts, t]); await sbUpsert("tasks", taskToRow(t));
    setNewTask(nt => ({ ...nt, text: "", deadline: "", recurring: "" })); setAddingTask(false);
  };
  const addPersonalTask = async () => {
    if (!newPersonalTask.text.trim()) return;
    const t = { id: uid(), text: newPersonalTask.text.trim(), mode: "personal", jobId: "personal", jobLabel: "Personal", category: newPersonalTask.category, deadline: newPersonalTask.deadline || null, status: "open", followUp: false, followUpNote: "", subtasks: [], createdAt: nowISO(), completedAt: null, priority: newPersonalTask.priority || "medium", recurring: null };
    setTasks(ts => [...ts, t]); await sbUpsert("tasks", taskToRow(t));
    setNewPersonalTask(nt => ({ ...nt, text: "", deadline: "" })); setAddingTask(false);
  };
  const toggle = async id => { const t = tasks.find(x => x.id === id); if (!t) return; const u = { ...t, status: t.status === "done" ? "open" : "done", completedAt: t.status !== "done" ? nowISO() : null }; setTasks(ts => ts.map(x => x.id === id ? u : x)); await sbUpsert("tasks", taskToRow(u)); };
  const toggleFU = async id => { const t = tasks.find(x => x.id === id); if (!t) return; const u = { ...t, followUp: !t.followUp }; setTasks(ts => ts.map(x => x.id === id ? u : x)); await sbUpsert("tasks", taskToRow(u)); };
  const resolveFU = async id => { const t = tasks.find(x => x.id === id); if (!t) return; const u = { ...t, followUp: false, followUpNote: "" }; setTasks(ts => ts.map(x => x.id === id ? u : x)); await sbUpsert("tasks", taskToRow(u)); };
  const setFUNote = async (id, note) => { const t = tasks.find(x => x.id === id); if (!t) return; const u = { ...t, followUpNote: note }; setTasks(ts => ts.map(x => x.id === id ? u : x)); await sbUpsert("tasks", taskToRow(u)); };
  const del = async id => { setTasks(ts => ts.filter(x => x.id !== id)); await sbDelete("tasks", id); setConfirmDelete(null); };
  const updateTask = async (id, patch) => { const t = tasks.find(x => x.id === id); if (!t) return; const u = { ...t, ...patch }; setTasks(ts => ts.map(x => x.id === id ? u : x)); await sbUpsert("tasks", taskToRow(u)); };

  // ── Jobs ──────────────────────────────────────────────────────
  const addJob = async () => {
    if (!newJobTitle.trim()) return;
    const j = { id: uid(), title: newJobTitle.trim(), number: newJobNumber.trim(), inactive: false };
    setJobs(js => [...js, j]); await sbUpsert("jobs", { id: j.id, title: j.title, number: j.number, inactive: false });
    if (!activeJob) { setActiveJob(j.id); await sbSetSetting("activeJob", j.id); setNewTask(nt => ({ ...nt, jobId: j.id })); setManualLogJob(j.id); }
    setNewJobTitle(""); setNewJobNumber(""); setShowAddJob(false);
  };
  const saveEditJob = async () => {
    if (!editingJob) return;
    const updated = jobs.map(j => j.id === editingJob.id ? { ...j, title: editingJob.title, number: editingJob.number } : j);
    setJobs(updated); await sbUpsert("jobs", { id: editingJob.id, title: editingJob.title, number: editingJob.number, inactive: editingJob.inactive || false });
    setTasks(ts => ts.map(t => t.jobId === editingJob.id ? { ...t, jobLabel: editingJob.number ? `#${editingJob.number} — ${editingJob.title}` : editingJob.title } : t));
    setEditingJob(null);
  };
  const toggleJobInactive = async id => {
    const j = jobs.find(x => x.id === id); if (!j) return;
    const updated = { ...j, inactive: !j.inactive };
    setJobs(js => js.map(x => x.id === id ? updated : x));
    await sbUpsert("jobs", { id: updated.id, title: updated.title, number: updated.number, inactive: updated.inactive });
  };
  const removeJob = async id => { setJobs(js => js.filter(j => j.id !== id)); await sbDelete("jobs", id); if (activeJob === id) { const next = jobs.find(j => j.id !== id); setActiveJob(next?.id || null); await sbSetSetting("activeJob", next?.id || null); } if (selectedJob === id) { setSelectedJob(null); setView("overview"); } };

  // ── Categories ────────────────────────────────────────────────
  const addCat = async (mode, cat) => { const t = cat.trim(); if (!t) return; if (mode === "professional") { const u = profCats.includes(t) ? profCats : [...profCats, t]; setProfCats(u); await sbSetSetting("profCats", u); } else { const u = persCats.includes(t) ? persCats : [...persCats, t]; setPersCats(u); await sbSetSetting("persCats", u); } };
  const removeCat = async (mode, cat) => { if (mode === "professional") { const u = profCats.filter(x => x !== cat); setProfCats(u); await sbSetSetting("profCats", u); } else { const u = persCats.filter(x => x !== cat); setPersCats(u); await sbSetSetting("persCats", u); } };

  // ── Report ────────────────────────────────────────────────────
  const fetchWeather = async jobLabel => {
    try {
      const resp = await askClaude(`Give me the current weather conditions for a construction job site in or near "${jobLabel}" in Canada. Include temperature in Celsius, conditions (sunny/cloudy/rain/snow etc), and wind. Format as one short line like: "12°C, Partly Cloudy, Wind 15 km/h NW". If you cannot determine the location respond with just "Weather unavailable". No other text.`);
      return resp.trim();
    } catch { return "Weather unavailable"; }
  };

  const generateReport = async () => {
    setView("report"); setLoadingReport(true);
    const selDate = new Date(reportDate + "T00:00:00").toDateString();
    const done = tasks.filter(t => t.completedAt && new Date(t.completedAt).toDateString() === selDate && t.mode === tab);
    const open = tasks.filter(t => t.status === "open" && t.mode === tab);
    const fu = tasks.filter(t => t.followUp && t.status !== "done" && t.mode === tab);
    const dayLogs = logs.filter(l => new Date(l.time).toDateString() === selDate && l.mode === tab);
    // Get weather for active job if professional
    let weatherStr = "";
    if (tab === "professional" && activeJob) {
      const job = jobs.find(j => j.id === activeJob);
      if (job) weatherStr = await fetchWeather(jLabel(job));
    }
    const r = await askClaude(`Professional end-of-day PM report for ${fmtDate(reportDate + "T00:00:00")}. Mode: ${tab}.${reportNotes ? `\nNOTES: ${reportNotes}` : ""}${weatherStr && weatherStr !== "Weather unavailable" ? `\nWEATHER: ${weatherStr}` : ""}
COMPLETED:\n${done.map(t=>`- [${t.jobLabel||t.jobId}][${t.category}][${t.priority}] ${t.text}`).join("\n")||"None"}
LOGS:\n${dayLogs.map(l=>`[${fmtTime(l.time)}][${l.jobLabel||l.jobId}]${l.type==="visitor"?" VISITOR:":""} ${l.text}`).join("\n")||"None"}
OPEN:\n${open.map(t=>`- [${t.jobLabel||t.jobId}][${t.category}]${t.deadline?` [Due: ${t.deadline}]`:""} ${t.text}`).join("\n")||"None"}
FOLLOW-UPS:\n${fu.map(t=>`- [${t.jobLabel||t.jobId}] ${t.text}${t.followUpNote?": "+t.followUpNote:""}`).join("\n")||"None"}
${weatherStr && weatherStr !== "Weather unavailable" ? `\nInclude weather conditions at the top of the report under the date.` : ""}
Sections: Completed Work (by job), In Progress (by job), Follow-Ups Required. No title. Professional. Markdown.`);
    setReport(r); setLoadingReport(false);
  };

  // ── Export ────────────────────────────────────────────────────
  const openExport = () => { setExportContent(buildExportHTML(tasks, logs, tab, jobs, reportNotes)); setShowExport(true); };
  const copyExport = () => {
    const cur = tasks.filter(t => t.mode === tab);
    const done = cur.filter(t => t.completedAt && new Date(t.completedAt).toDateString() === todayStr());
    const inProg = cur.filter(t => t.status === "open");
    const fu = cur.filter(t => t.followUp && t.status !== "done");
    const tLogs = logs.filter(l => new Date(l.time).toDateString() === todayStr() && l.mode === tab);
    const lines = [`DOCKET — ${fmtDate(nowISO()).toUpperCase()}`, reportNotes ? `Notes: ${reportNotes}` : "", "", "COMPLETED", ...done.map(t=>`  [${t.jobLabel}][${t.priority}] ${t.text}`), done.length===0?"  None":"", "", "IN PROGRESS", ...inProg.map(t=>`  [${t.jobLabel}][${t.priority}] ${t.text}`), inProg.length===0?"  None":"", "", "FOLLOW-UPS", ...fu.map(t=>`  [${t.jobLabel}] ${t.text}${t.followUpNote?" — "+t.followUpNote:""}`), fu.length===0?"  None":"", "", "ACTIVITY LOG", ...tLogs.map(l=>`  [${fmtTime(l.time)}][${l.jobLabel}]${l.type==="visitor"?" VISITOR:":""} ${l.text}`), tLogs.length===0?"  None":""];
    navigator.clipboard.writeText(lines.filter(Boolean).join("\n"));
  };
  const downloadHTML = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([exportContent],{type:"text/html"})); a.download = `Docket-${new Date().toISOString().slice(0,10)}.html`; a.click(); };

  // ── Timesheet (derived from daily log) ───────────────────────
  const formatDuration = min => { const h = Math.floor(min / 60); const m = min % 60; return h > 0 ? `${h}h ${m}m` : `${m}m`; };

  const generateTimesheet = async (date) => {
    setGeneratingTimesheet(true);
    const dayLogs = logs.filter(l => new Date(l.time).toDateString() === new Date(date + "T00:00:00").toDateString())
      .sort((a,b) => new Date(a.time) - new Date(b.time));
    if (!dayLogs.length) { setGeneratingTimesheet(false); return; }
    // Use AI to interpret the log and assign time blocks per job
    const resp = await askClaude(`You are a construction PM timesheet assistant. Based on these daily log entries, calculate how much time was spent on each job. Assume the work day runs from the first log entry to the last. Split time proportionally between jobs based on when entries were logged.

LOG ENTRIES:
${dayLogs.map(l => `[${fmtTime(l.time)}] [${l.jobLabel||"Unknown"}] ${l.text}`).join("\n")}

Return ONLY a JSON array of time blocks, no markdown:
[{"jobLabel":"Job Name","start":"09:00","end":"11:30","durationMin":150,"description":"Brief summary of work done"},...]
Cover the full day from first to last entry. If only one job, one block is fine.`);
    try {
      const blocks = JSON.parse(resp.replace(/```json|```/g,"").trim());
      const entries = blocks.map(b => ({ id: uid(), date, jobLabel: b.jobLabel, start: b.start, end: b.end, durationMin: b.durationMin, description: b.description }));
      const existing = timeEntries.filter(e => e.date !== date);
      const updated = [...existing, ...entries];
      setTimeEntries(updated);
      await sbSetSetting("timeEntries", updated);
    } catch {}
    setGeneratingTimesheet(false);
  };

  const saveTimeEntry = async (entry) => {
    const updated = timeEntries.map(e => e.id === entry.id ? entry : e);
    setTimeEntries(updated);
    await sbSetSetting("timeEntries", updated);
    setEditingTimeEntry(null);
  };

  const deleteTimeEntry = async id => {
    const updated = timeEntries.filter(e => e.id !== id);
    setTimeEntries(updated);
    await sbSetSetting("timeEntries", updated);
  };

  const addManualTimeEntry = async (date) => {
    const entry = { id: uid(), date, jobLabel: activeJobs[0]?.title || "", start: "09:00", end: "10:00", durationMin: 60, description: "" };
    const updated = [...timeEntries, entry];
    setTimeEntries(updated);
    await sbSetSetting("timeEntries", updated);
    setEditingTimeEntry(entry);
  };

  // ── Mileage ───────────────────────────────────────────────────
  const saveLocation = async () => {
    if (!newLocName.trim() || !newLocAddress.trim()) return;
    const loc = { id: uid(), name: newLocName.trim(), address: newLocAddress.trim() };
    const updated = [...savedLocations, loc];
    setSavedLocations(updated);
    await sbSetSetting("savedLocations", updated);
    // Auto-select into the field we were adding for
    if (addingLocation === "from") setMileageForm(f => ({ ...f, fromId: loc.id, km: null }));
    if (addingLocation === "to") setMileageForm(f => ({ ...f, toId: loc.id, km: null }));
    setNewLocName(""); setNewLocAddress(""); setAddingLocation(null);
  };

  const deleteLocation = async id => {
    const updated = savedLocations.filter(l => l.id !== id);
    setSavedLocations(updated);
    await sbSetSetting("savedLocations", updated);
  };

  const lookupKm = async () => {
    const from = savedLocations.find(l => l.id === mileageForm.fromId);
    const to = savedLocations.find(l => l.id === mileageForm.toId);
    if (!from || !to) return;
    setLookingUpKm(true);
    const resp = await askClaude(`You are a driving distance calculator. Give the one-way driving distance in kilometres between these two addresses in Canada:\nFROM: "${from.address}"\nTO: "${to.address}"\nRespond with ONLY a JSON object, no other text: {"km": 45}`);
    try {
      const parsed = JSON.parse(resp.replace(/```json|```/g,"").trim());
      setMileageForm(f => ({ ...f, km: parsed.km }));
    } catch { setMileageForm(f => ({ ...f, km: null })); }
    setLookingUpKm(false);
  };

  const saveMileage = async () => {
    const from = savedLocations.find(l => l.id === mileageForm.fromId);
    const to = savedLocations.find(l => l.id === mileageForm.toId);
    if (!from || !to || !mileageForm.km) return;
    const job = jobs.find(j => j.id === (mileageForm.jobId || activeJob));
    const entry = { id: uid(), from: from.name, fromAddress: from.address, to: to.name, toAddress: to.address, km: mileageForm.km, jobId: job?.id || activeJob, jobLabel: job ? jLabel(job) : "", date: mileageForm.date, notes: mileageForm.notes || "" };
    const updated = [...mileageEntries, entry];
    setMileageEntries(updated);
    await sbSetSetting("mileageEntries", updated);
    setMileageForm({ fromId: "", toId: "", jobId: "", date: new Date().toISOString().slice(0,10), notes: "", km: null });
  };

  const deleteMileageEntry = async id => {
    const updated = mileageEntries.filter(e => e.id !== id);
    setMileageEntries(updated);
    await sbSetSetting("mileageEntries", updated);
  };

  // ── Voice input ───────────────────────────────────────────────
  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input not supported in this browser. Try Chrome."); return; }
    const r = new SR();
    r.continuous = true; r.interimResults = true; r.lang = "en-CA";
    r.onresult = e => { let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; setVoiceTranscript(t); };
    r.onend = () => setIsRecording(false);
    recognitionRef.current = r;
    r.start(); setIsRecording(true);
  };

  const stopVoice = async () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsRecording(false);
    if (!voiceTranscript.trim()) return;
    // AI summarize the voice transcript into a clean log entry
    const summary = await askClaude(`You are a construction PM assistant. The following is a voice note recorded on a job site. Summarize it into a clear, concise professional log entry (2-4 sentences max). Remove filler words and false starts. Preserve all important details like names, quantities, locations, and decisions made.\n\nVOICE NOTE: "${voiceTranscript}"\n\nRespond with ONLY the cleaned summary, no preamble.`);
    setManualLogText(summary);
    setVoiceTranscript("");
    setShowManualLog(true);
  };

  // ── Logo ──────────────────────────────────────────────────────
  const handleLogoUpload = async e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => { const b64 = ev.target.result; setCompanyLogo(b64); await sbSetSetting("companyLogo", b64); };
    reader.readAsDataURL(file);
  };

  const removeLogo = async () => { setCompanyLogo(null); await sbSetSetting("companyLogo", null); };

  // ── Schedule ──────────────────────────────────────────────────
  const openSchedule = () => { setScheduleEdit({...schedule}); setShowSchedule(true); };
  const saveSchedule = async () => { setSchedule(scheduleEdit); await sbSetSetting("schedule", scheduleEdit); setShowSchedule(false); };
  const toggleDay = d => setScheduleEdit(s => ({...s, days: s.days.includes(d) ? s.days.filter(x=>x!==d) : [...s.days,d].sort()}));
  const schedLabel = () => { const days = schedule.days.map(d=>DAY_NAMES[d]).join(", "); const pad = n=>String(n).padStart(2,"0"); return `${days} · ${pad(schedule.startHour)}:${pad(schedule.startMin)}–${pad(schedule.endHour)}:${pad(schedule.endMin)} · every ${schedule.intervalMin}min`; };

  // ── Helpers ───────────────────────────────────────────────────
  const groupByJobCat = list => { const m={}; list.forEach(t=>{const k=t.jobId||"unknown"; if(!m[k])m[k]={}; if(!m[k][t.category])m[k][t.category]=[]; m[k][t.category].push(t);}); return m; };
  const groupByCat = list => { const m={}; list.forEach(t=>{if(!m[t.category])m[t.category]=[]; m[t.category].push(t);}); return m; };
  const jLabel = j => j.number ? `#${j.number} — ${j.title}` : j.title;
  const jobById = id => jobs.find(j => j.id === id);
  const activeJobs = jobs.filter(j => !j.inactive);
  const curTasks = tasks.filter(t => t.mode === tab);
  const fuTasks = curTasks.filter(t => t.followUp && t.status !== "done");
  const openCount = curTasks.filter(t => t.status === "open").length;
  const overdueCount = tasks.filter(t => t.status === "open" && t.deadline && new Date(t.deadline + "T00:00:00") < new Date()).length;

  if (loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#1a1a1a",color:"#555",fontFamily:"'Lato',sans-serif",fontSize:13,letterSpacing:"0.1em",textTransform:"uppercase"}}>Loading Docket…</div>;

  const navTo = v => { setView(v); setSidebarOpen(false); };

  return (
    <div style={S.root}>
      <style>{CSS}</style>

      {/* ── Mobile overlay ── */}
      {sidebarOpen && <div style={S.mobileOverlay} onClick={()=>setSidebarOpen(false)}/>}

      {/* ── Check-in modal ── */}
      {(prompt45 || loadingPrompt) && (
        <div style={S.overlay}>
          <div style={S.modal}>
            {(checkinStage==="input"||loadingPrompt)&&(<>
              <div style={S.modalTag}>SCHEDULED CHECK-IN</div>
              {loadingPrompt?<div style={S.muted}>Preparing…</div>:<p style={S.modalMsg}>{prompt45}</p>}
              <textarea style={S.textarea} rows={3} placeholder="What did you work on?" value={promptInput} onChange={e=>setPromptInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),submitCheckin())}/>
              <div style={S.row}><button style={S.btnPrimary} onClick={submitCheckin} disabled={checkinProcessing}>{checkinProcessing?"Analysing…":"Submit"}</button><button style={S.btnGhost} onClick={resetCheckin}>Dismiss</button></div>
            </>)}
            {checkinStage==="matching"&&(<><div style={S.modalTag}>SCHEDULED CHECK-IN</div><div style={S.muted}>Checking open tasks…</div></>)}
            {checkinStage==="confirm-existing"&&checkinMatched&&(<>
              <div style={S.modalTag}>STILL WORKING ON THIS?</div>
              <p style={{...S.modalMsg,marginBottom:6}}>Looks related to an open task:</p>
              <div style={S.matchBox}><div style={S.matchTaskText}>{checkinMatched.text}</div><div style={S.matchMeta}>{checkinMatched.category} · {checkinMatched.jobLabel}</div></div>
              <div style={S.row}><button style={S.btnPrimary} onClick={confirmExistingTask}>Yes, same task</button><button style={S.btnGhost} onClick={rejectExistingTask}>No, it's different</button></div>
            </>)}
            {checkinStage==="suggest-new"&&checkinSuggested&&(<>
              <div style={S.modalTag}>ADD AS NEW TASK?</div>
              <div style={S.matchBox}><div style={S.matchTaskText}>{checkinSuggested.text}</div><div style={S.matchMeta}>{checkinSuggested.category}</div></div>
              <div style={S.row}><button style={S.btnPrimary} onClick={acceptNewTask}>Add Task</button><button style={S.btnGhost} onClick={dismissNewTask}>Log Only</button></div>
            </>)}
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {confirmDelete && (
        <div style={S.overlay}>
          <div style={{...S.modal,maxWidth:360}}>
            <div style={S.modalTag}>CONFIRM DELETE</div>
            <p style={{...S.modalMsg,marginBottom:20}}>Delete "{confirmDelete.text}"? This cannot be undone.</p>
            <div style={S.row}><button style={{...S.btnPrimary,background:"#3a1a1a",borderColor:"#5a2a2a",color:"#cc8888"}} onClick={()=>del(confirmDelete.id)}>Delete</button><button style={S.btnGhost} onClick={()=>setConfirmDelete(null)}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* ── Manual log modal ── */}
      {showManualLog && (
        <div style={S.overlay}>
          <div style={S.modal}>
            <div style={S.modalTag}>ADD LOG ENTRY</div>
            <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
              <select style={S.fSelect} value={manualLogJob} onChange={e=>setManualLogJob(e.target.value)}>
                {activeJobs.map(j=><option key={j.id} value={j.id}>{jLabel(j)}</option>)}
              </select>
              <select style={S.fSelect} value={manualLogType} onChange={e=>setManualLogType(e.target.value)}>
                <option value="manual">General Note</option>
                <option value="visitor">Site Visitor / Inspector</option>
                <option value="checkin">Work Update</option>
              </select>
            </div>
            <div style={{position:"relative"}}>
              <textarea style={S.textarea} rows={3} placeholder={manualLogType==="visitor"?"Who visited and why…":"What happened / what did you work on…"} value={manualLogText} onChange={e=>setManualLogText(e.target.value)} autoFocus/>
              <button style={{position:"absolute",top:8,right:8,background:isRecording?"#3a1a1a":"#222",border:"1px solid "+(isRecording?"#c55":"#333"),color:isRecording?"#c55":"#888",borderRadius:2,padding:"4px 8px",cursor:"pointer",fontFamily:"inherit",fontSize:11}} onClick={isRecording?stopVoice:startVoice}>{isRecording?"⏹ Stop":"🎤 Voice"}</button>
            </div>
            {voiceTranscript&&<div style={{fontSize:11,color:"#666",marginTop:4,fontStyle:"italic"}}>Transcript: {voiceTranscript.slice(0,80)}…</div>}
            <div style={S.row}><button style={S.btnPrimary} onClick={submitManualLog}>Add to Log</button><button style={S.btnGhost} onClick={()=>{setShowManualLog(false);setManualLogText("");setVoiceTranscript("");}}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* ── Morning summary modal ── */}
      {showMorningSummary && (
        <div style={S.overlay}>
          <div style={{...S.modal,maxWidth:560}}>
            <div style={S.modalTag}>MORNING BRIEFING — {fmtDate(nowISO()).toUpperCase()}</div>
            {loadingMorning?<div style={S.muted}>Generating briefing…</div>:<div className="report-body" dangerouslySetInnerHTML={{__html:mdToHtml(morningSummary)}}/>}
            <div style={{...S.row,marginTop:20}}><button style={S.btnGhost} onClick={()=>setShowMorningSummary(false)}>Close</button></div>
          </div>
        </div>
      )}

      {/* ── Settings modal ── */}
      {showSettings && (
        <div style={S.overlay}>
          <div style={{...S.modal,maxWidth:420}}>
            <div style={S.modalTag}>SETTINGS</div>
            <div style={S.schRow}>
              <div style={S.schLabel}>Company Logo Watermark</div>
              <p style={{fontSize:11,color:"#666",marginBottom:8,lineHeight:1.6}}>Upload a logo to display as a subtle watermark on the dashboard background.</p>
              {companyLogo?(
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <img src={companyLogo} style={{height:40,opacity:0.7,borderRadius:2}} alt="logo"/>
                  <button style={S.btnGhost} onClick={removeLogo}>Remove</button>
                </div>
              ):(
                <label style={{...S.btnGhost,display:"inline-block",cursor:"pointer",marginBottom:8}}>
                  Upload Logo (PNG/SVG)
                  <input type="file" accept="image/*" style={{display:"none"}} onChange={handleLogoUpload}/>
                </label>
              )}
            </div>
            <div style={{...S.row,marginTop:8}}><button style={S.btnGhost} onClick={()=>setShowSettings(false)}>Close</button></div>
          </div>
        </div>
      )}

      {/* ── Schedule modal ── */}
      {showSchedule&&scheduleEdit&&(
        <div style={S.overlay}><div style={{...S.modal,maxWidth:420}}>
          <div style={S.modalTag}>EDIT SCHEDULE</div>
          <div style={S.schRow}><div style={S.schLabel}>Active Days</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{DAY_NAMES.map((d,i)=><button key={i} style={{...S.dayBtn,...(scheduleEdit.days.includes(i)?S.dayBtnOn:{})}} onClick={()=>toggleDay(i)}>{d}</button>)}</div></div>
          <div style={S.schRow}><div style={S.schLabel}>Start Time</div><div style={{display:"flex",gap:6,alignItems:"center"}}><input style={S.schNum} type="number" min={0} max={23} value={scheduleEdit.startHour} onChange={e=>setScheduleEdit(s=>({...s,startHour:+e.target.value}))}/><span style={S.schColon}>:</span><input style={S.schNum} type="number" min={0} max={59} value={scheduleEdit.startMin} onChange={e=>setScheduleEdit(s=>({...s,startMin:+e.target.value}))}/></div></div>
          <div style={S.schRow}><div style={S.schLabel}>End Time</div><div style={{display:"flex",gap:6,alignItems:"center"}}><input style={S.schNum} type="number" min={0} max={23} value={scheduleEdit.endHour} onChange={e=>setScheduleEdit(s=>({...s,endHour:+e.target.value}))}/><span style={S.schColon}>:</span><input style={S.schNum} type="number" min={0} max={59} value={scheduleEdit.endMin} onChange={e=>setScheduleEdit(s=>({...s,endMin:+e.target.value}))}/></div></div>
          <div style={S.schRow}><div style={S.schLabel}>Interval (minutes)</div><input style={S.schNum} type="number" min={10} max={120} value={scheduleEdit.intervalMin} onChange={e=>setScheduleEdit(s=>({...s,intervalMin:+e.target.value}))}/></div>
          <div style={{...S.row,marginTop:20}}><button style={S.btnPrimary} onClick={saveSchedule}>Save</button><button style={S.btnGhost} onClick={()=>setShowSchedule(false)}>Cancel</button></div>
        </div></div>
      )}

      {/* ── Export modal ── */}
      {showExport&&(
        <div style={S.overlay}><div style={{...S.modal,maxWidth:560}}>
          <div style={S.modalTag}>EXPORT</div>
          <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}><button style={S.btnPrimary} onClick={copyExport}>📋 Copy Text</button><button style={S.btnPrimary} onClick={downloadHTML}>⬇ Download HTML</button><button style={S.btnGhost} onClick={()=>setShowExport(false)}>Close</button></div>
          <div style={S.previewBox}><div style={S.previewLabel}>HTML SOURCE</div><textarea style={S.previewTA} value={exportContent} readOnly rows={8} onClick={e=>e.target.select()}/></div>
        </div></div>
      )}

      {/* ── Edit job modal ── */}
      {editingJob&&(
        <div style={S.overlay}><div style={{...S.modal,maxWidth:380}}>
          <div style={S.modalTag}>EDIT JOB</div>
          <input style={{...S.fInput,width:"100%",marginBottom:8}} placeholder="Job title…" value={editingJob.title} onChange={e=>setEditingJob(j=>({...j,title:e.target.value}))}/>
          <input style={{...S.fInput,width:"100%",marginBottom:16}} placeholder="Job number…" value={editingJob.number} onChange={e=>setEditingJob(j=>({...j,number:e.target.value}))}/>
          <div style={S.row}><button style={S.btnPrimary} onClick={saveEditJob}>Save</button><button style={S.btnGhost} onClick={()=>setEditingJob(null)}>Cancel</button></div>
        </div></div>
      )}

      {/* ── SIDEBAR ── */}
      <aside style={{...S.sidebar,...(sidebarOpen?S.sidebarOpen:{})}}>
        <div style={S.brand}>
          <div style={S.brandMark}>D</div>
          <div style={{flex:1}}><div style={S.brandName}>Docket</div><div style={S.brandSub}>Daily Task & Report Log</div></div>
          <button style={S.sideCloseBtn} onClick={()=>setSidebarOpen(false)}>✕</button>
        </div>

        {overdueCount > 0 && (
          <div style={S.overdueBar} onClick={()=>navTo("overview")}>
            ⚠ {overdueCount} overdue task{overdueCount>1?"s":""}
          </div>
        )}

        <div style={S.sideSection}>
          <div style={S.sideLabel}>MODE</div>
          {["professional","personal"].map(m=>(
            <button key={m} style={{...S.sideBtn,...(tab===m?S.sideBtnActive:{})}} onClick={()=>{setTab(m);navTo("dashboard");}}>
              <span style={S.icon}>{m==="professional"?"◈":"◇"}</span>{m.charAt(0).toUpperCase()+m.slice(1)}
              <span style={S.pill}>{tasks.filter(t=>t.mode===m&&t.status==="open").length}</span>
            </button>
          ))}
        </div>
        <div style={S.divider}/>

        <div style={S.sideSection}>
          <div style={S.sideLabel}>VIEWS</div>
          <button style={{...S.sideBtn,...(view==="dashboard"?S.sideBtnActive:{})}} onClick={()=>navTo("dashboard")}><span style={S.icon}>◉</span> Dashboard</button>
          <button style={{...S.sideBtn,...(view==="overview"?S.sideBtnActive:{})}} onClick={()=>navTo("overview")}><span style={S.icon}>⊞</span> All Tasks</button>
          {tab==="professional"&&activeJobs.length===0&&<div style={{padding:"6px 10px 4px",fontSize:11,color:"#444",fontStyle:"italic"}}>No active jobs</div>}
          {tab==="professional"&&activeJobs.map(j=>(
            <div key={j.id} style={{display:"flex",alignItems:"center"}}>
              <button style={{...S.sideBtn,flex:1,...(view==="job"&&selectedJob===j.id?S.sideBtnActive:{})}} onClick={()=>{setSelectedJob(j.id);navTo("job");}}>
                <span style={S.icon}>–</span>
                <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.number&&<span style={{color:"#666",marginRight:4}}>#{j.number}</span>}{j.title}</span>
                <span style={S.pill}>{tasks.filter(t=>t.jobId===j.id&&t.status==="open").length}</span>
              </button>
              <button style={S.jobMenuBtn} onClick={()=>setEditingJob({...j})} title="Edit">✎</button>
              <button style={S.jobMenuBtn} onClick={()=>toggleJobInactive(j.id)} title="Mark inactive">◎</button>
            </div>
          ))}
          {tab==="professional"&&jobs.filter(j=>j.inactive).length>0&&(
            <div style={{padding:"4px 10px"}}>
              <div style={{fontSize:9,color:"#444",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>Inactive</div>
              {jobs.filter(j=>j.inactive).map(j=>(
                <div key={j.id} style={{display:"flex",alignItems:"center",opacity:0.5}}>
                  <button style={{...S.sideBtn,flex:1,fontSize:11}} onClick={()=>{setSelectedJob(j.id);navTo("job");}}>
                    <span style={S.icon}>–</span>{j.title}
                  </button>
                  <button style={S.jobMenuBtn} onClick={()=>toggleJobInactive(j.id)} title="Reactivate">↩</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {tab==="professional"&&(
          <div style={S.jobInputRow}>
            {showAddJob?(
              <div style={{width:"100%",padding:"0 10px 8px"}}>
                <div style={{...S.sideLabel,marginBottom:8}}>ADD JOB</div>
                <input style={{...S.sideInput,width:"100%",marginBottom:5}} placeholder="Job title…" value={newJobTitle} onChange={e=>setNewJobTitle(e.target.value)} autoFocus/>
                <input style={{...S.sideInput,width:"100%",marginBottom:8}} placeholder="Job number (optional)…" value={newJobNumber} onChange={e=>setNewJobNumber(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addJob()}/>
                <div style={{display:"flex",gap:5}}><button style={{...S.btnPrimary,flex:1,fontSize:11,padding:"5px"}} onClick={addJob}>Add</button><button style={{...S.btnGhost,fontSize:11,padding:"5px 8px"}} onClick={()=>setShowAddJob(false)}>✕</button></div>
              </div>
            ):(
              <button style={{...S.sideBtn,color:"#555",paddingLeft:10}} onClick={()=>setShowAddJob(true)}><span style={S.icon}>+</span> Add job / site</button>
            )}
          </div>
        )}
        <div style={S.divider}/>

        <div style={S.sideSection}>
          <button style={{...S.sideBtn,...(view==="followups"?S.sideBtnActive:{})}} onClick={()=>navTo("followups")}><span style={S.icon}>⚑</span> Follow-Ups{fuTasks.length>0&&<span style={{...S.pill,background:"#3a3a3a",color:"#ddd"}}>{fuTasks.length}</span>}</button>
          <button style={{...S.sideBtn,...(view==="dailylog"?S.sideBtnActive:{})}} onClick={()=>navTo("dailylog")}><span style={S.icon}>◈</span> Daily Log{logs.filter(l=>new Date(l.time).toDateString()===todayStr()).length>0&&<span style={S.pill}>{logs.filter(l=>new Date(l.time).toDateString()===todayStr()).length}</span>}</button>
          <button style={{...S.sideBtn,...(view==="report"?S.sideBtnActive:{})}} onClick={()=>{setView("report");generateReport();setSidebarOpen(false);}}><span style={S.icon}>≡</span> Daily Report</button>
          <button style={{...S.sideBtn,...(view==="timesheet"?S.sideBtnActive:{})}} onClick={()=>navTo("timesheet")}><span style={S.icon}>◷</span> Timesheet</button>
          <button style={{...S.sideBtn,...(view==="mileage"?S.sideBtnActive:{})}} onClick={()=>navTo("mileage")}><span style={S.icon}>⊙</span> Mileage Log</button>
          <button style={{...S.sideBtn,...(view==="archive"?S.sideBtnActive:{})}} onClick={()=>navTo("archive")}><span style={S.icon}>◫</span> Archive{archive.length>0&&<span style={S.pill}>{archive.length}</span>}</button>
          <button style={S.sideBtn} onClick={openExport}><span style={S.icon}>↗</span> Export / Share</button>
          <button style={S.sideBtn} onClick={()=>setShowManualLog(true)}><span style={S.icon}>✎</span> Add Log Entry</button>
          <button style={S.sideBtn} onClick={()=>{generateMorningSummary();setSidebarOpen(false);}}><span style={S.icon}>☀</span> Morning Briefing</button>
          <button style={S.sideBtn} onClick={()=>setShowSettings(true)}><span style={S.icon}>⚙</span> Settings</button>
        </div>

        {tab==="professional"&&(<>
          <div style={S.divider}/>
          <div style={S.sideSection}>
            <div style={S.sideLabel}>ACTIVE JOB</div>
            {activeJobs.length===0?<div style={{fontSize:11,color:"#444",fontStyle:"italic",padding:"4px 0 8px"}}>Add a job first</div>:(
              <select style={S.sideSelect} value={activeJob||""} onChange={async e=>{setActiveJob(e.target.value);await sbSetSetting("activeJob",e.target.value);}}>
                {activeJobs.map(j=><option key={j.id} value={j.id}>{j.number?`#${j.number} — ${j.title}`:j.title}</option>)}
              </select>
            )}
            <div style={S.scheduleBox}>
              <div style={S.schedStatus}><span style={{...S.schedDot,background:withinSchedule?"#6a6":"#555"}}/>{withinSchedule?`Next: ${nextCheckin}`:"Outside schedule"}</div>
              <div style={S.schedDetail}>{schedLabel()}</div>
              <button style={S.schedEditBtn} onClick={openSchedule}>Edit Schedule</button>
            </div>
          </div>
        </>)}
      </aside>

      {/* ── MAIN ── */}
      <main style={S.main}>
        {/* Mobile topbar */}
        <div style={S.mobileTopBar}>
          <button style={S.hamburger} onClick={()=>setSidebarOpen(true)}>☰</button>
          <span style={S.mobileBrand}>Docket</span>
          <button style={S.mobileLogBtn} onClick={()=>setShowManualLog(true)}>+ Log</button>
        </div>

        <div style={S.topBar}>
          <div style={S.topTitle}>
            {view==="dashboard"&&"Dashboard"}
            {view==="overview"&&(tab==="professional"?"All Professional Tasks":"All Personal Tasks")}
            {view==="job"&&selectedJob&&(()=>{const j=jobById(selectedJob);return j?jLabel(j):selectedJob;})()}
            {view==="followups"&&"Follow-Ups"}
            {view==="dailylog"&&"Daily Log"}
            {view==="report"&&"Daily Report"}
            {view==="timesheet"&&"Timesheet"}
            {view==="mileage"&&"Mileage Log"}
            {view==="archive"&&"Archive"}
          </div>
          <div style={S.topRight}>
            {view!=="report"&&<span style={S.openBadge}>{openCount} open{overdueCount>0&&<span style={{color:"#c55",marginLeft:6}}>· {overdueCount} overdue</span>}</span>}
            <button style={S.btnGhost} onClick={openExport}>↗</button>
            <button style={S.btnPrimary} onClick={()=>setAddingTask(a=>!a)}>{addingTask?"✕ Cancel":"+ Task"}</button>
          </div>
        </div>

        {addingTask&&(
          <div style={S.formBar}>
            {tab==="professional"?(
              <>
                {activeJobs.length===0?<div style={S.noJobsMsg}>Add a job first.</div>:(<>
                  <div style={S.formRow}>
                    <label style={S.formLabel}>Job</label>
                    <select style={S.fSelect} value={newTask.jobId} onChange={e=>setNewTask(t=>({...t,jobId:e.target.value}))}>
                      {activeJobs.map(j=><option key={j.id} value={j.id}>{j.number?`#${j.number} — ${j.title}`:j.title}</option>)}
                    </select>
                    <label style={S.formLabel}>Category</label>
                    <EditableSelect value={newTask.category} options={profCats} onChange={v=>setNewTask(t=>({...t,category:v}))} onAdd={v=>addCat("professional",v)} onRemove={v=>removeCat("professional",v)}/>
                    <label style={S.formLabel}>Priority</label>
                    <select style={S.fSelect} value={newTask.priority} onChange={e=>setNewTask(t=>({...t,priority:e.target.value}))}>
                      <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                    </select>
                    <label style={S.formLabel}>Deadline</label>
                    <input type="date" style={S.fSelect} value={newTask.deadline} onChange={e=>setNewTask(t=>({...t,deadline:e.target.value}))}/>
                    <label style={S.formLabel}>Recurring</label>
                    <select style={S.fSelect} value={newTask.recurring||""} onChange={e=>setNewTask(t=>({...t,recurring:e.target.value||null}))}>
                      <option value="">None</option><option value="daily">Daily</option><option value="weekly">Weekly</option>
                    </select>
                  </div>
                  <div style={S.formRow}>
                    <input style={S.fInput} placeholder="Task description…" value={newTask.text} onChange={e=>setNewTask(t=>({...t,text:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addProfTask()} autoFocus/>
                    <button style={S.btnPrimary} onClick={addProfTask}>Add Task</button>
                  </div>
                </>)}
              </>
            ):(
              <div style={S.formRow}>
                <label style={S.formLabel}>Category</label>
                <EditableSelect value={newPersonalTask.category} options={persCats} onChange={v=>setNewPersonalTask(t=>({...t,category:v}))} onAdd={v=>addCat("personal",v)} onRemove={v=>removeCat("personal",v)}/>
                <label style={S.formLabel}>Priority</label>
                <select style={S.fSelect} value={newPersonalTask.priority} onChange={e=>setNewPersonalTask(t=>({...t,priority:e.target.value}))}>
                  <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                </select>
                <label style={S.formLabel}>Deadline</label>
                <input type="date" style={S.fSelect} value={newPersonalTask.deadline} onChange={e=>setNewPersonalTask(t=>({...t,deadline:e.target.value}))}/>
                <input style={S.fInput} placeholder="Task description…" value={newPersonalTask.text} onChange={e=>setNewPersonalTask(t=>({...t,text:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addPersonalTask()} autoFocus/>
                <button style={S.btnPrimary} onClick={addPersonalTask}>Add Task</button>
              </div>
            )}
          </div>
        )}

        <div style={S.content}>

          {/* DASHBOARD */}
          {view==="dashboard"&&(()=>{
            const profOpen = tasks.filter(t=>t.mode==="professional"&&t.status==="open");
            const persOpen = tasks.filter(t=>t.mode==="personal"&&t.status==="open");
            const overdue = tasks.filter(t=>t.status==="open"&&t.deadline&&new Date(t.deadline+"T00:00:00")<new Date());
            const dueToday = tasks.filter(t=>t.status==="open"&&t.deadline&&new Date(t.deadline+"T00:00:00").toDateString()===todayStr());
            const todayDone = tasks.filter(t=>t.completedAt&&new Date(t.completedAt).toDateString()===todayStr());
            const allFU = tasks.filter(t=>t.followUp&&t.status!=="done");
            return(
              <div style={{...S.dashWrap,position:"relative",overflow:"hidden"}}>
                {companyLogo&&<img src={companyLogo} style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",maxWidth:"60%",maxHeight:"60%",opacity:0.04,pointerEvents:"none",userSelect:"none"}} alt=""/>}
                <div style={S.dashGrid}>
                  <div style={{...S.dashCard,cursor:"pointer"}} onClick={()=>navTo("overview")}><div style={S.dashNum}>{profOpen.length}</div><div style={S.dashLabel}>Professional Open</div></div>
                  <div style={{...S.dashCard,cursor:"pointer"}} onClick={()=>navTo("overview")}><div style={S.dashNum}>{persOpen.length}</div><div style={S.dashLabel}>Personal Open</div></div>
                  <div style={{...S.dashCard,cursor:"pointer",borderColor:overdue.length>0?"#c55":"#1e1e1e"}} onClick={()=>navTo("overview")}><div style={{...S.dashNum,color:overdue.length>0?"#c55":"inherit"}}>{overdue.length}</div><div style={S.dashLabel}>Overdue</div></div>
                  <div style={{...S.dashCard,cursor:"pointer"}} onClick={()=>navTo("overview")}><div style={{...S.dashNum,color:"#c8a84b"}}>{dueToday.length}</div><div style={S.dashLabel}>Due Today</div></div>
                  <div style={S.dashCard}><div style={{...S.dashNum,color:"#6a6"}}>{todayDone.length}</div><div style={S.dashLabel}>Completed Today</div></div>
                  <div style={{...S.dashCard,cursor:"pointer"}} onClick={()=>navTo("followups")}><div style={S.dashNum}>{allFU.length}</div><div style={S.dashLabel}>Follow-Ups</div></div>
                </div>

                {tab==="professional"&&activeJobs.length>0&&(
                  <div style={S.dashSection}>
                    <div style={S.dashSectionTitle}>Jobs at a Glance</div>
                    {activeJobs.map(j=>{
                      const jOpen = tasks.filter(t=>t.jobId===j.id&&t.status==="open");
                      const jOverdue = jOpen.filter(t=>t.deadline&&new Date(t.deadline+"T00:00:00")<new Date());
                      const jFU = tasks.filter(t=>t.jobId===j.id&&t.followUp&&t.status!=="done");
                      const jDone = tasks.filter(t=>t.jobId===j.id&&t.completedAt&&new Date(t.completedAt).toDateString()===todayStr());
                      return(
                        <div key={j.id} style={S.dashJobRow} onClick={()=>{setSelectedJob(j.id);navTo("job");}}>
                          <div style={{flex:1}}><div style={S.dashJobTitle}>{jLabel(j)}</div></div>
                          <div style={S.dashJobStats}>
                            <span style={S.dashStat}>{jOpen.length} open</span>
                            {jOverdue.length>0&&<span style={{...S.dashStat,color:"#c55"}}>{jOverdue.length} overdue</span>}
                            {jFU.length>0&&<span style={{...S.dashStat,color:"#aaa"}}>{jFU.length} follow-up</span>}
                            {jDone.length>0&&<span style={{...S.dashStat,color:"#6a6"}}>{jDone.length} done today</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {(overdue.length>0||dueToday.length>0)&&(
                  <div style={S.dashSection}>
                    <div style={S.dashSectionTitle}>Needs Attention</div>
                    {[...overdue,...dueToday.filter(t=>!overdue.find(o=>o.id===t.id))].slice(0,8).map(t=>(
                      <div key={t.id} style={S.dashAlertRow}>
                        <span style={{...S.priorityDot,background:PRIORITIES[t.priority||"medium"].color}}/>
                        <span style={{flex:1,fontSize:12,color:"#bbb"}}>{t.text}</span>
                        <span style={{fontSize:10,color:overdue.find(o=>o.id===t.id)?"#c55":"#c8a84b"}}>
                          {overdue.find(o=>o.id===t.id)?"overdue":"today"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{display:"flex",gap:10,marginTop:8,flexWrap:"wrap"}}>
                  <button style={S.btnPrimary} onClick={()=>{generateMorningSummary();}}>☀ Morning Briefing</button>
                  <button style={S.btnGhost} onClick={()=>setShowManualLog(true)}>✎ Add Log Entry</button>
                  <button style={S.btnGhost} onClick={()=>{setView("report");generateReport();}}>≡ Daily Report</button>
                </div>
              </div>
            );
          })()}

          {/* OVERVIEW */}
          {view==="overview"&&(()=>{
            const grouped=groupByJobCat(curTasks);
            const jKeys=tab==="professional"?activeJobs.filter(j=>grouped[j.id]).map(j=>j.id):(grouped["personal"]?["personal"]:[]);
            if(!jKeys.length) return <Empty/>;
            return jKeys.map(jid=>{
              const job=jobById(jid);
              const label=job?jLabel(job):(jid==="personal"?"Personal":jid);
              const openN=curTasks.filter(t=>t.jobId===jid&&t.status==="open").length;
              const doneN=curTasks.filter(t=>t.jobId===jid&&t.status==="done").length;
              return(<div key={jid} style={S.jobBlock}><div style={S.jobHead}><span style={S.jobHeadTitle}>{label}</span><span style={S.jobHeadMeta}>{openN} open · {doneN} done</span></div>
                {grouped[jid]&&Object.entries(grouped[jid]).map(([cat,list])=>(
                  <div key={cat} style={S.catBlock}><div style={S.catHead}>{cat}</div>
                    {list.sort((a,b)=>{ const po={high:0,medium:1,low:2}; return (po[a.priority||"medium"]||1)-(po[b.priority||"medium"]||1); }).map(t=><TaskRow key={t.id} task={t} onToggle={()=>toggle(t.id)} onFU={()=>toggleFU(t.id)} onResolveFU={()=>resolveFU(t.id)} onFUNote={n=>setFUNote(t.id,n)} onDel={()=>setConfirmDelete(t)} onUpdate={patch=>updateTask(t.id,patch)}/>)}
                  </div>
                ))}
              </div>);
            });
          })()}

          {/* JOB VIEW */}
          {view==="job"&&selectedJob&&(()=>{
            const jobTasks=curTasks.filter(t=>t.jobId===selectedJob);
            if(!jobTasks.length) return <Empty/>;
            return Object.entries(groupByCat(jobTasks)).map(([cat,list])=>(
              <div key={cat} style={S.jobBlock}><div style={S.catHead}>{cat}</div>
                {list.sort((a,b)=>{ const po={high:0,medium:1,low:2}; return (po[a.priority||"medium"]||1)-(po[b.priority||"medium"]||1); }).map(t=><TaskRow key={t.id} task={t} onToggle={()=>toggle(t.id)} onFU={()=>toggleFU(t.id)} onResolveFU={()=>resolveFU(t.id)} onFUNote={n=>setFUNote(t.id,n)} onDel={()=>setConfirmDelete(t)} onUpdate={patch=>updateTask(t.id,patch)}/>)}
              </div>
            ));
          })()}

          {/* FOLLOW-UPS */}
          {view==="followups"&&(fuTasks.length===0?<Empty msg="No pending follow-ups."/>:(()=>{
            const grouped=groupByJobCat(fuTasks);
            const jKeys=tab==="professional"?activeJobs.filter(j=>grouped[j.id]).map(j=>j.id):(grouped["personal"]?["personal"]:[]);
            return jKeys.map(jid=>{
              const job=jobById(jid); const label=job?jLabel(job):"Personal";
              return(<div key={jid} style={S.jobBlock}><div style={S.jobHead}><span style={S.jobHeadTitle}>{label}</span></div>
                {grouped[jid]&&Object.entries(grouped[jid]).map(([cat,list])=>(
                  <div key={cat} style={S.catBlock}><div style={S.catHead}>{cat}</div>
                    {list.map(t=>(<div key={t.id} style={{...S.taskRow,borderLeft:"2px solid #555"}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{...S.priorityDot,background:PRIORITIES[t.priority||"medium"].color}}/><div style={S.taskText}>{t.text}</div></div>
                        {t.followUpNote&&<div style={S.fuNoteText}>{t.followUpNote}</div>}
                        <div style={S.taskMeta}>Added {fmtDate(t.createdAt)}</div>
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        <button style={S.btnGhost} onClick={()=>resolveFU(t.id)}>Resolve</button>
                        <button style={S.btnGhost} onClick={()=>toggle(t.id)}>Done</button>
                      </div>
                    </div>))}
                  </div>
                ))}
              </div>);
            });
          })())}

          {/* REPORT */}
          {view==="report"&&(
            <div style={S.reportWrap}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <input type="date" style={{...S.fSelect,fontSize:11}} value={reportDate} onChange={e=>{setReportDate(e.target.value);}}/>
                  <button style={S.btnGhost} onClick={generateReport}>Load</button>
                </div>
                <button style={S.btnGhost} onClick={openExport}>↗ Export</button>
              </div>
              <textarea style={{...S.fInput,width:"100%",marginBottom:16,fontSize:12}} placeholder="Add report notes (optional — appears at top of export)…" value={reportNotes} onChange={e=>setReportNotes(e.target.value)} rows={2}/>
              {loadingReport?<div style={S.muted}>Generating report…</div>:<div className="report-body" dangerouslySetInnerHTML={{__html:mdToHtml(report)}}/>}
              {!loadingReport&&<button style={{...S.btnGhost,marginTop:24}} onClick={generateReport}>↻ Regenerate</button>}
            </div>
          )}

          {/* DAILY LOG */}
          {view==="dailylog"&&(()=>{
            const todayLogs = logs.filter(l => new Date(l.time).toDateString() === todayStr()).sort((a,b)=>new Date(b.time)-new Date(a.time));
            const typeIcon = t => ({ checkin:"◈", manual:"✎", visitor:"👤", "":"◈" })[t]||"◈";
            const typeLabel = t => ({ checkin:"Check-in", manual:"Note", visitor:"Visitor", "":"Entry" })[t]||"Entry";
            return(
              <div style={S.reportWrap}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                  <div style={{fontSize:11,color:"#555"}}>{fmtDate(nowISO())}</div>
                  <button style={S.btnPrimary} onClick={()=>setShowManualLog(true)}>+ Add Entry</button>
                </div>
                {todayLogs.length===0?(
                  <div style={S.empty}>No entries yet today.<br/><br/><button style={S.btnGhost} onClick={()=>setShowManualLog(true)}>Add your first entry</button></div>
                ):(
                  <div>
                    {todayLogs.map(l=>(
                      <div key={l.id} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:"1px solid #191919"}}>
                        <div style={{fontSize:10,color:"#555",fontFamily:"monospace",whiteSpace:"nowrap",paddingTop:2,minWidth:42}}>{fmtTime(l.time)}</div>
                        <div style={{flex:1}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                            <span style={{fontSize:10,color:"#444"}}>{typeIcon(l.type)}</span>
                            <span style={{fontSize:9,color:"#555",letterSpacing:"0.08em",textTransform:"uppercase"}}>{typeLabel(l.type)}</span>
                            {l.jobLabel&&<span style={{fontSize:9,color:"#444"}}>· {l.jobLabel}</span>}
                          </div>
                          <div style={{fontSize:13,color:"#c0c0c0",lineHeight:1.5}}>{l.text}</div>
                        </div>
                        <button style={{...S.iconBtn,color:"#2a2a2a",flexShrink:0}} onClick={async()=>{
                          const updated = logs.filter(x=>x.id!==l.id);
                          setLogs(updated);
                          await sbDelete("logs", l.id);
                        }}>✕</button>
                      </div>
                    ))}
                    <div style={{marginTop:16,fontSize:11,color:"#444",textAlign:"right"}}>{todayLogs.length} entr{todayLogs.length===1?"y":"ies"} today</div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* TIMESHEET */}
          {view==="timesheet"&&(()=>{
            const dateEntries = timeEntries.filter(e => e.date === timesheetDate).sort((a,b)=>a.start.localeCompare(b.start));
            const totalMin = dateEntries.reduce((a,e)=>a+e.durationMin,0);
            const byJob = {};
            dateEntries.forEach(e=>{ if(!byJob[e.jobLabel])byJob[e.jobLabel]=0; byJob[e.jobLabel]+=e.durationMin; });
            const dayLogs = logs.filter(l => new Date(l.time).toDateString() === new Date(timesheetDate+"T00:00:00").toDateString());
            return(
              <div style={S.reportWrap}>
                {/* Date selector + generate */}
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
                  <input type="date" style={S.fSelect} value={timesheetDate} onChange={e=>setTimesheetDate(e.target.value)}/>
                  <button style={S.btnPrimary} onClick={()=>generateTimesheet(timesheetDate)} disabled={generatingTimesheet||!dayLogs.length}>
                    {generatingTimesheet?"Generating…":"◷ Generate from Log"}
                  </button>
                  <button style={S.btnGhost} onClick={()=>addManualTimeEntry(timesheetDate)}>+ Add Entry</button>
                  {!dayLogs.length&&<span style={{fontSize:11,color:"#555"}}>No log entries for this date</span>}
                </div>

                {/* Edit modal */}
                {editingTimeEntry&&(
                  <div style={{background:"#161616",border:"1px solid #2a2a2a",borderRadius:4,padding:"14px",marginBottom:14}}>
                    <div style={{fontSize:9,color:"#555",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:10}}>EDIT ENTRY</div>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
                      <input style={{...S.fInput,minWidth:140}} placeholder="Job…" value={editingTimeEntry.jobLabel} onChange={e=>setEditingTimeEntry(t=>({...t,jobLabel:e.target.value}))}/>
                      <input style={{...S.fSelect,width:80}} type="time" value={editingTimeEntry.start} onChange={e=>{ const s=e.target.value; const [sh,sm]=s.split(":").map(Number); const [eh,em]=editingTimeEntry.end.split(":").map(Number); const dur=(eh*60+em)-(sh*60+sm); setEditingTimeEntry(t=>({...t,start:s,durationMin:Math.max(0,dur)})); }}/>
                      <input style={{...S.fSelect,width:80}} type="time" value={editingTimeEntry.end} onChange={e=>{ const en=e.target.value; const [sh,sm]=editingTimeEntry.start.split(":").map(Number); const [eh,em]=en.split(":").map(Number); const dur=(eh*60+em)-(sh*60+sm); setEditingTimeEntry(t=>({...t,end:en,durationMin:Math.max(0,dur)})); }}/>
                    </div>
                    <input style={{...S.fInput,width:"100%",marginBottom:8}} placeholder="Description…" value={editingTimeEntry.description} onChange={e=>setEditingTimeEntry(t=>({...t,description:e.target.value}))}/>
                    <div style={{display:"flex",gap:6}}><button style={S.btnPrimary} onClick={()=>saveTimeEntry(editingTimeEntry)}>Save</button><button style={S.btnGhost} onClick={()=>setEditingTimeEntry(null)}>Cancel</button></div>
                  </div>
                )}

                {/* Day breakdown */}
                {dateEntries.length===0?(
                  <div style={S.empty}>No timesheet for this date yet.{dayLogs.length>0?<><br/><br/><button style={S.btnGhost} onClick={()=>generateTimesheet(timesheetDate)}>Generate from {dayLogs.length} log entries</button></>:" Add entries or log activity first."}</div>
                ):(
                  <>
                    <div style={S.dashSectionTitle}>Time Blocks — {new Date(timesheetDate+"T00:00:00").toLocaleDateString([],{weekday:"long",month:"short",day:"numeric"})}</div>
                    {dateEntries.map(e=>(
                      <div key={e.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"8px 0",borderBottom:"1px solid #191919"}}>
                        <div style={{flex:1}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                            <span style={{fontSize:12,color:"#c0c0c0",fontWeight:600}}>{e.jobLabel}</span>
                            <span style={{fontSize:10,color:"#555",fontFamily:"monospace"}}>{e.start} – {e.end}</span>
                            <span style={{fontSize:10,color:"#c8a84b",fontFamily:"monospace"}}>{formatDuration(e.durationMin)}</span>
                          </div>
                          {e.description&&<div style={{fontSize:11,color:"#888"}}>{e.description}</div>}
                        </div>
                        <button style={{...S.iconBtn,color:"#555"}} onClick={()=>setEditingTimeEntry({...e})}>✎</button>
                        <button style={{...S.iconBtn,color:"#3a3a3a"}} onClick={()=>deleteTimeEntry(e.id)}>✕</button>
                      </div>
                    ))}

                    {/* Totals */}
                    <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #2a2a2a"}}>
                      <div style={S.dashSectionTitle}>Breakdown by Job</div>
                      {Object.entries(byJob).map(([job,min])=>(
                        <div key={job} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",fontSize:12}}>
                          <span style={{color:"#bbb"}}>{job}</span>
                          <span style={{color:"#888",fontFamily:"monospace"}}>{formatDuration(min)}</span>
                        </div>
                      ))}
                      <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",marginTop:4,borderTop:"1px solid #1e1e1e"}}>
                        <span style={{fontSize:11,color:"#666",letterSpacing:"0.06em",textTransform:"uppercase"}}>Total</span>
                        <span style={{color:"#c8a84b",fontFamily:"monospace",fontSize:14}}>{formatDuration(totalMin)}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* MILEAGE */}
          {view==="mileage"&&(()=>{
            const totalKm = mileageEntries.reduce((a,e)=>a+(e.km||0),0);
            const byJob = {};
            mileageEntries.forEach(e=>{ if(!byJob[e.jobLabel])byJob[e.jobLabel]=0; byJob[e.jobLabel]+=(e.km||0); });
            const fromLoc = savedLocations.find(l=>l.id===mileageForm.fromId);
            const toLoc = savedLocations.find(l=>l.id===mileageForm.toId);
            return(
              <div style={S.reportWrap}>
                {/* Log a trip */}
                <div style={{background:"#161616",border:"1px solid #1e1e1e",borderRadius:6,padding:"16px",marginBottom:16}}>
                  <div style={{fontSize:9,color:"#555",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12}}>Log a Trip</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
                    {/* FROM */}
                    <div style={{flex:1,minWidth:140}}>
                      <div style={{fontSize:9,color:"#555",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4}}>From</div>
                      <select style={{...S.fSelect,width:"100%"}} value={mileageForm.fromId} onChange={e=>{
                        if(e.target.value==="__add__"){setAddingLocation("from");}
                        else setMileageForm(f=>({...f,fromId:e.target.value,km:null}));
                      }}>
                        <option value="">Select location…</option>
                        {savedLocations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                        <option value="__add__">+ Add new location…</option>
                      </select>
                    </div>
                    {/* TO */}
                    <div style={{flex:1,minWidth:140}}>
                      <div style={{fontSize:9,color:"#555",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4}}>To</div>
                      <select style={{...S.fSelect,width:"100%"}} value={mileageForm.toId} onChange={e=>{
                        if(e.target.value==="__add__"){setAddingLocation("to");}
                        else setMileageForm(f=>({...f,toId:e.target.value,km:null}));
                      }}>
                        <option value="">Select location…</option>
                        {savedLocations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                        <option value="__add__">+ Add new location…</option>
                      </select>
                    </div>
                  </div>

                  {/* Add location inline form */}
                  {addingLocation&&(
                    <div style={{background:"#111",border:"1px solid #2a2a2a",borderRadius:4,padding:"12px",marginBottom:10}}>
                      <div style={{fontSize:9,color:"#555",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8}}>ADD LOCATION</div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                        <input style={{...S.fInput,minWidth:130}} placeholder="Location name (e.g. Office, Site A)…" value={newLocName} onChange={e=>setNewLocName(e.target.value)} autoFocus/>
                        <input style={{...S.fInput,flex:2,minWidth:200}} placeholder="Full address (e.g. 123 Main St, Winnipeg, MB)…" value={newLocAddress} onChange={e=>setNewLocAddress(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveLocation()}/>
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        <button style={S.btnPrimary} onClick={saveLocation}>Save Location</button>
                        <button style={S.btnGhost} onClick={()=>{setAddingLocation(null);setNewLocName("");setNewLocAddress("");}}>Cancel</button>
                      </div>
                    </div>
                  )}

                  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}>
                    <select style={S.fSelect} value={mileageForm.jobId||activeJob||""} onChange={e=>setMileageForm(f=>({...f,jobId:e.target.value}))}>
                      {activeJobs.map(j=><option key={j.id} value={j.id}>{jLabel(j)}</option>)}
                    </select>
                    <input type="date" style={S.fSelect} value={mileageForm.date} onChange={e=>setMileageForm(f=>({...f,date:e.target.value}))}/>
                    <input style={{...S.fSelect,width:80}} type="number" placeholder="km" value={mileageForm.km||""} onChange={e=>setMileageForm(f=>({...f,km:+e.target.value}))}/>
                    <button style={S.btnGhost} onClick={lookupKm} disabled={!mileageForm.fromId||!mileageForm.toId||lookingUpKm}>
                      {lookingUpKm?"Looking up…":"⊙ Get km"}
                    </button>
                  </div>
                  {fromLoc&&toLoc&&mileageForm.km&&<div style={{fontSize:11,color:"#6a6",marginBottom:8}}>✓ {fromLoc.name} → {toLoc.name}: {mileageForm.km} km</div>}
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <input style={S.fInput} placeholder="Notes (optional)…" value={mileageForm.notes} onChange={e=>setMileageForm(f=>({...f,notes:e.target.value}))}/>
                    <button style={S.btnPrimary} onClick={saveMileage} disabled={!mileageForm.km||!mileageForm.fromId||!mileageForm.toId}>Save Trip</button>
                  </div>
                </div>

                {/* Saved locations manager */}
                {savedLocations.length>0&&(
                  <div style={{marginBottom:16}}>
                    <div style={S.dashSectionTitle}>Saved Locations</div>
                    {savedLocations.map(l=>(
                      <div key={l.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid #191919"}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:12,color:"#c0c0c0"}}>{l.name}</div>
                          <div style={{fontSize:10,color:"#555"}}>{l.address}</div>
                        </div>
                        <button style={{...S.iconBtn,color:"#444"}} onClick={()=>deleteLocation(l.id)}>✕</button>
                      </div>
                    ))}
                    <button style={{...S.metaLink,marginTop:8,display:"block",fontSize:11}} onClick={()=>setAddingLocation("from")}>+ Add location</button>
                  </div>
                )}
                {savedLocations.length===0&&!addingLocation&&(
                  <div style={{marginBottom:16}}>
                    <button style={S.btnGhost} onClick={()=>setAddingLocation("from")}>+ Add your first location</button>
                  </div>
                )}

                {/* Totals by job */}
                {Object.keys(byJob).length>0&&(
                  <div style={{marginBottom:16}}>
                    <div style={S.dashSectionTitle}>Total km by Job</div>
                    {Object.entries(byJob).map(([job,km])=>(
                      <div key={job} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #191919",fontSize:13}}>
                        <span style={{color:"#bbb"}}>{job}</span>
                        <span style={{color:"#888",fontFamily:"monospace"}}>{km} km</span>
                      </div>
                    ))}
                    <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",fontSize:13}}>
                      <span style={{color:"#666",fontSize:11,letterSpacing:"0.06em",textTransform:"uppercase"}}>Total</span>
                      <span style={{color:"#c8a84b",fontFamily:"monospace"}}>{totalKm} km</span>
                    </div>
                  </div>
                )}

                {/* Trip log */}
                <div style={S.dashSectionTitle}>Trip Log</div>
                {mileageEntries.length===0?<div style={S.empty}>No trips logged yet.</div>:
                  [...mileageEntries].reverse().map(e=>(
                    <div key={e.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid #191919"}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:12,color:"#c0c0c0"}}>{e.from} → {e.to}</div>
                        <div style={{fontSize:10,color:"#555"}}>{e.jobLabel} · {e.date}{e.notes?` · ${e.notes}`:""}</div>
                      </div>
                      <span style={{fontFamily:"monospace",fontSize:12,color:"#888"}}>{e.km} km</span>
                      <button style={{...S.iconBtn,color:"#444"}} onClick={()=>deleteMileageEntry(e.id)}>✕</button>
                    </div>
                  ))
                }
              </div>
            );
          })()}

          {/* ARCHIVE */}
          {view==="archive"&&(()=>{
            const filtered=archive.filter(t=>archiveFilter==="all"||t.mode===archiveFilter);
            const byJob={};
            filtered.forEach(t=>{const k=t.jobLabel||t.jobId||"Personal"; if(!byJob[k])byJob[k]=[]; byJob[k].push(t);});
            return(
              <div style={S.reportWrap}>
                <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
                  {["all","professional","personal"].map(f=>(
                    <button key={f} style={{...S.btnGhost,fontSize:11,padding:"4px 12px",...(archiveFilter===f?{background:"#222",color:"#ccc",borderColor:"#444"}:{})}} onClick={()=>setArchiveFilter(f)}>{f.charAt(0).toUpperCase()+f.slice(1)}</button>
                  ))}
                  <span style={{marginLeft:"auto",fontSize:11,color:"#444"}}>{filtered.length} tasks</span>
                </div>
                {filtered.length===0?<div style={S.empty}>No archived tasks.</div>
                :Object.entries(byJob).map(([jobKey,jobTasks])=>(
                  <div key={jobKey} style={{marginBottom:24}}>
                    <div style={{...S.jobHead,marginBottom:8}}><span style={S.jobHeadTitle}>{jobKey}</span><span style={S.jobHeadMeta}>{jobTasks.length} tasks</span></div>
                    {jobTasks.sort((a,b)=>new Date(b.completedAt)-new Date(a.completedAt)).map(t=>(
                      <div key={t.id} style={S.archiveRow}>
                        <span style={S.archiveCheck}>■</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={S.archiveText}>{t.text}</div>
                          <div style={S.archiveMeta}><span style={S.archiveCat}>{t.category}</span><span style={{...S.archiveCat,background:"none",color:PRIORITIES[t.priority||"medium"].color}}>{t.priority||"medium"}</span><span>Completed {fmtShort(t.completedAt)}</span></div>
                        </div>
                        <button style={{...S.iconBtn,color:"#3a3a3a",fontSize:11}} onClick={async()=>{
                          const r={...t,status:"open",completedAt:null,archivedAt:undefined};
                          setTasks(ts=>[...ts,r]); await sbUpsert("tasks",taskToRow(r));
                          setArchive(a=>a.filter(x=>x.id!==t.id)); await sbDelete("archive",t.id);
                        }}>↩</button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );
          })()}

        </div>
      </main>
    </div>
  );
}

// ── Editable Select ───────────────────────────────────────────────
function EditableSelect({ value, options, onChange, onAdd, onRemove }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newVal, setNewVal] = useState("");
  const ref = useRef(null);
  useEffect(() => { const h = e => { if(ref.current&&!ref.current.contains(e.target))setOpen(false); }; document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h); }, []);
  const handleAdd = () => { if(!newVal.trim())return; onAdd(newVal.trim()); onChange(newVal.trim()); setNewVal(""); setAdding(false); };
  return (
    <div ref={ref} style={{position:"relative"}}>
      <div style={ES.trigger} onClick={()=>setOpen(o=>!o)}><span style={{flex:1,color:value?"#bbb":"#444"}}>{value||"Select…"}</span><span style={{color:"#555",fontSize:9}}>▼</span></div>
      {open&&(
        <div style={ES.dropdown}>
          {options.map(opt=>(
            <div key={opt} style={{...ES.option,...(opt===value?ES.optionActive:{})}}>
              <span style={{flex:1,cursor:"pointer"}} onClick={()=>{onChange(opt);setOpen(false);}}>{opt}</span>
              <button style={ES.removeBtn} onClick={e=>{e.stopPropagation();onRemove(opt);if(opt===value)onChange(options.find(o=>o!==opt)||"");}}>✕</button>
            </div>
          ))}
          {adding?(<div style={ES.addRow}><input style={ES.addInput} autoFocus placeholder="New category…" value={newVal} onChange={e=>setNewVal(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")handleAdd();if(e.key==="Escape")setAdding(false);}}/><button style={ES.addConfirm} onClick={handleAdd}>+</button></div>):(<div style={ES.addTrigger} onClick={()=>setAdding(true)}>+ Add category</div>)}
        </div>
      )}
    </div>
  );
}
const ES = {
  trigger:{display:"flex",alignItems:"center",gap:6,background:"#111",border:"1px solid #222",color:"#bbb",padding:"6px 10px",fontFamily:"inherit",fontSize:12,borderRadius:2,cursor:"pointer",minWidth:130,userSelect:"none"},
  dropdown:{position:"absolute",top:"calc(100% + 3px)",left:0,zIndex:200,background:"#161616",border:"1px solid #2a2a2a",borderRadius:3,minWidth:170,maxHeight:240,overflowY:"auto",boxShadow:"0 4px 16px rgba(0,0,0,0.5)"},
  option:{display:"flex",alignItems:"center",padding:"6px 10px",cursor:"pointer",fontSize:12,color:"#aaa",borderBottom:"1px solid #1e1e1e"},
  optionActive:{background:"#222",color:"#ddd"},
  removeBtn:{background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:10,padding:"0 2px",fontFamily:"inherit",flexShrink:0},
  addRow:{display:"flex",gap:4,padding:"6px 8px",borderTop:"1px solid #1e1e1e"},
  addInput:{flex:1,background:"#111",border:"1px solid #2a2a2a",color:"#ccc",padding:"4px 8px",fontFamily:"inherit",fontSize:12,outline:"none",borderRadius:2},
  addConfirm:{background:"#2a2a2a",border:"none",color:"#aaa",cursor:"pointer",padding:"4px 8px",fontFamily:"inherit",fontSize:13,borderRadius:2},
  addTrigger:{padding:"7px 10px",fontSize:11,color:"#555",cursor:"pointer",borderTop:"1px solid #1e1e1e"},
};

// ── Task Row ──────────────────────────────────────────────────────
function TaskRow({ task, onToggle, onFU, onResolveFU, onFUNote, onDel, onUpdate }) {
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState(task.followUpNote || "");
  const [rewriting, setRewriting] = useState(false);
  const [rewriteOptions, setRewriteOptions] = useState(null);
  const [editingDeadline, setEditingDeadline] = useState(false);
  const [editingText, setEditingText] = useState(false);
  const [editText, setEditText] = useState(task.text);
  const [showSubs, setShowSubs] = useState(false);
  const [newSub, setNewSub] = useState("");
  const [newSubDeadline, setNewSubDeadline] = useState("");
  const [newSubPriority, setNewSubPriority] = useState("medium");
  const [addingSub, setAddingSub] = useState(false);

  const subtasks = task.subtasks || [];
  const subTotal = subtasks.length;
  const subDone = subtasks.filter(s => s.done).length;
  const pct = subTotal > 0 ? Math.round((subDone / subTotal) * 100) : null;

  const addSubtask = () => {
    if(!newSub.trim()) return;
    const u = [...subtasks, { id: Math.random().toString(36).slice(2,8), text: newSub.trim(), done: false, deadline: newSubDeadline||null, priority: newSubPriority }];
    onUpdate({subtasks:u}); setNewSub(""); setNewSubDeadline(""); setNewSubPriority("medium"); setAddingSub(false); setShowSubs(true);
  };
  const toggleSub = sid => { const u=subtasks.map(s=>s.id===sid?{...s,done:!s.done}:s); const allDone=u.every(s=>s.done); onUpdate({subtasks:u,...(u.length>0&&allDone&&task.status!=="done"?{status:"done",completedAt:new Date().toISOString()}:{})}); };
  const removeSub = sid => onUpdate({subtasks:subtasks.filter(s=>s.id!==sid)});

  const saveEditText = () => { if(editText.trim()) onUpdate({text:editText.trim()}); setEditingText(false); };

  const deadlineStatus = () => {
    if (!task.deadline) return null;
    const dl = new Date(task.deadline + "T00:00:00");
    const today = new Date(); today.setHours(0,0,0,0);
    const diff = Math.round((dl - today) / 86400000);
    if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, color: "#c55" };
    if (diff === 0) return { label: "Due today", color: "#c8a84b" };
    if (diff <= 3) return { label: `Due in ${diff}d`, color: "#c8a84b" };
    return { label: `Due ${dl.toLocaleDateString([],{month:"short",day:"numeric"})}`, color: "#666" };
  };

  const requestRewrite = async () => {
    setRewriting(true); setRewriteOptions(null);
    const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:400,messages:[{role:"user",content:`Construction PM. Rewrite this task 3 ways using proper PM terminology. Return JSON array of 3 strings only. Under 12 words each. Task: "${task.text}"`}]})});
    const d = await res.json();
    try { setRewriteOptions(JSON.parse(d.content?.map(b=>b.text||"").join("")||"[]".replace(/```json|```/g,"").trim())); } catch { setRewriteOptions(["Could not generate. Try again."]); }
    setRewriting(false);
  };
  const ds = deadlineStatus();
  const pri = PRIORITIES[task.priority || "medium"];

  return (
    <div style={{...S.taskRow,opacity:task.status==="done"?0.42:1}}>
      <button style={S.checkBtn} onClick={onToggle}>{task.status==="done"?"■":"□"}</button>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <span style={{...S.priorityDot,background:pri.color}} title={pri.label}/>
          {editingText?(
            <input style={{...S.fInput,flex:1,fontSize:13,padding:"2px 6px"}} value={editText} autoFocus onChange={e=>setEditText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")saveEditText();if(e.key==="Escape")setEditingText(false);}} onBlur={saveEditText}/>
          ):(
            <div style={{...S.taskText,textDecoration:task.status==="done"?"line-through":"none",flex:1,cursor:"text"}} onClick={()=>{if(task.status!=="done"){setEditingText(true);setEditText(task.text);}}}>{task.text}</div>
          )}
          {pct!==null&&<span style={{...S.pctBadge,color:pct===100?"#6a6":pct>=50?"#c8a84b":"#888"}}>{pct}%</span>}
          {task.recurring&&<span style={{fontSize:9,color:"#555",border:"1px solid #2a2a2a",borderRadius:2,padding:"1px 4px"}}>↻{task.recurring}</span>}
        </div>
        {subTotal>0&&<div style={S.progressTrack}><div style={{...S.progressFill,width:`${pct}%`,background:pct===100?"#4a8a4a":"#555"}}/></div>}
        <div style={S.taskMetaRow}>
          {subTotal>0&&<span style={S.metaLink} onClick={()=>setShowSubs(s=>!s)}>{showSubs?"▾":"▸"} {subDone}/{subTotal} subtasks</span>}
          <span style={S.metaLink} onClick={()=>{setAddingSub(true);setShowSubs(true);}}>+ subtask</span>
          {ds&&<span style={{...S.deadlineBadge,color:ds.color,borderColor:ds.color}}>{ds.label}</span>}
          {!task.deadline&&!editingDeadline&&<span style={S.metaLink} onClick={()=>setEditingDeadline(true)}>+ deadline</span>}
          {editingDeadline&&<input type="date" style={S.deadlineInput} value={task.deadline||""} onChange={e=>{onUpdate({deadline:e.target.value||null});setEditingDeadline(false);}} onBlur={()=>setEditingDeadline(false)} autoFocus/>}
          {task.deadline&&!editingDeadline&&<span style={S.metaLink} onClick={()=>setEditingDeadline(true)}>edit date</span>}
          <select style={{...S.metaLink,background:"none",border:"none",color:"#555",fontSize:10,cursor:"pointer",padding:0}} value={task.priority||"medium"} onChange={e=>onUpdate({priority:e.target.value})}>
            <option value="high">● High</option><option value="medium">● Med</option><option value="low">● Low</option>
          </select>
          <span style={{...S.metaLink,marginLeft:2}} onClick={requestRewrite}>{rewriting?"…":"✦ rewrite"}</span>
        </div>
        {showSubs&&subTotal>0&&(<div style={S.subList}>{subtasks.map(s=>{
          const sPri = PRIORITIES[s.priority||"medium"];
          const sDl = s.deadline ? (() => { const d=new Date(s.deadline+"T00:00:00"); const today=new Date(); today.setHours(0,0,0,0); const diff=Math.round((d-today)/86400000); if(diff<0)return{label:`${Math.abs(diff)}d overdue`,color:"#c55"}; if(diff===0)return{label:"today",color:"#c8a84b"}; return{label:fmtShort(s.deadline),color:"#555"}; })() : null;
          return(<div key={s.id} style={S.subRow}>
            <button style={S.subCheck} onClick={()=>toggleSub(s.id)}>{s.done?"■":"□"}</button>
            <span style={{...S.priorityDot,background:sPri.color,width:5,height:5,marginRight:2}}/>
            <span style={{...S.subText,textDecoration:s.done?"line-through":"none",color:s.done?"#555":"#aaa"}}>{s.text}</span>
            {sDl&&<span style={{fontSize:9,color:sDl.color,marginLeft:4}}>{sDl.label}</span>}
            <button style={S.subDel} onClick={()=>removeSub(s.id)}>✕</button>
          </div>);
        })}</div>)}
        {addingSub&&(<div style={{...S.subAddRow,flexDirection:"column",alignItems:"stretch",gap:5}}>
          <div style={{display:"flex",gap:5}}>
            <input style={S.subInput} placeholder="Subtask description…" value={newSub} autoFocus onChange={e=>setNewSub(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addSubtask();if(e.key==="Escape"){setAddingSub(false);setNewSub("");}}}/>
            <button style={S.subAddBtn} onClick={addSubtask}>Add</button>
            <button style={S.subCancelBtn} onClick={()=>{setAddingSub(false);setNewSub("");setNewSubDeadline("");setNewSubPriority("medium");}}>✕</button>
          </div>
          <div style={{display:"flex",gap:5,alignItems:"center"}}>
            <select style={{...S.fSelect,fontSize:10,padding:"3px 6px"}} value={newSubPriority} onChange={e=>setNewSubPriority(e.target.value)}>
              <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </select>
            <input type="date" style={{...S.deadlineInput,fontSize:10}} value={newSubDeadline} onChange={e=>setNewSubDeadline(e.target.value)}/>
          </div>
        </div>)}
        {rewriteOptions&&(<div style={S.rewriteBox}><div style={S.rewriteLabel}>SELECT REWRITE</div>{rewriteOptions.map((opt,i)=><button key={i} style={S.rewriteOpt} onClick={()=>{onUpdate({text:opt});setRewriteOptions(null);}}>{opt}</button>)}<button style={{...S.metaLink,marginTop:4,display:"block"}} onClick={()=>setRewriteOptions(null)}>dismiss</button></div>)}
        {task.followUp&&(<div style={S.fuTag}>⚑ Follow-up<span style={S.noteToggle} onClick={()=>setShowNote(s=>!s)}>{showNote?"hide":"note"}</span><span style={{...S.noteToggle,color:"#6a6"}} onClick={onResolveFU}>resolve</span></div>)}
        {showNote&&<input style={S.noteInput} placeholder="Follow-up note…" value={note} onChange={e=>{setNote(e.target.value);onFUNote(e.target.value);}}/>}
      </div>
      <div style={S.actRow}>
        <button style={{...S.iconBtn,color:task.followUp?"#bbb":"#444"}} onClick={onFU}>⚑</button>
        <button style={{...S.iconBtn,color:"#555"}} onClick={onDel}>✕</button>
      </div>
    </div>
  );
}

function Empty({ msg = "No tasks yet. Add one above." }) { return <div style={S.empty}>{msg}</div>; }

// ── Styles ────────────────────────────────────────────────────────
const S = {
  root:{display:"flex",minHeight:"100vh",background:"#1a1a1a",color:"#d0d0d0",fontFamily:"'Lato',sans-serif",fontSize:13},
  mobileOverlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:49},
  sidebar:{width:230,minWidth:230,background:"#111",borderRight:"1px solid #222",display:"flex",flexDirection:"column",overflowY:"auto",paddingBottom:32,transition:"transform 0.2s ease",zIndex:50},
  sidebarOpen:{},
  brand:{display:"flex",alignItems:"center",gap:11,padding:"18px 16px 14px",borderBottom:"1px solid #1e1e1e"},
  brandMark:{width:30,height:30,background:"#2a2a2a",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Tenor Sans',serif",fontSize:12,color:"#ddd",letterSpacing:1,flexShrink:0},
  brandName:{fontFamily:"'Tenor Sans',serif",fontSize:15,color:"#e0e0e0",letterSpacing:"0.05em"},
  brandSub:{fontSize:9,color:"#444",letterSpacing:"0.1em",textTransform:"uppercase",marginTop:1},
  sideCloseBtn:{background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:16,padding:"0 2px",display:"none"},
  overdueBar:{background:"#2a1010",borderBottom:"1px solid #3a1a1a",padding:"8px 16px",fontSize:11,color:"#cc6666",cursor:"pointer",letterSpacing:"0.04em"},
  sideSection:{padding:"12px 10px 4px"},
  sideLabel:{fontSize:9,letterSpacing:"0.14em",color:"#444",textTransform:"uppercase",marginBottom:5,paddingLeft:8},
  sideBtn:{display:"flex",alignItems:"center",gap:7,width:"100%",padding:"7px 10px",background:"none",border:"none",color:"#777",cursor:"pointer",fontFamily:"'Lato',sans-serif",fontSize:13,borderRadius:2,textAlign:"left",marginBottom:1},
  sideBtnActive:{background:"#222",color:"#ddd"},
  icon:{fontSize:10,color:"#444",width:13,textAlign:"center",flexShrink:0},
  pill:{marginLeft:"auto",fontSize:10,background:"#1e1e1e",color:"#666",borderRadius:10,padding:"1px 6px"},
  divider:{borderTop:"1px solid #1e1e1e",margin:"4px 0"},
  jobInputRow:{display:"flex",gap:4,padding:"2px 10px 6px"},
  jobMenuBtn:{background:"none",border:"none",color:"#3a3a3a",cursor:"pointer",fontSize:11,padding:"4px 4px",flexShrink:0,fontFamily:"inherit"},
  jobRemoveBtn:{background:"none",border:"none",color:"#3a3a3a",cursor:"pointer",fontSize:10,padding:"4px 6px",flexShrink:0,fontFamily:"inherit"},
  sideInput:{flex:1,background:"#181818",border:"1px solid #222",padding:"5px 8px",color:"#bbb",fontFamily:"inherit",fontSize:12,outline:"none",borderRadius:2},
  sideSelect:{width:"100%",background:"#181818",border:"1px solid #222",color:"#aaa",padding:"6px 8px",fontFamily:"inherit",fontSize:12,outline:"none",borderRadius:2,marginBottom:8},
  scheduleBox:{background:"#181818",border:"1px solid #1e1e1e",borderRadius:3,padding:"8px",marginTop:4},
  schedStatus:{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#bbb",marginBottom:4},
  schedDot:{width:6,height:6,borderRadius:"50%",flexShrink:0},
  schedDetail:{fontSize:9,color:"#555",lineHeight:1.6,marginBottom:6},
  schedEditBtn:{width:"100%",padding:"5px",background:"#222",border:"1px solid #2a2a2a",color:"#888",cursor:"pointer",fontFamily:"inherit",fontSize:11,borderRadius:2},
  main:{flex:1,display:"flex",flexDirection:"column",minWidth:0},
  mobileTopBar:{display:"none",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:"#111",borderBottom:"1px solid #1e1e1e"},
  hamburger:{background:"none",border:"none",color:"#aaa",fontSize:20,cursor:"pointer",padding:0},
  mobileBrand:{fontFamily:"'Tenor Sans',serif",fontSize:16,color:"#e0e0e0"},
  mobileLogBtn:{background:"#2a2a2a",border:"1px solid #3a3a3a",color:"#ccc",padding:"5px 10px",borderRadius:2,cursor:"pointer",fontFamily:"inherit",fontSize:12},
  topBar:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 24px 12px",borderBottom:"1px solid #1e1e1e",background:"#161616"},
  topTitle:{fontFamily:"'Tenor Sans',serif",fontSize:18,color:"#e0e0e0",letterSpacing:"0.03em"},
  topRight:{display:"flex",alignItems:"center",gap:8},
  openBadge:{fontSize:11,color:"#555"},
  btnPrimary:{padding:"7px 14px",background:"#2a2a2a",border:"1px solid #3a3a3a",color:"#d0d0d0",cursor:"pointer",fontFamily:"'Lato',sans-serif",fontSize:12,letterSpacing:"0.04em",borderRadius:2,whiteSpace:"nowrap"},
  btnGhost:{padding:"6px 12px",background:"none",border:"1px solid #2a2a2a",color:"#777",cursor:"pointer",fontFamily:"inherit",fontSize:12,borderRadius:2,whiteSpace:"nowrap"},
  formBar:{background:"#141414",borderBottom:"1px solid #1e1e1e",padding:"10px 24px"},
  formRow:{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"},
  formLabel:{fontSize:10,color:"#555",letterSpacing:"0.08em",textTransform:"uppercase",whiteSpace:"nowrap"},
  fSelect:{background:"#111",border:"1px solid #222",color:"#bbb",padding:"6px 10px",fontFamily:"inherit",fontSize:12,outline:"none",borderRadius:2},
  fInput:{flex:1,minWidth:150,background:"#111",border:"1px solid #222",color:"#d0d0d0",padding:"7px 10px",fontFamily:"inherit",fontSize:13,outline:"none",borderRadius:2},
  content:{flex:1,overflowY:"auto",paddingBottom:40},
  dashWrap:{padding:"20px 24px"},
  dashGrid:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20},
  dashCard:{background:"#161616",border:"1px solid #1e1e1e",borderRadius:6,padding:"14px",textAlign:"center"},
  dashNum:{fontFamily:"'Tenor Sans',serif",fontSize:26,color:"#c8c8c8",lineHeight:1},
  dashLabel:{fontSize:10,color:"#555",letterSpacing:"0.08em",textTransform:"uppercase",marginTop:4},
  dashSection:{marginBottom:20},
  dashSectionTitle:{fontSize:9,letterSpacing:"0.14em",color:"#444",textTransform:"uppercase",marginBottom:10,paddingBottom:4,borderBottom:"1px solid #1e1e1e"},
  dashJobRow:{display:"flex",alignItems:"center",padding:"8px 10px",background:"#161616",border:"1px solid #1e1e1e",borderRadius:4,marginBottom:6,cursor:"pointer"},
  dashJobTitle:{fontSize:13,color:"#c0c0c0"},
  dashJobStats:{display:"flex",gap:10,flexWrap:"wrap"},
  dashStat:{fontSize:10,color:"#666"},
  dashAlertRow:{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #191919"},
  jobBlock:{padding:"14px 24px 6px",borderBottom:"1px solid #1c1c1c"},
  jobHead:{display:"flex",alignItems:"baseline",gap:12,marginBottom:12},
  jobHeadTitle:{fontFamily:"'Tenor Sans',serif",fontSize:16,color:"#c8c8c8",letterSpacing:"0.03em"},
  jobHeadMeta:{fontSize:10,color:"#444"},
  catBlock:{marginBottom:10},
  catHead:{fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:"#444",marginBottom:5,paddingBottom:3,borderBottom:"1px solid #1e1e1e"},
  taskRow:{display:"flex",alignItems:"flex-start",gap:10,padding:"7px 0",borderBottom:"1px solid #191919"},
  checkBtn:{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:13,padding:0,marginTop:1,fontFamily:"monospace",flexShrink:0},
  taskText:{fontSize:13,color:"#c0c0c0",lineHeight:1.5},
  taskMeta:{fontSize:10,color:"#444",marginTop:2},
  actRow:{display:"flex",gap:2,flexShrink:0,marginTop:1},
  iconBtn:{background:"none",border:"none",cursor:"pointer",fontSize:12,padding:"2px 4px",fontFamily:"inherit"},
  priorityDot:{display:"inline-block",width:6,height:6,borderRadius:"50%",flexShrink:0},
  fuTag:{fontSize:10,color:"#999",marginTop:3,display:"flex",alignItems:"center",gap:6},
  noteToggle:{color:"#555",cursor:"pointer",textDecoration:"underline"},
  noteInput:{display:"block",width:"100%",marginTop:4,background:"#111",border:"1px solid #222",color:"#aaa",padding:"4px 8px",fontFamily:"inherit",fontSize:12,outline:"none",borderRadius:2,boxSizing:"border-box"},
  fuNoteText:{fontSize:11,color:"#888",marginTop:2,fontStyle:"italic"},
  pctBadge:{fontSize:11,fontWeight:700,fontFamily:"monospace",flexShrink:0},
  progressTrack:{height:2,background:"#222",borderRadius:2,marginTop:4,marginBottom:2,overflow:"hidden"},
  progressFill:{height:"100%",borderRadius:2,transition:"width 0.3s ease"},
  subList:{marginTop:5,marginLeft:2,borderLeft:"1px solid #2a2a2a",paddingLeft:10},
  subRow:{display:"flex",alignItems:"center",gap:6,padding:"3px 0"},
  subCheck:{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:11,padding:0,fontFamily:"monospace",flexShrink:0},
  subText:{flex:1,fontSize:12,lineHeight:1.4},
  subDel:{background:"none",border:"none",color:"#333",cursor:"pointer",fontSize:9,padding:"0 2px",fontFamily:"inherit",flexShrink:0},
  subAddRow:{display:"flex",alignItems:"center",gap:5,marginTop:4,marginLeft:2,paddingLeft:10,borderLeft:"1px solid #2a2a2a"},
  subInput:{flex:1,background:"#111",border:"1px solid #222",color:"#ccc",padding:"4px 8px",fontFamily:"inherit",fontSize:12,outline:"none",borderRadius:2},
  subAddBtn:{background:"#2a2a2a",border:"1px solid #333",color:"#bbb",cursor:"pointer",padding:"3px 8px",fontFamily:"inherit",fontSize:11,borderRadius:2},
  subCancelBtn:{background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:11,padding:"0 2px",fontFamily:"inherit"},
  taskMetaRow:{display:"flex",alignItems:"center",gap:6,marginTop:3,flexWrap:"wrap"},
  deadlineBadge:{fontSize:10,border:"1px solid",borderRadius:2,padding:"1px 5px"},
  deadlineInput:{background:"#111",border:"1px solid #333",color:"#bbb",padding:"2px 6px",fontFamily:"inherit",fontSize:11,outline:"none",borderRadius:2,colorScheme:"dark"},
  metaLink:{fontSize:10,color:"#555",cursor:"pointer",background:"none",border:"none",fontFamily:"inherit",padding:0},
  rewriteBox:{background:"#111",border:"1px solid #2a2a2a",borderRadius:3,padding:"8px 10px",marginTop:6},
  rewriteLabel:{fontSize:9,letterSpacing:"0.12em",color:"#555",textTransform:"uppercase",marginBottom:6},
  rewriteOpt:{display:"block",width:"100%",textAlign:"left",background:"none",border:"1px solid #222",borderRadius:2,color:"#bbb",cursor:"pointer",fontFamily:"inherit",fontSize:12,padding:"5px 8px",marginBottom:3,lineHeight:1.4},
  noJobsMsg:{fontSize:12,color:"#555",fontStyle:"italic",padding:"6px 0"},
  reportWrap:{padding:"20px 24px"},
  reportDate:{fontFamily:"'Tenor Sans',serif",fontSize:12,color:"#555",letterSpacing:"0.1em",textTransform:"uppercase"},
  archiveRow:{display:"flex",alignItems:"flex-start",gap:10,padding:"7px 0",borderBottom:"1px solid #191919",opacity:0.7},
  archiveCheck:{color:"#444",fontSize:12,fontFamily:"monospace",flexShrink:0,marginTop:1},
  archiveText:{fontSize:13,color:"#888",lineHeight:1.5,textDecoration:"line-through"},
  archiveMeta:{display:"flex",alignItems:"center",gap:6,fontSize:10,color:"#444",marginTop:2,flexWrap:"wrap"},
  archiveCat:{background:"#1e1e1e",borderRadius:2,padding:"1px 5px",color:"#555"},
  muted:{color:"#444",fontStyle:"italic",padding:"32px 24px",fontSize:13},
  empty:{padding:"48px 24px",color:"#3a3a3a",fontSize:13,textAlign:"center"},
  overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16},
  modal:{background:"#181818",border:"1px solid #2a2a2a",padding:24,maxWidth:460,width:"100%",borderRadius:2,maxHeight:"90vh",overflowY:"auto"},
  modalTag:{fontSize:9,letterSpacing:"0.16em",color:"#666",textTransform:"uppercase",marginBottom:12},
  modalMsg:{fontSize:14,color:"#c0c0c0",lineHeight:1.75,marginBottom:12},
  matchBox:{background:"#111",border:"1px solid #2a2a2a",borderRadius:3,padding:"10px 12px",marginBottom:12},
  matchTaskText:{fontSize:13,color:"#d0d0d0",lineHeight:1.5,marginBottom:3},
  matchMeta:{fontSize:10,color:"#555"},
  textarea:{width:"100%",background:"#111",border:"1px solid #222",color:"#d0d0d0",padding:"10px 12px",fontFamily:"inherit",fontSize:13,outline:"none",borderRadius:2,boxSizing:"border-box",resize:"vertical"},
  row:{display:"flex",gap:8,marginTop:10},
  schRow:{marginBottom:14},
  schLabel:{fontSize:10,color:"#666",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6},
  schNum:{width:52,background:"#111",border:"1px solid #2a2a2a",color:"#d0d0d0",padding:"6px 8px",fontFamily:"monospace",fontSize:14,outline:"none",borderRadius:2,textAlign:"center"},
  schColon:{color:"#666",fontSize:16,fontFamily:"monospace"},
  dayBtn:{padding:"4px 9px",background:"#1a1a1a",border:"1px solid #2a2a2a",color:"#666",cursor:"pointer",fontFamily:"inherit",fontSize:11,borderRadius:2},
  dayBtnOn:{background:"#2a2a2a",border:"1px solid #555",color:"#ddd"},
  previewBox:{marginTop:8},
  previewLabel:{fontSize:9,letterSpacing:"0.12em",color:"#555",textTransform:"uppercase",marginBottom:4},
  previewTA:{width:"100%",background:"#111",border:"1px solid #222",color:"#888",padding:"8px 10px",fontFamily:"monospace",fontSize:11,outline:"none",borderRadius:2,boxSizing:"border-box",resize:"vertical"},
};

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #1a1a1a; }
  ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-track { background: #111; } ::-webkit-scrollbar-thumb { background: #2a2a2a; }
  input::placeholder, textarea::placeholder { color: #333; }
  select option { background: #1a1a1a; color: #bbb; }
  .report-body h1 { font-family: 'Tenor Sans', serif; font-size: 17px; color: #c8c8c8; margin: 18px 0 8px; }
  .report-body h2 { font-family: 'Tenor Sans', serif; font-size: 14px; color: #b0b0b0; margin: 16px 0 6px; border-bottom: 1px solid #242424; padding-bottom: 4px; }
  .report-body h3 { font-family: 'Tenor Sans', serif; font-size: 13px; color: #909090; margin: 10px 0 4px; }
  .report-body ul { padding-left: 16px; margin: 4px 0 8px; }
  .report-body li { margin: 3px 0; color: #aaa; font-size: 13px; line-height: 1.6; }
  .report-body strong { color: #ccc; }
  button:focus { outline: none; }
  @media (max-width: 768px) {
    .sidebar-desktop { display: none !important; }
  }
`;
