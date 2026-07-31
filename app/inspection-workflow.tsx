"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { db, storage } from "./firebase";
import { InspectionSection, monthlyInspectionSections } from "./inspection-data";
import ExitConfirmation from "./exit-confirmation";

type Result = "pass" | "fail" | "na";
type Response = {
  result?: Result;
  note?: string;
  correctiveAction?: string;
  responsiblePerson?: string;
  dueDate?: string;
  photoUrl?: string;
  photoName?: string;
};

type Props = {
  userId: string;
  directorName: string;
  location: string;
  close: () => void;
  completed: () => void;
};

const safe = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function InspectionWorkflow({ userId, directorName, location, close, completed }: Props) {
  const [inspectionId, setInspectionId] = useState("");
  const [sectionIndex, setSectionIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, Response>>({});
  const [overallNotes, setOverallNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingItem, setUploadingItem] = useState("");
  const [exitConfirmationOpen, setExitConfirmationOpen] = useState(false);
  const [validationIssue, setValidationIssue] = useState<null | {
    title: string;
    message: string;
    sectionIndex: number;
    targetId: string;
  }>(null);
  const [sections, setSections] = useState<InspectionSection[]>(monthlyInspectionSections);
  const [message, setMessage] = useState("Loading saved inspection...");
  const pointerId = `${userId}_${safe(location)}`;
  const allItems = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const answered = allItems.filter((item) => responses[item.id]?.result).length;
  const failed = allItems.filter((item) => responses[item.id]?.result === "fail").length;
  const completionPercent = Math.round((answered / allItems.length) * 100);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const template = await getDoc(doc(db, "contentOverrides", "inspection-template"));
        if (active && template.exists() && Array.isArray(template.data().sections)) setSections(template.data().sections);
        const pointer = await getDoc(doc(db, "inspectionDrafts", pointerId));
        const existingId = pointer.exists() ? pointer.data().inspectionId : "";
        if (existingId) {
          const draft = await getDoc(doc(db, "inspections", existingId));
          if (active && draft.exists() && draft.data().status === "draft") {
            setInspectionId(existingId);
            setResponses(draft.data().responses || {});
            setOverallNotes(draft.data().overallNotes || "");
            setSectionIndex(draft.data().sectionIndex || 0);
            setMessage("Saved draft restored.");
            return;
          }
        }
        const newId = `${safe(location)}_${userId}_${Date.now()}`;
        if (!active) return;
        setInspectionId(newId);
        await setDoc(doc(db, "inspectionDrafts", pointerId), { inspectionId: newId, userId, location, updatedAt: serverTimestamp() });
        await setDoc(doc(db, "inspections", newId), {
          id: newId,
          userId,
          directorId: userId,
          directorName,
          location,
          type: "monthly-self-assessment",
          status: "draft",
          responses: {},
          overallNotes: "",
          sectionIndex: 0,
          startedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        if (active) setMessage("New monthly inspection started.");
      } catch {
        if (active) setMessage("Unable to load the saved draft. Check your connection and try again.");
      }
    }
    load();
    return () => { active = false; };
  }, [directorName, location, pointerId, userId]);

  async function persist(nextResponses: Record<string, Response>, nextSection = sectionIndex, nextNotes = overallNotes) {
    if (!inspectionId) return false;
    setSaving(true);
    try {
      await setDoc(doc(db, "inspections", inspectionId), {
        responses: nextResponses,
        overallNotes: nextNotes,
        sectionIndex: nextSection,
        answeredCount: Object.values(nextResponses).filter((response) => response.result).length,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setMessage("Progress saved.");
      return true;
    } catch {
      setMessage("Save failed. Your answers remain on this screen; try again before leaving.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function updateItem(itemId: string, patch: Partial<Response>) {
    const next = { ...responses, [itemId]: { ...responses[itemId], ...patch } };
    setResponses(next);
    void persist(next);
  }

  function setResult(itemId: string, result: Result) {
    const previous = responses[itemId]?.result;
    if (result === "pass") {
      updateItem(itemId, { result, note: "", correctiveAction: "", responsiblePerson: "", dueDate: "", photoUrl: "", photoName: "" });
      return;
    }
    if (result === "na") {
      updateItem(itemId, { result, note: previous === "na" ? responses[itemId]?.note : "", correctiveAction: "", responsiblePerson: "", dueDate: "", photoUrl: "", photoName: "" });
      return;
    }
    updateItem(itemId, { result, note: previous === "fail" ? responses[itemId]?.note : "" });
  }

  async function addPhoto(itemId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !inspectionId) return;
    setUploadingItem(itemId);
    setMessage("Uploading photo...");
    try {
      const extension = file.name.split(".").pop() || "jpg";
      const path = `inspection-evidence/${userId}/${inspectionId}/${itemId}-${Date.now()}.${safe(extension)}`;
      const fileRef = storageRef(storage, path);
      await uploadBytes(fileRef, file, { contentType: file.type || "image/jpeg" });
      const photoUrl = await getDownloadURL(fileRef);
      updateItem(itemId, { photoUrl, photoName: file.name });
      setMessage("Photo attached and progress saved.");
    } catch {
      setMessage("Photo upload failed. Check Storage permissions or try a smaller image.");
    } finally {
      setUploadingItem("");
      event.target.value = "";
    }
  }

  async function moveSection(nextIndex: number) {
    setSectionIndex(nextIndex);
    await persist(responses, nextIndex);
    document.querySelector(".inspection-workflow")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveAndExit() {
    const saved = await persist(responses, sectionIndex, overallNotes);
    if (saved) {
      setExitConfirmationOpen(false);
      close();
    }
  }

  async function submitInspection() {
    const unanswered = allItems.filter((item) => !responses[item.id]?.result);
    const undocumentedExceptions = allItems.filter((item) =>
      (responses[item.id]?.result === "fail" || responses[item.id]?.result === "na") &&
      !responses[item.id]?.note?.trim()
    );
    if (unanswered.length) {
      const first = unanswered[0];
      const targetSection = sections.findIndex((candidate) => candidate.items.some((item) => item.id === first.id));
      setValidationIssue({
        title: "The checklist is not finished",
        message: `${unanswered.length} item${unanswered.length === 1 ? " has" : "s have"} not been answered. Every item must be marked Pass, Fail or N/A before this inspection can be submitted.`,
        sectionIndex: targetSection,
        targetId: `inspection-item-${first.id}`,
      });
      return;
    }
    if (undocumentedExceptions.length) {
      const first = undocumentedExceptions[0];
      const targetSection = sections.findIndex((candidate) => candidate.items.some((item) => item.id === first.id));
      setValidationIssue({
        title: "An explanation is missing",
        message: `${undocumentedExceptions.length} Fail or N/A response${undocumentedExceptions.length === 1 ? " needs" : "s need"} an explanation before this inspection can be submitted.`,
        sectionIndex: targetSection,
        targetId: `inspection-item-${first.id}`,
      });
      return;
    }
    setSaving(true);
    try {
      await setDoc(doc(db, "inspections", inspectionId), {
        status: "completed",
        responses,
        overallNotes,
        answeredCount: allItems.length,
        failedCount: failed,
        notificationStatus: "pending",
        notificationRecipient: "admin@brightlearnersacademy.net",
        notificationType: "inspection-completed",
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await setDoc(doc(db, "inspectionDrafts", pointerId), { inspectionId: null, userId, location, updatedAt: serverTimestamp() });
      completed();
    } catch {
      setMessage("Submission failed. Your draft is still saved; please try again.");
    } finally {
      setSaving(false);
    }
  }

  function continueChecklist() {
    if (!validationIssue) return;
    const { sectionIndex: targetSection, targetId } = validationIssue;
    setValidationIssue(null);
    setSectionIndex(targetSection);
    void persist(responses, targetSection);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }));
  }

  const section = sections[sectionIndex] || sections[0];
  return <div className="inspection-backdrop">
    <section className="inspection-workflow" role="dialog" aria-modal="true" aria-labelledby="inspection-title">
      <header className="inspection-workflow-header">
        <div><p className="eyebrow">Monthly self-assessment · {location}</p><h1 id="inspection-title">{section.title}</h1><span>Section {sectionIndex + 1} of {sections.length}</span></div>
        <button className="inspection-close" onClick={() => setExitConfirmationOpen(true)} aria-label="Save progress and exit inspection">×</button>
      </header>
      <div className="inspection-progress"><i style={{ width: `${completionPercent}%` }} /></div>
      <div className="inspection-progress-copy"><b>{answered} of {allItems.length} answered</b><span>{failed} follow-up{failed === 1 ? "" : "s"} · {saving ? "Saving..." : message}</span></div>
      <nav className="inspection-section-tabs" aria-label="Inspection sections">
        {sections.map((item, index) => <button key={item.id} className={sectionIndex === index ? "active" : ""} onClick={() => void moveSection(index)}><span>{index + 1}</span>{item.title}</button>)}
      </nav>
      <label className="inspection-section-select">Checklist section<select value={sectionIndex} onChange={(event) => void moveSection(Number(event.target.value))}>{sections.map((item, index) => <option value={index} key={item.id}>{index + 1}. {item.title}</option>)}</select></label>
      <div className="inspection-items">
        {section.items.map((item, index) => {
          const response = responses[item.id] || {};
          return <article id={`inspection-item-${item.id}`} className={`inspection-item ${response.result || ""}`} key={item.id}>
            <div className="inspection-item-copy"><span>{sectionIndex + 1}.{index + 1}</span><p>{item.text}</p></div>
            <div className="inspection-result-buttons" role="group" aria-label={`Result for ${item.text}`}>
              <button className={response.result === "pass" ? "selected" : ""} onClick={() => setResult(item.id, "pass")}>✓ Pass</button>
              <button className={response.result === "fail" ? "selected" : ""} onClick={() => setResult(item.id, "fail")}>! Fail</button>
              <button className={response.result === "na" ? "selected" : ""} onClick={() => setResult(item.id, "na")}>— N/A</button>
            </div>
            {(response.result === "fail" || response.result === "na") && <div className={`inspection-followup ${response.result}`}>
              <label>{response.result === "fail" ? "Why did this item fail?" : "Why is this item not applicable?"} <em>Required</em><textarea value={response.note || ""} onChange={(event) => updateItem(item.id, { note: event.target.value })} placeholder={response.result === "fail" ? "Describe exactly what was observed..." : "Explain why this item does not apply at this location..."} /></label>
              {response.result === "fail" && <>
                <label>Corrective action<textarea value={response.correctiveAction || ""} onChange={(event) => updateItem(item.id, { correctiveAction: event.target.value })} placeholder="What needs to be corrected?" /></label>
                <div><label>Responsible person<input value={response.responsiblePerson || ""} onChange={(event) => updateItem(item.id, { responsiblePerson: event.target.value })} placeholder="Name or role" /></label><label>Due date<input type="date" value={response.dueDate || ""} onChange={(event) => updateItem(item.id, { dueDate: event.target.value })} /></label></div>
              </>}
            </div>}
            {response.result === "fail" && <div className="inspection-photo-row">
              <label className="inspection-camera">Camera: {uploadingItem === item.id ? "Uploading..." : response.photoUrl ? "Replace photo" : "Add optional photo"}<input type="file" accept="image/*" capture="environment" disabled={uploadingItem === item.id} onChange={(event) => void addPhoto(item.id, event)} /></label>
              {response.photoUrl && <a href={response.photoUrl} target="_blank" rel="noopener noreferrer">View {response.photoName || "photo"} ↗</a>}
            </div>}
          </article>;
        })}
      </div>
      <label className="inspection-overall-notes">Section or inspection notes<textarea value={overallNotes} onChange={(event) => setOverallNotes(event.target.value)} onBlur={() => void persist(responses, sectionIndex, overallNotes)} placeholder="Optional general notes for this inspection..." /></label>
      <footer className="inspection-actions">
        <button className="outline-button" disabled={sectionIndex === 0} onClick={() => void moveSection(sectionIndex - 1)}>← Previous section</button>
        {sectionIndex < sections.length - 1 ? <button className="primary-button" onClick={() => void moveSection(sectionIndex + 1)}>Save & next section →</button> : <button className="primary-button" disabled={saving} onClick={() => void submitInspection()}>Complete inspection →</button>}
      </footer>
    </section>
    {exitConfirmationOpen && <ExitConfirmation
      title="Save this inspection and exit?"
      message="Your answers, notes, photos and current section will be saved. You can resume this inspection later from the same location."
      saving={saving}
      stay={() => setExitConfirmationOpen(false)}
      saveAndExit={saveAndExit}
    />}
    {validationIssue && <div className="inspection-validation-backdrop">
      <section className="inspection-validation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="inspection-validation-title">
        <span aria-hidden="true">!</span>
        <p className="eyebrow">Cannot submit yet</p>
        <h2 id="inspection-validation-title">{validationIssue.title}</h2>
        <p>{validationIssue.message}</p>
        <button className="primary-button" onClick={continueChecklist}>Continue with checklist</button>
        <button className="text-button" onClick={() => setValidationIssue(null)}>Stay here</button>
      </section>
    </div>}
  </div>;
}
