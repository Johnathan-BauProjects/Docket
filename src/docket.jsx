import { useState, useEffect, useRef, useCallback } from "react";

// ── Fonts ─────────────────────────────────────────────────────────
const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=Tenor+Sans&family=Lato:wght@300;400;700&display=swap";
document.head.appendChild(fontLink);

// ── Supabase ──────────────────────────────────────────────────────
const SB_URL = "https://rcaluapxwmmvbccqynxv.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjYWx1YXB4d21tdmJjY3F5bnh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwODY3MzAsImV4cCI6MjA5MTY2MjczMH0.iWV8DUCwB-pS3PyT-FdxPFcryCyi0294trnn1Ioenm0";
const sbHeaders = { "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}`, "Prefer": "return=representation" };

async function sbGet(table) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?select=*`, { headers: sbHeaders });
    return await r.json();
  } catch { return []; }
}
async function sbUpsert(table, row) {
  try {
    await fetch(`${SB_URL}/rest/v1/${table}`, { method: "POST", headers: { ...sbHeaders, "Prefer": "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row) });
  } catch {}
}
async function sbDelete(table, id) {
  try {
    await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${id}`, { method: "DELETE", headers: sbHeaders });
  } catch {}
}
async function sbGetSetting(key) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/settings?key=eq.${key}&select=value`, { headers: sbHeaders });
    const d = await r.json();
    return d?.[0]?.value ?? null;
  } catch { return null; }
}
async function sbSetSetting(key, value) {
  try {
    await fetch(`${SB_URL}/rest/v1/settings`, { method: "POST", headers: { ...sbHeaders, "Prefer": "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ key, value }) });
  } catch {}
}

// ── Claude API ────────────────────────────────────────────────────
async function askClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
  });
  const d = await res.json();
  return d.content?.map(b => b.text || "").join("") || "";
}

// ── Helpers ───────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);
const nowISO = () => new Date().toISOString();
const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtDate = (iso) => new Date(iso).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
const todayStr = () => new Date().toDateString();
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DEFAULT_SCHEDULE = { days: [1,2,3,4,5], startHour: 6, startMin: 0, endHour: 19, endMin: 0, intervalMin: 45 };
const DEFAULT_PROF_CATS = ["Planning", "Site Visit", "Procurement", "Scheduling", "Approvals", "Safety", "Stakeholder", "Admin", "Other"];
const DEFAULT_PERS_CATS = ["Health", "Finance", "Home", "Family", "Learning", "Errands", "Other"];

function isWithinSchedule(sc) {
  const now = new Date();
  if (!sc.days.includes(now.getDay())) return false;
  const m = now.getHours() * 60 + now.getMinutes();
  return m >= sc.startHour * 60 + sc.startMin && m <= sc.endHour * 60 + sc.endMin;
}

// ── DB row ↔ app object converters ───────────────────────────────
const taskToRow = t => ({ id: t.id, text: t.text, mode: t.mode, job_id: t.jobId, job_label: t.jobLabel, category: t.category, deadline: t.deadline || null, status: t.status, follow_up: t.followUp || false, follow_up_note: t.followUpNote || "", subtasks: t.subtasks || [], created_at: t.createdAt, completed_at: t.completedAt || null });
const rowToTask = r => ({ id: r.id, text: r.text, mode: r.mode, jobId: r.job_id, jobLabel: r.job_label, category: r.category, deadline: r.deadline, status: r.status, followUp: r.follow_up, followUpNote: r.follow_up_note, subtasks: r.subtasks || [], createdAt: r.created_at, completedAt: r.completed_at });
const logToRow = l => ({ id: l.id, time: l.time, job_id: l.jobId, job_label: l.jobLabel, mode: l.mode, text: l.text, type: l.type });
const rowToLog = r => ({ id: r.id, time: r.time, jobId: r.job_id, jobLabel: r.job_label, mode: r.mode, text: r.text, type: r.type });
const archiveToRow = t => ({ id: t.id, text: t.text, mode: t.mode, job_id: t.jobId, job_label: t.jobLabel, category: t.category, deadline: t.deadline || null, status: t.status, follow_up: t.followUp || false, follow_up_note: t.followUpNote || "", subtasks: t.subtasks || [], created_at: t.createdAt, completed_at: t.completedAt || null, archived_at: t.archivedAt || nowISO() });
const rowToArchive = r => ({ id: r.id, text: r.text, mode: r.mode, jobId: r.job_id, jobLabel: r.job_label, category: r.category, deadline: r.deadline, status: r.status, followUp: r.follow_up, followUpNote: r.follow_up_note, subtasks: r.subtasks || [], createdAt: r.created_at, completedAt: r.completed_at, archivedAt: r.archived_at });

// ── Export builder ────────────────────────────────────────────────
function buildExportHTML(tasks, logs, tab, jobs) {
  const date = fmtDate(nowISO());
  const curTasks = tasks.filter(t => t.mode === tab);
  const done = curTasks.filter(t => t.completedAt && new Date(t.completedAt).toDateString() === todayStr());
  const inProgress = curTasks.filter(t => t.status === "open");
  const fu = curTasks.filter(t => t.followUp && t.status !== "done");
  const todayLogs = logs.filter(l => new Date(l.time).toDateString() === todayStr() && l.mode === tab);
  const jobKeys = tab === "professional" ? jobs.map(j => j.id) : ["personal"];
  const jobDisplay = (jid) => { const j = jobs.find(x => x.id === jid); return j ? (j.number ? `#${j.number} — ${j.title}` : j.title) : (jid === "personal" ? "Personal" : jid); };
  const renderSection = (title, taskList, showReason = false) => {
    if (!taskList.length) return `<p style="color:#888;font-style:italic;">None</p>`;
    return jobKeys.map(jid => {
      const items = taskList.filter(t => t.jobId === jid);
      if (!items.length) return "";
      return `<p style="font-weight:bold;color:#333;margin:10px 0 4px;">${jobDisplay(jid)}</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:8px;"><thead><tr style="background:#f0f0f0;">
          <th style="text-align:left;padding:6px 10px;font-size:12px;border:1px solid #ddd;">Task</th>
          <th style="text-align:left;padding:6px 10px;font-size:12px;border:1px solid #ddd;">Category</th>
          <th style="text-align:left;padding:6px 10px;font-size:12px;border:1px solid #ddd;">Deadline</th>
          ${showReason ? `<th style="text-align:left;padding:6px 10px;font-size:12px;border:1px solid #ddd;">Status</th>` : ""}
          ${title === "Follow-Ups Required" ? `<th style="text-align:left;padding:6px 10px;font-size:12px;border:1px solid #ddd;">Note</th>` : ""}
        </tr></thead><tbody>
          ${items.map((t, i) => `<tr style="background:${i%2===0?"#fff":"#f9f9f9"};">
            <td style="padding:6px 10px;font-size:12px;border:1px solid #ddd;">${t.text}</td>
            <td style="padding:6px 10px;font-size:12px;border:1px solid #ddd;">${t.category}</td>
            <td style="padding:6px 10px;font-size:12px;border:1px solid #ddd;">${t.deadline||"—"}</td>
            ${showReason?`<td style="padding:6px 10px;font-size:12px;border:1px solid #ddd;">In Progress</td>`:""}
            ${title==="Follow-Ups Required"?`<td style="padding:6px 10px;font-size:12px;border:1px solid #ddd;">${t.followUpNote||"—"}</td>`:""}
          </tr>`).join("")}
        </tbody></table>`;
    }).join("");
  };
  const logsHtml = todayLogs.length ? todayLogs.map(l => `<p style="margin:4px 0;font-size:12px;"><span style="color:#888;">[${fmtTime(l.time)}]</span> <strong>${l.jobLabel||""}</strong> — ${l.text}</p>`).join("") : `<p style="color:#888;font-style:italic;">No check-ins logged today.</p>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Docket Report — ${date}</title></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;max-width:900px;margin:0 auto;padding:32px;color:#222;">
  <p style="font-size:13px;color:#888;margin-bottom:28px;">${date}</p>
  <h2 style="font-size:15px;color:#333;border-bottom:1px solid #ddd;padding-bottom:6px;margin-top:24px;">✓ Completed Today</h2>${renderSection("Completed Today",done)}
  <h2 style="font-size:15px;color:#333;border-bottom:1px solid #ddd;padding-bottom:6px;margin-top:24px;">⟳ In Progress</h2>${renderSection("In Progress",inProgress,true)}
  <h2 style="font-size:15px;color:#333;border-bottom:1px solid #ddd;padding-bottom:6px;margin-top:24px;">⚑ Follow-Ups Required</h2>${renderSection("Follow-Ups Required",fu)}
  <h2 style="font-size:15px;color:#333;border-bottom:1px solid #ddd;padding-bottom:6px;margin-top:24px;">📋 Check-In Log</h2>${logsHtml}
  <p style="margin-top:40px;font-size:11px;color:#bbb;">Generated by Docket · ${new Date().toLocaleString()}</p>
</body></html>`;
}

function mdToHtml(md = "") {
  return md
    .replace(/^### (.+)$/gm,"<h3>$1</h3>").replace(/^## (.+)$/gm,"<h2>$1</h2>").replace(/^# (.+)$/gm,"<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\*(.+?)\*/g,"<em>$1</em>")
    .replace(/^- (.+)$/gm,"<li>$1</li>").replace(/(<li>.*<\/li>\n?)+/gs,m=>`<ul>${m}</ul>`)
    .replace(/\n{2,}/g,"<br/><br/>").replace(/\n/g,"<br/>");
}

// ── Main App ──────────────────────────────────────────────────────
export default function Docket() {
  const [tab, setTab] = useState("professional");
  const [view, setView] = useState("overview");
  const [selectedJob, setSelectedJob] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [archive, setArchive] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [activeJob, setActiveJob] = useState(null);
  const [profCats, setProfCats] = useState(DEFAULT_PROF_CATS);
  const [persCats, setPersCats] = useState(DEFAULT_PERS_CATS);
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const [newTask, setNewTask] = useState({ text: "", jobId: "", category: DEFAULT_PROF_CATS[0], deadline: "" });
  const [newPersonalTask, setNewPersonalTask] = useState({ text: "", category: DEFAULT_PERS_CATS[0], deadline: "" });
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newJobNumber, setNewJobNumber] = useState("");
  const [showAddJob, setShowAddJob] = useState(false);
  const [report, setReport] = useState("");
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
  const lastPromptRef = useRef(0);

  // ── Load from Supabase ────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [taskRows, logRows, jobRows, archiveRows, settingsJobs, settingsActive, settingsSched, settingsProfCats, settingsPersCats] = await Promise.all([
        sbGet("tasks"), sbGet("logs"), sbGet("jobs"), sbGet("archive"),
        sbGetSetting("activeJob"), sbGetSetting("activeJob"),
        sbGetSetting("schedule"), sbGetSetting("profCats"), sbGetSetting("persCats"),
      ]);
      const loadedJobs = jobRows.map(r => ({ id: r.id, title: r.title, number: r.number || "" }));
      setTasks(taskRows.map(rowToTask));
      setLogs(logRows.map(rowToLog));
      setArchive(archiveRows.map(rowToArchive));
      setJobs(loadedJobs);
      if (loadedJobs.length > 0) {
        const savedActive = await sbGetSetting("activeJob");
        const validActive = loadedJobs.find(j => j.id === savedActive);
        setActiveJob(validActive ? savedActive : loadedJobs[0].id);
        setNewTask(nt => ({ ...nt, jobId: validActive ? savedActive : loadedJobs[0].id }));
      }
      const sc = await sbGetSetting("schedule"); if (sc) setSchedule(sc);
      const pc = await sbGetSetting("profCats"); if (pc) setProfCats(pc);
      const prc = await sbGetSetting("persCats"); if (prc) setPersCats(prc);
      setLoading(false);
    })();
  }, []);

  // ── Auto-archive: completed tasks older than 7 days ───────────
  useEffect(() => {
    if (loading) return;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const toArchive = tasks.filter(t => t.status === "done" && t.completedAt && new Date(t.completedAt).getTime() < cutoff);
    if (!toArchive.length) return;
    toArchive.forEach(async t => {
      const entry = { ...t, archivedAt: nowISO() };
      await sbUpsert("archive", archiveToRow(entry));
      await sbDelete("tasks", t.id);
    });
    setArchive(a => {
      const ids = new Set(a.map(x => x.id));
      return [...a, ...toArchive.filter(t => !ids.has(t.id)).map(t => ({ ...t, archivedAt: nowISO() }))];
    });
    setTasks(ts => ts.filter(t => !toArchive.find(a => a.id === t.id)));
  }, [tasks, loading]);

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

  // ── Check-in flow ─────────────────────────────────────────────
  const logCheckin = async (text) => {
    const job = jobs.find(j => j.id === activeJob);
    const label = job ? (job.number ? `#${job.number} — ${job.title}` : job.title) : activeJob;
    const entry = { id: uid(), time: nowISO(), jobId: activeJob, jobLabel: label, mode: "professional", text: text.trim(), type: "checkin" };
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
      const resp = await askClaude(`You are a construction PM assistant. Analyse this check-in update and open tasks.
CHECK-IN: "${raw}"
OPEN TASKS: ${openJobTasks.length > 0 ? openJobTasks.map((t,i) => `${i}: ${t.text} [${t.category}]`).join("\n") : "none"}
Respond ONLY with JSON (no markdown): {"matchIndex":<index or null>,"matchConfidence":"high"|"low","rewrite":"<concise professional task rewrite under 12 words>","category":"<Planning|Site Visit|Procurement|Scheduling|Approvals|Safety|Stakeholder|Admin|Other>"}`);
      const parsed = JSON.parse(resp.replace(/```json|```/g,"").trim());
      if (parsed.matchIndex !== null && parsed.matchConfidence === "high" && openJobTasks[parsed.matchIndex]) match = openJobTasks[parsed.matchIndex];
      rewrite = parsed.rewrite || raw; category = parsed.category || "Planning";
    } catch {}
    setCheckinProcessing(false);
    if (match) { setCheckinMatched(match); setCheckinSuggested({ text: rewrite, category }); setCheckinStage("confirm-existing"); }
    else { setCheckinSuggested({ text: rewrite, category }); setCheckinStage("suggest-new"); }
  };

  const confirmExistingTask = async () => { await logCheckin(promptInput); resetCheckin(); };
  const rejectExistingTask = () => { setCheckinMatched(null); setCheckinStage("suggest-new"); };

  const acceptNewTask = async () => {
    if (!checkinSuggested) return;
    const job = jobs.find(j => j.id === activeJob) || jobs[0];
    if (!job) return;
    const t = { id: uid(), text: checkinSuggested.text, mode: "professional", jobId: job.id, jobLabel: jobLabel(job), category: checkinSuggested.category, deadline: null, status: "open", followUp: false, followUpNote: "", subtasks: [], createdAt: nowISO(), completedAt: null };
    setTasks(ts => [...ts, t]);
    await sbUpsert("tasks", taskToRow(t));
    await logCheckin(promptInput);
    resetCheckin();
  };

  const dismissNewTask = async () => { await logCheckin(promptInput); resetCheckin(); };

  // ── Tasks CRUD ────────────────────────────────────────────────
  const addProfTask = async () => {
    if (!newTask.text.trim() || !newTask.jobId) return;
    const job = jobs.find(j => j.id === newTask.jobId) || jobs[0];
    if (!job) return;
    const t = { id: uid(), text: newTask.text.trim(), mode: "professional", jobId: job.id, jobLabel: jobLabel(job), category: newTask.category, deadline: newTask.deadline || null, status: "open", followUp: false, followUpNote: "", subtasks: [], createdAt: nowISO(), completedAt: null };
    setTasks(ts => [...ts, t]);
    await sbUpsert("tasks", taskToRow(t));
    setNewTask(nt => ({ ...nt, text: "", deadline: "" })); setAddingTask(false);
  };

  const addPersonalTask = async () => {
    if (!newPersonalTask.text.trim()) return;
    const t = { id: uid(), text: newPersonalTask.text.trim(), mode: "personal", jobId: "personal", jobLabel: "Personal", category: newPersonalTask.category, deadline: newPersonalTask.deadline || null, status: "open", followUp: false, followUpNote: "", subtasks: [], createdAt: nowISO(), completedAt: null };
    setTasks(ts => [...ts, t]);
    await sbUpsert("tasks", taskToRow(t));
    setNewPersonalTask(nt => ({ ...nt, text: "", deadline: "" })); setAddingTask(false);
  };

  const toggle = async (id) => {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const updated = { ...t, status: t.status === "done" ? "open" : "done", completedAt: t.status !== "done" ? nowISO() : null };
    setTasks(ts => ts.map(x => x.id === id ? updated : x));
    await sbUpsert("tasks", taskToRow(updated));
  };

  const toggleFU = async (id) => {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const updated = { ...t, followUp: !t.followUp };
    setTasks(ts => ts.map(x => x.id === id ? updated : x));
    await sbUpsert("tasks", taskToRow(updated));
  };

  const setFUNote = async (id, note) => {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const updated = { ...t, followUpNote: note };
    setTasks(ts => ts.map(x => x.id === id ? updated : x));
    await sbUpsert("tasks", taskToRow(updated));
  };

  const del = async (id) => {
    setTasks(ts => ts.filter(x => x.id !== id));
    await sbDelete("tasks", id);
  };

  const updateTask = async (id, patch) => {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const updated = { ...t, ...patch };
    setTasks(ts => ts.map(x => x.id === id ? updated : x));
    await sbUpsert("tasks", taskToRow(updated));
  };

  // ── Jobs CRUD ─────────────────────────────────────────────────
  const addJob = async () => {
    if (!newJobTitle.trim()) return;
    const j = { id: uid(), title: newJobTitle.trim(), number: newJobNumber.trim() };
    setJobs(js => [...js, j]);
    await sbUpsert("jobs", { id: j.id, title: j.title, number: j.number });
    if (!activeJob) { setActiveJob(j.id); await sbSetSetting("activeJob", j.id); setNewTask(nt => ({ ...nt, jobId: j.id })); }
    else setNewTask(nt => (!nt.jobId || !jobs.find(x => x.id === nt.jobId)) ? { ...nt, jobId: j.id } : nt);
    setNewJobTitle(""); setNewJobNumber(""); setShowAddJob(false);
  };

  const removeJob = async (id) => {
    setJobs(js => js.filter(j => j.id !== id));
    await sbDelete("jobs", id);
    if (activeJob === id) {
      const next = jobs.find(j => j.id !== id);
      setActiveJob(next?.id || null);
      await sbSetSetting("activeJob", next?.id || null);
    }
    if (selectedJob === id) { setSelectedJob(null); setView("overview"); }
  };

  // ── Categories ────────────────────────────────────────────────
  const addCat = async (mode, cat) => {
    const trimmed = cat.trim(); if (!trimmed) return;
    if (mode === "professional") { setProfCats(c => c.includes(trimmed) ? c : [...c, trimmed]); await sbSetSetting("profCats", [...profCats, trimmed]); }
    else { setPersCats(c => c.includes(trimmed) ? c : [...c, trimmed]); await sbSetSetting("persCats", [...persCats, trimmed]); }
  };
  const removeCat = async (mode, cat) => {
    if (mode === "professional") { const updated = profCats.filter(x => x !== cat); setProfCats(updated); await sbSetSetting("profCats", updated); }
    else { const updated = persCats.filter(x => x !== cat); setPersCats(updated); await sbSetSetting("persCats", updated); }
  };

  // ── Report ────────────────────────────────────────────────────
  const generateReport = async () => {
    setView("report"); setLoadingReport(true);
    const done = tasks.filter(t => t.completedAt && new Date(t.completedAt).toDateString() === todayStr() && t.mode === tab);
    const open = tasks.filter(t => t.status === "open" && t.mode === tab);
    const fu = tasks.filter(t => t.followUp && t.status !== "done" && t.mode === tab);
    const todayLogs = logs.filter(l => new Date(l.time).toDateString() === todayStr() && l.mode === tab);
    const r = await askClaude(`Generate a professional end-of-day PM report for ${fmtDate(nowISO())}. Mode: ${tab}.
COMPLETED TODAY:\n${done.map(t=>`- [${t.jobLabel||t.jobId}][${t.category}] ${t.text}`).join("\n")||"None"}
CHECK-IN LOGS:\n${todayLogs.map(l=>`[${fmtTime(l.time)}][${l.jobLabel||l.jobId}] ${l.text}`).join("\n")||"None"}
OPEN ITEMS:\n${open.map(t=>`- [${t.jobLabel||t.jobId}][${t.category}]${t.deadline?` [Due: ${t.deadline}]`:""} ${t.text}`).join("\n")||"None"}
FOLLOW-UPS REQUIRED:\n${fu.map(t=>`- [${t.jobLabel||t.jobId}][${t.category}]${t.deadline?` [Due: ${t.deadline}]`:""} ${t.text}${t.followUpNote?": "+t.followUpNote:""}`).join("\n")||"None"}
Sections: Completed Work (by job), In Progress (by job, include why it's still open if inferable), Follow-Ups Required. No title heading — the date is already shown. Professional tone. Markdown.`);
    setReport(r); setLoadingReport(false);
  };

  // ── Export ────────────────────────────────────────────────────
  const openExport = () => { setExportContent(buildExportHTML(tasks, logs, tab, jobs)); setShowExport(true); };
  const copyExport = () => {
    const curTasks = tasks.filter(t => t.mode === tab);
    const done = curTasks.filter(t => t.completedAt && new Date(t.completedAt).toDateString() === todayStr());
    const inProg = curTasks.filter(t => t.status === "open");
    const fu = curTasks.filter(t => t.followUp && t.status !== "done");
    const todayLogs = logs.filter(l => new Date(l.time).toDateString() === todayStr() && l.mode === tab);
    const lines = [`DOCKET REPORT — ${fmtDate(nowISO()).toUpperCase()}`,`Mode: ${tab.charAt(0).toUpperCase()+tab.slice(1)}`,"","COMPLETED TODAY",...done.map(t=>`  [${t.jobLabel||t.jobId}] [${t.category}] ${t.text}`),done.length===0?"  None":"","","IN PROGRESS",...inProg.map(t=>`  [${t.jobLabel||t.jobId}] [${t.category}] ${t.text}`),inProg.length===0?"  None":"","","FOLLOW-UPS REQUIRED",...fu.map(t=>`  [${t.jobLabel||t.jobId}] [${t.category}] ${t.text}${t.followUpNote?" — "+t.followUpNote:""}`),fu.length===0?"  None":"","","CHECK-IN LOG",...todayLogs.map(l=>`  [${fmtTime(l.time)}] [${l.jobLabel||l.jobId}] ${l.text}`),todayLogs.length===0?"  None":""];
    navigator.clipboard.writeText(lines.join("\n"));
  };
  const downloadHTML = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([exportContent],{type:"text/html"})); a.download = `Docket-Report-${new Date().toISOString().slice(0,10)}.html`; a.click(); };

  // ── Schedule ──────────────────────────────────────────────────
  const openSchedule = () => { setScheduleEdit({...schedule}); setShowSchedule(true); };
  const saveSchedule = async () => { setSchedule(scheduleEdit); await sbSetSetting("schedule", scheduleEdit); setShowSchedule(false); };
  const toggleDay = d => setScheduleEdit(s => ({...s, days: s.days.includes(d) ? s.days.filter(x=>x!==d) : [...s.days,d].sort()}));
  const schedLabel = () => { const days = schedule.days.map(d=>DAY_NAMES[d]).join(", "); const pad = n=>String(n).padStart(2,"0"); return `${days}  ·  ${pad(schedule.startHour)}:${pad(schedule.startMin)} – ${pad(schedule.endHour)}:${pad(schedule.endMin)}  ·  every ${schedule.intervalMin} min`; };

  // ── Grouping ──────────────────────────────────────────────────
  const groupByJobCat = list => { const m={}; list.forEach(t=>{const k=t.jobId||"unknown"; if(!m[k])m[k]={}; if(!m[k][t.category])m[k][t.category]=[]; m[k][t.category].push(t);}); return m; };
  const groupByCat = list => { const m={}; list.forEach(t=>{if(!m[t.category])m[t.category]=[]; m[t.category].push(t);}); return m; };

  // ── Job helpers ───────────────────────────────────────────────
  const jobLabel = j => j.number ? `#${j.number} — ${j.title}` : j.title;
  const jobById = id => jobs.find(j => j.id === id);

  const curTasks = tasks.filter(t => t.mode === tab);
  const fuTasks = curTasks.filter(t => t.followUp && t.status !== "done");
  const openCount = curTasks.filter(t => t.status === "open").length;

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#1a1a1a",color:"#555",fontFamily:"'Lato',sans-serif",fontSize:13,letterSpacing:"0.1em",textTransform:"uppercase"}}>
      Loading Docket…
    </div>
  );

  return (
    <div style={S.root}>
      <style>{CSS}</style>

      {/* ── Check-in modal ── */}
      {(prompt45 || loadingPrompt) && (
        <div style={S.overlay}>
          <div style={S.modal}>
            {(checkinStage === "input" || loadingPrompt) && (<>
              <div style={S.modalTag}>SCHEDULED CHECK-IN</div>
              {loadingPrompt ? <div style={S.muted}>Preparing prompt…</div> : <p style={S.modalMsg}>{prompt45}</p>}
              <textarea style={S.textarea} rows={3} placeholder="What did you work on?" value={promptInput} onChange={e=>setPromptInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),submitCheckin())} />
              <div style={S.row}><button style={S.btnPrimary} onClick={submitCheckin} disabled={checkinProcessing}>{checkinProcessing?"Analysing…":"Submit"}</button><button style={S.btnGhost} onClick={resetCheckin}>Dismiss</button></div>
            </>)}
            {checkinStage === "matching" && (<><div style={S.modalTag}>SCHEDULED CHECK-IN</div><div style={S.muted}>Checking against your open tasks…</div></>)}
            {checkinStage === "confirm-existing" && checkinMatched && (<>
              <div style={S.modalTag}>STILL WORKING ON THIS?</div>
              <p style={{...S.modalMsg,marginBottom:6}}>This looks related to an open task:</p>
              <div style={S.matchBox}><div style={S.matchTaskText}>{checkinMatched.text}</div><div style={S.matchMeta}>{checkinMatched.category} · {checkinMatched.jobLabel}</div></div>
              <p style={{fontSize:12,color:"#777",marginBottom:16,lineHeight:1.6}}>Are you still working on this task, or is your update something different?</p>
              <div style={S.row}><button style={S.btnPrimary} onClick={confirmExistingTask}>Yes, same task</button><button style={S.btnGhost} onClick={rejectExistingTask}>No, it's different</button></div>
            </>)}
            {checkinStage === "suggest-new" && checkinSuggested && (<>
              <div style={S.modalTag}>ADD AS NEW TASK?</div>
              <p style={{...S.modalMsg,marginBottom:6}}>AI suggested task:</p>
              <div style={S.matchBox}><div style={S.matchTaskText}>{checkinSuggested.text}</div><div style={S.matchMeta}>{checkinSuggested.category} · {jobs.find(j=>j.id===activeJob)?jobLabel(jobs.find(j=>j.id===activeJob)):""}</div></div>
              <p style={{fontSize:12,color:"#777",marginBottom:16,lineHeight:1.6}}>Add this to your task list, or just log the update without creating a task?</p>
              <div style={S.row}><button style={S.btnPrimary} onClick={acceptNewTask}>Add Task</button><button style={S.btnGhost} onClick={dismissNewTask}>Log Only</button></div>
            </>)}
          </div>
        </div>
      )}

      {/* ── Schedule modal ── */}
      {showSchedule && scheduleEdit && (
        <div style={S.overlay}><div style={{...S.modal,maxWidth:420}}>
          <div style={S.modalTag}>EDIT SCHEDULE</div>
          <div style={S.schRow}><div style={S.schLabel}>Active Days</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{DAY_NAMES.map((d,i)=><button key={i} style={{...S.dayBtn,...(scheduleEdit.days.includes(i)?S.dayBtnOn:{})}} onClick={()=>toggleDay(i)}>{d}</button>)}</div></div>
          <div style={S.schRow}><div style={S.schLabel}>Start Time</div><div style={{display:"flex",gap:6,alignItems:"center"}}><input style={S.schNum} type="number" min={0} max={23} value={scheduleEdit.startHour} onChange={e=>setScheduleEdit(s=>({...s,startHour:+e.target.value}))}/><span style={S.schColon}>:</span><input style={S.schNum} type="number" min={0} max={59} value={scheduleEdit.startMin} onChange={e=>setScheduleEdit(s=>({...s,startMin:+e.target.value}))}/></div></div>
          <div style={S.schRow}><div style={S.schLabel}>End Time</div><div style={{display:"flex",gap:6,alignItems:"center"}}><input style={S.schNum} type="number" min={0} max={23} value={scheduleEdit.endHour} onChange={e=>setScheduleEdit(s=>({...s,endHour:+e.target.value}))}/><span style={S.schColon}>:</span><input style={S.schNum} type="number" min={0} max={59} value={scheduleEdit.endMin} onChange={e=>setScheduleEdit(s=>({...s,endMin:+e.target.value}))}/></div></div>
          <div style={S.schRow}><div style={S.schLabel}>Check-in Interval</div><div style={{display:"flex",alignItems:"center",gap:8}}><input style={S.schNum} type="number" min={10} max={120} value={scheduleEdit.intervalMin} onChange={e=>setScheduleEdit(s=>({...s,intervalMin:+e.target.value}))}/><span style={{color:"#666",fontSize:12}}>minutes</span></div></div>
          <div style={{...S.row,marginTop:20}}><button style={S.btnPrimary} onClick={saveSchedule}>Save Schedule</button><button style={S.btnGhost} onClick={()=>setShowSchedule(false)}>Cancel</button></div>
        </div></div>
      )}

      {/* ── Export modal ── */}
      {showExport && (
        <div style={S.overlay}><div style={{...S.modal,maxWidth:560}}>
          <div style={S.modalTag}>EXPORT FOR ONENOTE / TEAMS</div>
          <p style={{fontSize:12,color:"#888",marginBottom:16,lineHeight:1.7}}><strong style={{color:"#bbb"}}>Option 1 — Copy as text:</strong> paste directly into OneNote, Teams, or any chat.<br/><strong style={{color:"#bbb"}}>Option 2 — Download HTML:</strong> open in browser, select all, copy, paste into OneNote.<br/><strong style={{color:"#bbb"}}>Option 3 — Preview below</strong> to copy the HTML source.</p>
          <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}><button style={S.btnPrimary} onClick={copyExport}>📋 Copy as Plain Text</button><button style={S.btnPrimary} onClick={downloadHTML}>⬇ Download HTML File</button><button style={S.btnGhost} onClick={()=>setShowExport(false)}>Close</button></div>
          <div style={S.previewBox}><div style={S.previewLabel}>PREVIEW (HTML source)</div><textarea style={S.previewTA} value={exportContent} readOnly rows={10} onClick={e=>e.target.select()}/></div>
        </div></div>
      )}

      {/* ── SIDEBAR ── */}
      <aside style={S.sidebar}>
        <div style={S.brand}><div style={S.brandMark}>D</div><div><div style={S.brandName}>Docket</div><div style={S.brandSub}>Daily Task & Report Log</div></div></div>

        <div style={S.sideSection}>
          <div style={S.sideLabel}>MODE</div>
          {["professional","personal"].map(m=>(
            <button key={m} style={{...S.sideBtn,...(tab===m?S.sideBtnActive:{})}} onClick={()=>{setTab(m);setView("overview");setSelectedJob(null);}}>
              <span style={S.icon}>{m==="professional"?"◈":"◇"}</span>{m.charAt(0).toUpperCase()+m.slice(1)}
              <span style={S.pill}>{tasks.filter(t=>t.mode===m&&t.status==="open").length}</span>
            </button>
          ))}
        </div>
        <div style={S.divider}/>

        <div style={S.sideSection}>
          <div style={S.sideLabel}>VIEWS</div>
          <button style={{...S.sideBtn,...(view==="overview"?S.sideBtnActive:{})}} onClick={()=>{setView("overview");setSelectedJob(null);}}><span style={S.icon}>⊞</span> Overview</button>
          {tab==="professional"&&jobs.length===0&&<div style={{padding:"6px 10px 4px",fontSize:11,color:"#444",fontStyle:"italic"}}>No jobs yet</div>}
          {tab==="professional"&&jobs.map(j=>(
            <div key={j.id} style={{display:"flex",alignItems:"center"}}>
              <button style={{...S.sideBtn,flex:1,...(view==="job"&&selectedJob===j.id?S.sideBtnActive:{})}} onClick={()=>{setView("job");setSelectedJob(j.id);}}>
                <span style={S.icon}>–</span>
                <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{j.number&&<span style={{color:"#666",marginRight:4}}>#{j.number}</span>}{j.title}</span>
                <span style={S.pill}>{tasks.filter(t=>t.jobId===j.id&&t.status==="open").length}</span>
              </button>
              <button style={S.jobRemoveBtn} onClick={()=>removeJob(j.id)} title="Remove job">✕</button>
            </div>
          ))}
        </div>

        {tab==="professional"&&(
          <div style={S.jobInputRow}>
            {showAddJob?(
              <div style={{width:"100%",padding:"0 10px 8px"}}>
                <div style={{...S.sideLabel,marginBottom:8}}>ADD JOB / SITE</div>
                <input style={{...S.sideInput,width:"100%",marginBottom:5}} placeholder="Job title…" value={newJobTitle} onChange={e=>setNewJobTitle(e.target.value)} autoFocus/>
                <input style={{...S.sideInput,width:"100%",marginBottom:8}} placeholder="Job number (optional)…" value={newJobNumber} onChange={e=>setNewJobNumber(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addJob()}/>
                <div style={{display:"flex",gap:5}}><button style={{...S.btnPrimary,flex:1,fontSize:11,padding:"5px"}} onClick={addJob}>Add Job</button><button style={{...S.btnGhost,fontSize:11,padding:"5px 8px"}} onClick={()=>setShowAddJob(false)}>✕</button></div>
              </div>
            ):(
              <button style={{...S.sideBtn,color:"#555",paddingLeft:10}} onClick={()=>setShowAddJob(true)}><span style={S.icon}>+</span> Add job / site</button>
            )}
          </div>
        )}
        <div style={S.divider}/>

        <div style={S.sideSection}>
          <button style={{...S.sideBtn,...(view==="followups"?S.sideBtnActive:{})}} onClick={()=>setView("followups")}><span style={S.icon}>⚑</span> Follow-Ups{fuTasks.length>0&&<span style={{...S.pill,background:"#3a3a3a",color:"#ddd"}}>{fuTasks.length}</span>}</button>
          <button style={{...S.sideBtn,...(view==="report"?S.sideBtnActive:{})}} onClick={generateReport}><span style={S.icon}>≡</span> Daily Report</button>
          <button style={{...S.sideBtn,...(view==="archive"?S.sideBtnActive:{})}} onClick={()=>setView("archive")}><span style={S.icon}>◫</span> Archive{archive.length>0&&<span style={S.pill}>{archive.length}</span>}</button>
          <button style={S.sideBtn} onClick={openExport}><span style={S.icon}>↗</span> Export / Share</button>
        </div>

        {tab==="professional"&&(<>
          <div style={S.divider}/>
          <div style={S.sideSection}>
            <div style={S.sideLabel}>ACTIVE JOB</div>
            {jobs.length===0?<div style={{fontSize:11,color:"#444",fontStyle:"italic",padding:"4px 0 8px"}}>Add a job first</div>:(
              <select style={S.sideSelect} value={activeJob||""} onChange={async e=>{setActiveJob(e.target.value);await sbSetSetting("activeJob",e.target.value);}}>
                {jobs.map(j=><option key={j.id} value={j.id}>{j.number?`#${j.number} — ${j.title}`:j.title}</option>)}
              </select>
            )}
            <div style={S.scheduleBox}>
              <div style={S.schedStatus}><span style={{...S.schedDot,background:withinSchedule?"#6a6":"#555"}}/>{withinSchedule?`Next check-in: ${nextCheckin}`:"Outside schedule"}</div>
              <div style={S.schedDetail}>{schedLabel()}</div>
              <button style={S.schedEditBtn} onClick={openSchedule}>Edit Schedule</button>
            </div>
          </div>
        </>)}
      </aside>

      {/* ── MAIN ── */}
      <main style={S.main}>
        <div style={S.topBar}>
          <div style={S.topTitle}>
            {view==="overview"&&(tab==="professional"?"All Professional Tasks":"All Personal Tasks")}
            {view==="job"&&selectedJob&&(()=>{const j=jobById(selectedJob);return j?jobLabel(j):selectedJob;})()}
            {view==="followups"&&"Follow-Ups"}
            {view==="report"&&"Daily Report"}
            {view==="archive"&&"Archive"}
          </div>
          <div style={S.topRight}>
            {view!=="report"&&<span style={S.openBadge}>{openCount} open</span>}
            <button style={S.btnGhost} onClick={openExport}>↗ Export</button>
            <button style={S.btnPrimary} onClick={()=>setAddingTask(a=>!a)}>{addingTask?"✕  Cancel":"+  New Task"}</button>
          </div>
        </div>

        {addingTask&&(
          <div style={S.formBar}>
            {tab==="professional"?(
              <>
                {jobs.length===0?<div style={S.noJobsMsg}>No jobs added yet — add a job in the sidebar first.</div>:(<>
                  <div style={S.formRow}>
                    <label style={S.formLabel}>Job</label>
                    <select style={S.fSelect} value={newTask.jobId} onChange={e=>setNewTask(t=>({...t,jobId:e.target.value}))}>
                      {jobs.map(j=><option key={j.id} value={j.id}>{j.number?`#${j.number} — ${j.title}`:j.title}</option>)}
                    </select>
                    <label style={S.formLabel}>Category</label>
                    <EditableSelect value={newTask.category} options={profCats} onChange={v=>setNewTask(t=>({...t,category:v}))} onAdd={v=>addCat("professional",v)} onRemove={v=>removeCat("professional",v)}/>
                    <label style={S.formLabel}>Deadline</label>
                    <input type="date" style={S.fSelect} value={newTask.deadline} onChange={e=>setNewTask(t=>({...t,deadline:e.target.value}))}/>
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
                <label style={S.formLabel}>Deadline</label>
                <input type="date" style={S.fSelect} value={newPersonalTask.deadline} onChange={e=>setNewPersonalTask(t=>({...t,deadline:e.target.value}))}/>
                <input style={S.fInput} placeholder="Task description…" value={newPersonalTask.text} onChange={e=>setNewPersonalTask(t=>({...t,text:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addPersonalTask()} autoFocus/>
                <button style={S.btnPrimary} onClick={addPersonalTask}>Add Task</button>
              </div>
            )}
          </div>
        )}

        <div style={S.content}>

          {/* OVERVIEW */}
          {view==="overview"&&(()=>{
            const grouped=groupByJobCat(curTasks);
            const jobKeys=tab==="professional"?jobs.filter(j=>grouped[j.id]).map(j=>j.id):(grouped["personal"]?["personal"]:[]);
            if(!jobKeys.length) return <Empty/>;
            return jobKeys.map(jid=>{
              const job=jobById(jid);
              const label=job?jobLabel(job):(jid==="personal"?"Personal":jid);
              const openN=curTasks.filter(t=>t.jobId===jid&&t.status==="open").length;
              const doneN=curTasks.filter(t=>t.jobId===jid&&t.status==="done").length;
              return(<div key={jid} style={S.jobBlock}><div style={S.jobHead}><span style={S.jobHeadTitle}>{label}</span><span style={S.jobHeadMeta}>{openN} open · {doneN} done</span></div>
                {grouped[jid]&&Object.entries(grouped[jid]).map(([cat,list])=>(
                  <div key={cat} style={S.catBlock}><div style={S.catHead}>{cat}</div>
                    {list.map(t=><TaskRow key={t.id} task={t} onToggle={()=>toggle(t.id)} onFU={()=>toggleFU(t.id)} onFUNote={n=>setFUNote(t.id,n)} onDel={()=>del(t.id)} onUpdate={patch=>updateTask(t.id,patch)}/>)}
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
                {list.map(t=><TaskRow key={t.id} task={t} onToggle={()=>toggle(t.id)} onFU={()=>toggleFU(t.id)} onFUNote={n=>setFUNote(t.id,n)} onDel={()=>del(t.id)} onUpdate={patch=>updateTask(t.id,patch)}/>)}
              </div>
            ));
          })()}

          {/* FOLLOW-UPS */}
          {view==="followups"&&(fuTasks.length===0?<Empty msg="No pending follow-ups."/>:(()=>{
            const grouped=groupByJobCat(fuTasks);
            const jobKeys=tab==="professional"?jobs.filter(j=>grouped[j.id]).map(j=>j.id):(grouped["personal"]?["personal"]:[]);
            return jobKeys.map(jid=>{
              const job=jobById(jid); const label=job?jobLabel(job):"Personal";
              return(<div key={jid} style={S.jobBlock}><div style={S.jobHead}><span style={S.jobHeadTitle}>{label}</span></div>
                {grouped[jid]&&Object.entries(grouped[jid]).map(([cat,list])=>(
                  <div key={cat} style={S.catBlock}><div style={S.catHead}>{cat}</div>
                    {list.map(t=>(<div key={t.id} style={{...S.taskRow,borderLeft:"2px solid #555"}}>
                      <div style={{flex:1}}><div style={S.taskText}>{t.text}</div>{t.followUpNote&&<div style={S.fuNoteText}>{t.followUpNote}</div>}<div style={S.taskMeta}>Added {fmtDate(t.createdAt)}</div></div>
                      <button style={S.btnGhost} onClick={()=>toggle(t.id)}>Mark Done</button>
                    </div>))}
                  </div>
                ))}
              </div>);
            });
          })())}

          {/* REPORT */}
          {view==="report"&&(
            <div style={S.reportWrap}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
                <div style={S.reportDate}>{fmtDate(nowISO())}</div>
                <button style={S.btnGhost} onClick={openExport}>↗ Export</button>
              </div>
              {loadingReport?<div style={S.muted}>Generating report…</div>:<div className="report-body" dangerouslySetInnerHTML={{__html:mdToHtml(report)}}/>}
              {!loadingReport&&<button style={{...S.btnGhost,marginTop:24}} onClick={generateReport}>↻ Regenerate</button>}
            </div>
          )}

          {/* ARCHIVE */}
          {view==="archive"&&(()=>{
            const filtered=archive.filter(t=>archiveFilter==="all"||t.mode===archiveFilter);
            const byJob={};
            filtered.forEach(t=>{const k=t.jobLabel||t.jobId||"Personal"; if(!byJob[k])byJob[k]=[]; byJob[k].push(t);});
            return(
              <div style={S.reportWrap}>
                <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:10,color:"#555",letterSpacing:"0.1em",textTransform:"uppercase",marginRight:4}}>Show</span>
                  {["all","professional","personal"].map(f=>(
                    <button key={f} style={{...S.btnGhost,fontSize:11,padding:"4px 12px",...(archiveFilter===f?{background:"#222",color:"#ccc",borderColor:"#444"}:{})}} onClick={()=>setArchiveFilter(f)}>{f.charAt(0).toUpperCase()+f.slice(1)}</button>
                  ))}
                  <span style={{marginLeft:"auto",fontSize:11,color:"#444"}}>{filtered.length} tasks</span>
                </div>
                {filtered.length===0?<div style={S.empty}>No archived tasks{archiveFilter!=="all"?` in ${archiveFilter}`:""}.}</div>
                :Object.entries(byJob).map(([jobKey,jobTasks])=>(
                  <div key={jobKey} style={{marginBottom:24}}>
                    <div style={{...S.jobHead,marginBottom:8}}><span style={S.jobHeadTitle}>{jobKey}</span><span style={S.jobHeadMeta}>{jobTasks.length} tasks</span></div>
                    {jobTasks.sort((a,b)=>new Date(b.completedAt)-new Date(a.completedAt)).map(t=>(
                      <div key={t.id} style={S.archiveRow}>
                        <span style={S.archiveCheck}>■</span>
                        <div style={{flex:1,minWidth:0}}><div style={S.archiveText}>{t.text}</div>
                          <div style={S.archiveMeta}><span style={S.archiveCat}>{t.category}</span><span>Completed {fmtDate(t.completedAt)}</span>{t.subtasks?.length>0&&<span>· {t.subtasks.length} subtasks</span>}</div>
                        </div>
                        <button style={{...S.iconBtn,color:"#3a3a3a",fontSize:11}} title="Restore task" onClick={async()=>{
                          const restored={...t,status:"open",completedAt:null,archivedAt:undefined};
                          setTasks(ts=>[...ts,restored]); await sbUpsert("tasks",taskToRow(restored));
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

// ── Editable Category Select ──────────────────────────────────────
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
          {adding?(
            <div style={ES.addRow}><input style={ES.addInput} autoFocus placeholder="New category…" value={newVal} onChange={e=>setNewVal(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")handleAdd();if(e.key==="Escape")setAdding(false);}}/><button style={ES.addConfirm} onClick={handleAdd}>+</button></div>
          ):(
            <div style={ES.addTrigger} onClick={()=>setAdding(true)}>+ Add category</div>
          )}
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
function TaskRow({ task, onToggle, onFU, onFUNote, onDel, onUpdate }) {
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState(task.followUpNote || "");
  const [rewriting, setRewriting] = useState(false);
  const [rewriteOptions, setRewriteOptions] = useState(null);
  const [editingDeadline, setEditingDeadline] = useState(false);
  const [showSubs, setShowSubs] = useState(false);
  const [newSub, setNewSub] = useState("");
  const [addingSub, setAddingSub] = useState(false);

  const subtasks = task.subtasks || [];
  const subTotal = subtasks.length;
  const subDone = subtasks.filter(s => s.done).length;
  const pct = subTotal > 0 ? Math.round((subDone / subTotal) * 100) : null;

  const addSubtask = () => {
    if (!newSub.trim()) return;
    const updated = [...subtasks, { id: Math.random().toString(36).slice(2,8), text: newSub.trim(), done: false }];
    onUpdate({ subtasks: updated });
    setNewSub(""); setAddingSub(false); setShowSubs(true);
  };
  const toggleSub = sid => {
    const updated = subtasks.map(s => s.id === sid ? { ...s, done: !s.done } : s);
    const allDone = updated.every(s => s.done);
    onUpdate({ subtasks: updated, ...(updated.length > 0 && allDone && task.status !== "done" ? { status: "done", completedAt: new Date().toISOString() } : {}) });
  };
  const removeSub = sid => onUpdate({ subtasks: subtasks.filter(s => s.id !== sid) });

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
    const res = await fetch("https://api.anthropic.com/v1/messages", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:400,messages:[{role:"user",content:`You are a professional construction project manager. Rewrite the following task using proper construction/PM terminology. Return exactly 3 concise alternatives as a JSON array of strings — no preamble, no markdown, just the JSON array. Keep each under 12 words. Task: "${task.text}"`}]}) });
    const d = await res.json();
    const raw = d.content?.map(b=>b.text||"").join("")||"[]";
    try { setRewriteOptions(JSON.parse(raw.replace(/```json|```/g,"").trim())); } catch { setRewriteOptions(["Could not generate options. Try again."]); }
    setRewriting(false);
  };
  const applyRewrite = text => { onUpdate({ text }); setRewriteOptions(null); };
  const ds = deadlineStatus();

  return (
    <div style={{...S.taskRow, opacity: task.status==="done"?0.42:1}}>
      <button style={S.checkBtn} onClick={onToggle}>{task.status==="done"?"■":"□"}</button>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <div style={{...S.taskText,textDecoration:task.status==="done"?"line-through":"none",flex:1}}>{task.text}</div>
          {pct!==null&&<span style={{...S.pctBadge,color:pct===100?"#6a6":pct>=50?"#c8a84b":"#888"}}>{pct}%</span>}
        </div>
        {subTotal>0&&<div style={S.progressTrack}><div style={{...S.progressFill,width:`${pct}%`,background:pct===100?"#4a8a4a":"#555"}}/></div>}
        <div style={S.taskMetaRow}>
          <span style={S.metaLink} onClick={()=>setShowSubs(s=>!s)}>{subTotal>0?`${showSubs?"▾":"▸"} ${subDone}/${subTotal} subtasks`:""}</span>
          <span style={S.metaLink} onClick={()=>{setAddingSub(true);setShowSubs(true);}}>+ subtask</span>
          {ds&&<span style={{...S.deadlineBadge,color:ds.color,borderColor:ds.color}}>{ds.label}</span>}
          {!task.deadline&&!editingDeadline&&<span style={S.metaLink} onClick={()=>setEditingDeadline(true)}>+ deadline</span>}
          {editingDeadline&&<input type="date" style={S.deadlineInput} value={task.deadline||""} onChange={e=>{onUpdate({deadline:e.target.value||null});setEditingDeadline(false);}} onBlur={()=>setEditingDeadline(false)} autoFocus/>}
          {task.deadline&&!editingDeadline&&<span style={S.metaLink} onClick={()=>setEditingDeadline(true)}>edit date</span>}
          <span style={{...S.metaLink,marginLeft:4}} onClick={requestRewrite}>{rewriting?"…":"✦ rewrite"}</span>
        </div>
        {showSubs&&subTotal>0&&(<div style={S.subList}>{subtasks.map(s=>(<div key={s.id} style={S.subRow}><button style={S.subCheck} onClick={()=>toggleSub(s.id)}>{s.done?"■":"□"}</button><span style={{...S.subText,textDecoration:s.done?"line-through":"none",color:s.done?"#555":"#aaa"}}>{s.text}</span><button style={S.subDel} onClick={()=>removeSub(s.id)}>✕</button></div>))}</div>)}
        {addingSub&&(<div style={S.subAddRow}><input style={S.subInput} placeholder="Subtask description…" value={newSub} autoFocus onChange={e=>setNewSub(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addSubtask();if(e.key==="Escape"){setAddingSub(false);setNewSub("");}}}/><button style={S.subAddBtn} onClick={addSubtask}>Add</button><button style={S.subCancelBtn} onClick={()=>{setAddingSub(false);setNewSub("");}}>✕</button></div>)}
        {rewriteOptions&&(<div style={S.rewriteBox}><div style={S.rewriteLabel}>SELECT A REWRITE</div>{rewriteOptions.map((opt,i)=><button key={i} style={S.rewriteOpt} onClick={()=>applyRewrite(opt)}>{opt}</button>)}<button style={{...S.metaLink,marginTop:4,display:"block"}} onClick={()=>setRewriteOptions(null)}>dismiss</button></div>)}
        {task.followUp&&(<div style={S.fuTag}>⚑ Follow-up required<span style={S.noteToggle} onClick={()=>setShowNote(s=>!s)}>{showNote?"hide":"add note"}</span></div>)}
        {showNote&&<input style={S.noteInput} placeholder="Follow-up note…" value={note} onChange={e=>{setNote(e.target.value);onFUNote(e.target.value);}}/>}
      </div>
      <div style={S.actRow}>
        <button style={{...S.iconBtn,color:task.followUp?"#bbb":"#444"}} onClick={onFU} title="Flag follow-up">⚑</button>
        <button style={{...S.iconBtn,color:"#555"}} onClick={onDel}>✕</button>
      </div>
    </div>
  );
}

function Empty({ msg = "No tasks yet. Add one above." }) { return <div style={S.empty}>{msg}</div>; }

// ── Styles ────────────────────────────────────────────────────────
const S = {
  root:{display:"flex",minHeight:"100vh",background:"#1a1a1a",color:"#d0d0d0",fontFamily:"'Lato',sans-serif",fontSize:13},
  sidebar:{width:230,minWidth:230,background:"#111",borderRight:"1px solid #222",display:"flex",flexDirection:"column",overflowY:"auto",paddingBottom:32},
  brand:{display:"flex",alignItems:"center",gap:11,padding:"22px 16px 18px",borderBottom:"1px solid #1e1e1e"},
  brandMark:{width:32,height:32,background:"#2a2a2a",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Tenor Sans',serif",fontSize:12,color:"#ddd",letterSpacing:1,flexShrink:0},
  brandName:{fontFamily:"'Tenor Sans',serif",fontSize:15,color:"#e0e0e0",letterSpacing:"0.05em"},
  brandSub:{fontSize:9,color:"#444",letterSpacing:"0.13em",textTransform:"uppercase",marginTop:2},
  sideSection:{padding:"14px 10px 6px"},
  sideLabel:{fontSize:9,letterSpacing:"0.14em",color:"#444",textTransform:"uppercase",marginBottom:5,paddingLeft:8},
  sideBtn:{display:"flex",alignItems:"center",gap:7,width:"100%",padding:"7px 10px",background:"none",border:"none",color:"#777",cursor:"pointer",fontFamily:"'Lato',sans-serif",fontSize:13,borderRadius:2,textAlign:"left",marginBottom:1},
  sideBtnActive:{background:"#222",color:"#ddd"},
  icon:{fontSize:10,color:"#444",width:13,textAlign:"center",flexShrink:0},
  pill:{marginLeft:"auto",fontSize:10,background:"#1e1e1e",color:"#666",borderRadius:10,padding:"1px 6px"},
  divider:{borderTop:"1px solid #1e1e1e",margin:"6px 0"},
  jobInputRow:{display:"flex",gap:4,padding:"2px 10px 8px"},
  sideInput:{flex:1,background:"#181818",border:"1px solid #222",padding:"5px 8px",color:"#bbb",fontFamily:"inherit",fontSize:12,outline:"none",borderRadius:2},
  addBtn:{background:"#222",border:"none",color:"#999",cursor:"pointer",padding:"5px 10px",fontSize:14,borderRadius:2},
  sideSelect:{width:"100%",background:"#181818",border:"1px solid #222",color:"#aaa",padding:"6px 8px",fontFamily:"inherit",fontSize:12,outline:"none",borderRadius:2,marginBottom:8},
  scheduleBox:{background:"#181818",border:"1px solid #1e1e1e",borderRadius:3,padding:"10px",marginTop:4},
  schedStatus:{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#bbb",marginBottom:5},
  schedDot:{width:7,height:7,borderRadius:"50%",flexShrink:0},
  schedDetail:{fontSize:10,color:"#555",lineHeight:1.6,marginBottom:8},
  schedEditBtn:{width:"100%",padding:"6px",background:"#222",border:"1px solid #2a2a2a",color:"#888",cursor:"pointer",fontFamily:"inherit",fontSize:11,borderRadius:2},
  main:{flex:1,display:"flex",flexDirection:"column",minWidth:0},
  topBar:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 28px 14px",borderBottom:"1px solid #1e1e1e",background:"#161616"},
  topTitle:{fontFamily:"'Tenor Sans',serif",fontSize:20,color:"#e0e0e0",letterSpacing:"0.03em"},
  topRight:{display:"flex",alignItems:"center",gap:10},
  openBadge:{fontSize:11,color:"#555"},
  btnPrimary:{padding:"7px 16px",background:"#2a2a2a",border:"1px solid #3a3a3a",color:"#d0d0d0",cursor:"pointer",fontFamily:"'Lato',sans-serif",fontSize:12,letterSpacing:"0.04em",borderRadius:2,whiteSpace:"nowrap"},
  btnGhost:{padding:"6px 14px",background:"none",border:"1px solid #2a2a2a",color:"#777",cursor:"pointer",fontFamily:"inherit",fontSize:12,borderRadius:2,whiteSpace:"nowrap"},
  formBar:{background:"#141414",borderBottom:"1px solid #1e1e1e",padding:"12px 28px"},
  formRow:{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"},
  formLabel:{fontSize:10,color:"#555",letterSpacing:"0.08em",textTransform:"uppercase",whiteSpace:"nowrap"},
  fSelect:{background:"#111",border:"1px solid #222",color:"#bbb",padding:"6px 10px",fontFamily:"inherit",fontSize:12,outline:"none",borderRadius:2},
  fInput:{flex:1,minWidth:200,background:"#111",border:"1px solid #222",color:"#d0d0d0",padding:"7px 12px",fontFamily:"inherit",fontSize:13,outline:"none",borderRadius:2},
  content:{flex:1,overflowY:"auto",paddingBottom:40},
  jobBlock:{padding:"18px 28px 6px",borderBottom:"1px solid #1c1c1c"},
  jobHead:{display:"flex",alignItems:"baseline",gap:12,marginBottom:14},
  jobHeadTitle:{fontFamily:"'Tenor Sans',serif",fontSize:16,color:"#c8c8c8",letterSpacing:"0.03em"},
  jobHeadMeta:{fontSize:10,color:"#444"},
  catBlock:{marginBottom:12},
  catHead:{fontSize:9,letterSpacing:"0.14em",textTransform:"uppercase",color:"#444",marginBottom:6,paddingBottom:4,borderBottom:"1px solid #1e1e1e"},
  taskRow:{display:"flex",alignItems:"flex-start",gap:10,padding:"8px 0",borderBottom:"1px solid #191919"},
  checkBtn:{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:13,padding:0,marginTop:1,fontFamily:"monospace",flexShrink:0},
  taskText:{fontSize:13,color:"#c0c0c0",lineHeight:1.55},
  taskMeta:{fontSize:10,color:"#444",marginTop:2},
  actRow:{display:"flex",gap:2,flexShrink:0,marginTop:1},
  iconBtn:{background:"none",border:"none",cursor:"pointer",fontSize:12,padding:"2px 5px",fontFamily:"inherit"},
  fuTag:{fontSize:10,color:"#999",marginTop:3,display:"flex",alignItems:"center",gap:6},
  noteToggle:{color:"#555",cursor:"pointer",textDecoration:"underline"},
  noteInput:{display:"block",width:"100%",marginTop:5,background:"#111",border:"1px solid #222",color:"#aaa",padding:"5px 8px",fontFamily:"inherit",fontSize:12,outline:"none",borderRadius:2,boxSizing:"border-box"},
  fuNoteText:{fontSize:11,color:"#888",marginTop:3,fontStyle:"italic"},
  pctBadge:{fontSize:11,fontWeight:700,fontFamily:"monospace",letterSpacing:"0.02em",flexShrink:0},
  progressTrack:{height:2,background:"#222",borderRadius:2,marginTop:5,marginBottom:2,overflow:"hidden"},
  progressFill:{height:"100%",borderRadius:2,transition:"width 0.3s ease"},
  subList:{marginTop:6,marginLeft:2,borderLeft:"1px solid #2a2a2a",paddingLeft:10},
  subRow:{display:"flex",alignItems:"center",gap:6,padding:"3px 0"},
  subCheck:{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:11,padding:0,fontFamily:"monospace",flexShrink:0},
  subText:{flex:1,fontSize:12,lineHeight:1.4},
  subDel:{background:"none",border:"none",color:"#333",cursor:"pointer",fontSize:9,padding:"0 2px",fontFamily:"inherit",flexShrink:0},
  subAddRow:{display:"flex",alignItems:"center",gap:5,marginTop:5,marginLeft:2,paddingLeft:10,borderLeft:"1px solid #2a2a2a"},
  subInput:{flex:1,background:"#111",border:"1px solid #222",color:"#ccc",padding:"4px 8px",fontFamily:"inherit",fontSize:12,outline:"none",borderRadius:2},
  subAddBtn:{background:"#2a2a2a",border:"1px solid #333",color:"#bbb",cursor:"pointer",padding:"3px 10px",fontFamily:"inherit",fontSize:11,borderRadius:2},
  subCancelBtn:{background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:11,padding:"0 2px",fontFamily:"inherit"},
  taskMetaRow:{display:"flex",alignItems:"center",gap:8,marginTop:4,flexWrap:"wrap"},
  deadlineBadge:{fontSize:10,border:"1px solid",borderRadius:2,padding:"1px 6px",letterSpacing:"0.04em"},
  deadlineInput:{background:"#111",border:"1px solid #333",color:"#bbb",padding:"2px 6px",fontFamily:"inherit",fontSize:11,outline:"none",borderRadius:2,colorScheme:"dark"},
  metaLink:{fontSize:10,color:"#555",cursor:"pointer",textDecoration:"none",background:"none",border:"none",fontFamily:"inherit",padding:0},
  rewriteBox:{background:"#111",border:"1px solid #2a2a2a",borderRadius:3,padding:"10px 12px",marginTop:8},
  rewriteLabel:{fontSize:9,letterSpacing:"0.12em",color:"#555",textTransform:"uppercase",marginBottom:7},
  rewriteOpt:{display:"block",width:"100%",textAlign:"left",background:"none",border:"1px solid #222",borderRadius:2,color:"#bbb",cursor:"pointer",fontFamily:"inherit",fontSize:12,padding:"6px 10px",marginBottom:4,lineHeight:1.4},
  jobRemoveBtn:{background:"none",border:"none",color:"#3a3a3a",cursor:"pointer",fontSize:10,padding:"4px 6px",flexShrink:0,fontFamily:"inherit"},
  noJobsMsg:{fontSize:12,color:"#555",fontStyle:"italic",padding:"8px 0 4px"},
  reportWrap:{padding:"28px"},
  reportDate:{fontFamily:"'Tenor Sans',serif",fontSize:12,color:"#555",letterSpacing:"0.1em",textTransform:"uppercase"},
  archiveRow:{display:"flex",alignItems:"flex-start",gap:10,padding:"8px 0",borderBottom:"1px solid #191919",opacity:0.7},
  archiveCheck:{color:"#444",fontSize:12,fontFamily:"monospace",flexShrink:0,marginTop:1},
  archiveText:{fontSize:13,color:"#888",lineHeight:1.5,textDecoration:"line-through"},
  archiveMeta:{display:"flex",alignItems:"center",gap:8,fontSize:10,color:"#444",marginTop:3,flexWrap:"wrap"},
  archiveCat:{background:"#1e1e1e",borderRadius:2,padding:"1px 5px",color:"#555"},
  muted:{color:"#444",fontStyle:"italic",padding:"40px 28px",fontSize:13},
  empty:{padding:"60px 28px",color:"#3a3a3a",fontSize:13,textAlign:"center"},
  overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16},
  modal:{background:"#181818",border:"1px solid #2a2a2a",padding:28,maxWidth:460,width:"100%",borderRadius:2,maxHeight:"90vh",overflowY:"auto"},
  modalTag:{fontSize:9,letterSpacing:"0.16em",color:"#666",textTransform:"uppercase",marginBottom:14},
  modalMsg:{fontSize:14,color:"#c0c0c0",lineHeight:1.75,marginBottom:14},
  matchBox:{background:"#111",border:"1px solid #2a2a2a",borderRadius:3,padding:"10px 14px",marginBottom:14},
  matchTaskText:{fontSize:13,color:"#d0d0d0",lineHeight:1.5,marginBottom:4},
  matchMeta:{fontSize:10,color:"#555",letterSpacing:"0.04em"},
  textarea:{width:"100%",background:"#111",border:"1px solid #222",color:"#d0d0d0",padding:"10px 12px",fontFamily:"inherit",fontSize:13,outline:"none",borderRadius:2,boxSizing:"border-box",resize:"vertical"},
  row:{display:"flex",gap:8,marginTop:12},
  schRow:{marginBottom:16},
  schLabel:{fontSize:10,color:"#666",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:7},
  schNum:{width:56,background:"#111",border:"1px solid #2a2a2a",color:"#d0d0d0",padding:"6px 10px",fontFamily:"monospace",fontSize:15,outline:"none",borderRadius:2,textAlign:"center"},
  schColon:{color:"#666",fontSize:18,fontFamily:"monospace"},
  dayBtn:{padding:"5px 10px",background:"#1a1a1a",border:"1px solid #2a2a2a",color:"#666",cursor:"pointer",fontFamily:"inherit",fontSize:11,borderRadius:2},
  dayBtnOn:{background:"#2a2a2a",border:"1px solid #555",color:"#ddd"},
  previewBox:{marginTop:8},
  previewLabel:{fontSize:9,letterSpacing:"0.12em",color:"#555",textTransform:"uppercase",marginBottom:5},
  previewTA:{width:"100%",background:"#111",border:"1px solid #222",color:"#888",padding:"8px 10px",fontFamily:"monospace",fontSize:11,outline:"none",borderRadius:2,boxSizing:"border-box",resize:"vertical"},
};

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #1a1a1a; }
  ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-track { background: #111; } ::-webkit-scrollbar-thumb { background: #2a2a2a; }
  input::placeholder, textarea::placeholder { color: #333; }
  select option { background: #1a1a1a; color: #bbb; }
  .report-body h1 { font-family: 'Tenor Sans', serif; font-size: 18px; color: #c8c8c8; margin: 20px 0 10px; }
  .report-body h2 { font-family: 'Tenor Sans', serif; font-size: 15px; color: #b0b0b0; margin: 18px 0 8px; border-bottom: 1px solid #242424; padding-bottom: 5px; }
  .report-body h3 { font-family: 'Tenor Sans', serif; font-size: 13px; color: #909090; margin: 12px 0 5px; }
  .report-body ul { padding-left: 18px; margin: 4px 0 10px; }
  .report-body li { margin: 4px 0; color: #aaa; font-size: 13px; line-height: 1.6; }
  .report-body strong { color: #ccc; }
  button:focus { outline: none; }
`;
