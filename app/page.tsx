"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  linkWithCredential,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
} from "firebase/auth";
import { arrayUnion, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
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
  toursCompleted?: Partial<Record<"learning" | "inspection" | "admin", boolean>>;
};

const albertaModules = [
  { title: "Welcome to Bright Learners", eyebrow: "Culture, role and professional expectations", time: "18 min", colour: "sun", icon: "⌂" },
  { title: "Curriculum and learning through play", eyebrow: "FLIGHT, emergent curriculum and documentation", time: "22 min", colour: "lavender", icon: "✎" },
  { title: "Active supervision and safe spaces", eyebrow: "Ratios, headcounts, hazards and playspaces", time: "22 min", colour: "orange", icon: "◎" },
  { title: "Health, illness and outbreaks", eyebrow: "Recognize, separate, document and report", time: "22 min", colour: "blue", icon: "+" },
  { title: "Cleaning, sanitizing and toy safety", eyebrow: "Correct products, contact times and schedules", time: "24 min", colour: "rose", icon: "✦" },
  { title: "Food, allergies and safe meals", eyebrow: "Storage, temperatures and food-contact surfaces", time: "20 min", colour: "green", icon: "◇" },
  { title: "Diapering, medication, sleep and daily care", eyebrow: "Safe personal-care routines", time: "24 min", colour: "lavender", icon: "☾" },
  { title: "Guidance, incidents and emergencies", eyebrow: "Positive guidance, reporting and response", time: "24 min", colour: "blue", icon: "!" },
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

function roleForEmail(email: string, emailVerified: boolean): StaffRole {
  if (emailVerified && ownerEmails.has(email)) return "owner";
  if (emailVerified && adminEmails.has(email)) return "admin";
  if (emailVerified && directorEmails.has(email)) return "director";
  return "employee";
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState("");
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourPortal, setTourPortal] = useState<"learning" | "inspection" | "admin">("learning");
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
          if (!savedProfile.toursCompleted?.learning) {
            setTourPortal("learning");
            setTourOpen(true);
          }
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
      role: roleForEmail(signedInEmail, user.emailVerified),
      location: finalLocation,
      province: finalLocation === "Willowgrove" ? "SK" : "AB",
      status: "active",
      renewalIntervalMonths: 12,
      toursCompleted: {},
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

  async function updateProfile(firstName: string, lastName: string, selectedLocation?: string) {
    if (!user || !profile) return;
    const canChangeOwnLocation = profile.role === "owner";
    const finalLocation = canChangeOwnLocation && selectedLocation ? selectedLocation : profile.location;
    const finalProvince: Province = finalLocation === "Willowgrove" ? "SK" : "AB";
    const updatedProfile = {
      ...profile,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      displayName: `${firstName.trim()} ${lastName.trim()}`.trim(),
      location: finalLocation,
      province: finalProvince,
    };
    await setDoc(doc(db, "users", user.uid), {
      firstName: updatedProfile.firstName,
      lastName: updatedProfile.lastName,
      displayName: updatedProfile.displayName,
      location: updatedProfile.location,
      province: updatedProfile.province,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setProfile(updatedProfile);
    setLocation(finalLocation);
    setPortalMode("chooser");
    setView("dashboard");
    setEditProfileOpen(false);
  }

  async function finishTour(portal: "learning" | "inspection" | "admin") {
    if (!user || !profile) return;
    const toursCompleted = { ...profile.toursCompleted, [portal]: true };
    await setDoc(doc(db, "users", user.uid), { toursCompleted, updatedAt: serverTimestamp() }, { merge: true });
    setProfile({ ...profile, toursCompleted });
    setTourOpen(false);
  }

  function startTour(portal: "learning" | "inspection" | "admin") {
    document.querySelectorAll("details.account-menu[open]").forEach((menu) => menu.removeAttribute("open"));
    setView(portal === "learning" ? "dashboard" : portal === "inspection" ? "director" : "admin");
    setTourPortal(portal);
    setTourOpen(false);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => setTourOpen(true)));
  }

  async function emailLogin(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (code.includes("invalid-credential") || code.includes("wrong-password")) {
        setMessage("That password is not set or is incorrect. Choose Reset password to create a password, or continue with Google.");
      } else {
        setMessage("We couldn’t sign you in. Try Google sign-in or use Reset password to create a password.");
      }
    }
  }

  async function emailSignup(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    if (password.length < 8) return setMessage("Use a password with at least 8 characters.");
    if (password !== confirmPassword) return setMessage("The two passwords do not match.");
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await sendEmailVerification(credential.user, {
        url: window.location.origin,
        handleCodeInApp: false,
      }).catch(() => undefined);
      setMessage("Account created. Verify your email before completing your staff profile.");
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (code.includes("email-already-in-use")) {
        setMessage("An account already uses this email. Sign in, continue with Google, or reset the password.");
      } else if (code.includes("invalid-email")) {
        setMessage("Enter a valid email address.");
      } else {
        setMessage("We couldn’t create the account. Check the email and password, then try again.");
      }
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
      setMessage(`Email sent — check your Inbox and Spam/Junk folders. The secure password link was sent to ${email} and may take a few minutes to arrive.`);
    } catch {
      setMessage("We couldn’t send a password link for that address. If the account uses Google, continue with Google and add a password from the profile menu.");
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
          <form className="login-card" onSubmit={authMode === "signin" ? emailLogin : emailSignup}>
            <div className="card-pin" />
            <p className="handwritten">{authMode === "signin" ? "Welcome back!" : "Join the team!"}</p>
            <h2>{authMode === "signin" ? "Sign in to continue" : "Create your staff account"}</h2>
            <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@brightlearnersacademy.net" required /></label>
            <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={authMode === "signup" ? "At least 8 characters" : "••••••••"} minLength={authMode === "signup" ? 8 : undefined} required /></label>
            {authMode === "signup" && <label>Confirm password<input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Enter it again" minLength={8} required /></label>}
            <button className="primary-button" type="submit">{authMode === "signin" ? "Sign in" : "Create account"}</button>
            <button className="google-button" type="button" onClick={googleLogin}><b>G</b>{authMode === "signin" ? "Continue with Google" : "Create account with Google"}</button>
            {authMode === "signin" && <button className="text-button" type="button" onClick={resetPassword}>Reset password</button>}
            <button className="auth-mode-toggle" type="button" onClick={() => { setAuthMode((current) => current === "signin" ? "signup" : "signin"); setPassword(""); setConfirmPassword(""); setMessage(""); }}>{authMode === "signin" ? "Don’t have an account? Create one" : "Already have an account? Sign in"}</button>
            {message && <p className={`form-message ${message.startsWith("Email sent") ? "email-delivery-notice" : ""}`} role="status">{message}</p>}
            <p className="tiny">{authMode === "signin" ? "Use Google or the email and password attached to your staff account." : "Employees choose their academy after signup. Director and administrator access is restricted to approved emails."}</p>
          </form>
        </section>
      </main>
    );
  }

  if (!user.emailVerified) {
    return <EmailVerificationGate user={user} signOutUser={() => signOut(auth)} />;
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
      const selectedTour = portal === "chooser" ? "learning" : portal;
      if (!profile.toursCompleted?.[selectedTour]) startTour(selectedTour);
    }} signOutUser={() => signOut(auth)} />;
  }

  return (
    <main className="portal">
      <section className="workspace">
        <header className="portal-topbar">
          <Link className="portal-logo-link" href="/" onClick={() => setView(activePortal === "inspection" ? "director" : activePortal === "admin" ? "admin" : "dashboard")}><Image src="/bright-learners-logo.png" alt="Bright Learners Academy staff portal" width={210} height={102} priority /></Link>
          <nav aria-label="Portal">
            {activePortal === "learning" && <><button data-tour="dashboard-tab" className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>Dashboard</button><button data-tour="learning-tab" className={view === "employee" ? "active" : ""} onClick={() => setView("employee")}>My Learning</button><button data-tour="resources-tab" className={view === "resources" ? "active" : ""} onClick={() => setView("resources")}>Resources</button></>}
            {activePortal === "inspection" && <><span data-tour="inspection-heading" className="portal-name">Director Inspection Portal</span><button className="active" onClick={() => setView("director")}>Inspection dashboard</button></>}
            {activePortal === "admin" && <><span className="portal-name">Administration Console</span><button className="active" onClick={() => setView("admin")}>Organization overview</button></>}
          </nav>
          <details className="account-menu">
            <summary className="user-chip" data-tour="profile-menu" aria-label="Open account menu"><span>{profile.firstName[0]?.toUpperCase() || "S"}</span><div><b>{profile.displayName}</b><small>{profile.location} · {profile.role}</small></div></summary>
            <div className="account-menu-panel">
              {canInspect && <button onClick={() => setPortalMode("chooser")}><span>⇄</span><div><b>Switch portal</b><small>Learning, inspections or admin</small></div></button>}
              <button onClick={() => setEditProfileOpen(true)}><span>✎</span><div><b>Edit profile</b><small>Name and certificate details</small></div></button>
              <button onClick={() => setPasswordOpen(true)}><span>⌁</span><div><b>Set or change password</b><small>Receive a secure email link</small></div></button>
              <button onClick={() => setCertificateOpen(true)}><span>☆</span><div><b>View certificate</b><small>Orientation completion record</small></div></button>
              <button onClick={() => startTour(activePortal)}><span>?</span><div><b>Website walkthrough</b><small>Tour this portal again</small></div></button>
              <button className="account-signout" onClick={() => signOut(auth)}><span>→</span><div><b>Sign out</b><small>End this session</small></div></button>
            </div>
          </details>
        </header>

        {activePortal === "learning" && view === "dashboard" && <DashboardView name={profile.displayName} location={assignedLocation} province={assignedProvince} setView={setView} />}
        {activePortal === "learning" && view === "employee" && <EmployeeView userId={user.uid} location={assignedLocation} province={assignedProvince} />}
        {activePortal === "learning" && view === "resources" && <ResourcesView location={assignedLocation} province={assignedProvince} />}
        {activePortal === "inspection" && <DirectorView location={location} setLocation={setLocation} />}
        {activePortal === "admin" && <AdminView />}
      </section>
      {editProfileOpen && <EditProfile profile={profile} save={updateProfile} close={() => setEditProfileOpen(false)} />}
      {passwordOpen && <PasswordResetDialog email={profile.email} close={() => setPasswordOpen(false)} />}
      {certificateOpen && <CertificateStatus profile={profile} close={() => setCertificateOpen(false)} />}
      {tourOpen && <GuidedTour portal={tourPortal} canAdmin={canAdmin} finish={() => finishTour(tourPortal)} close={() => setTourOpen(false)} />}
    </main>
  );
}

function EmailVerificationGate({ user, signOutUser }: { user: User; signOutUser: () => void }) {
  const [status, setStatus] = useState("Check your Inbox and Spam/Junk folders for the verification email we sent when this account was created.");
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    let active = true;
    const checkWhenReturning = async () => {
      if (document.visibilityState === "hidden") return;
      await user.reload().catch(() => undefined);
      if (active && auth.currentUser?.emailVerified) window.location.reload();
    };
    window.addEventListener("focus", checkWhenReturning);
    document.addEventListener("visibilitychange", checkWhenReturning);
    return () => {
      active = false;
      window.removeEventListener("focus", checkWhenReturning);
      document.removeEventListener("visibilitychange", checkWhenReturning);
    };
  }, [user]);
  async function resend() {
    setChecking(true);
    try {
      await sendEmailVerification(user, {
        url: window.location.origin,
        handleCodeInApp: false,
      });
      setStatus(`Email sent — check your Inbox and Spam/Junk folders. The verification link was sent to ${user.email} and may take a few minutes to arrive.`);
    } catch {
      setStatus("The verification email could not be sent yet. Wait a moment and try again.");
    } finally {
      setChecking(false);
    }
  }
  async function continueAfterVerification() {
    setChecking(true);
    try {
      await user.reload();
      if (auth.currentUser?.emailVerified) {
        window.location.reload();
        return;
      }
      setStatus("This email is not verified yet. Open the link in the verification email, then try again.");
    } catch {
      setStatus("We could not check the email status. Please try again.");
    } finally {
      setChecking(false);
    }
  }
  return <main className="verification-gate"><header><Image src="/bright-learners-logo.png" alt="Bright Learners Academy" width={230} height={112} priority /><button onClick={signOutUser}>Sign out</button></header><section><span className="verification-icon">✉</span><p className="eyebrow">One quick security step</p><h1>Verify your email address.</h1><p>Before you choose a location or begin Bright Learners training, confirm that <b>{user.email}</b> belongs to you.</p><div className="verification-status" role="status">{status}</div><button className="brand-button" disabled={checking} onClick={continueAfterVerification}>{checking ? "Checking…" : "I’ve verified my email — continue"}</button><button className="outline-button" disabled={checking} onClick={resend}>Resend verification email</button><small>The verification link is sent securely by Firebase Authentication.</small></section></main>;
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

function EditProfile({ profile, save, close }: { profile: StaffProfile; save: (firstName: string, lastName: string, location?: string) => Promise<void>; close: () => void }) {
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [selectedLocation, setSelectedLocation] = useState(profile.location);
  const [saving, setSaving] = useState(false);
  const canChangeOwnLocation = profile.role === "owner";
  return <div className="profile-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="profile-editor" role="dialog" aria-modal="true" aria-labelledby="edit-profile-title"><button className="profile-editor-close" onClick={close} aria-label="Close profile editor">×</button><p className="eyebrow">Certificate details</p><h2 id="edit-profile-title">Edit your staff profile</h2><p>Use your legal name exactly as it should appear on your final orientation certificate.</p><div className="profile-name-fields"><label>Legal first name<input required autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Enter your legal first name" /></label><label>Legal last name<input required autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Enter your legal last name" /></label></div>{canChangeOwnLocation ? <label>Testing academy<select value={selectedLocation} onChange={(event) => setSelectedLocation(event.target.value)}>{locations.map((academy) => <option key={academy} value={academy}>{academy} — {academy === "Willowgrove" ? "Saskatchewan" : "Alberta"}</option>)}</select></label> : <label>Assigned academy<input value={`${profile.location} — ${profile.province === "SK" ? "Saskatchewan" : "Alberta"}`} disabled /></label>}<button className="brand-button" disabled={!firstName.trim() || !lastName.trim() || !selectedLocation || saving} onClick={async () => { setSaving(true); try { await save(firstName, lastName, selectedLocation); } finally { setSaving(false); } }}>{saving ? "Saving…" : "Save profile"}</button><small>{canChangeOwnLocation ? "Owner testing access: changing academy switches your assigned provincial course without deleting progress in the other province." : "Contact an administrator if your academy assignment needs to change."}</small></section></div>;
}

function PasswordResetDialog({ email, close }: { email: string; close: () => void }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  async function savePassword() {
    if (!auth.currentUser) return;
    if (newPassword.length < 8) return setStatus("Use at least 8 characters.");
    if (newPassword !== confirmPassword) return setStatus("The two passwords do not match.");
    setSending(true);
    setStatus("");
    try {
      const hasPassword = auth.currentUser.providerData.some((provider) => provider.providerId === "password");
      if (hasPassword) {
        await updatePassword(auth.currentUser, newPassword);
      } else {
        await linkWithCredential(auth.currentUser, EmailAuthProvider.credential(email, newPassword));
      }
      setNewPassword("");
      setConfirmPassword("");
      setStatus("Password saved. You can now sign in with either email and password or Google.");
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      setStatus(code.includes("requires-recent-login") ? "For security, sign out, sign back in with Google, then set the password again." : "The password could not be saved. Use the secure email link below or contact the administrator.");
    } finally {
      setSending(false);
    }
  }
  async function sendLink() {
    setSending(true);
    setStatus("");
    try {
      await sendPasswordResetEmail(auth, email);
      setStatus(`Email sent — check your Inbox and Spam/Junk folders. The secure password link was sent to ${email} and may take a few minutes to arrive.`);
    } catch {
      setStatus("The password email could not be sent. Please try again or contact the administrator.");
    } finally {
      setSending(false);
    }
  }
  return <div className="profile-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="profile-editor" role="dialog" aria-modal="true" aria-labelledby="password-title"><button className="profile-editor-close" onClick={close} aria-label="Close password settings">×</button><p className="eyebrow">Account security</p><h2 id="password-title">Set or change your password</h2><p>A Google-created account can add password sign-in here. Use at least eight characters.</p><div className="profile-name-fields password-fields"><label>New password<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setStatus(""); }} placeholder="At least 8 characters" /></label><label>Confirm password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setStatus(""); }} placeholder="Enter it again" /></label></div><button className="brand-button" disabled={sending || !newPassword || !confirmPassword} onClick={savePassword}>{sending ? "Saving…" : "Save password"}</button><button className="text-button password-email-link" disabled={sending} onClick={sendLink}>Or send a secure password email to {email}</button>{status && <p className="form-message" role="status">{status}</p>}<small>You can continue using Google sign-in after adding a password.</small></section></div>;
}

function CertificateStatus({ profile, close }: { profile: StaffProfile; close: () => void }) {
  return <div className="profile-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="profile-editor certificate-status" role="dialog" aria-modal="true" aria-labelledby="certificate-title"><button className="profile-editor-close" onClick={close} aria-label="Close certificate status">×</button><span className="certificate-seal">☆</span><p className="eyebrow">Bright Learners Academy</p><h2 id="certificate-title">Orientation certificate</h2><p>Your internal completion certificate will be generated for <b>{profile.displayName}</b> after every assigned {profile.province === "SK" ? "Saskatchewan" : "Alberta"} module and assessment is completed at 100%.</p><div className="certificate-progress"><span>Requirement</span><b>Complete all 8 assigned modules</b></div><button className="brand-button" disabled>Certificate not yet available</button><small>Once complete, this page will provide the dated PDF and module checklist.</small></section></div>;
}

function GuidedTour({ portal, canAdmin, finish, close }: { portal: "learning" | "inspection" | "admin"; canAdmin: boolean; finish: () => void; close: () => void }) {
  const [step, setStep] = useState(0);
  const tours = {
    learning: [
      ["Your module progress", "This card shows how many of your eight assigned modules are complete. Results save to your own account.", "[data-tour='module-progress']"],
      ["Dashboard", "Return here to see your assigned course, progress, next lesson and anything that needs attention.", "[data-tour='dashboard-tab']"],
      ["My Learning", "Open your modules here. Select an available card, choose Start module, read each slide and pass the knowledge check at 100%.", "[data-tour='learning-tab']"],
      ["Resources", "Open the Bright Learners policies and official provincial references used throughout your course.", "[data-tour='resources-tab']"],
      ["Your profile", "Open this menu to edit your legal certificate name, view certificate status, restart this walkthrough or sign out.", "[data-tour='profile-menu']"],
    ],
    inspection: [
      ["Director inspection portal", "This workspace is separate from learning. It holds facility checklists and records for the academy selected on each inspection.", "[data-tour='inspection-heading']"],
      ["Start or resume an inspection", "Choose the academy, start its required checklist, save an unfinished draft and continue it later without losing responses.", "[data-tour='inspection-button']"],
      ["Document every exception", "Failed items require a note. Add corrective actions and photographs when evidence is useful.", "[data-tour='inspection-exception']"],
      ["Your profile", "Use this menu to switch portals, edit your name, restart the walkthrough or sign out.", "[data-tour='profile-menu']"],
    ],
    admin: [
      ["Administration console", "This workspace is restricted to the administrator and technical owner.", "[data-tour='admin-overview']"],
      ["Staff and access", "Manage employee and director access, academy assignment and provincial course assignment.", "[data-tour='admin-overview']"],
      ["Courses and inspections", "Edit module content, quiz questions, source references, checklist items, deadlines and renewal schedules.", "[data-tour='admin-actions']"],
      ["Your profile", "Use this menu to switch portals, view certificate status, restart the walkthrough or sign out.", "[data-tour='profile-menu']"],
    ],
  };
  const steps = tours[portal];
  const current = steps[step];
  const [position, setPosition] = useState({ top: 120, left: 24, arrow: "top" });
  useEffect(() => {
    const target = document.querySelector(current[2]) as HTMLElement | null;
    document.querySelectorAll(".tour-highlight").forEach((item) => item.classList.remove("tour-highlight"));
    if (!target) {
      setPosition({ top: Math.max(90, window.innerHeight / 2 - 220), left: Math.max(20, window.innerWidth / 2 - 240), arrow: "none" });
      return;
    }
    target.classList.add("tour-highlight");
    const place = () => {
      const rect = target.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 32);
      const estimatedHeight = 360;
      const clampTop = (value: number) => Math.min(
        Math.max(16, value),
        Math.max(16, window.innerHeight - estimatedHeight - 16),
      );
      if (portal !== "inspection" && rect.left >= width + 28) {
        setPosition({
          top: clampTop(rect.top + rect.height / 2 - estimatedHeight / 2),
          left: rect.left - width - 22,
          arrow: "right",
        });
        return;
      }
      if (portal !== "inspection" && window.innerWidth - rect.right >= width + 28) {
        setPosition({
          top: clampTop(rect.top + rect.height / 2 - estimatedHeight / 2),
          left: rect.right + 22,
          arrow: "left",
        });
        return;
      }
      const left = Math.min(Math.max(16, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 16);
      const fitsBelow = rect.bottom + 18 + estimatedHeight <= window.innerHeight - 16;
      const desiredTop = fitsBelow ? rect.bottom + 18 : rect.top - estimatedHeight - 18;
      const top = clampTop(desiredTop);
      setPosition({ top, left, arrow: fitsBelow ? "top" : "bottom" });
    };
    if (!target.closest(".portal-topbar")) {
      target.scrollIntoView({ block: "start" });
      window.scrollBy({ top: -125 });
    }
    const placementTimer = window.setTimeout(place, 80);
    window.addEventListener("resize", place);
    return () => {
      window.clearTimeout(placementTimer);
      target.classList.remove("tour-highlight");
      window.removeEventListener("resize", place);
    };
  }, [portal, step]);
  return <div className="tour-backdrop anchored" role="presentation"><section className={`guided-tour anchored arrow-${position.arrow}`} style={{ top: position.top, left: position.left }} role="dialog" aria-modal="true" aria-labelledby="tour-title"><button className="tour-skip" onClick={close}>Skip tour</button><p className="eyebrow">{portal === "learning" ? "Employee learning" : portal === "inspection" ? "Director inspections" : "Administration"} · Step {step + 1} of {steps.length}</p><h2 id="tour-title">{current[0]}</h2><p>{current[1]}</p>{portal === "admin" && !canAdmin && <small>Administration features are not available for your account.</small>}<div className="tour-dots">{steps.map((_, index) => <i key={index} className={index === step ? "active" : ""} />)}</div><footer><button className="outline-button" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>Back</button>{step < steps.length - 1 ? <button className="brand-button" onClick={() => setStep((value) => value + 1)}>Next →</button> : <button className="brand-button" onClick={finish}>Finish tour</button>}</footer></section></div>;
}

function PortalChooser({ name, canAdmin, choose, signOutUser }: { name: string; canAdmin: boolean; choose: (portal: PortalMode) => void; signOutUser: () => void }) {
  return <main className="portal-chooser"><header><Image src="/bright-learners-logo.png" alt="Bright Learners Academy" width={230} height={112} priority /><button onClick={signOutUser}>Sign out</button></header><section><p className="eyebrow">Private staff access</p><h1>Where would you like to go, {name.split(" ")[0]}?</h1><p>Learning and facility inspections are separate workspaces with different tools and records.</p><div className="portal-choice-grid"><button onClick={() => choose("learning")}><span className="choice-icon learning-choice">⌂</span><small>For all staff</small><h2>Employee Learning</h2><p>Complete onboarding modules, take assessments, review resources and download certificates.</p><b>Open learning portal →</b></button><button onClick={() => choose("inspection")}><span className="choice-icon inspection-choice">✓</span><small>For directors</small><h2>Director Inspections</h2><p>Run facility checklists, document follow-ups, attach evidence and export inspection records.</p><b>Open inspection portal →</b></button>{canAdmin && <button onClick={() => choose("admin")}><span className="choice-icon admin-choice">A</span><small>For executives</small><h2>Admin Console</h2><p>Manage staff access, courses, checklists, deadlines and organization-wide compliance.</p><b>Open admin console →</b></button>}</div></section></main>;
}

function DashboardView({ name, location, province, setView }: { name: string; location: string; province: Province; setView: (view: View) => void }) {
  return <div className="content dashboard-content">
    <section className="dashboard-greeting"><div><p className="eyebrow">{location} • {province === "SK" ? "Saskatchewan" : "Alberta"} course</p><h1>Welcome, {name.split(" ")[0]}.</h1><p>Continue your assigned onboarding or find a policy for your academy.</p></div><div className="dashboard-sun" aria-hidden="true">☼</div></section>
    <div className="dashboard-stat-grid">
      <article data-tour="module-progress" className="pastel-blue"><span className="line-symbol">✓</span><b>8</b><strong>Required modules</strong><small>Your saved progress appears in My Learning</small></article>
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

function EmployeeView({ userId, location, province }: { userId: string; location: string; province: Province }) {
  const [completedModules, setCompletedModules] = useState<number[]>([]);
  const [moduleSlides, setModuleSlides] = useState<Record<string, number>>({});
  const [selectedModule, setSelectedModule] = useState<number | null>(null);
  const [lessonOpen, setLessonOpen] = useState(false);
  const [favorites, setFavorites] = useState<number[]>([]);
  const modules = province === "AB" ? albertaModules : saskatchewanModules;
  const completion = Math.round((completedModules.length / modules.length) * 100);
  const progressId = `${userId}_${province.toLowerCase()}-orientation`;

  useEffect(() => {
    getDoc(doc(db, "progress", progressId)).then((snapshot) => {
      if (snapshot.exists()) {
        setCompletedModules(snapshot.data().completedModules || []);
        setModuleSlides(snapshot.data().moduleSlides || {});
      }
    }).catch(() => undefined);
  }, [progressId]);

  async function saveSlide(moduleIndex: number, slideIndex: number) {
    const key = String(moduleIndex);
    setModuleSlides((current) => ({ ...current, [key]: slideIndex }));
    await setDoc(doc(db, "progress", progressId), {
      userId,
      courseId: `${province.toLowerCase()}-orientation`,
      currentModule: moduleIndex,
      moduleSlides: { ...moduleSlides, [key]: slideIndex },
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  async function recordAttempt(moduleIndex: number, score: number, answers: Record<string, number>) {
    const passed = score === 100;
    const update: Record<string, unknown> = {
      userId,
      courseId: `${province.toLowerCase()}-orientation`,
      attempts: arrayUnion({
        moduleIndex,
        score,
        passed,
        answers,
        submittedAt: new Date().toISOString(),
      }),
      currentModule: passed ? Math.min(moduleIndex + 1, modules.length - 1) : moduleIndex,
      updatedAt: serverTimestamp(),
    };
    if (passed) update.completedModules = arrayUnion(moduleIndex);
    await setDoc(doc(db, "progress", progressId), update, { merge: true });
    if (passed) setCompletedModules((current) => current.includes(moduleIndex) ? current : [...current, moduleIndex].sort((a, b) => a - b));
  }

  return <div className="content learning-content">
    <section className="learning-intro">
      <div><p className="handwritten">Your learning path</p><h2>{location} • {province === "AB" ? "Alberta employee orientation" : "Saskatchewan employee orientation"}</h2><p>This is the course assigned to your academy. It combines Bright Learners procedures with the rules and public-health guidance that apply to your location.</p></div>
      <div className="course-progress"><b>{completion}%</b><span>{completedModules.length} of {modules.length} complete</span></div>
    </section>
    {province === "SK" && <section className="sk-status-alert"><span>SK</span><div><b>Willowgrove is operating under a provisional licence.</b><p>Close monitoring is expected for six months. The Ministry licence copy is still pending. Site directions and verbal Public Health guidance are identified separately from written requirements.</p></div></section>}
    <aside className="course-assignment-note"><b>{province === "SK" ? "Saskatchewan" : "Alberta"} course assigned through {location}.</b><span>Need a different assignment? Contact an administrator.</span></aside>

    <section className="professional-modules" aria-label="Course modules">
      <div className="module-list-heading"><div><p className="eyebrow">Required learning</p><h3>Your modules</h3></div><span>Complete in order</span></div>
      <div className="professional-module-grid">
        {modules.map((module, index) => {
          const complete = completedModules.includes(index);
          const available = index === 0 || completedModules.includes(index - 1);
          return <article className={`professional-module ${complete ? "complete" : available ? "current" : "locked"}`} key={module.title}>
            <button className="module-card-button" disabled={!available} onClick={() => { setSelectedModule(index); setLessonOpen(false); }}>
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
        <div className={`preview-icon ${modules[selectedModule].colour}`}>{completedModules.includes(selectedModule) ? "✓" : String(selectedModule + 1).padStart(2, "0")}</div>
        <p className="eyebrow">Module {selectedModule + 1} • {modules[selectedModule].time}</p>
        <h2 id="module-preview-title">{modules[selectedModule].title}</h2>
        <p className="preview-description">{modules[selectedModule].eyebrow}. Work through the lesson, review its official references, then complete the knowledge check with 100%.</p>
        <div className="preview-meta"><span><b>{completedModules.includes(selectedModule) ? "Complete" : "Available"}</b>Status</span><span><b>100%</b>Pass mark</span><span><b>{province}</b>Course</span></div>
        <button className="primary-button preview-start" onClick={() => setLessonOpen(true)}>{completedModules.includes(selectedModule) ? "Review module" : moduleSlides[String(selectedModule)] ? "Resume module" : "Start module"}</button>
        <button className={`favorite-button ${favorites.includes(selectedModule) ? "active" : ""}`} onClick={() => setFavorites((current) => current.includes(selectedModule) ? current.filter((item) => item !== selectedModule) : [...current, selectedModule])}>{favorites.includes(selectedModule) ? "★ Favorited" : "☆ Add to favorites"}</button>
      </section>
    </div>}

    {selectedModule !== null && lessonOpen && <div className="lesson-backdrop" role="dialog" aria-modal="true" aria-labelledby="lesson-title">
      <section className="lesson-drawer">
        <button className="lesson-close" onClick={() => { setLessonOpen(false); setSelectedModule(null); }} aria-label="Close lesson">×</button>
        <p className="eyebrow">Module {selectedModule + 1} • {province === "AB" ? "Alberta" : "Saskatchewan"} orientation</p>
        <h2 id="lesson-title">{modules[selectedModule].title}</h2>
        <CourseModuleLesson province={province} moduleIndex={selectedModule} initialSlide={completedModules.includes(selectedModule) ? 0 : moduleSlides[String(selectedModule)] || 0} onSlideChange={(slideIndex) => saveSlide(selectedModule, slideIndex)} onAttempt={(score, answers) => recordAttempt(selectedModule, score, answers)} />
      </section>
    </div>}
  </div>;
}

type OrientationSlide = {
  kicker: string;
  title: string;
  body: string;
  points?: string[];
  media?: string;
  image?: { src: string; alt: string; credit: string };
  scenario?: { situation: string; prompt: string; response: string };
  ref: string;
};
type QuizQuestion = { id: string; prompt: string; options: string[]; correct: number; reviewSlide: number; explanation: string; ref: string };

const abLessonSlides: OrientationSlide[][] = [
  [
    { kicker: "Welcome", title: "You are part of Bright Learners", body: "Bright Learners began in Alberta in 2015. Every academy shares one purpose: children should feel safe, known and excited to learn.", media: "Founders' welcome video", ref: "Bright Learners Orientation, May 2026 - slides 1-4" },
    { kicker: "Your role", title: "Safety and relationships come first", body: "Educators actively supervise, prepare learning experiences, observe development and maintain welcoming spaces. If you are unsure, pause and ask the director.", points: ["Protect children before completing another task", "Communicate concerns immediately", "Follow licensing, health and centre procedures"], ref: "Bright Learners Orientation, May 2026 - slides 8-14" },
    { kicker: "Families", title: "Build trust every day", body: "Greet families by name, listen carefully, repeat important care instructions and share useful updates. Keep personal information private.", media: "Family greeting scenario", ref: "Bright Learners Orientation, May 2026 - slides 11-12, 36-39" },
    { kicker: "Professional conduct", title: "Respect is non-negotiable", body: "Harassment, bullying, mental abuse and sexual misconduct are not accepted. Raise concerns promptly through centre leadership.", ref: "Bright Learners Orientation, May 2026 - slides 13-15" },
    { kicker: "First day", title: "Help each child and family feel welcome", body: "Prepare the room, greet the family, confirm allergies and care instructions, support separation calmly and provide a positive pickup update.", media: "First-day welcome video", ref: "Bright Learners Orientation, May 2026 - slides 56-58" },
    { kicker: "Leadership", title: "Know who to ask at your academy", body: "Your director coordinates daily operations, staffing, safety questions, family concerns and licensing follow-up. Raise urgent issues immediately instead of waiting for a meeting or the end of your shift.", points: ["Sundance - Margaret Ferriss", "Midnapore - Karla Buick", "Sylvan Lake - Sherry Murphy", "Millwoods - Evelyn Mahmoudi"], media: "Director introductions and academy photos", ref: "Bright Learners Orientation, May 2026 - slide 5; Bright Learners location directory" },
    { kicker: "Ready for work", title: "Arrive prepared to supervise", body: "Be ready to take responsibility at the start of your scheduled shift. Review the room, attendance, allergies, care instructions, staffing plan and any information handed over by the previous educator.", points: ["Store personal belongings securely", "Put away personal devices", "Clarify changes before accepting the group"], ref: "Bright Learners Orientation, May 2026 - role and safety expectations, slides 7-14 and 40-47" },
    { kicker: "Chain of communication", title: "Say what happened, not what you assume", body: "When reporting a concern, give the director clear facts: who was involved, what you observed, where and when it happened, what immediate action you took and what still needs attention.", media: "Fact-based handover scenario", ref: "Bright Learners Orientation, May 2026 - communication expectations, slides 11-15 and 36-39" },
    { kicker: "Confidentiality", title: "Child and family information is private", body: "Access information only when you need it for your work. Discuss children with their own family and authorized staff in an appropriate private setting. Do not share records, photos, diagnoses or family circumstances with other families.", points: ["Use approved systems and devices", "Confirm the authorized recipient", "Ask leadership before releasing information"], ref: "Bright Learners Orientation, May 2026 - family communication and professional-conduct content, slides 11-15 and 36-39" },
    { kicker: "Digital communication", title: "Use Lillio and photographs with purpose", body: "Use approved accounts and centre devices according to Bright Learners policy. Posts and photographs should support meaningful family communication while protecting every child's dignity, consent requirements and personal information.", media: "Approved versus inappropriate documentation examples", ref: "Bright Learners Orientation, May 2026 - documentation and Lillio content, slides 34-39" },
    { kicker: "Work as a team", title: "Handover keeps children safe", body: "Before leaving a room or ending a shift, transfer responsibility directly. Confirm attendance, current location, allergies, medication or care needs, incidents, family messages and unfinished safety tasks.", points: ["Never assume another educator has taken over", "Complete a verbal and required written handover", "Maintain ratio and supervision during the transition"], ref: "Bright Learners Orientation, May 2026 - staff-role, communication and supervision content, slides 7-14 and 40-47" },
    { kicker: "Accountability", title: "Your completion record confirms understanding", body: "This orientation supports your work but does not replace posted procedures, director instructions or current legal requirements. Ask for clarification before acting whenever this course and current workplace direction appear different.", points: ["Official current requirements take priority", "Bright Learners may use stricter internal procedures", "Never sign or certify work you did not complete"], ref: "Bright Learners Orientation, May 2026 - complete deck; Alberta Early Learning and Child Care Regulation; Bright Learners orientation acknowledgement" },
  ],
  [
    { kicker: "Approach", title: "Children learn through play", body: "Bright Learners combines Alberta's FLIGHT framework, emergent curriculum and Reggio Emilia ideas. Planning begins with careful observation of children's interests.", ref: "Bright Learners Orientation, May 2026 - slides 16-23" },
    { kicker: "Observe", title: "Notice before you plan", body: "Record what children say, do and investigate. Look for repeated interests, questions, relationships and emerging skills.", media: "Bright Learners classroom observation", image: { src: "/course-media/child-building-provocation.jpg", alt: "Child investigating balance while building with classroom materials", credit: "Bright Learners Orientation, May 2026 - source photograph from slide 24" }, ref: "Bright Learners Orientation, May 2026 - slides 24-27" },
    { kicker: "Plan", title: "Turn observations into invitations", body: "Use observations to offer materials, questions and experiences that extend learning without controlling the result.", points: ["Keep experiences open-ended", "Offer real and natural materials when safe", "Adapt for age, ability and culture"], media: "Balance and movement provocation", image: { src: "/course-media/balance-movement-provocation.jpg", alt: "Classroom provocation using ramps, tubes and loose parts to explore balance and movement", credit: "Bright Learners Orientation, May 2026 - source photograph from slide 26" }, ref: "Bright Learners Orientation, May 2026 - slides 28-33; AHS Natural Materials recommendations" },
    { kicker: "Document", title: "Make learning visible", body: "Documentation explains the learning, not just the activity. Use accurate notes and purposeful photos while protecting dignity and privacy.", media: "Learning-story and Lillio examples", ref: "Bright Learners Orientation, May 2026 - slides 34-39" },
    { kicker: "Review", title: "Planning is a team practice", body: "Share observations, review the room and adjust plans together. A beautiful setup is not enough if it does not respond to the children.", ref: "Bright Learners Orientation, May 2026 - slides 27-35" },
    { kicker: "Emergent curriculum", title: "Follow the investigation instead of forcing a theme", body: "Emergent curriculum develops from patterns educators notice in children's play. The educator identifies the learning, considers what the children may be trying to understand and offers a thoughtful next step.", scenario: { situation: "Children repeatedly turn blocks into buses, roads and repair shops even though the weekly plan says “farm animals.”", prompt: "What should the educator do?", response: "Document the transportation interest and adapt upcoming invitations around routes, signs, construction, community roles and movement instead of forcing unrelated activities." }, ref: "Bright Learners Orientation, May 2026 - slides 16-33; FLIGHT: Alberta's Early Learning and Care Framework" },
    { kicker: "Open-ended materials", title: "One material can support many ideas", body: "Loose parts and open-ended materials invite children to test, combine, represent and redesign. Select materials for the children's age and abilities, inspect them before use and consider choking, toxicity, sharp edges, cleanliness and allergy risk.", points: ["Avoid materials that can splinter or break dangerously", "Supervise based on the actual risk", "Clean or discard materials according to the approved procedure"], ref: "AHS, Health and Safety Recommendations for Natural Materials and Loose Parts in Childcare Settings; Bright Learners Orientation - slides 28-33" },
    { kicker: "Environment", title: "The room should make learning possible", body: "Arrange spaces so children can reach meaningful materials, work alone or together and revisit ideas over time while educators maintain visibility and safe movement paths.", media: "Car-wash classroom provocation", image: { src: "/course-media/car-wash-provocation.jpg", alt: "Bright Learners classroom car-wash provocation created with blocks, ramps and signs", credit: "Bright Learners Orientation, May 2026 - source photograph from slide 27" }, ref: "Bright Learners Orientation, May 2026 - slides 27-35" },
    { kicker: "Ask useful questions", title: "Invite thinking without taking over", body: "Use comments and questions that help children describe, predict, compare and revise. Give time to respond and accept ideas that differ from the adult's expected answer.", points: ["What do you notice?", "What do you think will happen?", "How could we test that?", "What might you change?"], ref: "Bright Learners Orientation, May 2026 - emergent curriculum and educator-role content, slides 16-35" },
    { kicker: "Include every child", title: "Adapt access, not the learning goal", body: "Change the materials, space, communication method, time or level of physical support so each child can participate meaningfully. Include family knowledge and avoid assuming one approach works for every child.", scenario: { situation: "A child cannot comfortably use the small floor space where a block investigation is happening.", prompt: "How can the educator preserve participation?", response: "Move or duplicate materials onto an accessible surface, create room for mobility and invite the child into the same investigation rather than assigning a separate unrelated activity." }, ref: "Bright Learners Orientation, May 2026 - inclusion and individualized-learning principles; Alberta Early Learning and Child Care Act - matters to be considered" },
    { kicker: "Write objective observations", title: "Describe before you interpret", body: "Record visible actions and exact words before describing possible learning. Avoid labels such as lazy, aggressive, gifted or behind; those are judgments, not observations.", points: ["Include date, context and participants", "Use the child's words when useful", "Separate observation from educator interpretation", "Identify a reasonable next step"], ref: "Bright Learners Orientation, May 2026 - slides 24-39" },
    { kicker: "Photograph with dignity", title: "A useful photo needs a learning purpose", body: "Take and share photographs only through approved practices. Check consent and privacy requirements, avoid embarrassing or vulnerable moments and ensure unrelated children or confidential information are not captured.", scenario: { situation: "A strong learning moment is visible, but another child's medication sheet appears in the background.", prompt: "Should the photograph be posted?", response: "No. Protect the confidential record, retake or crop only through an approved process and confirm the image still meets consent and documentation requirements." }, ref: "Bright Learners Orientation, May 2026 - Lillio and documentation content, slides 34-39; Bright Learners confidentiality expectations" },
    { kicker: "Reflect as a team", title: "Planning changes when evidence changes", body: "Review observations with coworkers, compare perspectives and decide what to continue, change or remove. A plan is not successful because it was completed; it is successful when it responds to children and supports meaningful learning.", ref: "Bright Learners Orientation, May 2026 - slides 27-39" },
    { kicker: "Module summary", title: "Observe, interpret, respond and review", body: "Quality curriculum is a cycle. Notice children's ideas, interpret learning cautiously, prepare safe responsive experiences, document what happens and use that evidence to plan again.", points: ["Children's interests guide direction", "Educators add intention and safety", "Documentation makes thinking visible", "Reflection improves the next experience"], ref: "Bright Learners Orientation, May 2026 - slides 16-39; FLIGHT framework; AHS natural-materials guidance" },
  ],
  [
    { kicker: "Active supervision", title: "Know where every child is", body: "Position yourself to see and hear children, scan often, move through blind spots and anticipate risk. Supervision is active, not passive.", ref: "Bright Learners Orientation, May 2026 - slides 40-43; Alberta Child Care Licensing Handbook, supervision requirements" },
    { kicker: "Transitions", title: "Count children every time the group moves", body: "Complete and verbally confirm headcounts when leaving or entering rooms, playgrounds and vehicles. Compare the count with attendance.", media: "Headcount demonstration", ref: "Bright Learners Orientation, May 2026 - slides 40-43" },
    { kicker: "Ratios", title: "Stay within the required staff-to-child ratio", body: "Know the ratio and group-size requirement for the children in your care. Tell the director before a change could leave the room out of ratio.", ref: "Alberta Child Care Licensing Handbook - staff-to-child ratios and group sizes" },
    { kicker: "Hazards", title: "Keep dangerous items inaccessible", body: "Cleaning products, medicines, sharp objects, plastic bags, hot items and staff belongings must be secured away from children.", ref: "AHS Health & Safety Guidelines for Child Care Facilities - environmental safety; Bright Learners Orientation, May 2026 - slides 44-47" },
    { kicker: "Playspaces", title: "Inspect before children play", body: "Check equipment, surfacing, gates, debris, entrapment risks and weather conditions. Block unsafe equipment and report it immediately.", media: "Outdoor inspection walkthrough", ref: "AHS Inspection and Maintenance of Playspaces - inspection and maintenance sections" },
    { kicker: "Supervision cycle", title: "Position, scan, count, listen and anticipate", body: "Choose a position that gives you the best view, then keep moving your attention. Watch faces and body language, listen for changes in sound, count regularly and anticipate what could happen next.", points: ["Move when furniture or play creates a blind spot", "Stay close to higher-risk activity", "Engage without losing awareness of the whole group", "Reposition before helping one child"], ref: "Bright Learners Orientation, May 2026 - slide 45; Alberta Child Care Licensing Handbook - supervision" },
    { kicker: "Attendance", title: "A headcount is verified against names", body: "A number alone is not enough. Check the children present against the current attendance record so you know exactly who is in your care, who has arrived or left and whether a child is missing.", scenario: { situation: "The room count is 12 and the attendance sheet also says 12, but one child was picked up and another child arrived without the sheet being updated.", prompt: "Is the group accounted for?", response: "No. Stop movement, identify every child by name, correct the attendance record and tell the responsible educator or director. Matching totals can still hide an attendance error." }, ref: "Bright Learners Orientation, May 2026 - slide 47; Alberta Early Learning and Child Care Regulation, Schedule 1 - attendance records and supervision" },
    { kicker: "Transitions", title: "Transfer responsibility deliberately", body: "Before a child or group moves, the sending and receiving educators confirm names, destination, attendance, allergies or care needs and who now has supervision responsibility. Never assume another educator has taken over.", points: ["Count before leaving", "Count on arrival", "Compare names with attendance", "Communicate any change immediately"], scenario: { situation: "An educator opens the playground door while another educator is still helping a child in the washroom.", prompt: "What should happen before the group moves?", response: "Pause the transition. Confirm coverage for both areas, identify every child and move only when supervision and ratio are maintained." }, ref: "Bright Learners Orientation, May 2026 - slides 40, 45 and 47; Alberta Child Care Licensing Handbook - supervision" },
    { kicker: "Ratio coverage", title: "Plan coverage before an educator steps away", body: "Ratios and maximum group sizes apply throughout the day, including opening, closing, breaks, washroom support, outdoor play and transitions. An educator does not leave the group until another qualified person has clearly accepted coverage.", scenario: { situation: "A child needs help changing clothes and the only other educator is outside with the rest of the group.", prompt: "Can you leave the room and assume the hallway is close enough?", response: "No. Contact the director or designated staff and arrange coverage that maintains supervision, ratio and group-size requirements before leaving." }, ref: "Bright Learners Orientation, May 2026 - slide 47; Alberta Early Learning and Child Care Regulation, Schedule 1 - staff-to-child ratios and maximum group size; Alberta Child Care Licensing Handbook" },
    { kicker: "Room arrangement", title: "Design out blind spots", body: "Furniture, shelves, curtains and large play structures must not prevent effective supervision. Keep paths clear, place higher-risk experiences where educators can stay close and organize calming, sleep and learning areas so children remain observable.", points: ["Check sightlines at child height and adult height", "Avoid tall barriers across the room", "Do not let documentation or cleaning block supervision", "Change the setup when the group or activity changes"], ref: "Bright Learners Orientation, May 2026 - slides 41-43 and 45; Alberta Child Care Licensing Handbook - supervision and premises" },
    { kicker: "Outdoor zones", title: "Assign coverage before children enter", body: "Outdoor spaces create distance, noise and visual barriers. Educators should agree on zones and communicate when moving so gates, climbing equipment, wheeled-toy areas, quiet corners and entrances remain covered.", scenario: { situation: "Two educators begin talking beside the door while children spread between the climber, bikes and far fence.", prompt: "What is the supervision problem?", response: "Both educators are covering the same small area. They must separate, scan assigned zones, communicate movement and keep the complete group within sight and hearing." }, ref: "Bright Learners Orientation, May 2026 - slides 45 and 47; Alberta Child Care Licensing Handbook - outdoor supervision" },
    { kicker: "Off-site safety", title: "Account for children beyond the academy", body: "Before a walk or off-site activity, follow the approved plan and consent requirements, confirm staffing and attendance, identify hazards, bring required emergency information and supplies and establish how counts and communication will be maintained.", points: ["Count before departure and at each transition", "Keep the group together according to the plan", "Use designated crossing and transportation procedures", "Report any change or emergency immediately"], ref: "Alberta Early Learning and Child Care Regulation, Schedule 1 - off-site activities and transportation; Alberta Child Care Licensing Handbook" },
    { kicker: "Unsafe conditions", title: "Stop access, correct what is safe and escalate", body: "When you find a hazard, protect children first. Remove the item or block the area when it is safe to do so, tell the director, document it as required and do not return it to use until the responsible person confirms it is safe.", scenario: { situation: "A shelf is loose but has not fallen. Children are arriving and the room is busy.", prompt: "Should the shelf stay open because no one has been hurt?", response: "No. Keep children away, remove accessible materials if safe, notify the director and keep the shelf out of use until it is properly repaired and checked." }, ref: "AHS Health and Safety Guide for Operators of Child Care Facilities, April 2025 - physical premises and injury prevention; Bright Learners Orientation, May 2026 - slide 43" },
    { kicker: "Playspace checks", title: "Daily checks and detailed inspections serve different purposes", body: "Complete the required pre-use or daily check before children enter. Look for immediate hazards such as broken equipment, sharp objects, animal waste, standing water, damaged surfacing, unsecured gates or weather hazards. Complete and retain the more detailed inspection and maintenance records on the centre schedule.", points: ["Do not tick a check you did not perform", "Record the exact defect and location", "Identify who was notified and the corrective action", "Keep unsafe equipment inaccessible"], ref: "AHS, Inspection and Maintenance of Playspaces; Bright Learners monthly audit materials" },
    { kicker: "Missing-child response", title: "A count mismatch is an emergency", body: "If a child cannot be accounted for, stop the group, maintain supervision of the children present and activate the centre's missing-child and emergency procedure immediately. Notify the director without delay; do not quietly search alone or postpone reporting.", scenario: { situation: "After returning indoors, the count is one short. A coworker says the child is probably with the next room.", prompt: "What is the first response?", response: "Keep the present group supervised, immediately alert the director and other assigned staff, verify names and locations and follow the centre's missing-child emergency procedure." }, ref: "Alberta Child Care Licensing Handbook - serious incidents and supervision; Bright Learners emergency and incident procedures" },
    { kicker: "Module summary", title: "Supervision is a continuous safety system", body: "Effective supervision combines accurate attendance, correct staffing, intentional positioning, clear handovers, hazard control and immediate escalation. It continues during routine tasks, transitions, outdoor play and emergencies.", points: ["Know every child's name and location", "Maintain ratio and group size", "Count and verify at every transition", "Block hazards and report immediately"], ref: "Bright Learners Orientation, May 2026 - slides 40-47; Alberta Early Learning and Child Care Regulation; Alberta Child Care Licensing Handbook; AHS playspace guidance" },
  ],
  [
    { kicker: "Recognize", title: "Notice changes from normal", body: "Watch for fever, vomiting, diarrhea, breathing difficulty, unusual tiredness, rash, irritated eyes or other signs that a child may be ill.", ref: "AHS Health & Safety Guidelines for Child Care Facilities - illness section" },
    { kicker: "Respond", title: "Separate, supervise and contact the family", body: "Move the sick child away from the group while keeping them comfortable and supervised. Contact the parent or guardian for prompt pickup.", media: "Illness response scenario", ref: "AHS Health & Safety Guidelines for Child Care Facilities - illness management" },
    { kicker: "Document", title: "Record facts and times", body: "Record observed symptoms, care provided, who was contacted and when the child left. Avoid diagnosing the child.", ref: "AHS Health & Safety Guidelines for Child Care Facilities - records and notification" },
    { kicker: "Outbreaks", title: "Escalate unusual illness patterns", body: "Tell the director when several children or staff have similar symptoms. Follow current AHS instructions for reporting, exclusion and enhanced cleaning.", ref: "AHS Health & Safety Guidelines for Child Care Facilities - outbreak management" },
    { kicker: "After illness", title: "Clean items the child used", body: "Promptly clean and disinfect bedding, mouthed toys and frequently touched items used by the ill child, using the correct product and contact time.", ref: "AHS Surface Cleaning and Disinfection During GI Outbreaks; AHS Health & Safety Guidelines" },
    { kicker: "Immediate danger", title: "Know when illness becomes an emergency", body: "Call for emergency help according to the centre plan when a child has severe difficulty breathing, is unresponsive, has a serious allergic reaction, has a seizure requiring emergency response or shows another life-threatening sign. Notify the director and family without delaying urgent care.", points: ["Stay with the child", "Bring emergency information and medication when directed", "Keep the remaining group supervised", "Record the event after immediate care is underway"], ref: "AHS Health and Safety Guide for Operators of Child Care Facilities, April 2025 - emergency response and illness; Bright Learners emergency procedures" },
    { kicker: "Observe objectively", title: "Describe symptoms instead of diagnosing", body: "Educators report what they can see, hear and measure. Use plain facts such as the number and time of vomiting episodes, appearance of stool, measured temperature, breathing effort, rash location, behaviour change and food or fluid intake.", scenario: { situation: "A child is quiet, refuses lunch and rests their head on the table. There is no confirmed diagnosis.", prompt: "What should the educator record and communicate?", response: "Record the observed behaviour, time, intake and any measured symptoms. Tell the director and family what was observed without labelling the illness." }, ref: "AHS Health and Safety Guide for Operators of Child Care Facilities, April 2025 - illness management and records" },
    { kicker: "Comfortable separation", title: "Reduce exposure without isolating the child", body: "Use the centre's designated supervised area away from group activity. Keep the child comfortable, maintain direct supervision and hand hygiene, and avoid sharing toys, bedding, utensils or personal items while pickup is arranged.", points: ["Never leave the child alone", "Continue watching for worsening symptoms", "Use dedicated or easily cleaned items", "Clean the area after the child leaves"], ref: "AHS Health and Safety Guide for Operators of Child Care Facilities, April 2025 - managing ill children; Bright Learners Orientation, May 2026 - slide 46" },
    { kicker: "Family contact", title: "Give clear facts and pickup instructions", body: "Contact the authorized parent or guardian promptly. State the symptoms, when they began, what care was provided and why pickup is required. If the first contact cannot be reached, follow the authorized emergency-contact sequence and keep trying.", scenario: { situation: "The first parent does not answer and the child's symptoms are worsening.", prompt: "Should the educator leave one voicemail and wait?", response: "No. Inform the director, follow the emergency-contact sequence, continue supervised care and escalate to emergency services if the child's condition requires it." }, ref: "AHS Health and Safety Guide for Operators of Child Care Facilities, April 2025 - illness response; Bright Learners family-contact procedures" },
    { kicker: "Exclusion", title: "Use current requirements, not personal opinion", body: "Attendance decisions depend on symptoms, the child's ability to participate, the care the centre can safely provide, public-health direction and the centre's current illness policy. Educators do not promise a return date or create their own exclusion rule.", points: ["Refer the family to the director when uncertain", "Apply the policy consistently", "Follow specific public-health direction when issued", "Protect the child's privacy"], ref: "AHS Health and Safety Guide for Operators of Child Care Facilities, April 2025 - exclusion of ill children; Alberta child-care illness policy requirements" },
    { kicker: "Return to care", title: "Confirm the child meets the return conditions", body: "On return, review the information provided and confirm the child can participate in the program without requiring care that compromises supervision of others. Follow any condition set by public health, the current centre policy or an individualized health plan.", scenario: { situation: "A family says the child is better, but the child continues to vomit on arrival.", prompt: "Does the verbal assurance override the current symptoms?", response: "No. Keep the child supervised away from the group, inform the director and follow the illness and exclusion procedure based on the symptoms present." }, ref: "AHS Health and Safety Guide for Operators of Child Care Facilities, April 2025 - exclusion and return; Bright Learners illness policy" },
    { kicker: "Medication is separate", title: "Do not use medication to hide symptoms", body: "Medication administration follows written authorization, original-label and documentation requirements. Giving medication does not automatically make a child well enough to remain in care, and educators must never recommend, diagnose or alter a dose.", ref: "Alberta Early Learning and Child Care Regulation, Schedule 1 - medication; Alberta Child Care Licensing Handbook; AHS illness guidance" },
    { kicker: "Recognize a pattern", title: "Several related cases may be an outbreak", body: "Report clusters of vomiting, diarrhea, respiratory illness, rash or other similar symptoms to the director immediately. Leadership determines whether public health must be contacted and applies the current instructions for line lists, notices, exclusion and cleaning.", scenario: { situation: "Three children in different rooms develop vomiting and diarrhea during the same day.", prompt: "Should each case be treated only as an unrelated pickup?", response: "No. Manage each child safely, notify the director of the pattern immediately and preserve accurate onset, room and contact information for outbreak assessment." }, ref: "AHS Health and Safety Guide for Operators of Child Care Facilities, April 2025 - outbreak management; AHS GI outbreak cleaning guidance" },
    { kicker: "Outbreak cleaning", title: "Increase cleaning without skipping the procedure", body: "During gastrointestinal or other directed outbreak control, clean first and then apply the approved disinfectant at the required concentration and wet contact time. Increase attention to washrooms, diapering areas, high-touch surfaces and shared items according to public-health and centre direction.", points: ["Remove mouthed toys immediately", "Keep clean and contaminated items separate", "Use required personal protective equipment", "Record completed enhanced-cleaning tasks"], ref: "AHS, Surface Cleaning and Disinfection During Gastrointestinal Outbreaks in Child Care Facilities; AHS Health and Safety Guide, April 2025" },
    { kicker: "Confidentiality", title: "Inform families without identifying a child", body: "Use only approved notices and communication channels. Families may need information about symptoms, monitoring and public-health direction, but they do not need the ill child's name, diagnosis, room details beyond what is authorized or personal family information.", scenario: { situation: "A parent asks which child brought an illness into the room.", prompt: "What should the educator say?", response: "Protect confidentiality. Share the approved general health information and direct policy or outbreak questions to the director." }, ref: "Bright Learners confidentiality and family-communication expectations; AHS outbreak communication guidance" },
    { kicker: "Module summary", title: "Observe, protect, report and follow current direction", body: "Illness management protects the unwell child and the whole academy. Recognize symptoms, provide supervised separation, contact the family, document objective facts, escalate emergencies and patterns and follow current public-health and centre requirements.", points: ["Never diagnose", "Never leave an ill child alone", "Report clusters immediately", "Protect confidential information"], ref: "AHS Health and Safety Guide for Operators of Child Care Facilities, April 2025; AHS GI outbreak guidance; Alberta Child Care Licensing Handbook" },
  ],
  [
    { kicker: "Know the difference", title: "Cleaning, sanitizing and disinfecting are different", body: "Cleaning removes dirt first. Sanitizing reduces germs on food-contact surfaces. Disinfecting is used for higher-risk surfaces and situations.", ref: "AHS Cleaning and Sanitizing Food Contact Surfaces, Equipment, Toys and Other Surfaces" },
    { kicker: "Correct order", title: "Always clean before sanitizing or disinfecting", body: "Remove debris, wash with detergent, rinse when required, then apply the approved sanitizer or disinfectant.", media: "Four-step cleaning demonstration", ref: "AHS Cleaning and Sanitizing Food Contact Surfaces, Equipment, Toys and Other Surfaces" },
    { kicker: "Contact time", title: "The surface must stay wet long enough", body: "Read the product label and centre procedure. A product wiped off too soon may not work as intended.", ref: "AHS Cleaning and Sanitizing Food Contact Surfaces, Equipment, Toys and Other Surfaces - product use" },
    { kicker: "Toy schedule", title: "Mouthed toys are removed immediately", body: "Place mouthed toys in the designated dirty-toy container and clean and sanitize them before another child uses them. Follow the posted schedule for all other toys.", media: "Mouthed-toy procedure photos", ref: "AHS Health & Safety Guidelines for Child Care Facilities - toy cleaning; Appendix cleaning schedules" },
    { kicker: "Prevent mixing", title: "Keep clean and dirty items separate", body: "Use labelled containers and fresh cloths. Never return an item to play until the full procedure is complete and it is safely dry.", ref: "AHS Cleaning and Sanitizing Food Contact Surfaces, Equipment, Toys and Other Surfaces" },
    { kicker: "Use approved products", title: "The label is part of the procedure", body: "Use only the product approved for that surface and task. Read the label for dilution, required personal protection, contact time, rinsing and safe storage. Never mix cleaning chemicals.", points: ["Keep the original label readable", "Follow the centre's written product procedure", "Ask the director if the product or concentration is unclear"], ref: "Alberta Health Services, Health and Safety Guide for Operators of Child Care Facilities, April 2025 - PDF pages 34-35, Appendix F" },
    { kicker: "Prepare correctly", title: "More chemical is not safer", body: "Prepare sanitizer or disinfectant at the concentration required by the product label and centre procedure. A solution that is too weak may not work; one that is too strong can leave unsafe residue or damage surfaces.", media: "Sanitizer mixing demonstration", ref: "Alberta Health Services, Health and Safety Guide for Operators of Child Care Facilities, April 2025 - PDF page 35, Appendix F" },
    { kicker: "Verify concentration", title: "Test when the procedure requires testing", body: "Use the correct test strip for the product and compare it with the manufacturer's colour scale. Record or report an out-of-range result and prepare a fresh solution before continuing.", points: ["Use the matching test-strip type", "Check the expiry date", "Never guess concentration by smell or colour"], ref: "Alberta Health Services, Health and Safety Guide for Operators of Child Care Facilities, April 2025 - PDF page 35, Appendix F; product label and centre procedure" },
    { kicker: "Respect contact time", title: "Keep the entire surface wet", body: "Start timing only after the full surface is visibly wet. Reapply product if an area dries too early. Do not let children touch the surface until the required process is complete.", ref: "Alberta Health Services, Cleaning and Sanitizing Food Contact Surfaces, Equipment, Toys and Other Surfaces, PUB-0698-202406; Health and Safety Guide - Appendix F" },
    { kicker: "Finish safely", title: "Rinse when required and allow air drying", body: "Follow the label and centre procedure for any required potable-water rinse. Let the item or surface air dry in a protected clean area instead of drying it with a used cloth.", ref: "Alberta Health Services, Cleaning and Sanitizing Food Contact Surfaces, Equipment, Toys and Other Surfaces, PUB-0698-202406" },
    { kicker: "Match the risk", title: "Not every surface follows the same schedule", body: "Food-contact surfaces, mouthed toys, diapering surfaces, sleep equipment and general environmental surfaces have different contamination risks. Use the posted schedule and perform extra cleaning whenever contamination occurs.", points: ["Clean immediately when visibly soiled", "Follow after-each-use requirements", "Do not wait for the end-of-day schedule after contamination"], ref: "Alberta Health Services, Health and Safety Guide for Operators of Child Care Facilities, April 2025 - PDF pages 35-41, Appendices F-G" },
    { kicker: "Washable items", title: "Fabric toys and bedding need controlled laundry handling", body: "Place soiled washable items directly into the designated container without shaking them. Keep them separate from clean laundry, wash using the centre procedure and return them only when fully clean and dry.", media: "Clean and soiled laundry workflow photos", ref: "Alberta Health Services, Health and Safety Guide for Operators of Child Care Facilities, April 2025 - laundry requirements and PDF pages 36-41, Appendix G" },
    { kicker: "Body fluids", title: "Protect the area before cleaning a spill", body: "Keep children away, use required personal protective equipment, remove the spill safely, then clean and disinfect the affected area using the body-fluid procedure. Dispose of contaminated materials and wash hands afterward.", points: ["Block access immediately", "Never use bare hands", "Report exposures or injuries promptly"], ref: "Alberta Health Services, Health and Safety Guide for Operators of Child Care Facilities, April 2025 - PDF pages 42-43, Appendix I" },
    { kicker: "Outbreak response", title: "Increase cleaning when gastrointestinal illness spreads", body: "During a suspected or confirmed gastrointestinal outbreak, follow the director's and AHS directions for enhanced frequency, higher-risk touch points, product selection and documentation. Routine cleaning alone may not be enough.", media: "GI outbreak enhanced-cleaning walkthrough", ref: "Alberta Health Services, Surface Cleaning/Disinfection Guidelines for GI Outbreaks in Child Care Facilities, PUB-0734-201501" },
    { kicker: "Daily evidence", title: "Complete the schedule when the work is done", body: "Initial or sign the cleaning record only after completing the required task. If an item could not be cleaned, remove it from use and tell the director rather than marking it complete.", points: ["Use the actual completion time", "Record exceptions honestly", "Never pre-sign a cleaning record"], ref: "Alberta Health Services, Health and Safety Guide for Operators of Child Care Facilities, April 2025 - Appendix G; Bright Learners internal cleaning schedule" },
    { kicker: "Stop and escalate", title: "When in doubt, keep the item out of use", body: "If you do not know the correct product, concentration, contact time or cleaning method, isolate the item or area and ask the director. Uncertainty is not permission to improvise.", ref: "Alberta Health Services, Health and Safety Guide for Operators of Child Care Facilities, April 2025 - operational cleaning requirements; Bright Learners safety expectation" },
  ],
  [
    { kicker: "Allergies", title: "Check before every meal and snack", body: "Know each child's allergies, dietary restrictions and emergency plan. Verify the child, food and serving before it leaves the preparation area.", ref: "Bright Learners Orientation, May 2026 - food safety slides; AHS Health & Safety Guidelines" },
    { kicker: "Temperatures", title: "Keep cold food cold and hot food hot", body: "Use a clean, sanitized thermometer and follow the centre's approved temperature limits, monitoring and corrective-action procedure.", media: "Food temperature demonstration", ref: "AHS Health & Safety Guidelines for Child Care Facilities - food temperature control" },
    { kicker: "Food from home", title: "Label and store outside food safely", body: "Label food with the child's name and use refrigeration, ice packs or insulated containers when temperature control is required.", ref: "AHS Food From Home: Safe Child Care" },
    { kicker: "Family style", title: "Serve without sharing germs", body: "Supervise serving, use clean utensils, prevent used utensils from returning to shared dishes and discard food that may be contaminated.", ref: "AHS Family Style Meal Service in Child Care Facilities" },
    { kicker: "Food-contact surfaces", title: "Wash, rinse, sanitize and air dry", body: "Follow the full procedure before food preparation and after contamination. Keep chemicals away from food and use the correct concentration.", ref: "AHS Cleaning and Sanitizing Food Contact Surfaces, Equipment, Toys and Other Surfaces" },
  ],
  [
    { kicker: "Diapering", title: "Prepare before bringing the child", body: "Gather supplies, cover the surface as required and keep one hand on the child. Never leave a child unattended on the change surface.", media: "Diapering procedure video", ref: "AHS Diapering Procedure Poster" },
    { kicker: "Prevent spread", title: "Use the posted diapering sequence", body: "Remove the soiled diaper, clean the child front to back, dispose safely, redress, wash the child's hands, clean and disinfect the surface, then wash your hands.", ref: "AHS Diapering Procedure Poster" },
    { kicker: "Medication", title: "Written authorization and the original label are required", body: "Verify the right child, medicine, dose, route and time. Record administration immediately and secure medication from children.", ref: "Alberta Child Care Licensing Handbook - medication; Bright Learners Orientation, May 2026" },
    { kicker: "Sleep", title: "Use a safe crib and complete checks", body: "Inspect the crib, use approved sleep equipment and follow the child's plan and required supervision. Remove damaged equipment from use.", media: "Crib safety inspection", ref: "AHS Crib Safety Checklist" },
    { kicker: "Daily care", title: "Routines still require active supervision", body: "Coordinate toileting, laundry, medication and rest routines so no child or group is left without appropriate supervision.", ref: "Bright Learners Orientation, May 2026 - daily routines and supervision" },
  ],
  [
    { kicker: "Positive guidance", title: "Teach the behaviour children need", body: "Use calm redirection, clear expectations, choices and environments that support success. Never shame, threaten or use physical punishment.", ref: "Bright Learners Orientation, May 2026 - slides 51-54; Alberta Child Care Licensing Handbook - child guidance" },
    { kicker: "Incident response", title: "Care first, then document", body: "Provide appropriate first aid, notify the director and family, preserve factual details and complete the required report promptly.", media: "Incident documentation example", ref: "Bright Learners Orientation, May 2026 - incident reporting; Alberta Child Care Licensing Handbook" },
    { kicker: "Serious events", title: "Escalate immediately", body: "A serious injury, missing child, emergency service involvement or other reportable incident requires immediate director involvement and the applicable reporting process.", ref: "Alberta Child Care Licensing Handbook - serious incidents" },
    { kicker: "Emergency readiness", title: "Know exits, attendance and emergency supplies", body: "Know your evacuation route, alternate exit, muster point, emergency contacts and the location of attendance records and emergency bags.", ref: "Bright Learners Orientation, May 2026 - emergency procedures" },
    { kicker: "During an emergency", title: "Maintain supervision and account for everyone", body: "Follow the centre plan, bring attendance information, count children throughout and do not re-enter until authorized.", media: "Evacuation drill video", ref: "Bright Learners Orientation, May 2026 - emergency procedures; Alberta licensing requirements" },
  ],
];

const quizBanks: Record<Province, QuizQuestion[][]> = {
  AB: [
    [
      { id: "ab1-role", prompt: "What should you do when safety instructions are unclear?", options: ["Guess based on experience", "Pause and ask the director", "Wait until the end of the week"], correct: 1, reviewSlide: 1, explanation: "Safety questions must be clarified before continuing.", ref: "Bright Learners Orientation, May 2026 - slides 8-14" },
      { id: "ab1-family", prompt: "Which is appropriate family communication?", options: ["Share another child's information", "Repeat important care instructions to confirm them", "Avoid pickup updates"], correct: 1, reviewSlide: 2, explanation: "Confirming instructions prevents misunderstandings while protecting confidentiality.", ref: "Bright Learners Orientation, May 2026 - slides 11-12, 36-39" },
      { id: "ab1-first", prompt: "What must be confirmed when welcoming a new child?", options: ["Allergies and care instructions", "Only the pickup time", "Nothing until the second day"], correct: 0, reviewSlide: 4, explanation: "Important care and allergy information must be understood from the start.", ref: "Bright Learners Orientation, May 2026 - slides 56-58" },
      { id: "ab1-urgent", prompt: "When should an urgent safety concern be raised with the director?", options: ["Immediately", "At the next monthly meeting", "Only if a parent asks"], correct: 0, reviewSlide: 5, explanation: "Urgent concerns are escalated at once so protective action can be taken.", ref: "Bright Learners Orientation, May 2026 - leadership and safety expectations" },
      { id: "ab1-handover", prompt: "Before accepting responsibility for a group, what should an educator confirm?", options: ["Attendance, allergies, care needs and current information", "Only the room temperature", "Nothing if the room looks calm"], correct: 0, reviewSlide: 6, explanation: "A proper handover gives the incoming educator the information needed for safe care.", ref: "Bright Learners Orientation, May 2026 - slides 7-14 and 40-47" },
      { id: "ab1-facts", prompt: "Which is the best way to report a concern?", options: ["Describe observed facts, actions and times", "Repeat a rumour", "Wait until details are forgotten"], correct: 0, reviewSlide: 7, explanation: "Fact-based reporting helps leadership respond and creates a reliable record.", ref: "Bright Learners Orientation, May 2026 - communication expectations" },
      { id: "ab1-private", prompt: "A parent asks why another child receives medication. What should you do?", options: ["Explain the other child's health information", "Protect confidentiality and discuss only their own child", "Show them the medication record"], correct: 1, reviewSlide: 8, explanation: "Another child's personal and health information is private.", ref: "Bright Learners Orientation, May 2026 - slides 11-15 and 36-39" },
      { id: "ab1-transfer", prompt: "When is responsibility for a group safely transferred?", options: ["When the educator walks away", "After direct handover and confirmation that the other educator has accepted responsibility", "Whenever another adult enters the room"], correct: 1, reviewSlide: 10, explanation: "Supervision responsibility must be transferred deliberately, not assumed.", ref: "Bright Learners Orientation, May 2026 - role and supervision content" },
    ],
    [
      { id: "ab2-plan", prompt: "What should planning begin with?", options: ["A fixed craft copied online", "Observation of the children", "A decoration theme"], correct: 1, reviewSlide: 0, explanation: "Emergent planning starts with observed interests and questions.", ref: "Bright Learners Orientation, May 2026 - slides 16-27" },
      { id: "ab2-doc", prompt: "Good documentation explains:", options: ["Only what materials were used", "The learning visible in the experience", "Which educator made the display"], correct: 1, reviewSlide: 3, explanation: "Documentation connects observations to learning.", ref: "Bright Learners Orientation, May 2026 - slides 34-39" },
      { id: "ab2-photo", prompt: "Photos used for documentation must protect:", options: ["Only the room design", "Children's dignity and privacy", "The activity schedule"], correct: 1, reviewSlide: 3, explanation: "Purposeful photos must respect dignity and privacy.", ref: "Bright Learners Orientation, May 2026 - slides 36-39" },
      { id: "ab2-emerge", prompt: "Children repeatedly investigate roads and vehicles while the fixed plan says farm animals. What should guide the next plan?", options: ["The observed transportation interest", "The unchanged fixed theme", "A random worksheet"], correct: 0, reviewSlide: 5, explanation: "Emergent curriculum responds to sustained interests and questions visible in children's play.", ref: "Bright Learners Orientation, May 2026 - slides 16-33; FLIGHT framework" },
      { id: "ab2-loose", prompt: "Before adding natural loose parts, the educator should:", options: ["Assume natural means safe", "Assess age, choking, toxicity, sharp-edge and cleaning risks", "Let children test unknown materials alone"], correct: 1, reviewSlide: 6, explanation: "Natural and loose materials still require a complete safety and sanitation assessment.", ref: "AHS Health and Safety Recommendations for Natural Materials and Loose Parts" },
      { id: "ab2-question", prompt: "Which prompt best extends children's thinking?", options: ["Make it exactly like mine", "What do you notice, and how could we test your idea?", "Stop asking questions"], correct: 1, reviewSlide: 8, explanation: "Open prompts invite children to predict, compare, explain and revise.", ref: "Bright Learners Orientation, May 2026 - slides 16-35" },
      { id: "ab2-access", prompt: "A child cannot access a floor-based investigation. What is the best response?", options: ["Give the child an unrelated task", "Adapt the space or materials so the child can join the same learning", "End the investigation for everyone"], correct: 1, reviewSlide: 9, explanation: "Inclusive practice changes access while preserving meaningful participation.", ref: "Bright Learners individualized-learning principles; Alberta Early Learning and Child Care Act" },
      { id: "ab2-objective", prompt: "Which is an objective observation?", options: ["Maya was lazy", "Maya placed three blocks, said “tower,” and added a fourth", "Maya is behind"], correct: 1, reviewSlide: 10, explanation: "Objective records describe visible action and exact language rather than labels.", ref: "Bright Learners Orientation, May 2026 - slides 24-39" },
      { id: "ab2-private", prompt: "A useful learning photo contains a confidential medication sheet in the background. What should happen?", options: ["Post it immediately", "Do not post it; protect the record and retake through the approved process", "Send it from a personal account"], correct: 1, reviewSlide: 11, explanation: "Documentation never overrides privacy and approved-photo requirements.", ref: "Bright Learners Orientation, May 2026 - slides 34-39; confidentiality expectations" },
      { id: "ab2-review", prompt: "When should educators change a learning plan?", options: ["When observations show children's needs or interests have changed", "Never after it is written", "Only at year end"], correct: 0, reviewSlide: 12, explanation: "Planning is reviewed and adjusted using evidence from children's participation and learning.", ref: "Bright Learners Orientation, May 2026 - slides 27-39" },
    ],
    [
      { id: "ab3-supervision", prompt: "Active supervision means:", options: ["Staying seated while children play", "Seeing, hearing, scanning and anticipating", "Completing paperwork nearby"], correct: 1, reviewSlide: 0, explanation: "Active supervision requires continuous awareness and positioning.", ref: "Bright Learners Orientation, May 2026 - slides 40-43" },
      { id: "ab3-count", prompt: "When are headcounts required?", options: ["Only at closing", "At every transition", "Only on field trips"], correct: 1, reviewSlide: 1, explanation: "Transitions are high-risk moments and require verified counts.", ref: "Bright Learners Orientation, May 2026 - slides 40-43" },
      { id: "ab3-play", prompt: "What should happen to unsafe play equipment?", options: ["Use it carefully", "Block access and report it", "Wait for the monthly check"], correct: 1, reviewSlide: 4, explanation: "Unsafe equipment must be taken out of use immediately.", ref: "AHS Inspection and Maintenance of Playspaces" },
      { id: "ab3-cycle", prompt: "Which action is part of active supervision?", options: ["Remaining in one comfortable position", "Repositioning to remove blind spots", "Focusing only on the nearest child"], correct: 1, reviewSlide: 5, explanation: "Educators continually position, scan, listen, count and anticipate.", ref: "Bright Learners Orientation, May 2026 - slide 45; Alberta Child Care Licensing Handbook" },
      { id: "ab3-names", prompt: "The headcount and attendance total both say 12. Why must names still be checked?", options: ["Matching totals can hide an unrecorded arrival and departure", "Names are only needed at closing", "The totals prove everyone is present"], correct: 0, reviewSlide: 6, explanation: "A verified attendance check identifies the actual children in care, not only a total.", ref: "Alberta Early Learning and Child Care Regulation, Schedule 1 - attendance records and supervision" },
      { id: "ab3-transfer", prompt: "When is supervision responsibility safely transferred?", options: ["When another adult enters the room", "After a direct handover and acceptance of responsibility", "When the first educator walks away"], correct: 1, reviewSlide: 7, explanation: "The sending and receiving educators must deliberately confirm the transfer.", ref: "Bright Learners Orientation, May 2026 - supervision content; Alberta Child Care Licensing Handbook" },
      { id: "ab3-coverage", prompt: "An educator needs to leave the group to help one child. What happens first?", options: ["They arrange and confirm coverage that maintains ratio and supervision", "They leave because it will be quick", "They ask the children to supervise each other"], correct: 0, reviewSlide: 8, explanation: "Coverage must be established before an educator steps away.", ref: "Alberta Early Learning and Child Care Regulation, Schedule 1 - ratios and group size" },
      { id: "ab3-zones", prompt: "Two educators stand together while children spread across a large playground. What should they do?", options: ["Stay together so they can talk", "Separate into effective coverage zones and communicate movement", "Bring all children beside the door"], correct: 1, reviewSlide: 10, explanation: "Outdoor supervision requires intentional positioning across the complete play area.", ref: "Bright Learners Orientation, May 2026 - slides 45 and 47; Alberta Child Care Licensing Handbook" },
      { id: "ab3-hazard", prompt: "A loose shelf has not injured anyone. What is the correct action?", options: ["Leave it until the monthly audit", "Keep children away, report it and keep it out of use until repaired", "Ask children not to touch it"], correct: 1, reviewSlide: 12, explanation: "Potential hazards are controlled before an injury occurs.", ref: "AHS Health and Safety Guide for Operators of Child Care Facilities - injury prevention" },
      { id: "ab3-missing", prompt: "A transition count is one child short. What should the educator do?", options: ["Search alone without telling anyone", "Activate the centre response and notify the director immediately while supervising the present group", "Wait five minutes in case the child returns"], correct: 1, reviewSlide: 14, explanation: "A missing or unaccounted-for child requires immediate emergency escalation.", ref: "Alberta Child Care Licensing Handbook - serious incidents and supervision" },
    ],
    [
      { id: "ab4-sick", prompt: "A sick child waiting for pickup must be:", options: ["Left to rest alone", "Separated comfortably and supervised", "Returned to group play"], correct: 1, reviewSlide: 1, explanation: "The child remains supervised while separated from the group.", ref: "AHS Health & Safety Guidelines - illness management" },
      { id: "ab4-record", prompt: "Illness records should contain:", options: ["A diagnosis", "Observed facts, actions and times", "Rumours from other families"], correct: 1, reviewSlide: 2, explanation: "Educators document observations and actions, not diagnoses.", ref: "AHS Health & Safety Guidelines - records" },
      { id: "ab4-pattern", prompt: "Several similar illnesses should be reported first to:", options: ["The director", "Social media", "No one"], correct: 0, reviewSlide: 3, explanation: "The director coordinates outbreak assessment and official direction.", ref: "AHS Health & Safety Guidelines - outbreak management" },
      { id: "ab4-emergency", prompt: "A child has severe difficulty breathing. What takes priority?", options: ["Completing the incident form", "Emergency response according to the centre plan", "Waiting for routine pickup"], correct: 1, reviewSlide: 5, explanation: "Life-threatening symptoms require immediate emergency action before routine documentation.", ref: "AHS Health and Safety Guide, April 2025 - emergency response" },
      { id: "ab4-objective", prompt: "Which is an objective illness note?", options: ["Sam looked contagious", "Sam vomited twice at 10:12 and 10:28 and refused water", "Sam probably has a stomach bug"], correct: 1, reviewSlide: 6, explanation: "Objective notes record observable facts and times rather than a diagnosis.", ref: "AHS Health and Safety Guide, April 2025 - illness records" },
      { id: "ab4-contact", prompt: "The first parent does not answer and symptoms are worsening. What should happen?", options: ["Leave one message and stop", "Follow the authorized emergency-contact sequence and keep the director informed", "Ask another family to take the child"], correct: 1, reviewSlide: 8, explanation: "Staff continue the approved contact and escalation process while supervising the child.", ref: "AHS illness response; Bright Learners family-contact procedures" },
      { id: "ab4-return", prompt: "A child arrives while actively vomiting although the family says they are better. What controls the response?", options: ["The current symptoms and centre procedure", "The family's assurance alone", "Whether the room is busy"], correct: 0, reviewSlide: 10, explanation: "Current symptoms and applicable requirements determine whether care can be safely provided.", ref: "AHS Health and Safety Guide, April 2025 - exclusion and return" },
      { id: "ab4-dose", prompt: "May an educator change a medication dose to help a child remain in care?", options: ["Yes, if the room is short-staffed", "No", "Only without documenting it"], correct: 1, reviewSlide: 11, explanation: "Medication requires authorization and educators do not diagnose or alter prescribed directions.", ref: "Alberta Early Learning and Child Care Regulation, Schedule 1 - medication" },
      { id: "ab4-cluster", prompt: "Three children develop similar gastrointestinal symptoms in one day. What should staff do?", options: ["Report the pattern to the director immediately", "Treat the cases as unrelated and say nothing", "Post the children's names"], correct: 0, reviewSlide: 12, explanation: "A cluster may require outbreak assessment, enhanced measures and public-health contact.", ref: "AHS Health and Safety Guide, April 2025 - outbreak management" },
      { id: "ab4-private", prompt: "A parent asks which child caused an illness in the room. What may the educator share?", options: ["The child's name and diagnosis", "Only approved general health information while protecting identity", "The child's family contact information"], correct: 1, reviewSlide: 14, explanation: "Health communication does not remove a child's right to confidentiality.", ref: "Bright Learners confidentiality expectations; AHS outbreak communication guidance" },
    ],
    [
      { id: "ab5-order", prompt: "What happens before sanitizing or disinfecting?", options: ["Air drying", "Cleaning", "Storage"], correct: 1, reviewSlide: 1, explanation: "Dirt must be removed before the germ-reduction step.", ref: "AHS Cleaning and Sanitizing Food Contact Surfaces, Equipment, Toys and Other Surfaces" },
      { id: "ab5-mouth", prompt: "A mouthed toy should be:", options: ["Returned to the shelf", "Removed until cleaned and sanitized", "Wiped on a towel"], correct: 1, reviewSlide: 3, explanation: "Mouthed toys cannot be shared before the full procedure.", ref: "AHS Health & Safety Guidelines - toy cleaning" },
      { id: "ab5-time", prompt: "Why does contact time matter?", options: ["It lets the product work as directed", "It changes the toy colour", "It makes rinsing optional"], correct: 0, reviewSlide: 2, explanation: "The surface must remain wet for the labelled time.", ref: "AHS cleaning and sanitizing guidance" },
      { id: "ab5-label", prompt: "Where do you confirm dilution, contact time and rinsing instructions?", options: ["The product label and centre procedure", "A coworker's memory", "The colour of the bottle"], correct: 0, reviewSlide: 5, explanation: "The approved product label and written centre procedure control how the chemical is used.", ref: "AHS Health and Safety Guide, April 2025 - PDF pages 34-35, Appendix F" },
      { id: "ab5-strong", prompt: "If sanitizer is mixed stronger than directed, is that automatically safer?", options: ["Yes", "No", "Only for toys"], correct: 1, reviewSlide: 6, explanation: "Over-concentrated product can create residue or exposure risk and must not replace the required dilution.", ref: "AHS Health and Safety Guide, April 2025 - Appendix F; manufacturer label" },
      { id: "ab5-test", prompt: "A test strip shows the prepared solution is outside the required range. What should you do?", options: ["Use it anyway", "Prepare a correct fresh solution and report the result", "Add an unmeasured amount of chemical"], correct: 1, reviewSlide: 7, explanation: "Out-of-range solution is not used until it has been prepared and verified correctly.", ref: "AHS Health and Safety Guide, April 2025 - Appendix F; product procedure" },
      { id: "ab5-wet", prompt: "When does disinfectant contact time begin?", options: ["When the bottle is opened", "After the entire surface is visibly wet", "After the surface dries"], correct: 1, reviewSlide: 8, explanation: "The complete surface must remain wet for the required labelled contact time.", ref: "AHS Cleaning and Sanitizing Food Contact Surfaces, Equipment, Toys and Other Surfaces, PUB-0698-202406" },
      { id: "ab5-dry", prompt: "What is the safest normal way to finish a cleaned and sanitized item?", options: ["Dry it with a used cloth", "Allow protected air drying after any required rinse", "Return it to play while wet"], correct: 1, reviewSlide: 9, explanation: "Air drying prevents a used towel from recontaminating the item.", ref: "AHS Cleaning and Sanitizing Food Contact Surfaces, Equipment, Toys and Other Surfaces, PUB-0698-202406" },
      { id: "ab5-soiled", prompt: "A surface becomes visibly contaminated shortly after its scheduled cleaning. What happens next?", options: ["Wait until tomorrow", "Clean it again immediately using the required procedure", "Only initial the schedule"], correct: 1, reviewSlide: 10, explanation: "Contamination triggers cleaning even when the routine schedule was already completed.", ref: "AHS Health and Safety Guide, April 2025 - Appendices F-G" },
      { id: "ab5-laundry", prompt: "How should soiled bedding be moved to laundry?", options: ["Shake it in the room", "Place it directly in the designated soiled-item container", "Stack it with clean bedding"], correct: 1, reviewSlide: 11, explanation: "Soiled textiles remain contained and separate from clean items.", ref: "AHS Health and Safety Guide, April 2025 - laundry requirements and Appendix G" },
      { id: "ab5-spill", prompt: "What is the first action when a body-fluid spill is found in a child-accessible area?", options: ["Keep children away and secure the area", "Wipe it with a bare hand", "Ignore it until closing"], correct: 0, reviewSlide: 12, explanation: "Access is controlled before the body-fluid cleaning and disinfection procedure begins.", ref: "AHS Health and Safety Guide, April 2025 - PDF pages 42-43, Appendix I" },
      { id: "ab5-record", prompt: "When should an educator initial the cleaning schedule?", options: ["Before starting", "Only after completing the task", "At the end of the month"], correct: 1, reviewSlide: 14, explanation: "A cleaning record is evidence of work actually completed, not a forecast.", ref: "AHS Health and Safety Guide, April 2025 - Appendix G; Bright Learners cleaning schedule" },
    ],
    [
      { id: "ab6-allergy", prompt: "Before serving food, educators must verify:", options: ["Only the menu name", "Child, food and allergy information", "Only the room number"], correct: 1, reviewSlide: 0, explanation: "Every serving must be checked against the child's needs.", ref: "AHS Health & Safety Guidelines - food safety" },
      { id: "ab6-home", prompt: "Food from home should be:", options: ["Unlabelled", "Labelled and temperature-controlled when needed", "Stored with cleaning products"], correct: 1, reviewSlide: 2, explanation: "Identification and safe temperature control are required.", ref: "AHS Food From Home: Safe Child Care" },
      { id: "ab6-surface", prompt: "A food-contact surface finishes the procedure by:", options: ["Air drying", "Being wiped with a used towel", "Being immediately covered"], correct: 0, reviewSlide: 4, explanation: "Air drying avoids recontamination.", ref: "AHS Cleaning and Sanitizing Food Contact Surfaces" },
    ],
    [
      { id: "ab7-diaper", prompt: "When may a child be left alone on a change surface?", options: ["For a few seconds", "Never", "While supplies are gathered"], correct: 1, reviewSlide: 0, explanation: "Prepare supplies first and maintain physical supervision.", ref: "AHS Diapering Procedure Poster" },
      { id: "ab7-med", prompt: "Medication requires:", options: ["A verbal message only", "Written authorization and the original label", "No record for non-prescription products"], correct: 1, reviewSlide: 2, explanation: "Authorization, label verification and documentation protect the child.", ref: "Alberta Child Care Licensing Handbook - medication" },
      { id: "ab7-crib", prompt: "Damaged sleep equipment must be:", options: ["Used with extra blankets", "Removed from use", "Used only during naps"], correct: 1, reviewSlide: 3, explanation: "Unsafe equipment cannot remain in service.", ref: "AHS Crib Safety Checklist" },
    ],
    [
      { id: "ab8-guidance", prompt: "Which is positive guidance?", options: ["Public shaming", "Calm redirection and clear choices", "Physical punishment"], correct: 1, reviewSlide: 0, explanation: "Guidance teaches skills while protecting dignity.", ref: "Bright Learners Orientation, May 2026 - slides 51-54" },
      { id: "ab8-incident", prompt: "After immediate care, an incident should be:", options: ["Documented factually and escalated", "Discussed publicly", "Ignored if the child is calm"], correct: 0, reviewSlide: 1, explanation: "Timely factual reporting is part of safe care.", ref: "Alberta Child Care Licensing Handbook - incident records" },
      { id: "ab8-emergency", prompt: "What must travel with the group during evacuation?", options: ["Room decorations", "Attendance information", "Personal bags"], correct: 1, reviewSlide: 4, explanation: "Attendance information is essential to account for every child.", ref: "Bright Learners emergency procedures" },
    ],
  ],
  SK: [],
};

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
        {current.media && <div className={`lesson-visual visual-${slide % 4}`}>{current.image ? <><Image className="course-source-image" src={current.image.src} alt={current.image.alt} width={900} height={700} /><small>{current.image.credit}</small></> : <><span className="doodle-mark">{String(slide + 1).padStart(2, "0")}</span><b>{current.media}</b><small>Media to be supplied by Bright Learners</small></>}</div>}
        <div className="slide-copy">
          <p className="eyebrow">{current.kicker}</p><h3>{current.title}</h3><p>{current.body}</p>
          {current.points && <ul>{current.points.map((point) => <li key={point}>{point}</li>)}</ul>}
          {current.scenario && <aside className="lesson-scenario"><b>Daycare scenario</b><p>{current.scenario.situation}</p><strong>{current.scenario.prompt}</strong><p className="scenario-response"><b>Best response:</b> {current.scenario.response}</p></aside>}
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
    { kicker: "Welcome", title: "Your Willowgrove centre", body: "Willowgrove is Bright Learners Academy's Saskatchewan location at 415 Willowgrove Square in Saskatoon. Employees follow the shared Bright Learners orientation together with Saskatchewan legislation, provincial licensing guidance, the current Willowgrove Parent Handbook and written centre procedures. Management reported in July 2026 that the centre is operating under a provisional licence and expects close monitoring for six months, making consistent practice and accurate records especially important.", points: ["Director: Merilyn De Guzman", "Centre phone: 306-244-2404", "Province-specific course: Saskatchewan", "Use the current posted procedure for daily work", "Direct licensing, policy and safety questions to centre leadership"], scenario: { situation: "A coworker says, “We used to do it differently at my Alberta centre, so I will use that procedure here.”", prompt: "What should happen?", response: "Pause and confirm the current Willowgrove procedure with the director. Shared Bright Learners expectations apply, but Saskatchewan requirements and Willowgrove directions control location-specific practice." }, ref: "Willowgrove Parent Handbook - pages 5, 46 and 48; management update dated July 2026; Saskatchewan Child Care Act, Regulations and Licensee's Manual" },
    { kicker: "How we learn", title: "Saskatchewan uses Play and Exploration", body: "The Saskatchewan framework supports curiosity, relationships, belonging and learning through play. Bright Learners combines it with emergent curriculum and Reggio Emilia practices.", points: ["Observe children before planning", "Build from their questions and interests", "Make learning visible to families"], ref: "Willowgrove Parent Handbook - pages 9-11" },
    { kicker: "Professional standard", title: "Safety and relationships guide your work", body: "Educators protect children, communicate respectfully, maintain confidentiality and follow applicable Saskatchewan requirements.", points: ["Ask when a direction is unclear", "Report hazards immediately", "Document required actions"], ref: "Willowgrove Parent Handbook - pages 5-10 and 46" },
    { kicker: "Current status", title: "Be ready for closer monitoring", body: "A provisional licence means consistent practice and complete records are especially important. Follow posted procedures exactly and respond promptly to director coaching.", ref: "Willowgrove management update - July 2026; licence copy pending from Ministry" },
    { kicker: "What provisional means", title: "Do not guess about licence conditions", body: "Willowgrove management reported that the centre is operating under a provisional licence and expects close monitoring for six months. The final licence copy and any formal conditions must be added to this course when received. Until then, staff follow the current written handbook, posted procedures and direct leadership instructions.", points: ["Treat the licence copy as pending information", "Do not describe a condition unless it is documented", "Escalate every licensing question to the director"], ref: "Willowgrove management update dated July 2026; Saskatchewan Child Care Licensee's Manual - licensing and monitoring sections" },
    { kicker: "Your first shift", title: "Begin with a complete handover", body: "Before taking responsibility for children, confirm the attendance count, room assignment, staffing plan, allergies, medication or individual care plans, current incidents, family messages and any environmental restrictions.", scenario: { situation: "You enter the room and the previous educator says, “There are about eleven children; the sheet should be close.”", prompt: "What should you do before accepting the group?", response: "Stop and reconcile the children physically present with the attendance record. Confirm the exact count and any care information with the outgoing educator before responsibility is transferred." }, ref: "Willowgrove Parent Handbook - supervision and attendance requirements, pages 42-44; Bright Learners Orientation, May 2026 - staff role and supervision content" },
    { kicker: "Know your responsibilities", title: "Safety tasks are part of teaching", body: "An educator's role includes active supervision, responsive relationships, age-appropriate learning, health routines, accurate records and immediate communication of concerns. Programming work never replaces supervision or required care.", points: ["Position yourself to see and hear children", "Follow care and sanitation procedures every time", "Complete required records when the event occurs", "Ask for coverage before leaving the group"], ref: "Willowgrove Parent Handbook - pages 9-11 and 42-46; Bright Learners Orientation, May 2026 - slides 7-14 and 40-47" },
    { kicker: "Families", title: "Build trust without crossing privacy boundaries", body: "Greet families, confirm instructions, share meaningful information about their own child and protect confidential information. Use approved communication systems and discuss sensitive concerns privately with authorized people.", scenario: { situation: "A parent asks why another child was taken to the office and whether that child has a contagious illness.", prompt: "What is the appropriate response?", response: "Do not share the other child's information. Reassure the parent that centre health procedures are being followed and direct questions about centre-wide notices to the director." }, ref: "Willowgrove Parent Handbook - family communication and confidentiality sections; Bright Learners Orientation, May 2026 - slides 11-15 and 36-39" },
    { kicker: "Observe and plan", title: "Turn children's interests into learning", body: "Observe what children repeatedly investigate, say and attempt. Use those observations to plan open-ended experiences, questions and materials that extend thinking while remaining safe and suitable for the group.", scenario: { situation: "Several children spend the morning moving stones, leaves and water between containers outside.", prompt: "How could the educator extend this interest?", response: "Document what the children are testing, then offer safe containers, measuring tools and questions about volume, texture or change. Check every loose material for age, ingestion and sanitation risk before use." }, ref: "Willowgrove Parent Handbook - Play and Exploration, pages 9-11; Bright Learners Orientation, May 2026 - slides 16-33" },
    { kicker: "Document learning", title: "Record the learning, not just the activity", body: "A useful observation includes what the child did or said, the context, the learning you noticed and a possible next step. Photographs should be purposeful, respectful and taken only through approved centre practices.", points: ["Use objective language", "Avoid labels or diagnoses", "Connect observations to future planning", "Protect children who should not appear in a photograph"], ref: "Bright Learners Orientation, May 2026 - observation, documentation and Lillio content, slides 24-39; Willowgrove Parent Handbook - programming sections" },
    { kicker: "Escalate facts", title: "Report concerns clearly and promptly", body: "Tell the director what you personally observed, when and where it happened, who was involved, the immediate action taken and what remains unresolved. Separate facts from assumptions and complete the required written record.", scenario: { situation: "You notice an unlocked cupboard containing scissors and plastic bags. Another educator says it is usually locked and will probably be fine until lunch.", prompt: "What is the correct response?", response: "Keep children away, secure the items immediately if this can be done safely, notify the director and document or follow up according to the centre procedure. Do not postpone a known hazard." }, ref: "Willowgrove management report of Licensing Consultant direction; Willowgrove Parent Handbook - safety and supervision, pages 42-44" },
    { kicker: "Professional conduct", title: "Respect applies to children, families and coworkers", body: "Harassment, bullying, humiliation, threats, discriminatory conduct and sexual misconduct are not acceptable. Maintain professional boundaries and report concerns through leadership or the appropriate external process when safety may be affected.", points: ["Use calm, respectful language", "Do not discuss workplace conflicts around children or families", "Preserve evidence and factual details", "Seek immediate help when someone may be unsafe"], ref: "Bright Learners Orientation, May 2026 - professional-conduct content, slides 13-15; Willowgrove Parent Handbook - conduct and guidance sections" },
    { kicker: "Source awareness", title: "Know which instruction has authority", body: "Provincial law and regulation come first, followed by official health and licensing guidance. Written location-specific directions and Bright Learners policies then explain how Willowgrove operates. A company rule may be stricter, but it cannot weaken an official requirement.", scenario: { situation: "An old staff note conflicts with a newer posted procedure from leadership.", prompt: "Which instruction should you follow?", response: "Pause the task if safety is affected and ask the director to confirm the current approved procedure. Do not rely on an undated note when newer authoritative direction exists." }, ref: "Saskatchewan Child Care Act, 2014; Child Care Regulations, 2015; Child Care Licensee's Manual; Willowgrove Parent Handbook; Bright Learners source-priority policy" },
    { kicker: "Module summary", title: "Ready means knowing when to act and when to ask", body: "You are expected to protect children, maintain active supervision, follow the current procedure, communicate factual concerns and keep accurate records. Completing this course confirms your understanding, but the director and current posted requirements remain part of every decision.", points: ["Act immediately on hazards", "Never invent a rule or licence condition", "Protect confidentiality", "Use direct handovers", "Document honestly"], ref: "Bright Learners Orientation, May 2026; Willowgrove Parent Handbook; Saskatchewan Child Care Licensee's Manual" },
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

const skQuizBanks: QuizQuestion[][] = [
  [
    { id: "sk1-status", prompt: "What does Willowgrove's current provisional status require from staff?", options: ["Less documentation", "Consistent practice and complete records", "Different rules each week"], correct: 1, reviewSlide: 3, explanation: "Closer monitoring makes consistent practice and complete records especially important.", ref: "Willowgrove management update - July 2026" },
    { id: "sk1-plan", prompt: "Saskatchewan learning plans should begin with:", options: ["Children's observed interests", "Identical worksheets", "A fixed monthly craft"], correct: 0, reviewSlide: 1, explanation: "Play and Exploration and emergent curriculum begin with observation.", ref: "Willowgrove Parent Handbook - pages 9-11" },
    { id: "sk1-hazard", prompt: "When a direction is unclear, educators should:", options: ["Guess", "Ask leadership before proceeding", "Ignore it"], correct: 1, reviewSlide: 2, explanation: "Safety and regulatory questions must be escalated.", ref: "Willowgrove Parent Handbook - pages 5-10 and 46" },
    { id: "sk1-condition", prompt: "The final provisional licence copy has not arrived. How should staff describe its conditions?", options: ["Invent likely conditions", "Only describe conditions once formally documented and confirmed", "Use conditions from an Alberta licence"], correct: 1, reviewSlide: 4, explanation: "Pending information must not be presented as a confirmed licence condition.", ref: "Willowgrove management update - July 2026; Saskatchewan Child Care Licensee's Manual" },
    { id: "sk1-count", prompt: "An outgoing educator gives an approximate child count. What must happen before handover?", options: ["Accept the estimate", "Reconcile the children present with attendance and confirm the exact count", "Wait until pickup"], correct: 1, reviewSlide: 5, explanation: "Responsibility is transferred only after attendance and essential care information are confirmed.", ref: "Willowgrove Parent Handbook - pages 42-44" },
    { id: "sk1-private", prompt: "A parent asks about another child's illness. What may the educator share?", options: ["The other child's diagnosis", "Only information authorized about the parent's own child and approved centre-wide notices", "The other child's medication record"], correct: 1, reviewSlide: 7, explanation: "Child and family information remains confidential.", ref: "Willowgrove Parent Handbook - confidentiality and family communication; Bright Learners Orientation - slides 11-15" },
    { id: "sk1-observe", prompt: "Which documentation best supports emergent planning?", options: ["A factual observation connected to learning and a possible next step", "A list of identical crafts", "A diagnosis of the child"], correct: 0, reviewSlide: 9, explanation: "Effective documentation records what happened, identifies learning and guides responsive planning.", ref: "Bright Learners Orientation - slides 24-39; Willowgrove Parent Handbook - pages 9-11" },
    { id: "sk1-cupboard", prompt: "You find hazardous items in an unlocked cupboard. What is the first appropriate response?", options: ["Wait until lunch", "Protect children, secure or isolate the hazard and notify the director", "Assume another employee will handle it"], correct: 1, reviewSlide: 10, explanation: "A known hazard requires immediate protective action and escalation.", ref: "Licensing Consultant direction reported by Willowgrove; Parent Handbook - pages 42-44" },
  ],
  [
    { id: "sk2-sick", prompt: "A sick child waiting for pickup must remain:", options: ["Alone", "Comfortable and directly supervised", "In group activities"], correct: 1, reviewSlide: 1, explanation: "Separation never removes the supervision requirement.", ref: "Willowgrove Parent Handbook - page 39" },
    { id: "sk2-report", prompt: "Which conditions did Public Health reportedly ask Willowgrove to notify them about?", options: ["Pertussis, measles and GI outbreaks", "Every cold", "Only HFMD"], correct: 0, reviewSlide: 2, explanation: "This is site-reported verbal guidance and must be treated as such.", ref: "Site-reported verbal Public Health guidance - June/July 2026" },
    { id: "sk2-record", prompt: "An illness record should be completed when:", options: ["Symptoms and response are observed", "Only after a diagnosis", "Never"], correct: 0, reviewSlide: 0, explanation: "Observed illness and the centre response must be documented.", ref: "Willowgrove Parent Handbook - pages 37-38" },
  ],
  [
    { id: "sk3-hands", prompt: "When must an educator wash hands after diapering?", options: ["Only if gloves tear", "After every diaper change", "At lunch"], correct: 1, reviewSlide: 0, explanation: "Gloves do not replace handwashing.", ref: "Licensing Consultant direction; Willowgrove Parent Handbook - page 20" },
    { id: "sk3-table", prompt: "What is the four-step table process?", options: ["Sweep, dry, cover, store", "Remove debris, wash, rinse, sanitize", "Spray and immediately wipe"], correct: 1, reviewSlide: 1, explanation: "All four steps are required.", ref: "Licensing Consultant direction reported by Willowgrove" },
    { id: "sk3-supervision", prompt: "Cleaning work may begin only when:", options: ["Supervision and ratios remain covered", "Children are nearby", "Paperwork is complete"], correct: 0, reviewSlide: 3, explanation: "Cleaning cannot interrupt active supervision.", ref: "Willowgrove Parent Handbook - pages 42-44" },
  ],
  [
    { id: "sk4-lock", prompt: "Non-emergency medication must be stored:", options: ["On a high open shelf", "In a locked container", "In a staff bag"], correct: 1, reviewSlide: 0, explanation: "Medication containers remain locked when not in use.", ref: "Willowgrove Parent Handbook - page 34; Licensing Consultant direction" },
    { id: "sk4-form", prompt: "Can medication be given without the completed form?", options: ["Yes, with a text message", "No", "Only once"], correct: 1, reviewSlide: 1, explanation: "Written authorization is required before administration.", ref: "Willowgrove Parent Handbook - pages 34-35" },
    { id: "sk4-check", prompt: "How many educators verify a dose under the centre procedure?", options: ["One", "Two", "Three"], correct: 1, reviewSlide: 2, explanation: "Two educators verify and sign the record.", ref: "Willowgrove Parent Handbook - page 35" },
  ],
  [
    { id: "sk5-home", prompt: "Food from home must be:", options: ["Labelled and kept at a safe temperature", "Shared freely", "Stored beside chemicals"], correct: 0, reviewSlide: 2, explanation: "Identification and temperature control protect children.", ref: "Willowgrove Parent Handbook - page 32; Licensing Consultant direction" },
    { id: "sk5-allergy", prompt: "Before serving food, educators check:", options: ["Allergy and dietary information", "Only the menu", "Only the child's age"], correct: 0, reviewSlide: 3, explanation: "Allergy information must be verified before serving.", ref: "Willowgrove Parent Handbook - pages 32-33 and 36" },
    { id: "sk5-onsite", prompt: "Where are Willowgrove meals and snacks prepared?", options: ["Offsite", "Onsite", "By families only"], correct: 1, reviewSlide: 0, explanation: "The current menu is prepared onsite.", ref: "Revised Menu; Willowgrove Parent Handbook - page 32" },
  ],
  [
    { id: "sk6-count", prompt: "When are headcounts required?", options: ["At each transition", "Only outdoors", "Only at closing"], correct: 0, reviewSlide: 1, explanation: "Counts are confirmed whenever the group moves.", ref: "Willowgrove Parent Handbook - pages 43-44" },
    { id: "sk6-hazard", prompt: "Staff belongings and plastic bags must be:", options: ["Placed on the floor", "Inaccessible to children", "Stored with toys"], correct: 1, reviewSlide: 2, explanation: "The licensing direction names these as hazardous items.", ref: "Licensing Consultant direction; Willowgrove Parent Handbook - page 42" },
    { id: "sk6-task", prompt: "While supervising, an educator should:", options: ["Focus on paperwork", "Continuously scan and position", "Use a personal phone"], correct: 1, reviewSlide: 0, explanation: "Supervision is the primary task.", ref: "Willowgrove Parent Handbook - pages 42-44" },
  ],
  [
    { id: "sk7-point", prompt: "Where is Willowgrove's stated muster point?", options: ["Island Boulevard/front parking area", "Inside the kitchen", "The staff room"], correct: 0, reviewSlide: 1, explanation: "Staff must know the centre's specified evacuation location.", ref: "Willowgrove Parent Handbook - page 40" },
    { id: "sk7-drill", prompt: "How often are fire drills documented?", options: ["Monthly", "Every five years", "Only after an alarm"], correct: 0, reviewSlide: 2, explanation: "The handbook requires monthly fire-drill practice and records.", ref: "Willowgrove Parent Handbook - page 40" },
    { id: "sk7-record", prompt: "After immediate first aid, staff should:", options: ["Complete the required record and notifications", "Delete notes", "Wait until year end"], correct: 0, reviewSlide: 3, explanation: "Incidents require timely documentation and escalation.", ref: "Willowgrove Parent Handbook - pages 41-42" },
  ],
  [
    { id: "sk8-guide", prompt: "Which is an appropriate guidance practice?", options: ["Calm redirection and choices", "Public shaming", "Physical punishment"], correct: 0, reviewSlide: 0, explanation: "Positive guidance teaches skills while protecting dignity.", ref: "Bright Learners Orientation - slides 51-54" },
    { id: "sk8-report", prompt: "Who must make a child-protection report when they have reasonable grounds?", options: ["The person with the concern", "Only the director", "Only the family"], correct: 0, reviewSlide: 2, explanation: "The duty to report cannot be delegated.", ref: "Willowgrove Parent Handbook - page 45; Saskatchewan child-protection law" },
    { id: "sk8-family", prompt: "Should staff notify the family before a protection report?", options: ["Always", "Not when doing so is prohibited or could increase risk", "Only by social media"], correct: 1, reviewSlide: 3, explanation: "Protect the child and follow child-protection direction.", ref: "Willowgrove Parent Handbook - page 45" },
  ],
];

function CourseModuleLesson({ province, moduleIndex, initialSlide, onSlideChange, onAttempt }: { province: Province; moduleIndex: number; initialSlide: number; onSlideChange: (slide: number) => Promise<void>; onAttempt: (score: number, answers: Record<string, number>) => Promise<void> }) {
  const [slide, setSlide] = useState(initialSlide);
  const slides = province === "AB" ? abLessonSlides[moduleIndex] : skLessonSlides[moduleIndex];
  const questions = province === "AB" ? quizBanks.AB[moduleIndex] : skQuizBanks[moduleIndex];
  const moveToSlide = (nextSlide: number) => {
    setSlide(nextSlide);
    void onSlideChange(nextSlide);
  };
  const quiz = <ModuleQuiz questions={questions} moduleIndex={moduleIndex} goToSlide={moveToSlide} onAttempt={onAttempt} />;
  return <LessonWorkspace slides={slides} slide={slide} setSlide={moveToSlide} quiz={quiz} />;
}

function ModuleQuiz({ questions, moduleIndex, goToSlide, onAttempt }: { questions: QuizQuestion[]; moduleIndex: number; goToSlide: (slide: number) => void; onAttempt: (score: number, answers: Record<string, number>) => Promise<void> }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ score: number; missed: QuizQuestion[] } | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit() {
    const missed = questions.filter((question) => answers[question.id] !== question.correct);
    const score = Math.round(((questions.length - missed.length) / questions.length) * 100);
    setSaving(true);
    try {
      await onAttempt(score, answers);
      setResult({ score, missed });
    } finally {
      setSaving(false);
    }
  }
  return <section className="module-quiz">
    <p className="eyebrow">Module {moduleIndex + 1} knowledge check</p>
    <h3>Pass every question to complete this module.</h3>
    <p>Your answers and submission time are saved. If you miss something, we will take you to the exact lesson slide to review.</p>
    {questions.map((question, questionIndex) => <fieldset key={question.id}>
      <legend>{questionIndex + 1}. {question.prompt}</legend>
      {question.options.map((option, optionIndex) => <label key={option}><input type="radio" name={question.id} checked={answers[question.id] === optionIndex} onChange={() => { setAnswers((current) => ({ ...current, [question.id]: optionIndex })); setResult(null); }} />{option}</label>)}
    </fieldset>)}
    <button className="primary-button" disabled={Object.keys(answers).length !== questions.length || saving} onClick={submit}>{saving ? "Saving attempt…" : "Submit knowledge check"}</button>
    {result && result.score === 100 && <div className="quiz-result passed" role="status"><b>100% - module complete.</b><p>Your result and completion time have been saved. The next module is now unlocked.</p></div>}
    {result && result.score < 100 && <div className="quiz-result needs-review" role="status"><b>{result.score}% - review required.</b><p>You need 100% to pass. Review these exact slides, then return and answer the missed questions again.</p>{result.missed.map((question) => <article key={question.id}><div><strong>Review Module {moduleIndex + 1}, Slide {question.reviewSlide + 1}</strong><span>{question.explanation}</span><small>{question.ref}</small></div><button className="outline-button" onClick={() => goToSlide(question.reviewSlide)}>Review slide {question.reviewSlide + 1}</button></article>)}</div>}
  </section>;
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
    <section data-tour="inspection-start" className="action-row"><div><p className="eyebrow">Authorized location</p><select value={location} onChange={(e) => setLocation(e.target.value)}>{locations.map(l => <option key={l}>{l}</option>)}</select></div><button data-tour="inspection-button" className="primary-button">＋ Start monthly inspection</button></section>
    <div className="stat-grid"><article><span>✓</span><div><b>4</b><small>Completed this month</small></div></article><article><span>!</span><div><b>2</b><small>Open follow-ups</small></div></article><article><span>◷</span><div><b>Jul 18</b><small>Last inspection</small></div></article></div>
    <section data-tour="inspection-records" className="table-card"><div className="section-heading"><div><p className="eyebrow">Recent activity</p><h2>{location} inspections</h2></div><button className="outline-button">Download records</button></div>
      <div className="record"><span className="record-status complete">✓</span><div><b>Monthly facility audit</b><small>Completed by Margaret Ferriss • July 18, 2026</small></div><strong>100%</strong><button>View report</button></div>
      <div data-tour="inspection-exception" className="record"><span className="record-status followup">!</span><div><b>Outdoor playspace check</b><small>2 items require follow-up • July 12, 2026</small></div><strong>86%</strong><button>Continue</button></div>
    </section>
    <p className="tiny muted">Failed items require an explanation. Photo evidence and every response will be timestamped in the signed inspection package.</p>
  </div>;
}

function AdminView() {
  return <div className="content">
    <div data-tour="admin-overview" className="stat-grid admin-stats"><article><span>☺</span><div><b>47</b><small>Active staff</small></div></article><article><span>✓</span><div><b>82%</b><small>Training complete</small></div></article><article><span>⌂</span><div><b>5</b><small>Academy locations</small></div></article></div>
    <div className="admin-grid">
      <section className="table-card"><p className="eyebrow">Needs attention</p><h2>Compliance queue</h2>{["3 overdue course assignments","2 inspection follow-ups","5 certificates renew soon"].map((x,i)=><div className="queue" key={x}><span>{i+1}</span><b>{x}</b><button>Review</button></div>)}</section>
      <section data-tour="admin-actions" className="quick-card"><p className="handwritten">Quick actions</p><button>＋ Add staff account</button><button>＋ Create course module</button><button>＋ Edit inspection checklist</button><button>↗ Export compliance report</button></section>
    </div>
  </div>;
}
