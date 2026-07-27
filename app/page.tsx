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
  { title: "Welcome to Bright Learners", eyebrow: "Your role & responsibilities", time: "12 min", colour: "sun", icon: "☺" },
  { title: "Healthy children, healthy centre", eyebrow: "Illness, hygiene & outbreaks", time: "18 min", colour: "blue", icon: "✚" },
  { title: "Clean toys, safer play", eyebrow: "Cleaning & disinfection", time: "16 min", colour: "rose", icon: "✦" },
  { title: "Food, allergies & safe meals", eyebrow: "Every bite handled safely", time: "14 min", colour: "green", icon: "♨" },
  { title: "Diapering, sleep & daily care", eyebrow: "Safe routines", time: "18 min", colour: "lavender", icon: "☾" },
  { title: "Emergencies & safe spaces", eyebrow: "Ready when it matters", time: "20 min", colour: "orange", icon: "!" },
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
  const [completedCount, setCompletedCount] = useState(1);
  const [selectedModule, setSelectedModule] = useState<number | null>(null);
  const [lessonOpen, setLessonOpen] = useState(false);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [answer, setAnswer] = useState("");
  const [quizMessage, setQuizMessage] = useState("");
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
      <div><p className="handwritten">Your learning path</p><h2>Alberta employee orientation</h2><p>Follow the string from one pinned lesson to the next. Finish each knowledge check with 100% to unlock the next card.</p></div>
      <div className="course-progress"><b>{completion}%</b><span>{completedCount} of {modules.length} complete</span></div>
    </section>

    <section className="professional-modules" aria-label="Course modules">
      <div className="module-list-heading"><div><p className="eyebrow">Required learning</p><h3>Your modules</h3></div><span>Complete in order</span></div>
      <div className="professional-module-grid">
        {modules.map((module, index) => {
          const complete = index < completedCount;
          const available = index <= completedCount;
          return <article className={`professional-module ${complete ? "complete" : available ? "current" : "locked"}`} key={module.title}>
            <button className="module-card-button" disabled={!available} onClick={() => { setSelectedModule(index); setLessonOpen(false); setQuizMessage(""); setAnswer(""); }}>
              <div className={`module-media-preview media-${index + 1}`} aria-hidden="true"><span className="doodle-mark">{String(index + 1).padStart(2, "0")}</span><small>{module.eyebrow}</small></div>
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
        <div className="preview-meta"><span><b>{selectedModule < completedCount ? "Complete" : "Available"}</b>Status</span><span><b>100%</b>Pass mark</span><span><b>AB</b>Course</span></div>
        <button className="primary-button preview-start" onClick={() => setLessonOpen(true)}>{selectedModule < completedCount ? "Review module" : "Start module"}</button>
        <button className={`favorite-button ${favorites.includes(selectedModule) ? "active" : ""}`} onClick={() => setFavorites((current) => current.includes(selectedModule) ? current.filter((item) => item !== selectedModule) : [...current, selectedModule])}>{favorites.includes(selectedModule) ? "★ Favorited" : "☆ Add to favorites"}</button>
      </section>
    </div>}

    {selectedModule !== null && lessonOpen && <div className="lesson-backdrop" role="dialog" aria-modal="true" aria-labelledby="lesson-title">
      <section className="lesson-drawer">
        <button className="lesson-close" onClick={() => { setLessonOpen(false); setSelectedModule(null); }} aria-label="Close lesson">×</button>
        <p className="eyebrow">Module {selectedModule + 1} • Alberta orientation</p>
        <h2 id="lesson-title">{modules[selectedModule].title}</h2>
        {selectedModule === 0 ? <WelcomeLesson /> : selectedModule === 1 ? <HealthLesson answer={answer} setAnswer={setAnswer} checkAnswer={checkAnswer} message={quizMessage} /> :
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
