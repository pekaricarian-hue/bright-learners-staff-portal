"use client";

import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, getDocs, query, where } from "firebase/firestore";
import { jsPDF } from "jspdf";
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
  userId?: string;
  directorName: string;
  location: string;
  status: "draft" | "completed";
  answeredCount?: number;
  failedCount?: number;
  responses?: Record<string, InspectionResponse>;
  sections?: typeof monthlyInspectionSections;
  overallNotes?: string;
  signatureName?: string;
  signatureData?: string;
  startedAt?: { toDate?: () => Date };
  updatedAt?: { toDate?: () => Date };
  completedAt?: { toDate?: () => Date };
};

type Props = {
  userId: string;
  directorName: string;
  adminMode?: boolean;
};

const totalItems = monthlyInspectionSections.reduce((sum, section) => sum + section.items.length, 0);

function dateValue(value?: { toDate?: () => Date }) {
  return value?.toDate?.() || null;
}

function formattedDate(value?: { toDate?: () => Date }) {
  const date = dateValue(value);
  return date ? new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short" }).format(date) : "Not available";
}

export default function InspectionReports({ userId, directorName, adminMode = false }: Props) {
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeDraft, setActiveDraft] = useState<InspectionRecord | null>(null);
  const [activeReport, setActiveReport] = useState<InspectionRecord | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [locationFilter, setLocationFilter] = useState("All locations");
  const [generatingPdf, setGeneratingPdf] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<InspectionRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const snapshot = adminMode
          ? await getDocs(collection(db, "inspections"))
          : await getDocs(query(collection(db, "inspections"), where("directorId", "==", userId)));
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
  }, [adminMode, refreshKey, userId]);

  const availableLocations = Array.from(new Set(records.map((record) => record.location))).sort();
  const visibleRecords = locationFilter === "All locations" ? records : records.filter((record) => record.location === locationFilter);
  const drafts = visibleRecords.filter((record) => record.status === "draft");
  const completed = visibleRecords.filter((record) => record.status === "completed");

  async function downloadPdf(record: InspectionRecord) {
    setGeneratingPdf(record.id);
    try {
      await createInspectionPdf(record);
    } finally {
      setGeneratingPdf("");
    }
  }

  async function deleteRecord(record: InspectionRecord) {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "inspections", record.id));
      if (record.status === "draft" && record.userId) {
        const pointerId = `${record.userId}_${record.location.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
        await deleteDoc(doc(db, "inspectionDrafts", pointerId)).catch(() => undefined);
      }
      setDeleteTarget(null);
      setRefreshKey((value) => value + 1);
    } finally {
      setDeleting(false);
    }
  }

  return <div className="content inspection-records-page">
    <div className="page-intro"><p className="eyebrow">{adminMode ? "Organization compliance" : "Director records"}</p><h1>{adminMode ? "All inspection records" : "Reports & drafts"}</h1><p>{adminMode ? "Review drafts and completed inspections across every Bright Learners location." : "Resume unfinished work or review completed inspection history from your profile."}</p></div>
    {adminMode && <label className="inspection-location-filter">Location<select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}><option>All locations</option>{availableLocations.map((location) => <option key={location}>{location}</option>)}</select></label>}
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
            <div className="inspection-history-actions">
              {!adminMode && <button className="primary-button" onClick={() => setActiveDraft(record)}>Resume</button>}
              <button className="outline-button danger-outline" onClick={() => setDeleteTarget(record)}>Delete draft</button>
            </div>
          </article>
        )}
      </section>
      <section data-tour="inspection-history" className="inspection-record-section">
        <div className="section-heading"><div><p className="eyebrow">Submitted records</p><h2>Inspection history</h2></div></div>
        {completed.length === 0 ? <p className="inspection-empty">Completed inspections will appear here after submission.</p> : completed.map((record) =>
          <article className="inspection-history-row" key={record.id}>
            <span className="inspection-history-status complete">Complete</span>
            <div><b>{record.location} monthly inspection</b><small>Completed {formattedDate(record.completedAt)} by {record.directorName || directorName} · {record.failedCount || 0} follow-ups</small></div>
            <div className="inspection-history-actions"><button className="outline-button" onClick={() => setActiveReport(record)}>View</button><button className="primary-button" disabled={generatingPdf === record.id} onClick={() => void downloadPdf(record)}>{generatingPdf === record.id ? "Creating..." : "Download PDF"}</button>{adminMode && <button className="outline-button danger-outline" onClick={() => setDeleteTarget(record)}>Delete record</button>}</div>
          </article>
        )}
      </section>
    </>}
    {activeDraft && <InspectionWorkflow userId={userId} directorName={directorName} location={activeDraft.location} close={() => setActiveDraft(null)} completed={() => { setActiveDraft(null); setRefreshKey((value) => value + 1); }} />}
    {activeReport && <InspectionReport record={activeReport} generating={generatingPdf === activeReport.id} download={() => void downloadPdf(activeReport)} close={() => setActiveReport(null)} />}
    {deleteTarget && <div className="inspection-validation-backdrop">
      <section className="inspection-validation-dialog compact-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="delete-record-title">
        <button className="confirmation-close" onClick={() => setDeleteTarget(null)} aria-label="Cancel deletion">×</button>
        <p className="eyebrow">{deleteTarget.status === "draft" ? "Delete draft" : "Delete submitted record"}</p>
        <h2 id="delete-record-title">Are you sure?</h2>
        <p>{deleteTarget.status === "completed" ? "Download the PDF before deleting it. This submitted compliance record cannot be recovered after deletion." : "This unfinished inspection and all saved answers will be permanently removed."}</p>
        {deleteTarget.status === "completed" && <button className="outline-button" disabled={generatingPdf === deleteTarget.id} onClick={() => void downloadPdf(deleteTarget)}>{generatingPdf === deleteTarget.id ? "Creating PDF..." : "Download PDF first"}</button>}
        <button className="danger-button" disabled={deleting} onClick={() => void deleteRecord(deleteTarget)}>{deleting ? "Deleting..." : `Yes, delete ${deleteTarget.status === "draft" ? "draft" : "record"}`}</button>
      </section>
    </div>}
  </div>;
}

function InspectionReport({ record, generating, download, close }: { record: InspectionRecord; generating: boolean; download: () => void; close: () => void }) {
  const responses = record.responses || {};
  return <div className="inspection-backdrop">
    <section className="inspection-workflow inspection-report-view" role="dialog" aria-modal="true" aria-labelledby="inspection-report-title">
      <header className="inspection-workflow-header">
        <div><p className="eyebrow">Completed inspection · {record.location}</p><h1 id="inspection-report-title">Monthly inspection report</h1><span>{formattedDate(record.completedAt)} · {record.directorName}</span></div>
        <button className="inspection-close" onClick={close} aria-label="Close inspection report">×</button>
      </header>
      <div className="inspection-report-summary"><b>{record.answeredCount || totalItems} items reviewed</b><b>{record.failedCount || 0} follow-ups</b></div>
      {(record.sections || monthlyInspectionSections).map((section, sectionIndex) => <section className="inspection-report-section" key={section.id}>
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
      <footer className="inspection-actions"><button className="outline-button" onClick={close}>Close report</button><button className="primary-button" disabled={generating} onClick={download}>{generating ? "Creating PDF..." : "Download PDF"}</button></footer>
    </section>
  </div>;
}

type PdfPhoto = {
  data: string;
  width: number;
  height: number;
};

async function photoData(url: string): Promise<PdfPhoto> {
  const response = await fetch(`/api/inspection-photo?url=${encodeURIComponent(url)}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Photo could not be loaded.");
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Photo format could not be decoded."));
      element.src = objectUrl;
    });
    const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = longestEdge > 1800 ? 1800 / longestEdge : 1;
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo could not be prepared.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return { data: canvas.toDataURL("image/jpeg", 0.86), width, height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function fittedPhotoSize(photo: PdfPhoto) {
  const scale = Math.min(300 / photo.width, 210 / photo.height, 1);
  return { width: photo.width * scale, height: photo.height * scale };
}

async function preloadPdfPhotos(record: InspectionRecord) {
  const urls = Object.values(record.responses || {})
    .map((response) => response.photoUrl)
    .filter((url): url is string => Boolean(url));
  const entries = await Promise.all(urls.map(async (url) => {
    try {
      return [url, await photoData(url)] as const;
    } catch {
      return [url, null] as const;
    }
  }));
  return new Map(entries);
}

async function loadPdfBrandImage(path: string) {
  const response = await fetch(path);
  if (!response.ok) return null;
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function createInspectionPdf(record: InspectionRecord) {
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 42;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const [photos, logo] = await Promise.all([
    preloadPdfPhotos(record),
    loadPdfBrandImage("/bright-learners-logo.png").catch(() => null),
  ]);
  let y = margin;
  const addPageIfNeeded = (height: number) => {
    if (y + height > pageHeight - 48) {
      pdf.addPage();
      y = margin;
    }
  };
  const writeWrapped = (text: string, size = 10, width = pageWidth - margin * 2, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, width);
    addPageIfNeeded(lines.length * (size + 3));
    pdf.text(lines, margin, y);
    y += lines.length * (size + 3);
  };

  if (logo) {
    pdf.addImage(logo, "PNG", margin, 24, 132, 64, undefined, "FAST");
    y = 108;
  }
  pdf.setTextColor(23, 52, 94);
  if (!logo) writeWrapped("BRIGHT LEARNERS ACADEMY", 11, pageWidth - margin * 2, true);
  y += 5;
  writeWrapped("Monthly Facility Inspection Report", 22, pageWidth - margin * 2, true);
  y += 8;
  writeWrapped(`Location: ${record.location}`, 11, pageWidth - margin * 2, true);
  writeWrapped(`Director: ${record.directorName}`, 11);
  writeWrapped(`Completed: ${formattedDate(record.completedAt)}`, 11);
  writeWrapped(`Result: ${record.answeredCount || totalItems} items reviewed · ${record.failedCount || 0} follow-ups`, 11);
  y += 14;

  const responses = record.responses || {};
  for (const [sectionIndex, section] of (record.sections || monthlyInspectionSections).entries()) {
    addPageIfNeeded(48);
    pdf.setFillColor(235, 241, 242);
    pdf.roundedRect(margin, y - 14, pageWidth - margin * 2, 30, 5, 5, "F");
    pdf.setTextColor(23, 52, 94);
    writeWrapped(`${sectionIndex + 1}. ${section.title}`, 14, pageWidth - margin * 2 - 14, true);
    y += 9;
    for (const [itemIndex, item] of section.items.entries()) {
      const answer = responses[item.id] || {};
      addPageIfNeeded(answer.note || answer.correctiveAction || answer.photoUrl ? 105 : 42);
      const label = answer.result === "na" ? "N/A" : answer.result === "fail" ? "FAIL" : "PASS";
      pdf.setTextColor(answer.result === "fail" ? 157 : 23, answer.result === "fail" ? 61 : 52, answer.result === "fail" ? 53 : 94);
      writeWrapped(`${sectionIndex + 1}.${itemIndex + 1}  [${label}]  ${item.text}`, 9, pageWidth - margin * 2, true);
      pdf.setTextColor(65, 80, 100);
      if (answer.note) writeWrapped(`Explanation: ${answer.note}`, 9);
      if (answer.correctiveAction) writeWrapped(`Corrective action: ${answer.correctiveAction}`, 9);
      if (answer.responsiblePerson || answer.dueDate) writeWrapped(`Responsible: ${answer.responsiblePerson || "Not assigned"}${answer.dueDate ? ` · Due: ${answer.dueDate}` : ""}`, 9);
      if (answer.photoUrl) {
        const photo = photos.get(answer.photoUrl);
        if (photo) {
          const size = fittedPhotoSize(photo);
          addPageIfNeeded(size.height + 18);
          pdf.setDrawColor(218, 226, 230);
          pdf.setFillColor(248, 250, 251);
          pdf.roundedRect(margin - 5, y - 5, size.width + 10, size.height + 10, 6, 6, "FD");
          pdf.addImage(photo.data, "JPEG", margin, y, size.width, size.height, undefined, "FAST");
          y += size.height + 16;
        } else {
          writeWrapped("Photo evidence is stored with the secure electronic inspection record.", 8);
        }
      }
      y += 7;
    }
  }
  if (record.overallNotes) {
    addPageIfNeeded(60);
    writeWrapped("Overall notes", 12, pageWidth - margin * 2, true);
    writeWrapped(record.overallNotes, 10);
  }
  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFontSize(8);
    pdf.setTextColor(110, 120, 135);
    pdf.text(`Bright Learners Academy · Internal inspection record · Page ${page} of ${pageCount}`, margin, pageHeight - 24);
  }
  const date = dateValue(record.completedAt) || new Date();
  const datePart = date.toISOString().slice(0, 10);
  const safeName = `${record.directorName || "Director"}_${record.location}_Inspection_${datePart}`.replace(/[^a-z0-9_-]+/gi, "_");
  pdf.save(`${safeName}.pdf`);
}
