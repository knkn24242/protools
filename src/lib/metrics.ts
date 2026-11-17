// 進捗の集計。「学習時間」ではなく「できるようになったこと」を中心に評価する。
//  教材の習熟度 = 学習完了(40%) + 理解度確認問題の正解率(60%)
//  分野の習熟度 = 教材の習熟度(50%) + 実技課題の合格率(30%) + 問題バンクの正解率(20%)
//  （実技課題・問題がない分野は、あるものだけで按分）
import type { CategoryId, Lesson, ProgressData, Question } from "../types";
import { allQuestions, categories, lessons, levels, practiceTasks, shortcuts } from "./content";
import { categoryPerformance } from "./adaptive";

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function lessonMastery(l: Lesson, d: ProgressData): number {
  const p = d.lessons[l.id];
  const statusScore = p?.status === "completed" ? 0.4 : p?.status === "in_progress" ? 0.1 : 0;
  const correct = l.quiz.filter((_, i) => d.questions[`${l.id}#${i}`]?.correct).length;
  const quizScore = l.quiz.length ? (correct / l.quiz.length) * 0.6 : p?.status === "completed" ? 0.6 : 0;
  return statusScore + quizScore;
}

function weighted(parts: [number, number | null][]): number {
  const valid = parts.filter(([, v]) => v !== null) as [number, number][];
  const w = valid.reduce((a, [wt]) => a + wt, 0);
  return w ? valid.reduce((a, [wt, v]) => a + wt * v, 0) / w : 0;
}

function practiceRate(d: ProgressData, filter: (lv: number, cat: CategoryId) => boolean): number | null {
  const ts = practiceTasks.filter((t) => filter(t.level, t.category));
  if (!ts.length) return null;
  return ts.filter((t) => d.practice[t.id]?.status === "passed").length / ts.length;
}

function bankRate(d: ProgressData, filter: (q: Question) => boolean): number | null {
  const qs = allQuestions.filter((q) => !q.id.includes("#") && filter(q));
  if (!qs.length) return null;
  return qs.filter((q) => d.questions[q.id]?.correct).length / qs.length;
}

export function levelMastery(level: number, d: ProgressData): number {
  const ls = lessons.filter((l) => l.level === level);
  return weighted([
    [0.5, ls.length ? avg(ls.map((l) => lessonMastery(l, d))) : null],
    [0.3, practiceRate(d, (lv) => lv === level)],
    [0.2, bankRate(d, (q) => q.level === level)],
  ]);
}

export function overallMastery(d: ProgressData): number {
  const active = levels.filter((lv) => lessons.some((l) => l.level === lv.level));
  return avg(active.map((lv) => levelMastery(lv.level, d)));
}

export function levelCompletion(level: number, d: ProgressData) {
  const ls = lessons.filter((l) => l.level === level);
  return { done: ls.filter((l) => d.lessons[l.id]?.status === "completed").length, total: ls.length };
}

export function quizStats(d: ProgressData, filter?: (q: Question) => boolean) {
  let answered = 0;
  let correct = 0;
  let total = 0;
  for (const q of allQuestions) {
    if (filter && !filter(q)) continue;
    total++;
    const r = d.questions[q.id];
    if (r) {
      answered++;
      if (r.correct) correct++;
    }
  }
  return { answered, correct, total, accuracy: answered ? correct / answered : 0 };
}

export function practiceStats(d: ProgressData) {
  const passed = practiceTasks.filter((t) => d.practice[t.id]?.status === "passed").length;
  return { passed, total: practiceTasks.length, rate: practiceTasks.length ? passed / practiceTasks.length : 0 };
}

/** ショートカット習得：直近で3回連続正解しているものを「習得済み」とする */
export const SHORTCUT_MASTER_STREAK = 3;
export function shortcutStats(d: ProgressData) {
  const mastered = shortcuts.filter((s) => (d.shortcuts[s.id]?.streak ?? 0) >= SHORTCUT_MASTER_STREAK).length;
  const recs = Object.values(d.shortcuts);
  const attempts = recs.reduce((a, r) => a + r.attempts, 0);
  const correct = recs.reduce((a, r) => a + r.correct, 0);
  const ms = recs.reduce((a, r) => a + r.totalMs, 0);
  return {
    mastered,
    total: shortcuts.length,
    rate: mastered / shortcuts.length,
    accuracy: attempts ? correct / attempts : 0,
    avgMs: attempts ? ms / attempts : 0,
    attempts,
  };
}

export interface CategorySkill {
  id: CategoryId;
  label: string;
  mastery: number;
  lessonCount: number;
  accuracy: number;
  answered: number;
}

export function categorySkills(d: ProgressData): CategorySkill[] {
  return categories.map((c) => {
    const ls = lessons.filter((l) => l.category === c.id);
    const qs = quizStats(d, (q) => q.category === c.id);
    const lessonPart = ls.length ? avg(ls.map((l) => lessonMastery(l, d))) : null;
    const prac = practiceRate(d, (_, cat) => cat === c.id);
    const bank = bankRate(d, (q) => q.category === c.id);
    return {
      id: c.id,
      label: c.label,
      mastery: weighted([
        [0.5, lessonPart],
        [0.3, prac],
        [0.2, bank],
      ]),
      lessonCount: ls.length + practiceTasks.filter((t) => t.category === c.id).length,
      accuracy: qs.accuracy,
      answered: qs.answered,
    };
  });
}

/**
 * 苦手分野：問題・トラブル対応・ショートカットの成績を合成した「総合成績」が 70% 未満の分野。
 * accuracy には総合成績、answered には判定材料の量を入れて返す。
 */
export function weakCategories(d: ProgressData): CategorySkill[] {
  const skills = categorySkills(d);
  return categoryPerformance(d)
    .filter((p) => p.evidence >= 2 && p.performance < 0.7)
    .sort((a, b) => a.performance - b.performance)
    .map((p) => ({ ...skills.find((s) => s.id === p.id)!, accuracy: p.performance, answered: Math.round(p.evidence) }));
}

/** 現在のLEVEL：未完了の教材がある最初のLEVEL */
export function currentLevel(d: ProgressData): number {
  for (const lv of levels) {
    const ls = lessons.filter((l) => l.level === lv.level);
    if (ls.length && ls.some((l) => d.lessons[l.id]?.status !== "completed")) return lv.level;
  }
  return levels.find((lv) => !lessons.some((l) => l.level === lv.level))?.level ?? 8;
}

/** 次に学ぶべき教材（未完了のうち順番が最も早いもの） */
export function nextLessons(d: ProgressData, n: number): Lesson[] {
  return lessons.filter((l) => d.lessons[l.id]?.status !== "completed").slice(0, n);
}

/** 次に取り組む実技課題（現在LEVEL以下で未合格、難易度の低い順） */
export function nextTask(d: ProgressData) {
  const lv = currentLevel(d);
  return practiceTasks.find((t) => t.level <= lv && d.practice[t.id]?.status !== "passed");
}

export function totalStudySec(d: ProgressData): number {
  return Object.values(d.studyLog).reduce((a, b) => a + b, 0);
}

export function formatDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}分`;
  return `${Math.floor(m / 60)}時間${m % 60}分`;
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
