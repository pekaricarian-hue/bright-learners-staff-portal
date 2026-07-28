"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  GoogleAuthProvider,
  User,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

type View = "dashboard" | "employee" | "resources" | "director" | "admin";
type PortalMode = "chooser" | "learning" | "inspection" | "admin";
type Province = "AB" | "SK";
type StaffRole = "employee" | "director" | "admin" | "owner";
type StaffProfile = {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  role: StaffRole;
  location: string;
  province: Province;
  status: "active";
  renewalIntervalMonths: 12;
};

const albertaModules = [
  { title: "Welcome to Bright Learners", eyebrow: "Your role & responsibilities", time: "12 min", colour: "sun", icon: "⌂" },
  { title: "Healthy children, healthy centre", eyebrow: "Illness, hygiene & outbreaks", time: "18 min", colour: "blue", icon: "+" },
  { title: "Clean toys, safer play", eyebrow: "Cleaning & disinfection", time: "16 min", colour: "rose", icon: "✦" },
  { title: "Food, allergies & safe meals", eyebrow: "Every bite handled safely", time: "14 min", colour: "green", icon: "◇" },
  { title: "Diapering, sleep & daily care", eyebrow: "Safe routines", time: "18 min", colour: "lavender", icon: "☾" },
  { title: "Emergencies & safe spaces", eyebrow: "Ready when it matters", time: "20 min", colour: "orange", icon: "!" },
];
const saskatchewanModules = [
  { title: "Welcome to Willowgrove", eyebrow: "Your role, centre & Saskatchewan framework", time: "18 min", colour: "sun", icon: "⌂" },
  { title: "Illness & communicable disease", eyebrow: "Exclusion, isolation, records & notification", time: "22 min", colour: "blue", icon: "+" },
  { title: "Hand hygiene, diapering & cleaning", eyebrow: "Four-step tables and cross-contamination", time: "20 min", colour: "rose", icon: "✦" },
  { title: "Medication, allergies & emergency plans", eyebrow: "Locked storage and dual verification", time: "18 min", colour: "lavender", icon: "◇" },
  { title: "Food service & safe meals", eyebrow: "Onsite preparation and food from home", time: "16 min", colour: "green", icon: "○" },
  { title: "Supervision & hazardous items", eyebrow: "Positioning, headcounts and safe storage", time: "22 min", colour: "orange", icon: "◎" },
  { title: "Emergencies, fire drills & incidents", eyebrow: "Evacuation, reporting and first response", time: "20 min", colour: "blue", icon: "!" },
  { title: "Child guidance & duty to report", eyebrow: "Positive guidance and child protection", time: "18 min", colour: "green", icon: "♡" },
];

const locations = ["Sundance", "Midnapore", "Sylvan Lake", "Millwoods", "Willowgrove"];
const directorLocations: Record<string, string> = {
  "sylvandaycare@gmail.com": "Sylvan Lake",
  "sundance@brightlearnersacademy.net": "Sundance",
  "midnapore@brightlearnersacademy.net": "Midnapore",
  "millwoods@brightlearnersacademy.net": "Millwoods",
  "willowgrove@brightlearnersacademy.net": "Willowgrove",
};
const ownerEmails = new Set(["pekaric.arian@gmail.com"]);
const adminEmails = new Set(["admin@brightlearnersacademy.net"]);
const directorEmails = new Set([
  ...Object.keys(directorLocations),
  "vick@brightlearnersacademy.net",
  "darin@brightlearnersacademy.net",
  "imroz@brightlearnersacademy.net",
  "ruby@brightlearnersacademy.net",
  "payroll@brightlearnersacademy.net",
]);

function roleForEmail(email: string): StaffRole {
  if (ownerEmails.has(email)) return "owner";
  if (adminEmails.has(email)) return "admin";
  if (directorEmails.has(email)) return "director";
  return "employee";
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [portalMode, setPortalMode] = useState<PortalMode>("chooser");
  const [location, setLocation] = useState("Sundance");
  const signedInEmail = user?.email?.toLowerCase() ?? "";
  const canAdmin = profile?.role === "admin" || profile?.role === "owner";
  const canInspect = canAdmin || profile?.role === "director";

  useEffect(() => onAuthStateChanged(auth, async (next) => {
    setUser(next);
    setProfile(null);
    setPortalMode("chooser");
    setView("dashboard");
    if (next) {
      try {
        const snapshot = await getDoc(doc(db, "users", next.uid));
        if (snapshot.exists()) {
          const savedProfile = snapshot.data() as StaffProfile;
          setProfile(savedProfile);
          setLocation(savedProfile.location);
        }
      } catch {
        setMessage("Your account is signed in, but its staff profile could not be loaded.");
      }
    }
    setLoading(false);
  }), []);

  async function createProfile(firstName: string, lastName: string, selectedLocation: string) {
    if (!user || !signedInEmail) return;
    const finalLocation = directorLocations[signedInEmail] || selectedLocation;
    const newProfile: StaffProfile = {
      uid: user.uid,
      email: signedInEmail,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      displayName: `${firstName.trim()} ${lastName.trim()}`.trim(),
      role: roleForEmail(signedInEmail),
      location: finalLocation,
      province: finalLocation === "Willowgrove" ? "SK" : "AB",
      status: "active",
      renewalIntervalMonths: 12,
    };
    await setDoc(doc(db, "users", user.uid), {
      ...newProfile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastSignInAt: serverTimestamp(),
    });
    await setDoc(doc(db, "progress", `${user.uid}_${newProfile.province.toLowerCase()}-orientation`), {
      userId: user.uid,
      courseId: `${newProfile.province.toLowerCase()}-orientation`,
      completedModules: [],
      currentModule: 0,
      renewalIntervalMonths: 12,
      assignedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setProfile(newProfile);
    setLocation(finalLocation);
  }

  async function updateProfileName(firstName: string, lastName: string) {
    if (!user || !profile) return;
    const updatedProfile = {
      ...profile,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      displayName: `${firstName.trim()} ${lastName.trim()}`.trim(),
    };
    await setDoc(doc(db, "users", user.uid), {
      firstName: updatedProfile.firstName,
      lastName: updatedProfile.lastName,
      displayName: updatedProfile.displayName,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setProfile(updatedProfile);
    setEditProfileOpen(false);
  }

  async function emailLogin(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setMessage("We couldn’t sign you in. Check your email and password.");
    }
  }

  async function googleLogin() {
    setMessage("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch {
      setMessage("Google sign-in was cancelled or unavailable.");
    }
  }

  async function resetPassword() {
    if (!email) return setMessage("Enter your email first, then choose reset password.");
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage("Password reset email sent.");
    } catch {
      setMessage("We couldn’t send a reset email for that address.");
    }
  }

  if (loading) return <main className="loading">Opening your learning space…</main>;

  if (!user) {
    return (
      <main className="landing">
        <div className="paper-noise" />
        <div className="animated-doodles" aria-hidden="true" />
        <header className="landing-nav">
          <a className="brand" href="https://brightlearnersacademy.net/" aria-label="Bright Learners Academy home">
            <Image className="brand-logo" src="/bright-learners-logo.png" alt="Bright Learners Academy" width={250} height={122} priority />
          </a>
          <span className="secure-pill">Private staff portal</span>
        </header>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Learn • practise • remember</p>
            <h1>Everything your team needs to feel ready.</h1>
            <p className="hero-text">Complete province-specific onboarding, keep inspection records organized, and make every important answer easy to find.</p>
          </div>
          <form className="login-card" onSubmit={emailLogin}>
            <div className="card-pin" />
            <p className="handwritten">Welcome back!</p>
            <h2>Sign in to continue</h2>
            <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@brightlearnersacademy.net" required /></label>
            <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required /></label>
            <button className="primary-button" type="submit">Sign in</button>
            <button className="google-button" type="button" onClick={googleLogin}><b>G</b> Continue with Google</button>
            <button className="text-button" type="button" onClick={resetPassword}>Reset password</button>
            {message && <p className="form-message" role="status">{message}</p>}
            <p className="tiny">Accounts are created by an administrator. Contact your director if you need access.</p>
          </form>
        </section>
      </main>
    );
  }

  if (!profile) {
    return <ProfileSetup user={user} fixedLocation={directorLocations[signedInEmail]} save={createProfile} signOutUser={() => signOut(auth)} />;
  }

  const assignedLocation = profile.location;
  const assignedProvince = profile.province;
  const activePortal = portalMode === "chooser" && !canInspect ? "learning" : portalMode;
  if (activePortal === "chooser") {
    return <PortalChooser name={profile.displayName} canAdmin={canAdmin} choose={(portal) => {
      setPortalMode(portal);
      setView(portal === "inspection" ? "director" : portal === "admin" ? "admin" : "dashboard");
    }} signOutUser={() => signOut(auth)} />;
  }

  return (
    <main className="portal">
      <section className="workspace">
        <header className="portal-topbar">
          <Link className="portal-logo-link" href="/" onClick={() => setView(activePortal === "inspection" ? "director" : activePortal === "admin" ? "admin" : "dashboard")}><Image src="/bright-learners-logo.png" alt="Bright Learners Academy staff portal" width={210} height={102} priority /></Link>
          <nav aria-label="Portal">
            {activePortal === "learning" && <><button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>Dashboard</button><button className={view === "employee" ? "active" : ""} onClick={() => setView("employee")}>My Learning</button><button className={view === "resources" ? "active" : ""} onClick={() => setView("resources")}>Resources</button></>}
            {activePortal === "inspection" && <><span className="portal-name">Director Inspection Portal</span><button className="active" onClick={() => setView("director")}>Inspection dashboard</button></>}
            {activePortal === "admin" && <><span className="portal-name">Administration Console</span><button className="active" onClick={() => setView("admin")}>Organization overview</button></>}
          </nav>
          <div className="user-chip"><span>{profile.firstName[0]?.toUpperCase() || "S"}</span><div><b>{profile.displayName}</b><small>{profile.location} · {profile.role}</small></div></div>
          <div className="account-actions">{canInspect && <button onClick={() => setPortalMode("chooser")}>Switch portal</button>}<button onClick={() => setEditProfileOpen(true)}>Edit profile</button><button onClick={() => signOut(auth)}>Sign out</button></div>
        </header>

        {activePortal === "learning" && view === "dashboard" && <DashboardView name={profile.displayName} location={assignedLocation} province={assignedProvince} setView={setView} />}
        {activePortal === "learning" && view === "employee" && <EmployeeView location={assignedLocation} province={assignedProvince} />}
        {activePortal === "learning" && view === "resources" && <ResourcesView location={assignedLocation} province={assignedProvince} />}
        {activePortal === "inspection" && <DirectorView location={location} setLocation={setLocation} />}
        {activePortal === "admin" && <AdminView />}
      </section>
      {editProfileOpen && <EditProfile profile={profile} save={updateProfileName} close={() => setEditProfileOpen(false)} />}
    </main>
  );
}

function ProfileSetup({ user, fixedLocation, save, signOutUser }: { user: User; fixedLocation?: string; save: (firstName: string, lastName: string, location: string) => Promise<void>; signOutUser: () => void }) {
  const displayParts = (user.displayName || "").trim().split(/\s+/);
  const [firstName, setFirstName] = useState(displayParts[0] || "");
  const [lastName, setLastName] = useState(displayParts.slice(1).join(" "));
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const chosenLocation = fixedLocation || selected;
  return <main className="location-assignment"><header><Image src="/bright-learners-logo.png" alt="Bright Learners Academy" width={230} height={112} priority /><button onClick={signOutUser}>Sign out</button></header><section><p className="eyebrow">Set up your staff profile</p><h1>Confirm your name and academy.</h1><p>Your name will appear on your final internal orientation certificate. Your academy permanently assigns the correct provincial course unless an administrator changes it.</p><div className="profile-name-fields"><label>Legal first name<input required autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Enter your legal first name" /></label><label>Legal last name<input required autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Enter your legal last name" /></label></div>{fixedLocation ? <label>Bright Learners location<input value={fixedLocation} disabled /></label> : <label>Bright Learners location<select value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Choose your location</option>{locations.map((academy) => <option key={academy} value={academy}>{academy}{academy === "Willowgrove" ? " — Saskatchewan" : " — Alberta"}</option>)}</select></label>}<button className="brand-button" disabled={!firstName.trim() || !lastName.trim() || !chosenLocation || saving} onClick={async () => { setSaving(true); try { await save(firstName, lastName, chosenLocation); } finally { setSaving(false); } }}>{saving ? "Saving…" : "Create my profile →"}</button><small>Selected the wrong location? Ask an administrator to update your assignment.</small></section></main>;
}

function EditProfile({ profile, save, close }: { profile: StaffProfile; save: (firstName: string, lastName: string) => Promise<void>; close: () => void }) {
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [saving, setSaving] = useState(false);
  return <div className="profile-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="profile-editor" role="dialog" aria-modal="true" aria-labelledby="edit-profile-title"><button className="profile-editor-close" onClick={close} aria-label="Close profile editor">×</button><p className="eyebrow">Certificate details</p><h2 id="edit-profile-title">Edit your staff profile</h2><p>Use your legal name exactly as it should appear on your final orientation certificate.</p><div className="profile-name-fields"><label>Legal first name<input required autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Enter your legal first name" /></label><label>Legal last name<input required autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Enter your legal last name" /></label></div><label>Assigned academy<input value={`${profile.location} — ${profile.province === "SK" ? "Saskatchewan" : "Alberta"}`} disabled /></label><button className="brand-button" disabled={!firstName.trim() || !lastName.trim() || saving} onClick={async () => { setSaving(true); try { await save(firstName, lastName); } finally { setSaving(false); } }}>{saving ? "Saving…" : "Save profile"}</button><small>Contact an administrator if your academy assignment needs to change.</small></section></div>;
}

function PortalChooser({ name, canAdmin, choose, signOutUser }: { name: string; canAdmin: boolean; choose: (portal: PortalMode) => void; signOutUser: () => void }) {
  return <main className="portal-chooser"><header><Image src="/bright-learners-logo.png" alt="Bright Learners Academy" width={230} height={112} priority /><button onClick={signOutUser}>Sign out</button></header><section><p className="eyebrow">Private staff access</p><h1>Where would you like to go, {name.split(" ")[0]}?</h1><p>Learning and facility inspections are separate workspaces with different tools and records.</p><div className="portal-choice-grid"><button onClick={() => choose("learning")}><span className="choice-icon learning-choice">⌂</span><small>For all staff</small><h2>Employee Learning</h2><p>Complete onboarding modules, take assessments, review resources and download certificates.</p><b>Open learning portal →</b></button><button onClick={() => choose("inspection")}><span className="choice-icon inspection-choice">✓</span><small>For directors</small><h2>Director Inspections</h2><p>Run facility checklists, document follow-ups, attach evidence and export inspection records.</p><b>Open inspection portal →</b></button>{canAdmin && <button onClick={() => choose("admin")}><span className="choice-icon admin-choice">A</span><small>For executives</small><h2>Admin Console</h2><p>Manage staff access, courses, checklists, deadlines and organization-wide compliance.</p><b>Open admin console →</b></button>}</div></section></main>;
}

function DashboardView({ name, location, province, setView }: { name: string; location: string; province: Province; setView: (view: View) => void }) {
  return <div className="content dashboard-content">
    <section className="dashboard-greeting"><div><p className="eyebrow">{location} • {province === "SK" ? "Saskatchewan" : "Alberta"} course</p><h1>Welcome, {name.split(" ")[0]}.</h1><p>Continue your assigned onboarding or find a policy for your academy.</p></div><div className="dashboard-sun" aria-hidden="true">☼</div></section>
    <div className="dashboard-stat-grid">
      <article className="pastel-blue"><span className="line-symbol">✓</span><b>1 of {province === "SK" ? 8 : 6}</b><strong>Modules complete</strong><small>Your onboarding progress</small></article>
      <article className="pastel-green"><span className="line-symbol">◎</span><b>100%</b><strong>Required pass mark</strong><small>Every knowledge check</small></article>
      <article className="pastel-yellow"><span className="line-symbol">↗</span><b>120</b><strong>Learning points</strong><small>Earned so far</small></article>
      <article className="pastel-lilac"><span className="line-symbol">◷</span><b>12 min</b><strong>Next lesson</strong><small>Welcome to Bright Learners</small></article>
    </div>
    <div className="dashboard-columns">
      <section className="continue-panel"><div><p className="eyebrow">Continue learning</p><h2>Welcome to Bright Learners</h2><p>Meet the organization, understand your role, and learn the standards that guide every academy.</p><div className="dashboard-progress"><i /></div><small>1 of 8 lesson slides viewed</small></div><button className="brand-button" onClick={() => setView("employee")}>Continue module →</button></section>
      <section className="dashboard-links"><p className="eyebrow">Quick access</p><button onClick={() => setView("resources")}><span>?</span><div><b>Policies & resources</b><small>Official documents and quick guides</small></div>→</button><button onClick={() => setView("employee")}><span>✓</span><div><b>Required learning</b><small>Continue assigned modules</small></div>→</button><button onClick={() => setView("employee")}><span>☆</span><div><b>My certificates</b><small>Completed training records</small></div>→</button></section>
    </div>
  </div>;
}

function ResourcesView({ location, province }: { location: string; province: Province }) {
  const resources = [
    ["Health & safety", "AHS childcare health and safety guidance", "AB"],
    ["Cleaning & disinfecting", "Toy, surface and equipment procedures", "AB"],
    ["Diapering procedure", "Step-by-step reference poster", "AB"],
    ["Licensing handbook", "Facility-based child care requirements", "AB"],
    ["Communicable disease", "School and child care centre guidance", "SK"],
    ["Bright Learners orientation", "Company expectations and program philosophy", "BLA"],
  ];
  const assignedResources = resources.filter((resource) => resource[2] === province || resource[2] === "BLA");
  return <div className="content resources-content"><div className="page-intro"><p className="eyebrow">{location} reference library</p><h1>Resources</h1><p>Only your assigned provincial policies and Bright Learners guides are shown here.</p></div><div className="resource-grid">{assignedResources.map(([title, description, resourceProvince], index) => <article key={title}><span className={`resource-icon resource-${index + 1}`}>{index + 1}</span><small>{resourceProvince} resource</small><h2>{title}</h2><p>{description}</p><button>Open resource →</button></article>)}</div></div>;
}

function EmployeeView({ location, province }: { location: string; province: Province }) {
  const [completedCount, setCompletedCount] = useState(1);
  const [selectedModule, setSelectedModule] = useState<number | null>(null);
  const [lessonOpen, setLessonOpen] = useState(false);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [answer, setAnswer] = useState("");
  const [quizMessage, setQuizMessage] = useState("");
  const modules = province === "AB" ? albertaModules : saskatchewanModules;
  const completion = Math.round((completedCount / modules.length) * 100);

  function checkAnswer() {
    if (answer === "after-each-child") {
      setQuizMessage("Correct — 100%. The next module is now unlocked.");
      setCompletedCount((current) => Math.max(current, 2));
    } else {
      setQuizMessage("Not quite. Review the cleaning frequency and try again.");
    }
  }

  return <div className="content learning-content">
    <section className="learning-intro">
      <div><p className="handwritten">Your learning path</p><h2>{location} • {province === "AB" ? "Alberta employee orientation" : "Saskatchewan employee orientation"}</h2><p>This is the course assigned to your academy. It combines Bright Learners procedures with the rules and public-health guidance that apply to your location.</p></div>
      <div className="course-progress"><b>{completion}%</b><span>{completedCount} of {modules.length} complete</span></div>
    </section>
    {province === "SK" && <section className="sk-status-alert"><span>SK</span><div><b>Willowgrove is operating under a provisional licence.</b><p>Close monitoring is expected for six months. The Ministry licence copy is still pending. Site directions and verbal Public Health guidance are identified separately from written requirements.</p></div></section>}
    <aside className="course-assignment-note"><b>{province === "SK" ? "Saskatchewan" : "Alberta"} course assigned through {location}.</b><span>Need a different assignment? Contact an administrator.</span></aside>

    <section className="professional-modules" aria-label="Course modules">
      <div className="module-list-heading"><div><p className="eyebrow">Required learning</p><h3>Your modules</h3></div><span>Complete in order</span></div>
      <div className="professional-module-grid">
        {modules.map((module, index) => {
          const complete = index < completedCount;
          const available = true;
          return <article className={`professional-module ${complete ? "complete" : available ? "current" : "locked"}`} key={module.title}>
            <button className="module-card-button" disabled={!available} onClick={() => { setSelectedModule(index); setLessonOpen(false); setQuizMessage(""); setAnswer(""); }}>
              <div className={`module-media-preview media-${index + 1}`} aria-hidden="true"><span className="program-icon">{module.icon}</span><small>{module.eyebrow}</small></div>
              <div className="module-card-top"><span className={`module-number ${module.colour}`}>{complete ? "✓" : index + 1}</span><span className="module-time">{module.time}</span></div>
              <div className="module-card-main"><small>Module {index + 1}</small><h3>{module.title}</h3></div>
              <div className="module-hover-description"><p>{module.eyebrow}</p><span>{complete ? "Completed • Review anytime" : available ? "Ready to continue" : "Complete the previous module to unlock"}</span></div>
              <div className="module-status-line"><i /><span>{complete ? "Complete" : available ? "In progress" : "Locked"}</span></div>
            </button>
            {favorites.includes(index) && <span className="favorite-marker" aria-label="Favorited">★</span>}
          </article>;
        })}
      </div>
    </section>

    <aside className="source-note"><b>Every lesson is traceable.</b><p>Official requirements link to their authority, document, page and section. Bright Learners policies are clearly labelled, and current official policy always takes priority.</p></aside>

    {selectedModule !== null && !lessonOpen && <div className="module-preview-backdrop" role="dialog" aria-modal="true" aria-labelledby="module-preview-title" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedModule(null); }}>
      <section className="module-preview-card">
        <button className="lesson-close" onClick={() => setSelectedModule(null)} aria-label="Close module">×</button>
        <div className={`preview-icon ${modules[selectedModule].colour}`}>{selectedModule < completedCount ? "✓" : String(selectedModule + 1).padStart(2, "0")}</div>
        <p className="eyebrow">Module {selectedModule + 1} • {modules[selectedModule].time}</p>
        <h2 id="module-preview-title">{modules[selectedModule].title}</h2>
        <p className="preview-description">{modules[selectedModule].eyebrow}. Work through the lesson, review its official references, then complete the knowledge check with 100%.</p>
        <div className="preview-meta"><span><b>{selectedModule < completedCount ? "Complete" : "Available"}</b>Status</span><span><b>100%</b>Pass mark</span><span><b>{province}</b>Course</span></div>
        <button className="primary-button preview-start" onClick={() => setLessonOpen(true)}>{selectedModule < completedCount ? "Review module" : "Start module"}</button>
        <button className={`favorite-button ${favorites.includes(selectedModule) ? "active" : ""}`} onClick={() => setFavorites((current) => current.includes(selectedModule) ? current.filter((item) => item !== selectedModule) : [...current, selectedModule])}>{favorites.includes(selectedModule) ? "★ Favorited" : "☆ Add to favorites"}</button>
      </section>
    </div>}

    {selectedModule !== null && lessonOpen && <div className="lesson-backdrop" role="dialog" aria-modal="true" aria-labelledby="lesson-title">
      <section className="lesson-drawer">
        <button className="lesson-close" onClick={() => { setLessonOpen(false); setSelectedModule(null); }} aria-label="Close lesson">×</button>
        <p className="eyebrow">Module {selectedModule + 1} • {province === "AB" ? "Alberta" : "Saskatchewan"} orientation</p>
        <h2 id="lesson-title">{modules[selectedModule].title}</h2>
        {province === "SK" ? <SaskatchewanModuleLesson moduleIndex={selectedModule} /> : selectedModule === 0 ? <WelcomeLesson /> : selectedModule === 1 ? <HealthLesson answer={answer} setAnswer={setAnswer} checkAnswer={checkAnswer} message={quizMessage} /> :
          <div className="lesson-placeholder"><span>{modules[selectedModule].icon}</span><h3>This lesson is on the board.</h3><p>Its complete cited content and knowledge check are being assembled from Bright Learners orientation material and the applicable Alberta requirements.</p></div>}
      </section>
    </div>}
  </div>;
}

type OrientationSlide = { kicker: string; title: string; body: string; points?: string[]; media?: string; ref: string };

function WelcomeLesson() {
  const [slide, setSlide] = useState(0);
  const slides: OrientationSlide[] = [
    { kicker: "Welcome", title: "You are now part of Bright Learners", body: "Bright Learners began in Alberta in 2015 and has grown into a multi-location childcare organization. Every location shares the same commitment: children should feel safe, known and excited to learn.", media: "Founders’ welcome video", ref: "Bright Learners Orientation, May 2026 — slides 1–3" },
    { kicker: "Our purpose", title: "Safe, nurturing and built around each child", body: "Our mission is to support children’s physical, social, emotional and cognitive development. We recognize that every child has different strengths, interests and needs.", points: ["Create individualized learning experiences", "Build independence and positive self-esteem", "Respect culture, diversity and family partnerships"], ref: "Bright Learners Orientation, May 2026 — slide 4" },
    { kicker: "Your team", title: "Know who leads each academy", body: "Directors guide daily operations, support educators and help resolve questions about safety, programming, families and workplace expectations.", points: ["Sundance — Margaret Ferriss", "Midnapore — Karla Buick", "Sylvan Lake — Sherry Murphy", "Millwoods — Evelyn Mahmoudi", "Willowgrove — Merilyn Guzman"], media: "Leadership team photos", ref: "Bright Learners Orientation, May 2026 — slide 5" },
    { kicker: "Your role", title: "Create a safe place where children can grow", body: "Educators supervise children, prepare thoughtful learning experiences, observe development and maintain welcoming spaces.", points: ["Maintain active supervision", "Plan age-appropriate experiences", "Observe and document learning", "Follow health, safety and licensing requirements"], ref: "Bright Learners Orientation, May 2026 — slides 7–10" },
    { kicker: "Families", title: "Build trust through everyday communication", body: "Greet families warmly, use their names, listen carefully and share useful daily updates. Protect confidentiality and raise concerns respectfully.", points: ["Share successes as well as challenges", "Confirm important care instructions", "Use face-to-face updates and Lillio appropriately", "Ask your director when you are unsure"], media: "Example family greeting video", ref: "Bright Learners Orientation, May 2026 — slides 11–12 and 36–39" },
    { kicker: "Non-negotiables", title: "Safety, care and communication come first", body: "These priorities guide every decision. Harassment, bullying, mental abuse and sexual misconduct are not accepted at Bright Learners.", points: ["Protect every child’s safety", "Communicate concerns immediately", "Treat children, families and colleagues with care and respect"], ref: "Bright Learners Orientation, May 2026 — slides 13–14" },
    { kicker: "Learning approach", title: "Follow children’s curiosity", body: "Bright Learners combines FLIGHT, emergent curriculum and Reggio Emilia ideas. Educators observe children’s interests and use them to plan meaningful play.", points: ["The environment acts as a third teacher", "Play supports communication, creativity and problem-solving", "Planning is shared and reviewed every week"], media: "Classroom and provocation photo gallery", ref: "Bright Learners Orientation, May 2026 — slides 16–33" },
    { kicker: "Your first day", title: "Help every family feel welcome", body: "A family’s first experience shapes their trust in the centre. Prepare the room, greet them by name, listen closely to care instructions and support separation calmly.", points: ["Get down to the child’s level", "Ask about food, allergies and belongings", "Repeat instructions back to confirm them", "Give a positive update at pickup"], media: "First-day welcome scenario video", ref: "Bright Learners Orientation, May 2026 — slides 56–58" },
  ];
  return <LessonWorkspace slides={slides} slide={slide} setSlide={setSlide} />;
}

function LessonWorkspace({ slides, slide, setSlide, quiz }: { slides: OrientationSlide[]; slide: number; setSlide: (value: number) => void; quiz?: React.ReactNode }) {
  const atQuiz = Boolean(quiz) && slide === slides.length;
  const current = slides[Math.min(slide, slides.length - 1)];
  const total = slides.length + (quiz ? 1 : 0);
  return <div className="lesson-workspace">
    <aside className="lesson-outline">
      <p className="eyebrow">Module outline</p>
      {slides.map((item, index) => <button key={item.title} className={slide === index ? "active" : ""} onClick={() => setSlide(index)}><span>{String(index + 1).padStart(2, "0")}</span>{item.title}</button>)}
      {quiz && <button className={atQuiz ? "active" : ""} onClick={() => setSlide(slides.length)}><span>{String(total).padStart(2, "0")}</span>Knowledge check</button>}
    </aside>
    <main className="lesson-stage">
      <div className="slide-progress"><span>Lesson progress</span><div><i style={{ width: `${((slide + 1) / total) * 100}%` }} /></div><b>{slide + 1} / {total}</b></div>
      {!atQuiz ? <article className={`lesson-slide ${current.media ? "" : "text-only"}`}>
        {current.media && <div className={`lesson-visual visual-${slide % 4}`}><span className="doodle-mark">{String(slide + 1).padStart(2, "0")}</span><b>{current.media}</b><small>Media to be supplied by Bright Learners</small></div>}
        <div className="slide-copy">
          <p className="eyebrow">{current.kicker}</p><h3>{current.title}</h3><p>{current.body}</p>
          {current.points && <ul>{current.points.map((point) => <li key={point}>{point}</li>)}</ul>}
          <span className="orientation-reference">{current.ref}</span>
        </div>
      </article> : quiz}
      <nav className="slide-controls" aria-label="Lesson slides">
        <button className="outline-button" disabled={slide === 0} onClick={() => setSlide(Math.max(0, slide - 1))}>← Previous</button>
        <span>{atQuiz ? "Knowledge check" : `Slide ${slide + 1}: ${current.title}`}</span>
        {slide < total - 1 && <button className="primary-button" onClick={() => setSlide(Math.min(total - 1, slide + 1))}>{quiz && slide === slides.length - 1 ? "Take knowledge check" : "Next slide"} →</button>}
      </nav>
    </main>
  </div>;
}

const skLessonSlides: OrientationSlide[][] = [
  [
    { kicker: "Welcome", title: "Your Willowgrove centre", body: "Willowgrove serves Saskatoon families at 415 Willowgrove Square. The centre is currently operating under a provisional licence and expects close monitoring during the next six months.", points: ["Director: Merilyn De Guzman", "Centre phone: 306-244-2404", "Questions about licensing go through centre leadership"], ref: "Willowgrove Parent Handbook - pages 5, 46 and 48; management update dated July 2026" },
    { kicker: "How we learn", title: "Saskatchewan uses Play and Exploration", body: "The Saskatchewan framework supports curiosity, relationships, belonging and learning through play. Bright Learners combines it with emergent curriculum and Reggio Emilia practices.", points: ["Observe children before planning", "Build from their questions and interests", "Make learning visible to families"], ref: "Willowgrove Parent Handbook - pages 9-11" },
    { kicker: "Professional standard", title: "Safety and relationships guide your work", body: "Educators protect children, communicate respectfully, maintain confidentiality and follow applicable Saskatchewan requirements.", points: ["Ask when a direction is unclear", "Report hazards immediately", "Document required actions"], ref: "Willowgrove Parent Handbook - pages 5-10 and 46" },
    { kicker: "Current status", title: "Be ready for closer monitoring", body: "A provisional licence means consistent practice and complete records are especially important. Follow posted procedures exactly and respond promptly to director coaching.", ref: "Willowgrove management update - July 2026; licence copy pending from Ministry" },
  ],
  [
    { kicker: "Recognize", title: "Watch for illness and document it", body: "Children with vomiting, fever, diarrhea, unexplained rash or cough, communicable-disease symptoms, or unusual lethargy may not remain in care.", points: ["Assess the child", "Notify the parent promptly", "Complete the Illness Record"], ref: "Willowgrove Parent Handbook - pages 37-38" },
    { kicker: "Separate safely", title: "A sick child remains supervised", body: "Move the child away from the group to the director or front office, keep them comfortable on a cot and maintain direct supervision until pickup.", ref: "Willowgrove Parent Handbook - page 39" },
    { kicker: "Public Health", title: "Know what the centre was told to report", body: "Willowgrove reports that Public Health requested notification for whooping cough, measles and gastrointestinal illness outbreaks. The Communicable Disease line provided was 306-655-4612.", points: ["This was verbal guidance", "It was not issued in writing", "Escalate uncertain cases to the director"], ref: "Site-reported verbal Public Health guidance - June/July 2026; not an official written directive" },
    { kicker: "HFMD", title: "Hand, Foot and Mouth Disease is handled locally", body: "The centre experienced HFMD cases in June. Saskatchewan Public Health reportedly advised that HFMD cases did not require notification, but exclusion, cleaning and centre illness procedures still apply.", ref: "Site-reported verbal Public Health guidance; Willowgrove Parent Handbook - pages 37-39" },
  ],
  [
    { kicker: "Hand hygiene", title: "Wash after every diaper change", body: "Hand hygiene must happen after every diaper change, even when gloves are used. Follow the posted diapering procedure and leave the station ready for the next child.", ref: "Licensing Consultant direction reported by Willowgrove; Parent Handbook - page 20" },
    { kicker: "Four steps", title: "Clean and sanitize tables correctly", body: "The current licensing direction is to reinforce the four-step table process: remove debris, wash, rinse, then sanitize using the approved product and contact time.", points: ["Use separate clean materials", "Test solution strength where required", "Allow the surface to remain wet for the required time"], ref: "Licensing Consultant direction reported by Willowgrove; Saskatchewan public-health cleaning practice" },
    { kicker: "Cross-contamination", title: "Keep contaminated items separate", body: "After illness, clean the cot promptly. Seal or immediately launder used bedding and keep soiled items away from clean laundry and supplies.", ref: "Willowgrove Parent Handbook - page 39" },
    { kicker: "Daily practice", title: "Cleaning never replaces supervision", body: "Coordinate cleaning with another educator so ratios, visibility and active supervision are maintained at all times.", ref: "Willowgrove Parent Handbook - pages 42-44" },
  ],
  [
    { kicker: "Locked storage", title: "Medication boxes stay locked", body: "All non-emergency medication must remain in a locked container inaccessible to children. Refrigerated medication also stays in a locked container inside the refrigerator.", ref: "Willowgrove Parent Handbook - page 34; Licensing Consultant direction" },
    { kicker: "Authorization", title: "No form means no administration", body: "The Saskatchewan Medication Administration Form must be complete before medication is given. Follow the original label, written instructions, dose and time.", ref: "Willowgrove Parent Handbook - pages 34-35" },
    { kicker: "Double check", title: "Two educators verify every dose", body: "Two educators confirm the right child, medication, dose and time, then both sign the record immediately after administration.", ref: "Willowgrove Parent Handbook - page 35" },
    { kicker: "Emergency plans", title: "Emergency medication must be available", body: "Children with severe allergies require an emergency plan. Emergency medication stays secure but quickly accessible to trained staff and includes a recent child photo.", ref: "Willowgrove Parent Handbook - page 36" },
  ],
  [
    { kicker: "Onsite service", title: "Willowgrove prepares food onsite", body: "Morning snack, lunch and afternoon snack are prepared onsite. The menu rotates over four weeks and is updated seasonally.", ref: "Willowgrove Parent Handbook - page 32; Revised Menu - pages 1-4" },
    { kicker: "Food safety", title: "Use safe handling, storage and sanitation", body: "Designated food staff follow Saskatchewan health guidance for preparation, temperature control, sanitation and storage. Required staff maintain food-handler training.", ref: "Willowgrove Parent Handbook - page 33" },
    { kicker: "Food from home", title: "Label and temperature-control outside food", body: "Food brought from home must be clearly labelled with the child's name. Use cooler packs or thermoses when temperature control is required.", ref: "Willowgrove Parent Handbook - page 32; Licensing Consultant direction" },
    { kicker: "Allergies", title: "The centre is nut-free", body: "Check allergy and dietary information before serving. The centre minimizes exposure but does not promise an allergen-free environment.", ref: "Willowgrove Parent Handbook - pages 32-33 and 36" },
  ],
  [
    { kicker: "Active supervision", title: "Know where every child is", body: "Position yourself to see and hear children, scan the whole area, move through blind spots and anticipate what may happen next.", ref: "Willowgrove Parent Handbook - pages 42-44" },
    { kicker: "Transitions", title: "Headcount every transition", body: "Use a consistent headcount or roll-call system whenever children leave or return to a room, outdoor area or vehicle. Compare counts with attendance.", ref: "Willowgrove Parent Handbook - pages 43-44" },
    { kicker: "Hazards", title: "Keep hazardous items out of reach", body: "Cleaning products, plastic bags, staff belongings, scissors, kitchen knives and other hazardous items must be locked or otherwise inaccessible to children.", ref: "Licensing Consultant direction; Willowgrove Parent Handbook - page 42" },
    { kicker: "No distractions", title: "Supervision is your primary task", body: "Do not text, read, complete paperwork or perform cleaning that pulls attention away from children when you are responsible for supervision.", ref: "Willowgrove Parent Handbook - page 44" },
  ],
  [
    { kicker: "Prepare", title: "Know exits, contacts and emergency supplies", body: "Emergency procedures and contacts are displayed in classrooms. Evacuation backpacks include child information, contacts and first-aid supplies.", ref: "Willowgrove Parent Handbook - page 40" },
    { kicker: "Evacuate", title: "Move to the Willowgrove muster point", body: "The handbook identifies the muster point as Island Boulevard across the street, at the front parking lot. Maintain counts and supervision throughout.", ref: "Willowgrove Parent Handbook - page 40" },
    { kicker: "Practice", title: "Fire drills happen monthly", body: "Monthly fire drills are documented and reviewed. Summer tornado drills prepare staff and children for severe-weather procedures.", ref: "Willowgrove Parent Handbook - page 40" },
    { kicker: "Report", title: "Document injuries and serious events", body: "Provide first aid, notify families according to severity, complete the correct injury or unusual-occurrence record and escalate serious injury or illness immediately.", ref: "Willowgrove Parent Handbook - pages 41-42" },
  ],
  [
    { kicker: "Positive guidance", title: "Teach the behaviour children need", body: "Use calm redirection, consistent expectations, choices and supportive environments. Respond to developmentally normal behaviour with patience rather than punishment.", ref: "Bright Learners Orientation - slides 51-54; Willowgrove Parent Handbook child-guidance section" },
    { kicker: "Inclusion", title: "Every child belongs", body: "Adapt routines, activities and environments so children of different abilities, cultures, languages and family structures can participate meaningfully.", ref: "Willowgrove Parent Handbook - pages 9-11 and 45" },
    { kicker: "Duty to report", title: "You report suspected abuse directly", body: "Anyone with reasonable grounds to suspect abuse, neglect or a child in need of protection must report immediately to Saskatchewan Child Protection Services. The concern cannot be delegated.", ref: "Willowgrove Parent Handbook - page 45; The Child and Family Services Act (Saskatchewan)" },
    { kicker: "After reporting", title: "Inform leadership without increasing risk", body: "Tell the director after making the report unless doing so could place the child at further risk. Do not notify the family before the report when prohibited by child-protection requirements.", ref: "Willowgrove Parent Handbook - page 45" },
  ],
];

function SaskatchewanModuleLesson({ moduleIndex }: { moduleIndex: number }) {
  const [slide, setSlide] = useState(0);
  return <LessonWorkspace slides={skLessonSlides[moduleIndex]} slide={slide} setSlide={setSlide} />;
}

function HealthLesson({ answer, setAnswer, checkAnswer, message }: { answer: string; setAnswer: (value: string) => void; checkAnswer: () => void; message: string }) {
  const [slide, setSlide] = useState(0);
  const slides: OrientationSlide[] = [
    { kicker: "Why this matters", title: "Healthy children, healthy centre", body: "You are often the first person to notice that a child is becoming unwell. Acting early helps protect the child, other children, families and your co-workers.", media: "Short introduction video", ref: "AHS Health & Safety Guide, April 2025 — PDF page 18" },
    { kicker: "Recognize", title: "Watch for signs of illness", body: "Look for fever, vomiting or diarrhea, cough, trouble breathing, sore throat, chills, unusual tiredness, or red and irritated eyes. A staff member with signs of a contagious illness must not stay at the facility.", points: ["Notice changes from the child’s normal behaviour", "Pause and check when something seems wrong", "Tell the director and follow the illness procedure"], media: "Symptom illustration", ref: "AHS Health & Safety Guide, April 2025 — PDF page 18" },
    { kicker: "Respond", title: "Separate, supervise and notify", body: "Move the sick child away from the group while keeping them supervised and comfortable. Contact their parent or guardian for immediate pickup. Follow AHS direction if an outbreak is suspected.", points: ["Never leave a sick child alone", "Record what you observed", "Record who was contacted and when"], ref: "AHS Health & Safety Guide, April 2025 — PDF pages 19–20" },
    { kicker: "Prevent spread", title: "Clean what the child used", body: "Clean and disinfect bedding, toys and other items the child used during the 48 hours before symptoms and while separated. Do this as soon as possible after pickup.", points: ["Pay special attention to mouthed toys", "Clean frequently touched surfaces", "Follow the product label and centre procedure"], media: "Cleaning demonstration video", ref: "AHS Health & Safety Guide, April 2025 — PDF pages 20–21" },
  ];
  const quiz = <fieldset className="knowledge-check"><legend>Knowledge check • 1 of 1</legend><p>A toy has been in a toddler’s mouth. When must it be cleaned and disinfected?</p>
      <label><input type="radio" name="toy-frequency" value="weekly" checked={answer === "weekly"} onChange={(e) => setAnswer(e.target.value)} /> At the end of the week</label>
      <label><input type="radio" name="toy-frequency" value="after-each-child" checked={answer === "after-each-child"} onChange={(e) => setAnswer(e.target.value)} /> After each child’s use and at least daily</label>
      <label><input type="radio" name="toy-frequency" value="when-dirty" checked={answer === "when-dirty"} onChange={(e) => setAnswer(e.target.value)} /> Only when it looks dirty</label>
      <button className="primary-button" type="button" onClick={checkAnswer} disabled={!answer}>Check my answer</button>
      {message && <p className={`quiz-feedback ${message.startsWith("Correct") ? "correct" : ""}`} role="status">{message}</p>}
      <small>Reference: AHS Health & Safety Guide, April 2025, PDF pages 21 and 37; Appendix G.</small>
    </fieldset>;
  return <LessonWorkspace slides={slides} slide={slide} setSlide={setSlide} quiz={quiz} />;
}

function DirectorView({ location, setLocation }: { location: string; setLocation: (v: string) => void }) {
  return <div className="content">
    <section className="action-row"><div><p className="eyebrow">Authorized location</p><select value={location} onChange={(e) => setLocation(e.target.value)}>{locations.map(l => <option key={l}>{l}</option>)}</select></div><button className="primary-button">＋ Start monthly inspection</button></section>
    <div className="stat-grid"><article><span>✓</span><div><b>4</b><small>Completed this month</small></div></article><article><span>!</span><div><b>2</b><small>Open follow-ups</small></div></article><article><span>◷</span><div><b>Jul 18</b><small>Last inspection</small></div></article></div>
    <section className="table-card"><div className="section-heading"><div><p className="eyebrow">Recent activity</p><h2>{location} inspections</h2></div><button className="outline-button">Download records</button></div>
      <div className="record"><span className="record-status complete">✓</span><div><b>Monthly facility audit</b><small>Completed by Margaret Ferriss • July 18, 2026</small></div><strong>100%</strong><button>View report</button></div>
      <div className="record"><span className="record-status followup">!</span><div><b>Outdoor playspace check</b><small>2 items require follow-up • July 12, 2026</small></div><strong>86%</strong><button>Continue</button></div>
    </section>
    <p className="tiny muted">Failed items require an explanation. Photo evidence and every response will be timestamped in the signed inspection package.</p>
  </div>;
}

function AdminView() {
  return <div className="content">
    <div className="stat-grid admin-stats"><article><span>☺</span><div><b>47</b><small>Active staff</small></div></article><article><span>✓</span><div><b>82%</b><small>Training complete</small></div></article><article><span>⌂</span><div><b>5</b><small>Academy locations</small></div></article></div>
    <div className="admin-grid">
      <section className="table-card"><p className="eyebrow">Needs attention</p><h2>Compliance queue</h2>{["3 overdue course assignments","2 inspection follow-ups","5 certificates renew soon"].map((x,i)=><div className="queue" key={x}><span>{i+1}</span><b>{x}</b><button>Review</button></div>)}</section>
      <section className="quick-card"><p className="handwritten">Quick actions</p><button>＋ Add staff account</button><button>＋ Create course module</button><button>＋ Edit inspection checklist</button><button>↗ Export compliance report</button></section>
    </div>
  </div>;
}
