// デイリーミッション：その日の学習内容を進捗と苦手分野から自動で組み立てる
//  60分版：テキスト15 / 実技30 / 問題演習10 / 復習5
//  30分版：テキスト10 / 実技10 / 問題演習5 / 復習5
import type { DailyMission, MissionItem, ProgressData } from "../types";
import { getLesson, lessons, practiceTasks, simProjects } from "./content";
import { currentLevel, lessonMastery, weakCategories } from "./metrics";
import { dueItems, todayStr } from "./review";

const isToday = (ts?: number) => !!ts && todayStr() === new Date(ts).toLocaleDateString("sv-SE");

export function generateMission(d: ProgressData, minutes: 60 | 30): DailyMission {
  const weak = weakCategories(d);
  const weakIds = weak.map((w) => w.id);
  const lv = currentLevel(d);
  const t = minutes === 60 ? { text: 15, practice: 30, quiz: 10, review: 5, quizN: 10, reviewN: 10 } : { text: 10, practice: 10, quiz: 5, review: 5, quizN: 5, reviewN: 5 };
  const items: MissionItem[] = [];

  // --- テキスト学習：苦手分野の未完了教材 → 次の未完了教材 → 習熟度の低い教材の再学習
  const incomplete = lessons.filter((l) => d.lessons[l.id]?.status !== "completed");
  const weakLesson = incomplete.find((l) => weakIds.includes(l.category) && l.level <= lv);
  if (weakLesson) {
    items.push({ kind: "text", label: weakLesson.title, ref: weakLesson.id, minutes: t.text, done: false, reason: `苦手分野「${weak.find((w) => w.id === weakLesson.category)?.label}」を優先` });
  } else if (incomplete[0]) {
    items.push({ kind: "text", label: incomplete[0].title, ref: incomplete[0].id, minutes: t.text, done: false, reason: "カリキュラム順の次の教材" });
  } else {
    const low = lessons.slice().sort((a, b) => lessonMastery(a, d) - lessonMastery(b, d))[0];
    if (low) items.push({ kind: "text", label: `${low.title}（再学習）`, ref: low.id, minutes: t.text, done: false, reason: "習熟度が最も低い教材" });
  }

  // --- 実技：現在LEVEL以下の未合格課題（苦手分野優先、30分版は短い課題）
  const candidates = practiceTasks.filter((p) => p.level <= lv && d.practice[p.id]?.status !== "passed" && (minutes === 60 || p.minutes <= 20));
  const task = candidates.find((p) => weakIds.includes(p.category)) ?? candidates.find((p) => d.practice[p.id]?.status === "in_progress") ?? candidates[0];
  if (task) {
    items.push({
      kind: "practice",
      label: task.title,
      ref: task.id,
      minutes: t.practice,
      done: false,
      reason: weakIds.includes(task.category) ? "苦手分野の実技" : d.practice[task.id]?.status === "in_progress" ? "取り組み中の課題の続き" : `LEVEL ${task.level} の課題`,
    });
  } else if (simProjects[0]) {
    items.push({ kind: "simulator", label: `${simProjects[0].code}：${simProjects[0].title}`, ref: simProjects[0].id, minutes: t.practice, done: false, reason: "取り組める実技課題がないため現場シミュレーション" });
  }

  // --- 問題演習
  items.push({ kind: "quiz", label: `AI Trainer おまかせ ${t.quizN}問`, minutes: t.quiz, target: t.quizN, done: false, reason: weak.length ? `苦手分野（${weak.map((w) => w.label).join("・")}）を重点出題` : "進捗に応じた難易度で出題" });

  // --- 復習（今日の復習がなければショートカット訓練）
  const due = dueItems(d.review).length;
  if (due > 0) items.push({ kind: "review", label: `復習 ${Math.min(due, t.reviewN)}件`, minutes: t.review, target: Math.min(due, t.reviewN), done: false, reason: `今日が復習日の項目が ${due}件` });
  else items.push({ kind: "shortcut", label: `ショートカット ${t.reviewN}問`, minutes: t.review, target: t.reviewN, done: false, reason: "今日の復習がないためショートカットを強化" });

  return { date: todayStr(), minutes, items, answered: 0, reviewed: 0, shortcutAnswered: 0 };
}

/** 自動判定による達成状況（手動チェックと OR） */
export function isItemDone(item: MissionItem, m: DailyMission, d: ProgressData): boolean {
  if (item.done) return true;
  switch (item.kind) {
    case "text":
      return !!item.ref && isToday(d.lessons[item.ref]?.completedAt);
    case "practice":
      return !!item.ref && isToday(d.practice[item.ref]?.passedAt);
    case "quiz":
      return m.answered >= (item.target ?? 0);
    case "review":
      return m.reviewed >= (item.target ?? 0) || (m.reviewed > 0 && dueItems(d.review).length === 0);
    case "shortcut":
      return m.shortcutAnswered >= (item.target ?? 0);
    case "simulator":
      return d.simRuns.some((r) => r.projectId === item.ref && isToday(r.finishedAt));
  }
}

export function missionLink(item: MissionItem): string {
  switch (item.kind) {
    case "text":
      return `#/lesson/${item.ref}`;
    case "practice":
      return `#/practice/${item.ref}`;
    case "quiz":
      return "#/ai-trainer";
    case "review":
      return "#/review";
    case "shortcut":
      return "#/shortcuts";
    case "simulator":
      return "#/simulator";
  }
}

export const KIND_TAG: Record<MissionItem["kind"], string> = {
  text: "テキスト",
  practice: "実技",
  quiz: "問題演習",
  review: "復習",
  shortcut: "ショートカット",
  simulator: "シミュレーター",
};

/** 全項目を達成した日が今日（または昨日）から何日続いているか */
export function missionStreak(d: ProgressData): number {
  let streak = 0;
  const day = new Date();
  for (let i = 0; i < 365; i++) {
    const key = day.toLocaleDateString("sv-SE");
    const m = d.missions[key];
    const done = m && m.items.length > 0 && m.items.every((it) => isItemDone(it, m, d));
    if (done) streak++;
    else if (i > 0) break; // 今日が未達成でも昨日までの連続は数える
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

export function lessonTitle(id?: string) {
  return id ? getLesson(id)?.title : undefined;
}
