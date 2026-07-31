"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { inspectionCompletedInCycle, inspectionCycleFor } from "./inspection-cycle";

type Schedule = {
  onboardingDueDays: number;
  courseDueSoonDays: number;
  renewalMonths: number;
  renewalReminderDays: number;
  inspectionDueDay: number;
};
type QueueItem = { id: string; type: "Course" | "Inspection" | "Renewal"; person: string; location: string; due: Date; status: "Complete" | "Due soon" | "Overdue" };

const defaults: Schedule = {
  onboardingDueDays: 14,
  courseDueSoonDays: 7,
  renewalMonths: 12,
  renewalReminderDays: 30,
  inspectionDueDay: 15,
};
const academyNames = ["Sundance", "Midnapore", "Sylvan Lake", "Millwoods", "Willowgrove"];
const dateLabel = (date: Date) => new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" }).format(date);

export default function AdminScheduling() {
  const [schedule, setSchedule] = useState<Schedule>(defaults);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [inspectionTrackingStartedAt, setInspectionTrackingStartedAt] = useState<Date | null>(null);

  async function loadQueue(activeSchedule: Schedule) {
    const [usersSnapshot, progressSnapshot, inspectionsSnapshot, certificatesSnapshot] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(collection(db, "progress")),
      getDocs(collection(db, "inspections")),
      getDocs(collection(db, "certificates")),
    ]);
    const now = new Date();
    const dueSoonCutoff = new Date(now.getTime() + activeSchedule.courseDueSoonDays * 86400000);
    const users = new Map(usersSnapshot.docs.map((item) => [item.id, item.data()]));
    const items: QueueItem[] = [];
    progressSnapshot.docs.forEach((item) => {
      const data = item.data();
      if ((data.completedModules || []).length >= 8) return;
      const user = users.get(data.userId);
      if (!user || user.status === "inactive") return;
      const due = data.dueAt?.toDate?.();
      if (!due || due > dueSoonCutoff) return;
      items.push({ id: item.id, type: "Course", person: user.displayName || user.email, location: user.location, due, status: due < now ? "Overdue" : "Due soon" });
    });
    const cycle = inspectionCycleFor(now, activeSchedule.inspectionDueDay);
    academyNames.forEach((location) => {
      const completedInspection = inspectionsSnapshot.docs.find((item) => {
        const data = item.data();
        const completed = data.completedAt?.toDate?.();
        return data.location === location && data.status === "submitted" && inspectionCompletedInCycle(completed, cycle);
      });
      const completedData = completedInspection?.data();
      items.push({
        id: `inspection-current-${location}`,
        type: "Inspection",
        person: completedData?.directorName || "Location director",
        location,
        due: cycle.due,
        status: completedInspection ? "Complete" : now > cycle.due ? "Overdue" : "Due soon",
      });
    });
    certificatesSnapshot.docs.forEach((item) => {
      const data = item.data();
      const due = data.expiresAt?.toDate?.();
      if (!due || due.getTime() - now.getTime() > activeSchedule.renewalReminderDays * 86400000) return;
      items.push({ id: item.id, type: "Renewal", person: data.employeeName, location: data.location, due, status: due < now ? "Overdue" : "Due soon" });
    });
    setQueue(items.sort((a, b) => a.due.getTime() - b.due.getTime()));
  }

  useEffect(() => {
    getDoc(doc(db, "complianceSchedules", "default")).then((snapshot) => {
      const active = snapshot.exists() ? { ...defaults, ...snapshot.data() } as Schedule : defaults;
      const trackingStartedAt = snapshot.data()?.inspectionTrackingStartedAt?.toDate?.() || null;
      setSchedule(active);
      setInspectionTrackingStartedAt(trackingStartedAt);
      return loadQueue(active);
    }).catch(() => setMessage("Unable to load compliance scheduling."));
  }, []);

  const summary = useMemo(() => ({
    overdue: queue.filter((item) => item.status === "Overdue").length,
    dueSoon: queue.filter((item) => item.status === "Due soon").length,
    inspections: queue.filter((item) => item.type === "Inspection" && item.status !== "Complete").length,
  }), [queue]);

  async function saveAndApply() {
    setSaving(true);
    try {
      const scheduleUpdate: Record<string, unknown> = { ...schedule, updatedAt: serverTimestamp() };
      if (!inspectionTrackingStartedAt) scheduleUpdate.inspectionTrackingStartedAt = serverTimestamp();
      await setDoc(doc(db, "complianceSchedules", "default"), scheduleUpdate, { merge: true });
      const [usersSnapshot, progressSnapshot] = await Promise.all([getDocs(collection(db, "users")), getDocs(collection(db, "progress"))]);
      const users = new Map(usersSnapshot.docs.map((item) => [item.id, item.data()]));
      await Promise.all(progressSnapshot.docs.map(async (item) => {
        const data = item.data();
        if ((data.completedModules || []).length >= 8 || data.dueAt) return;
        const user = users.get(data.userId);
        if (!user || user.status === "inactive") return;
        const assigned = data.assignedAt?.toDate?.() || new Date();
        const dueAt = new Date(assigned.getTime() + schedule.onboardingDueDays * 86400000);
        await updateDoc(doc(db, "progress", item.id), { dueAt, dueSoonDays: schedule.courseDueSoonDays, updatedAt: serverTimestamp() });
      }));
      const activeTrackingStart = inspectionTrackingStartedAt || new Date();
      setInspectionTrackingStartedAt(activeTrackingStart);
      await loadQueue(schedule);
      setMessage("Scheduling saved and deadlines applied to existing incomplete course assignments.");
    } catch {
      setMessage("Scheduling could not be applied. Try again.");
    } finally { setSaving(false); }
  }

  const numberField = (label: string, key: keyof Schedule, min: number, max: number) => <label>{label}<input type="number" min={min} max={max} value={schedule[key]} onChange={(event) => setSchedule({ ...schedule, [key]: Number(event.target.value) })} /></label>;

  return <div className="content admin-scheduling">
    <div className="page-intro"><p className="eyebrow">Compliance calendar</p><h1>Schedules & overdue work</h1><p>These dates control dashboard status, automatic reminders and overdue email reports.</p></div>
    {message && <p className="admin-management-message" role="status">{message}</p>}
    <div className="admin-management-summary"><article><b>{summary.overdue}</b><span>Overdue</span></article><article><b>{summary.dueSoon}</b><span>Due soon</span></article><article><b>{summary.inspections}</b><span>Monthly inspections outstanding</span></article></div>
    <div className="schedule-editor-grid">
      <section className="admin-panel"><p className="eyebrow">Employee learning</p><h2>Course deadlines</h2>{numberField("New employee course due after (days)", "onboardingDueDays", 1, 90)}{numberField("Show due soon this many days before", "courseDueSoonDays", 1, 30)}{numberField("Certificate renewal interval (months)", "renewalMonths", 1, 36)}{numberField("Renewal reminder begins (days before)", "renewalReminderDays", 1, 120)}</section>
      <section className="admin-panel"><p className="eyebrow">Facility compliance</p><h2>Monthly inspection timing</h2>{numberField("Monthly inspection due day", "inspectionDueDay", 1, 28)}<div className="schedule-preview"><b>Automatic monthly reminders</b><span>First reminder: 7 days before</span><span>Final reminder: 3 days before</span><span>Next cycle opens: 7 days before its due date</span></div><p className="editor-safety-note">Admins only choose the recurring due day. Reminder timing is fixed and cannot be changed. Once submitted, the location stays Complete until seven days before the next due date.</p></section>
    </div>
    <button className="primary-button schedule-save" disabled={saving} onClick={() => void saveAndApply()}>{saving ? "Applying schedules…" : "Save schedules & apply deadlines"}</button>
    <section className="admin-panel">
      <div className="section-heading"><div><p className="eyebrow">Live queue</p><h2>Due and overdue records</h2></div><span>{queue.length} records</span></div>
      {queue.length ? <div className="schedule-queue">{queue.map((item) => <article key={`${item.type}-${item.id}`}><span className={`schedule-status ${item.status.toLowerCase().replace(" ", "-")}`}>{item.status}</span><div><b>{item.person}</b><small>{item.type} · {item.location}</small></div><strong>{item.status === "Complete" ? `Finished · next cycle ${dateLabel(inspectionCycleFor(new Date(), schedule.inspectionDueDay).nextOpens)}` : `Due ${dateLabel(item.due)}`}</strong></article>)}</div> : <p className="inspection-record-message">No compliance records are currently available.</p>}
    </section>
  </div>;
}
