"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { InspectionSection, monthlyInspectionSections } from "./inspection-data";

export type EditableModule = { title: string; eyebrow: string; time: string; colour: string; icon: string };

export default function AdminContent({ albertaDefaults, saskatchewanDefaults }: { albertaDefaults: EditableModule[]; saskatchewanDefaults: EditableModule[] }) {
  const [province, setProvince] = useState<"AB" | "SK">("AB");
  const [courseModules, setCourseModules] = useState<Record<"AB" | "SK", EditableModule[]>>({ AB: albertaDefaults, SK: saskatchewanDefaults });
  const [sections, setSections] = useState<InspectionSection[]>(monthlyInspectionSections);
  const [tab, setTab] = useState<"courses" | "checklist">("courses");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      getDoc(doc(db, "courses", "ab-orientation")),
      getDoc(doc(db, "courses", "sk-orientation")),
      getDoc(doc(db, "contentOverrides", "inspection-template")),
    ]).then(([ab, sk, inspection]) => {
      setCourseModules({
        AB: ab.exists() && Array.isArray(ab.data().modules) ? ab.data().modules : albertaDefaults,
        SK: sk.exists() && Array.isArray(sk.data().modules) ? sk.data().modules : saskatchewanDefaults,
      });
      if (inspection.exists() && Array.isArray(inspection.data().sections)) setSections(inspection.data().sections);
    }).catch(() => setMessage("Saved content could not be loaded. The published defaults are shown."));
  }, [albertaDefaults, saskatchewanDefaults]);

  function updateModule(index: number, field: keyof EditableModule, value: string) {
    setCourseModules((current) => ({ ...current, [province]: current[province].map((module, moduleIndex) => moduleIndex === index ? { ...module, [field]: value } : module) }));
  }

  function updateSection(sectionIndex: number, title: string) {
    setSections((current) => current.map((section, index) => index === sectionIndex ? { ...section, title } : section));
  }

  function updateItem(sectionIndex: number, itemIndex: number, text: string) {
    setSections((current) => current.map((section, index) => index === sectionIndex ? { ...section, items: section.items.map((item, position) => position === itemIndex ? { ...item, text } : item) } : section));
  }

  function addItem(sectionIndex: number) {
    setSections((current) => current.map((section, index) => index === sectionIndex ? { ...section, items: [...section.items, { id: `${section.id}-${Date.now()}`, text: "New checklist requirement" }] } : section));
  }

  function removeItem(sectionIndex: number, itemIndex: number) {
    setSections((current) => current.map((section, index) => index === sectionIndex ? { ...section, items: section.items.filter((_, position) => position !== itemIndex) } : section));
  }

  function addSection() {
    const id = `custom-${Date.now()}`;
    setSections((current) => [...current, {
      id,
      title: `New section ${current.length + 1}`,
      items: [{ id: `${id}-1`, text: "New checklist requirement" }],
    }]);
  }

  function removeSection(sectionIndex: number) {
    setSections((current) => current.filter((_, index) => index !== sectionIndex));
  }

  async function saveCourses() {
    setSaving(true);
    try {
      await Promise.all((["AB", "SK"] as const).map((code) => setDoc(doc(db, "courses", `${code.toLowerCase()}-orientation`), {
        id: `${code.toLowerCase()}-orientation`,
        province: code,
        modules: courseModules[code],
        moduleCount: courseModules[code].length,
        passMark: 100,
        updatedAt: serverTimestamp(),
      }, { merge: true })));
      setMessage("Course cards published. Employees will see these titles, descriptions and durations on reload.");
    } finally { setSaving(false); }
  }

  async function saveChecklist() {
    setSaving(true);
    try {
      await setDoc(doc(db, "contentOverrides", "inspection-template"), {
        sections,
        itemCount: sections.reduce((sum, section) => sum + section.items.length, 0),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setMessage("Inspection checklist published. New inspections will use the updated wording.");
    } finally { setSaving(false); }
  }

  return <div className="content admin-content-editor">
    <div className="page-intro"><p className="eyebrow">Content administration</p><h1>Courses & checklists</h1><p>Edit published module-card information and every monthly inspection requirement. Existing completed records are never rewritten.</p></div>
    {message && <p className="admin-management-message" role="status">{message}</p>}
    <div className="admin-editor-tabs"><button className={tab === "courses" ? "active" : ""} onClick={() => setTab("courses")}>Course modules</button><button className={tab === "checklist" ? "active" : ""} onClick={() => setTab("checklist")}>Inspection checklist</button></div>
    {tab === "courses" ? <section className="admin-panel">
      <div className="section-heading"><div><p className="eyebrow">Employee learning</p><h2>Published module cards</h2></div><select aria-label="Course province" value={province} onChange={(event) => setProvince(event.target.value as "AB" | "SK")}><option value="AB">Alberta</option><option value="SK">Saskatchewan</option></select></div>
      <p className="editor-safety-note">This editor changes the module title, summary and estimated duration. Detailed lesson slides, quiz answers and source references remain protected in the reviewed course build.</p>
      <div className="module-content-editor">{courseModules[province].map((module, index) => <article key={`${province}-${index}`}><span>{index + 1}</span><label>Module title<input value={module.title} onChange={(event) => updateModule(index, "title", event.target.value)} /></label><label>Description<textarea value={module.eyebrow} onChange={(event) => updateModule(index, "eyebrow", event.target.value)} /></label><label>Duration<input value={module.time} onChange={(event) => updateModule(index, "time", event.target.value)} /></label></article>)}</div>
      <button className="primary-button admin-publish-button" disabled={saving} onClick={() => void saveCourses()}>{saving ? "Publishing…" : "Publish course changes"}</button>
    </section> : <section className="admin-panel">
      <div className="section-heading"><div><p className="eyebrow">Monthly self-assessment</p><h2>Inspection template</h2></div><b>{sections.reduce((sum, section) => sum + section.items.length, 0)} items</b></div>
      <p className="editor-safety-note">Removing an item affects future inspections only. Submitted reports retain the wording and responses captured when they were completed.</p>
      <div className="checklist-content-editor">{sections.map((section, sectionIndex) => <details key={section.id} open={sectionIndex === 0}><summary><b>{sectionIndex + 1}. {section.title}</b><span>{section.items.length} items</span></summary><div><label>Section title<input value={section.title} onChange={(event) => updateSection(sectionIndex, event.target.value)} /></label>{section.items.map((item, itemIndex) => <article key={item.id}><span>{sectionIndex + 1}.{itemIndex + 1}</span><textarea aria-label={`Checklist item ${sectionIndex + 1}.${itemIndex + 1}`} value={item.text} onChange={(event) => updateItem(sectionIndex, itemIndex, event.target.value)} /><button aria-label={`Remove checklist item ${sectionIndex + 1}.${itemIndex + 1}`} onClick={() => removeItem(sectionIndex, itemIndex)}>Remove</button></article>)}<div className="checklist-section-actions"><button className="outline-button" onClick={() => addItem(sectionIndex)}>＋ Add checklist item</button><button className="outline-button danger-outline" onClick={() => removeSection(sectionIndex)}>Delete section</button></div></div></details>)}</div>
      <button className="outline-button add-checklist-section" onClick={addSection}>＋ Add checklist section</button>
      <button className="primary-button admin-publish-button" disabled={saving} onClick={() => void saveChecklist()}>{saving ? "Publishing…" : "Publish checklist changes"}</button>
    </section>}
  </div>;
}
