import { useState } from "react";
import { useRoute } from "./lib/router";
import { useProgress } from "./lib/store";
import Dashboard from "./pages/Dashboard";
import { CurriculumIndex, LevelDetail } from "./pages/Curriculum";
import LessonPage from "./pages/Lesson";
import ProgressPage from "./pages/Progress";
import SettingsPage from "./pages/Settings";
import { PracticeDetail, PracticeIndex } from "./pages/Practice";
import Trainer from "./pages/Trainer";
import ShortcutsPage from "./pages/Shortcuts";
import GlossaryPage from "./pages/Glossary";
import { SimRunPage, SimulatorIndex, TroubleDrill } from "./pages/Simulator";
import ReviewPage from "./pages/Review";
import TutorPage from "./pages/Tutor";
import ErrorBoundary from "./components/ErrorBoundary";

const NAV: { key: string; label: string; phase?: number; desc?: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "curriculum", label: "Curriculum" },
  { key: "practice", label: "Practice" },
  { key: "ai-trainer", label: "AI Trainer" },
  { key: "tutor", label: "Tutor" },
  { key: "simulator", label: "Studio Simulator" },
  { key: "shortcuts", label: "Shortcut Training" },
  { key: "glossary", label: "Glossary" },
  { key: "review", label: "Review" },
  { key: "progress", label: "Progress" },
  { key: "settings", label: "Settings" },
];

export default function App() {
  const route = useRoute();
  const { loaded } = useProgress();
  const [menuOpen, setMenuOpen] = useState(false);
  const [head, a, b] = route;
  const active = head === "lesson" ? "curriculum" : head;

  let page;
  if (!loaded) page = <div className="page muted">読み込み中…</div>;
  else if (head === "dashboard") page = <Dashboard />;
  else if (head === "curriculum") page = a ? <LevelDetail level={Number(a)} /> : <CurriculumIndex />;
  else if (head === "lesson" && a) page = <LessonPage id={a} anchor={b} />;
  else if (head === "practice") page = a ? <PracticeDetail id={a} /> : <PracticeIndex />;
  else if (head === "ai-trainer") page = <Trainer />;
  else if (head === "shortcuts") page = <ShortcutsPage />;
  else if (head === "glossary") page = <GlossaryPage initial={a} />;
  else if (head === "simulator") page = a === "run" ? <SimRunPage /> : a === "trouble" && b ? <TroubleDrill id={b} /> : <SimulatorIndex tab={a} />;
  else if (head === "review") page = <ReviewPage />;
  else if (head === "tutor") page = <TutorPage kind={a} id={b} />;
  else if (head === "progress") page = <ProgressPage />;
  else if (head === "settings") page = <SettingsPage />;
  else {
    const item = NAV.find((n) => n.key === head);
    page = item ? (
      <div className="page">
        <h1>{item.label}</h1>
        <div className="card">
          <span className="badge">PHASE {item.phase} で実装予定</span>
          <p>{item.desc}</p>
        </div>
      </div>
    ) : (
      <div className="page">ページが見つかりません。</div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="menu-btn" aria-label="メニュー" onClick={() => setMenuOpen((o) => !o)}>
          ☰
        </button>
        <span className="brand">Pro Tools Academy</span>
      </header>
      <aside className={`sidebar ${menuOpen ? "open" : ""}`} onClick={() => setMenuOpen(false)}>
        <div className="brand side-brand">
          <span className="brand-mark" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
          Pro Tools Academy
        </div>
        <nav>
          {NAV.map((n) => (
            <a key={n.key} href={`#/${n.key}`} className={`nav-item ${active === n.key ? "active" : ""} ${n.phase ? "soon" : ""}`}>
              {n.label}
              {n.phase && <span className="nav-phase">P{n.phase}</span>}
            </a>
          ))}
        </nav>
        <div className="side-foot small muted">Offline ・ データはブラウザ内に保存</div>
      </aside>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
      <main className="main">
        <ErrorBoundary resetKey={route.join("/")}>{page}</ErrorBoundary>
      </main>
    </div>
  );
}
