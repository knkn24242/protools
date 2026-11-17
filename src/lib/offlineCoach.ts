// ルールベースの学習アドバイス（API 不要）
// 苦手分析（categoryPerformance）と教材・課題・トラブルの状況から、重点分野と7日間のプランを組み立てる。
import type { CategoryId, ProgressData } from "../types";
import { categoryPerformance } from "./adaptive";
import { lessons, practiceTasks, shortcuts, troubles } from "./content";
import { currentLevel, lessonMastery, overallMastery, pct } from "./metrics";
import { addDays, dueItems, todayStr } from "./review";

export interface OfflinePlan {
  summary: string;
  focus: { area: string; reason: string; actions: string[] }[];
  lessonIds: string[];
  taskIds: string[];
  troubleIds: string[];
  weekPlan: { day: string; plan: string }[];
}

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

export function offlinePlan(d: ProgressData): OfflinePlan {
  const lv = currentLevel(d);
  const perf = categoryPerformance(d);
  const measured = perf.filter((p) => p.evidence >= 2);
  const weak = measured.filter((p) => p.performance < 0.7).sort((a, b) => a.performance - b.performance);
  const strong = measured.filter((p) => p.performance >= 0.85);
  const due = dueItems(d.review).length;
  const minutes = d.settings.dailyMinutes;

  // 重点分野：苦手分野（最大2）。苦手がなければ、現在LEVELでまだ測定できていない分野
  const levelCats = new Set<CategoryId>(lessons.filter((l) => l.level <= lv).map((l) => l.category));
  const unmeasured = perf.filter((p) => p.evidence < 2 && levelCats.has(p.id));
  const focusCats = weak.length ? weak.slice(0, 2) : unmeasured.slice(0, 2);

  const lessonIds: string[] = [];
  const taskIds: string[] = [];
  const troubleIds: string[] = [];

  const focus = focusCats.map((p) => {
    const ls = lessons
      .filter((l) => l.category === p.id && l.level <= Math.max(lv, 1))
      .sort((a, b) => lessonMastery(a, d) - lessonMastery(b, d))
      .slice(0, 2);
    const ts = practiceTasks.filter((t) => t.category === p.id && t.level <= lv && d.practice[t.id]?.status !== "passed").slice(0, 1);
    const tr = troubles
      .filter((t) => t.category === p.id)
      .sort((a, b) => (d.troubles[a.id]?.best ?? -1) - (d.troubles[b.id]?.best ?? -1))
      .slice(0, 1);
    lessonIds.push(...ls.map((l) => l.id));
    taskIds.push(...ts.map((t) => t.id));
    troubleIds.push(...tr.map((t) => t.id));
    const actions: string[] = [];
    if (ls.length)
      actions.push(
        d.lessons[ls[0].id]?.status === "completed"
          ? `教材「${ls[0].title}」を読み直し、理解度確認問題を解き直す`
          : `教材「${ls[0].title}」を学習し、理解度確認問題を解く`,
      );
    if (p.detail.troubles !== null && p.detail.troubles < 0.7 && tr.length) actions.push(`トラブル演習「${tr[0].title}」で対応の順序を練習する`);
    else if (tr.length && !d.troubles[tr[0].id]) actions.push(`トラブル演習「${tr[0].title}」に挑戦する`);
    if (p.detail.shortcuts !== null && p.detail.shortcuts < 0.7) actions.push("Shortcut Training でこの分野のカテゴリーを選んで練習する");
    if (ts.length) actions.push(`実技課題「${ts[0].title}」を Pro Tools で行う`);
    const reason = p.evidence >= 2 ? `総合成績 ${pct(p.performance)}（問題 ${fmt(p.detail.questions)} / トラブル ${fmt(p.detail.troubles)} / ショートカット ${fmt(p.detail.shortcuts)}）` : "まだ成績データが少なく、習得度を判定できていません";
    return { area: p.label, reason, actions };
  });

  // 重点分野がない場合でも、次の教材と課題は提示する
  const nextLesson = lessons.find((l) => d.lessons[l.id]?.status !== "completed");
  if (nextLesson && !lessonIds.includes(nextLesson.id)) lessonIds.push(nextLesson.id);
  const nextTask = practiceTasks.find((t) => t.level <= lv && d.practice[t.id]?.status !== "passed");
  if (nextTask && !taskIds.includes(nextTask.id)) taskIds.push(nextTask.id);

  // ショートカットの未習得数
  const scLeft = shortcuts.filter((s) => (d.shortcuts[s.id]?.streak ?? 0) < 3).length;

  // 7日間のプラン：重点分野と通常の進行を交互に、6日目にシミュレーター、7日目は復習
  const today = todayStr();
  const textMin = minutes === 60 ? 15 : 10;
  const pracMin = minutes === 60 ? 30 : 10;
  const weekPlan = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    const [y, m, dd] = date.split("-").map(Number);
    const label = `${m}/${dd}（${WEEKDAY[new Date(y, m - 1, dd).getDay()]}）`;
    const f = focusCats.length ? focusCats[i % focusCats.length] : null;
    let plan: string;
    if (i === 5) plan = `Studio Simulator で案件を1本通す（${pracMin + textMin}分）＋ 復習`;
    else if (i === 6) plan = `復習リストの消化と、今週間違えた問題の解き直し（${minutes}分）`;
    else if (f && i % 2 === 0) plan = `重点分野「${f.label}」：教材の読み直し ${textMin}分 → 関連する実技 ${pracMin}分 → 問題演習`;
    else plan = `${nextLesson ? `次の教材「${nextLesson.title}」` : "教材の総復習"} ${textMin}分 → 実技 ${pracMin}分 → ショートカット練習`;
    return { day: label, plan };
  });

  const parts = [`現在は LEVEL ${lv}、全体の習得率は ${pct(overallMastery(d))} です。`];
  if (weak.length) parts.push(`苦手分野は「${weak.map((w) => w.label).join("・")}」です。`);
  else if (measured.length) parts.push("現時点で総合成績が70%を下回る分野はありません。");
  else parts.push("まだ成績データが少ないため、まず問題演習とトラブル演習で現状を測定しましょう。");
  if (strong.length) parts.push(`「${strong.map((s) => s.label).join("・")}」は安定しています。`);
  if (due) parts.push(`今日の復習が ${due} 件あります。`);
  if (scLeft) parts.push(`未習得のショートカットが ${scLeft} 件あります。`);

  return {
    summary: parts.join(""),
    focus,
    lessonIds: [...new Set(lessonIds)],
    taskIds: [...new Set(taskIds)],
    troubleIds: [...new Set(troubleIds)],
    weekPlan,
  };
}

function fmt(v: number | null) {
  return v === null ? "—" : pct(v);
}
