// 学習進捗のグローバルストア。変更は IndexedDB に自動保存される。
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  DailyMission,
  LessonProgress,
  LessonStatus,
  PracticeProgress,
  ProgressData,
  ReviewKind,
  Screenshot,
  Settings,
  SimRun,
  TroubleResult,
} from "../types";
import { kvGet, kvSet } from "./db";
import { applyReview, todayStr } from "./review";

const KEY = "progress";

export const defaultSettings = (): Settings => ({
  os: "mac",
  ptVersion: "2024",
  dailyMinutes: 60,
  shortcutTimeLimit: 10,
  shortcutMode: "choice",
});

export const defaultProgress = (): ProgressData => ({
  schema: 3,
  lessons: {},
  questions: {},
  review: [],
  practice: {},
  shortcuts: {},
  simRuns: [],
  troubles: {},
  missions: {},
  studyLog: {},
  settings: defaultSettings(),
});

/** 旧バージョンのデータを現在の形式（schema 3）に変換する */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function migrate(raw: any): ProgressData | null {
  if (!raw || typeof raw !== "object" || typeof raw.lessons !== "object") return null;
  const base = defaultProgress();
  let d: any = raw;
  if (d.schema === 1) {
    const questions: Record<string, unknown> = {};
    const lessons: Record<string, unknown> = {};
    for (const [id, p] of Object.entries<any>(d.lessons)) {
      for (const [i, r] of Object.entries<any>(p.quiz ?? {})) questions[`${id}#${i}`] = r;
      lessons[id] = { status: p.status, startedAt: p.startedAt, completedAt: p.completedAt, timeSec: p.timeSec ?? 0 };
    }
    d = {
      ...d,
      schema: 2,
      lessons,
      questions,
      review: (d.review ?? []).map((r: any) => ({ qid: `${r.lessonId}#${r.qIndex}`, addedAt: r.addedAt })),
    };
  }
  if (d.schema === 2) {
    d = {
      ...d,
      schema: 3,
      review: (d.review ?? []).map((r: any) => ({ kind: "question", id: r.qid, box: 0, due: todayStr(), addedAt: r.addedAt, lapses: 0 })),
    };
  }
  if (d.schema !== 3) return null;
  return { ...base, ...d, settings: { ...base.settings, ...d.settings } };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const today = todayStr;

function emptyLesson(): LessonProgress {
  return { status: "not_started", timeSec: 0 };
}

export function emptyPractice(): PracticeProgress {
  return { status: "not_started", checked: [], note: "", shots: [], updatedAt: 0 };
}

/** 今日のミッションのカウンターを進める */
function bumpMission(d: ProgressData, key: "answered" | "reviewed" | "shortcutAnswered", wasReview = false): ProgressData {
  const m = d.missions[today()];
  if (!m) return d;
  const next: DailyMission = { ...m, [key]: m[key] + 1 };
  if (wasReview && key !== "reviewed") next.reviewed = m.reviewed + 1;
  return { ...d, missions: { ...d.missions, [today()]: next } };
}

interface Store {
  data: ProgressData;
  loaded: boolean;
  lesson: (id: string) => LessonProgress;
  setStatus: (id: string, status: LessonStatus) => void;
  openLesson: (id: string) => void;
  /** 問題の回答を記録。不正解は復習リストへ、復習日以降の正解は復習段階を進める */
  answer: (qid: string, correct: boolean) => void;
  addTime: (id: string | null, sec: number) => void;
  updatePractice: (taskId: string, fn: (p: PracticeProgress) => PracticeProgress) => void;
  addShot: (taskId: string, shot: Screenshot) => void;
  recordShortcut: (id: string, correct: boolean, ms: number) => void;
  recordTrouble: (id: string, r: TroubleResult) => void;
  setSimActive: (run: SimRun | undefined) => void;
  finishSim: (run: SimRun) => void;
  setMission: (m: DailyMission) => void;
  setSettings: (s: Partial<Settings>) => void;
  replaceAll: (d: ProgressData) => void;
}

const Ctx = createContext<Store | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ProgressData>(defaultProgress);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<number>();

  useEffect(() => {
    kvGet<unknown>(KEY).then((d) => {
      const m = migrate(d);
      if (m) setData(m);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => kvSet(KEY, data), 300);
  }, [data, loaded]);

  const updateLesson = useCallback((id: string, fn: (p: LessonProgress) => LessonProgress, extra?: (d: ProgressData) => ProgressData) => {
    setData((d) => {
      const next = { ...d, lessons: { ...d.lessons, [id]: fn(d.lessons[id] ?? emptyLesson()) } };
      return extra ? extra(next) : next;
    });
  }, []);

  const isDueReview = (d: ProgressData, kind: ReviewKind, id: string) => d.review.some((r) => r.kind === kind && r.id === id && r.due <= today());

  const store: Store = {
    data,
    loaded,
    lesson: (id) => data.lessons[id] ?? emptyLesson(),
    setStatus: (id, status) =>
      updateLesson(id, (p) => ({
        ...p,
        status,
        startedAt: p.startedAt ?? Date.now(),
        completedAt: status === "completed" ? Date.now() : undefined,
      })),
    openLesson: (id) =>
      updateLesson(
        id,
        (p) => (p.status === "not_started" ? { ...p, status: "in_progress", startedAt: Date.now() } : p),
        (d) => ({ ...d, lastLessonId: id }),
      ),
    answer: (qid, correct) =>
      setData((d) => {
        const prev = d.questions[qid];
        const wasDue = isDueReview(d, "question", qid);
        const next: ProgressData = {
          ...d,
          questions: { ...d.questions, [qid]: { correct, attempts: (prev?.attempts ?? 0) + 1, lastAt: Date.now() } },
          review: applyReview(d.review, "question", qid, correct),
        };
        return bumpMission(next, "answered", wasDue);
      }),
    addTime: (id, sec) =>
      setData((d) => {
        const lessons = id ? { ...d.lessons, [id]: { ...(d.lessons[id] ?? emptyLesson()), timeSec: (d.lessons[id]?.timeSec ?? 0) + sec } } : d.lessons;
        return { ...d, lessons, studyLog: { ...d.studyLog, [today()]: (d.studyLog[today()] ?? 0) + sec } };
      }),
    updatePractice: (taskId, fn) =>
      setData((d) => ({ ...d, practice: { ...d.practice, [taskId]: { ...fn(d.practice[taskId] ?? emptyPractice()), updatedAt: Date.now() } } })),
    addShot: (taskId, shot) =>
      setData((d) => {
        const p = d.practice[taskId] ?? emptyPractice();
        return {
          ...d,
          practice: {
            ...d.practice,
            [taskId]: { ...p, status: p.status === "not_started" ? "in_progress" : p.status, shots: [...p.shots, shot], updatedAt: Date.now() },
          },
        };
      }),
    recordShortcut: (id, correct, ms) =>
      setData((d) => {
        const r = d.shortcuts[id] ?? { attempts: 0, correct: 0, totalMs: 0, lastAt: 0, streak: 0 };
        const wasDue = isDueReview(d, "shortcut", id);
        const next: ProgressData = {
          ...d,
          shortcuts: {
            ...d.shortcuts,
            [id]: {
              attempts: r.attempts + 1,
              correct: r.correct + (correct ? 1 : 0),
              totalMs: r.totalMs + ms,
              lastAt: Date.now(),
              streak: correct ? r.streak + 1 : 0,
            },
          },
          review: applyReview(d.review, "shortcut", id, correct),
        };
        return bumpMission(next, "shortcutAnswered", wasDue);
      }),
    recordTrouble: (id, res) =>
      setData((d) => {
        const r = d.troubles[id] ?? { attempts: 0, best: 0, last: 0, lastAt: 0 };
        const ok = res.causeCorrect && res.score >= 0.7;
        const wasDue = isDueReview(d, "trouble", id);
        const next: ProgressData = {
          ...d,
          troubles: { ...d.troubles, [id]: { attempts: r.attempts + 1, best: Math.max(r.best, res.score), last: res.score, lastAt: Date.now() } },
          review: applyReview(d.review, "trouble", id, ok),
        };
        return wasDue ? bumpMission(next, "reviewed") : next;
      }),
    setSimActive: (run) => setData((d) => ({ ...d, simActive: run })),
    finishSim: (run) => setData((d) => ({ ...d, simActive: undefined, simRuns: [...d.simRuns, run] })),
    setMission: (m) => setData((d) => ({ ...d, missions: { ...d.missions, [m.date]: m } })),
    setSettings: (s) => setData((d) => ({ ...d, settings: { ...d.settings, ...s } })),
    replaceAll: (d) => setData(d),
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useProgress(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("ProgressProvider missing");
  return s;
}

/** 画面表示中だけ学習時間を記録するフック（15秒単位） */
export function useStudyTimer(lessonId: string | null) {
  const { addTime } = useProgress();
  const ref = useRef(addTime);
  ref.current = addTime;
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") ref.current(lessonId, 15);
    }, 15000);
    return () => window.clearInterval(t);
  }, [lessonId]);
}
