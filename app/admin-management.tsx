"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

type Role = "employee" | "director" | "admin" | "owner";
type Province = "AB" | "SK";
type Staff = {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  location: string;
  province: Province;
  status?: "active" | "inactive";
};
type Academy = { id: string; name: string; province: Province; directorName: string; directorEmail: string; active: boolean };

const defaults: Academy[] = [
  { id: "sundance", name: "Sundance", province: "AB", directorName: "Margaret Ferriss", directorEmail: "Sundance@brightlearnersacademy.net", active: true },
  { id: "midnapore", name: "Midnapore", province: "AB", directorName: "Karla Buick", directorEmail: "Midnapore@brightlearnersacademy.net", active: true },
  { id: "sylvan-lake", name: "Sylvan Lake", province: "AB", directorName: "Sherry Murphy", directorEmail: "sylvandaycare@gmail.com", active: true },
  { id: "millwoods", name: "Millwoods", province: "AB", directorName: "Evelyn Mahmoudi", directorEmail: "Millwoods@brightlearnersacademy.net", active: true },
  { id: "willowgrove", name: "Willowgrove", province: "SK", directorName: "Merilyn Guzman", directorEmail: "Willowgrove@brightlearnersacademy.net", active: true },
];
const safeId = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function AdminManagement({ openContent: _openContent }: { openContent: () => void }) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("All locations");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState({ email: "", role: "employee" as Role, location: "Sundance" });
  const [academy, setAcademy] = useState({ name: "", province: "AB" as Province, directorName: "", directorEmail: "" });

  async function refresh() {
    setLoading(true);
    const [usersSnapshot, locationsSnapshot] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(collection(db, "academyLocations")),
    ]);
    setStaff(usersSnapshot.docs.map((item) => ({ uid: item.id, ...item.data() } as Staff)).sort((a, b) => a.displayName.localeCompare(b.displayName)));
    setAcademies(locationsSnapshot.empty ? defaults : locationsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Academy)).sort((a, b) => a.name.localeCompare(b.name)));
    setLoading(false);
  }

  useEffect(() => { void refresh().catch(() => { setLoading(false); setMessage("Unable to load staff management."); }); }, []);

  const visible = useMemo(() => staff.filter((person) => {
    const query = search.trim().toLowerCase();
    return (locationFilter === "All locations" || person.location === locationFilter)
      && (!query || `${person.displayName} ${person.email}`.toLowerCase().includes(query));
  }), [staff, search, locationFilter]);

  async function saveStaff(person: Staff, changes: Partial<Staff>) {
    const next = { ...person, ...changes };
    if (next.role === "owner") return;
    await updateDoc(doc(db, "users", person.uid), {
      role: next.role,
      location: next.location,
      province: next.location === "Willowgrove" ? "SK" : "AB",
      status: next.status || "active",
      updatedAt: serverTimestamp(),
    });
    setStaff((current) => current.map((item) => item.uid === person.uid ? { ...next, province: next.location === "Willowgrove" ? "SK" : "AB" } : item));
    setMessage(`${person.displayName} updated.`);
  }

  async function createInvitation(event: FormEvent) {
    event.preventDefault();
    const email = invite.email.trim().toLowerCase();
    if (!email) return;
    await setDoc(doc(db, "staffInvitations", email), {
      email,
      role: invite.role,
      location: invite.location,
      province: invite.location === "Willowgrove" ? "SK" : "AB",
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setInvite((current) => ({ ...current, email: "" }));
    setMessage(`Access assignment saved for ${email}. They can now create their account.`);
  }

  async function saveAcademy(event: FormEvent) {
    event.preventDefault();
    const id = safeId(academy.name);
    if (!id) return;
    const record: Academy = { id, ...academy, active: true };
    await setDoc(doc(db, "academyLocations", id), { ...record, updatedAt: serverTimestamp() }, { merge: true });
    setAcademies((current) => [...current.filter((item) => item.id !== id), record].sort((a, b) => a.name.localeCompare(b.name)));
    setAcademy({ name: "", province: "AB", directorName: "", directorEmail: "" });
    setMessage(`${record.name} saved.`);
  }

  return <div className="content admin-management">
    <div className="page-intro"><p className="eyebrow">Administration</p><h1>Staff & locations</h1><p>Assign access, academy location and provincial training. Changes apply to the employee’s next portal load.</p></div>
    {message && <p className="admin-management-message" role="status">{message}</p>}
    <div className="admin-management-summary"><article><b>{staff.filter((item) => item.status !== "inactive").length}</b><span>Active staff</span></article><article><b>{staff.filter((item) => item.role === "director").length}</b><span>Directors</span></article><article><b>{academies.filter((item) => item.active).length}</b><span>Locations</span></article></div>
    <section className="admin-panel">
      <div className="section-heading"><div><p className="eyebrow">Directory</p><h2>Staff accounts</h2></div></div>
      <div className="admin-directory-filters"><input aria-label="Search staff" placeholder="Search name or email" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Filter by location" value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}><option>All locations</option>{academies.map((item) => <option key={item.id}>{item.name}</option>)}</select></div>
      {loading ? <p>Loading staff…</p> : <div className="staff-directory">{visible.map((person) => <article key={person.uid}>
        <span className="staff-avatar">{person.displayName?.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?"}</span>
        <div className="staff-identity"><b>{person.displayName || "Profile incomplete"}</b><small>{person.email}</small></div>
        <label>Role<select value={person.role} disabled={person.role === "owner"} onChange={(event) => void saveStaff(person, { role: event.target.value as Role })}><option value="employee">Employee</option><option value="director">Director</option><option value="admin">Admin</option>{person.role === "owner" && <option value="owner">Owner</option>}</select></label>
        <label>Location<select value={person.location} disabled={person.role === "owner"} onChange={(event) => void saveStaff(person, { location: event.target.value })}>{academies.filter((item) => item.active).map((item) => <option key={item.id}>{item.name}</option>)}</select></label>
        <button className={person.status === "inactive" ? "brand-button" : "outline-button"} disabled={person.role === "owner"} onClick={() => void saveStaff(person, { status: person.status === "inactive" ? "active" : "inactive" })}>{person.status === "inactive" ? "Reactivate" : "Deactivate"}</button>
      </article>)}</div>}
    </section>
    <div className="admin-management-grid">
      <form className="admin-panel" onSubmit={createInvitation}><p className="eyebrow">Account assignment</p><h2>Pre-authorize staff</h2><p>Save a staff member’s role and academy before they register. Their assignment will be applied automatically when they create the account.</p><label>Email<input type="email" required value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} placeholder="employee@example.com" /></label><label>Role<select value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value as Role })}><option value="employee">Employee</option><option value="director">Director</option><option value="admin">Admin</option></select></label><label>Location<select value={invite.location} onChange={(event) => setInvite({ ...invite, location: event.target.value })}>{academies.filter((item) => item.active).map((item) => <option key={item.id}>{item.name}</option>)}</select></label><button className="primary-button">Save account assignment</button></form>
      <form className="admin-panel" onSubmit={saveAcademy}><p className="eyebrow">Academy directory</p><h2>Add or update a location</h2><label>Location name<input required value={academy.name} onChange={(event) => setAcademy({ ...academy, name: event.target.value })} /></label><label>Province<select value={academy.province} onChange={(event) => setAcademy({ ...academy, province: event.target.value as Province })}><option value="AB">Alberta</option><option value="SK">Saskatchewan</option></select></label><label>Director name<input value={academy.directorName} onChange={(event) => setAcademy({ ...academy, directorName: event.target.value })} /></label><label>Director email<input type="email" value={academy.directorEmail} onChange={(event) => setAcademy({ ...academy, directorEmail: event.target.value })} /></label><button className="primary-button">Save location</button></form>
    </div>
  </div>;
}
