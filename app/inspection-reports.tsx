"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import InspectionWorkflow from "./inspection-workflow";
import { monthlyInspectionSections } from "./inspection-data";

type InspectionResponse = {
  result?: "pass" | "fail" | "na";
  note?: string;
  correctiveAction?: string;
  responsiblePerson?: string;
  dueDate?: string;
  photoUrl?: string;
  photoName?: string;
};

type InspectionRecord = {
  id: string;
  directorName: string;
  location: string;
  status: "draft" | "completed";
  answeredCount?: number;
  failedCount?: number;
  responses?: Record<string, InspectionResponse>;
  overallNotes?: string;
  startedAt?: { toDate?: () => Date };
  updatedAt?: { toDate?: () => Date };
  completedAt?: { toDate?: () => Date };
};

type Props = {
  userId: string;
  directorName: string;
};

const totalItems = monthlyInspectionSections.reduce((sum, section) => sum + section.items.length, 0);

function dateValue(value?: { toDate?: () => Date }) {
  return value?.toDate?.() || null;
}

function formattedDate(value?: { toDate?: () => Date }) {
  const date = dateValue(value);
  return date ? new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" }).format(date) : "Not available";
}

export default function InspectionReports({ userId, directorName }: Props) {
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeDraft, setActiveDraft] = useState<InspectionRecord | null>(null);
  const [activeReport, setActiveReport] = useState<InspectionRecord | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const snapshot = await getDocs(query(collection(db, "inspections"), where("directorId", "==", userId)));
        const next = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as InspectionRecord)).sort((a, b) => {
          const aDate = dateValue(a.completedAt || a.updatedAt || a.startedAt)?.getTime() || 0;
          const bDate = dateValue(b.completedAt || b.updatedAt || b.startedAt)?.getTime() || 0;
          return bDate - aDate;
        });
        if (active) setRecords(next);
      } catch {
        if (active) setLoadError("Inspection records could not be loaded. Refresh the page and try again.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [refreshKey, userId]);

  const drafts = records.filter((record) => record.status === "draft");
  const completed = records.filter((record) => record.status === "completed");

  return <div className="content inspection-records-page">
    <div className="page-intro"><p className="eyebrow">Director records</p><h1>Reports & drafts</h1><p>Resume unfinished work or review completed inspection history from your profile.</p></div>
    <div className="inspection-record-summary">
      <article><b>{drafts.length}</b><span>Saved draft{drafts.length === 1 ? "" : "s"}</span></article>
      <article><b>{completed.length}</b><span>Completed inspection{completed.length === 1 ? "" : "s"}</span></article>
      <article><b>{completed.reduce((sum, record) => sum + (record.failedCount || 0), 0)}</b><span>Recorded follow-ups</span></article>
    </div>
    {loading && <p className="inspection-record-message">Loading inspection records...</p>}
    {loadError && <p className="inspection-record-message error" role="alert">{loadError}</p>}
    {!loading && !loadError && <>
      <section data-tour="inspection-drafts" className="inspection-record-section">
        <div className="section-heading"><div><p className="eyebrow">Unfinished work</p><h2>Drafts</h2></div></div>
        {drafts.length === 0 ? <p className="inspection-empty">No saved drafts. A draft appears here after an inspection is started.</p> : drafts.map((record) =>
          <article className="inspection-history-row" key={record.id}>
            <span className="inspection-history-status draft">Draft</span>
            <div><b>{record.location} monthly inspection</b><small>Last saved {formattedDate(record.updatedAt)} · {record.answeredCount || 0} of {totalItems} answered</small></div>
            <button className="primary-button" onClick={() => setActiveDraft(record)}>Resume</button>
          </article>
        )}
      </section>
      <section data-tour="inspection-history" className="inspection-record-section">
        <div className="section-heading"><div><p className="eyebrow">Submitted records</p><h2>Inspection history</h2></div></div>
        {completed.length === 0 ? <p className="inspection-empty">Completed inspections will appear here after submission.</p> : completed.map((record) =>
          <article className="inspection-history-row" key={record.id}>
            <span className="inspection-history-status complete">Complete</span>
            <div><b>{record.location} monthly inspection</b><small>Completed {formattedDate(record.completedAt)} by {record.directorName || directorName} · {record.failedCount || 0} follow-ups</small></div>
            <button className="outline-button" onClick={() => setActiveReport(record)}>View report</button>
          </article>
        )}
      </section>
    </>}
    {activeDraft && <InspectionWorkflow userId={userId} directorName={directorName} location={activeDraft.location} close={() => setActiveDraft(null)} completed={() => { setActiveDraft(null); setRefreshKey((value) => value + 1); }} />}
    {activeReport && <InspectionReport record={activeReport} close={() => setActiveReport(null)} />}
  </div>;
}

function InspectionReport({ record, close }: { record: InspectionRecord; close: () => void }) {
  const responses = record.responses || {};
  return <div className="inspection-backdrop">
    <section className="inspection-workflow inspection-report-view" role="dialog" aria-modal="true" aria-labelledby="inspection-report-title">
      <header className="inspection-workflow-header">
        <div><p className="eyebrow">Completed inspection · {record.location}</p><h1 id="inspection-report-title">Monthly inspection report</h1><span>{formattedDate(record.completedAt)} · {record.directorName}</span></div>
        <button className="inspection-close" onClick={close} aria-label="Close inspection report">×</button>
      </header>
      <div className="inspection-report-summary"><b>{record.answeredCount || totalItems} items reviewed</b><b>{record.failedCount || 0} follow-ups</b></div>
      {monthlyInspectionSections.map((section, sectionIndex) => <section className="inspection-report-section" key={section.id}>
        <h2>{sectionIndex + 1}. {section.title}</h2>
        {section.items.map((item, itemIndex) => {
          const response = responses[item.id] || {};
          return <article className={`inspection-report-row ${response.result || ""}`} key={item.id}>
            <span>{sectionIndex + 1}.{itemIndex + 1}</span>
            <div><b>{item.text}</b>{response.note && <p><strong>Explanation:</strong> {response.note}</p>}{response.correctiveAction && <p><strong>Corrective action:</strong> {response.correctiveAction}</p>}{response.responsiblePerson && <p><strong>Responsible:</strong> {response.responsiblePerson}{response.dueDate ? ` · Due ${response.dueDate}` : ""}</p>}{response.photoUrl && <a href={response.photoUrl} target="_blank" rel="noopener noreferrer">View photo evidence ↗</a>}</div>
            <strong>{response.result === "na" ? "N/A" : response.result === "fail" ? "Fail" : "Pass"}</strong>
          </article>;
        })}
      </section>)}
      {record.overallNotes && <section className="inspection-report-notes"><b>Overall notes</b><p>{record.overallNotes}</p></section>}
      <footer className="inspection-actions"><span /><button className="primary-button" onClick={close}>Close report</button></footer>
    </section>
  </div>;
}
