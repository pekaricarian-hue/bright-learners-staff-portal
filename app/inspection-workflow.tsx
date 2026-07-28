"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { db, storage } from "./firebase";
import { monthlyInspectionSections } from "./inspection-data";

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
  const [message, setMessage] = useState("Loading saved inspection...");
  const pointerId = `${userId}_${safe(location)}`;
  const allItems = useMemo(() => monthlyInspectionSections.flatMap((section) => section.items), []);
  const answered = allItems.filter((item) => responses[item.id]?.result).length;
  const failed = allItems.filter((item) => responses[item.id]?.result === "fail").length;
  const completionPercent = Math.round((answered / allItems.length) * 100);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
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
    if (!inspectionId) return;
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
    } catch {
      setMessage("Save failed. Your answers remain on this screen; try again before leaving.");
    } finally {
      setSaving(false);
    }
  }

  function updateItem(itemId: string, patch: Partial<Response>) {
    const next = { ...responses, [itemId]: { ...responses[itemId], ...patch } };
    setResponses(next);
    void persist(next);
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

  async function submitInspection() {
    const unanswered = allItems.filter((item) => !responses[item.id]?.result);
    const incompleteFailures = allItems.filter((item) => responses[item.id]?.result === "fail" && !responses[item.id]?.note?.trim());
    if (unanswered.length) {
      setMessage(`Answer all items before submitting. ${unanswered.length} remaining.`);
      return;
    }
    if (incompleteFailures.length) {
      setMessage(`Every failed item needs an explanation. ${incompleteFailures.length} explanation${incompleteFailures.length === 1 ? "" : "s"} missing.`);
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

  const section = monthlyInspectionSections[sectionIndex];
  return <div className="inspection-backdrop">
    <section className="inspection-workflow" role="dialog" aria-modal="true" aria-labelledby="inspection-title">
      <header className="inspection-workflow-header">
        <div><p className="eyebrow">Monthly self-assessment · {location}</p><h1 id="inspection-title">{section.title}</h1><span>Section {sectionIndex + 1} of {monthlyInspectionSections.length}</span></div>
        <button className="inspection-close" onClick={close} aria-label="Close and keep draft">×</button>
      </header>
      <div className="inspection-progress"><i style={{ width: `${completionPercent}%` }} /></div>
      <div className="inspection-progress-copy"><b>{answered} of {allItems.length} answered</b><span>{failed} follow-up{failed === 1 ? "" : "s"} · {saving ? "Saving..." : message}</span></div>
      <nav className="inspection-section-tabs" aria-label="Inspection sections">
        {monthlyInspectionSections.map((item, index) => <button key={item.id} className={sectionIndex === index ? "active" : ""} onClick={() => void moveSection(index)}><span>{index + 1}</span>{item.title}</button>)}
      </nav>
      <div className="inspection-items">
        {section.items.map((item, index) => {
          const response = responses[item.id] || {};
          return <article className={`inspection-item ${response.result || ""}`} key={item.id}>
            <div className="inspection-item-copy"><span>{sectionIndex + 1}.{index + 1}</span><p>{item.text}</p></div>
            <div className="inspection-result-buttons" role="group" aria-label={`Result for ${item.text}`}>
              <button className={response.result === "pass" ? "selected" : ""} onClick={() => updateItem(item.id, { result: "pass" })}>✓ Pass</button>
              <button className={response.result === "fail" ? "selected" : ""} onClick={() => updateItem(item.id, { result: "fail" })}>! Fail</button>
              <button className={response.result === "na" ? "selected" : ""} onClick={() => updateItem(item.id, { result: "na" })}>— N/A</button>
            </div>
            {response.result === "fail" && <div className="inspection-followup">
              <label>Why did this item fail? <em>Required</em><textarea value={response.note || ""} onChange={(event) => updateItem(item.id, { note: event.target.value })} placeholder="Describe exactly what was observed..." /></label>
              <label>Corrective action<textarea value={response.correctiveAction || ""} onChange={(event) => updateItem(item.id, { correctiveAction: event.target.value })} placeholder="What needs to be corrected?" /></label>
              <div><label>Responsible person<input value={response.responsiblePerson || ""} onChange={(event) => updateItem(item.id, { responsiblePerson: event.target.value })} placeholder="Name or role" /></label><label>Due date<input type="date" value={response.dueDate || ""} onChange={(event) => updateItem(item.id, { dueDate: event.target.value })} /></label></div>
            </div>}
            <div className="inspection-photo-row">
              <label className="inspection-camera">Camera: {uploadingItem === item.id ? "Uploading..." : response.photoUrl ? "Replace photo" : "Add optional photo"}<input type="file" accept="image/*" capture="environment" disabled={uploadingItem === item.id} onChange={(event) => void addPhoto(item.id, event)} /></label>
              {response.photoUrl && <a href={response.photoUrl} target="_blank" rel="noopener noreferrer">View {response.photoName || "photo"} ↗</a>}
            </div>
          </article>;
        })}
      </div>
      <label className="inspection-overall-notes">Section or inspection notes<textarea value={overallNotes} onChange={(event) => setOverallNotes(event.target.value)} onBlur={() => void persist(responses, sectionIndex, overallNotes)} placeholder="Optional general notes for this inspection..." /></label>
      <footer className="inspection-actions">
        <button className="outline-button" disabled={sectionIndex === 0} onClick={() => void moveSection(sectionIndex - 1)}>← Previous section</button>
        {sectionIndex < monthlyInspectionSections.length - 1 ? <button className="primary-button" onClick={() => void moveSection(sectionIndex + 1)}>Save & next section →</button> : <button className="primary-button" disabled={saving} onClick={() => void submitInspection()}>Complete inspection →</button>}
      </footer>
    </section>
  </div>;
}
