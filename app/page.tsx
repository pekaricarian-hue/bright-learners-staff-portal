"use client";

import { useEffect, useState } from "react";
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
import { auth } from "./firebase";

type View = "employee" | "director" | "admin";

const modules = [
  { title: "Welcome & professional practice", time: "12 min", progress: 100, colour: "sun" },
  { title: "Health, hygiene & illness", time: "18 min", progress: 64, colour: "blue" },
  { title: "Cleaning toys & surfaces", time: "16 min", progress: 0, colour: "rose" },
  { title: "Food, allergies & safe meals", time: "14 min", progress: 0, colour: "green" },
];

const locations = ["Sundance", "Midnapore", "Sylvan Lake", "Millwoods", "Willowgrove"];

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [view, setView] = useState<View>("employee");
  const [location, setLocation] = useState("Sundance");
  const isOwner = user?.email?.toLowerCase() === "pekaric.arian@gmail.com";

  useEffect(() => onAuthStateChanged(auth, (next) => {
    setUser(next);
    setLoading(false);
  }), []);

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
            <span className="brand-mark">B</span>
            <span>Bright Learners<br /><small>Staff Learning</small></span>
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

  return (
    <main className="portal">
      <aside className="sidebar">
        <Link className="brand compact" href="/"><span className="brand-mark">B</span><span>Bright Learners<small>Staff Learning</small></span></Link>
        <nav aria-label="Portal">
          <button className={view === "employee" ? "active" : ""} onClick={() => setView("employee")}>⌂ My learning</button>
          {isOwner && <button className={view === "director" ? "active" : ""} onClick={() => setView("director")}>✓ Inspections</button>}
          {isOwner && <button className={view === "admin" ? "active" : ""} onClick={() => setView("admin")}>⚙ Admin</button>}
        </nav>
        <div className="sidebar-note"><span>★</span><p><b>Nice work!</b><br />You’ve earned 120 points.</p></div>
        <button className="signout" onClick={() => signOut(auth)}>Sign out</button>
      </aside>
      <section className="workspace">
        <header className="workspace-header">
          <div><p className="eyebrow">Bright Learners Academy</p><h1>{view === "employee" ? "My learning" : view === "director" ? "Facility inspections" : "Administration"}</h1></div>
          <div className="user-chip"><span>{(user.displayName || user.email || "Staff")[0].toUpperCase()}</span><div><b>{user.displayName || "Team member"}</b><small>{user.email}</small></div></div>
        </header>

        {view === "employee" && <EmployeeView />}
        {view === "director" && <DirectorView location={location} setLocation={setLocation} />}
        {view === "admin" && <AdminView />}
      </section>
    </main>
  );
}

function EmployeeView() {
  return <div className="content">
    <section className="welcome-banner"><div><p className="handwritten">Hello, learner!</p><h2>Keep going—you’re making great progress.</h2><p>Your Alberta orientation has 3 modules left.</p></div><div className="progress-ring"><b>41%</b><span>complete</span></div></section>
    <div className="section-heading"><div><p className="eyebrow">Assigned course</p><h2>Alberta employee orientation</h2></div><span className="province-tag">AB • 2026</span></div>
    <div className="module-grid">{modules.map((m, i) => <article className="module-card" key={m.title}><div className={`module-icon ${m.colour}`}>{m.progress === 100 ? "✓" : i + 1}</div><small>Module {i + 1} • {m.time}</small><h3>{m.title}</h3><div className="bar"><i style={{ width: `${m.progress}%` }} /></div><div className="module-footer"><span>{m.progress}% complete</span><button>{m.progress === 100 ? "Review" : m.progress ? "Continue" : "Start"}</button></div></article>)}</div>
    <aside className="source-note"><b>Source-aware learning</b><p>Each regulated lesson and question will link directly to its official authority, document, page and section. Current official policy always wins.</p></aside>
  </div>;
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
