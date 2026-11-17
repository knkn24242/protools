// 苦手分野の分析（オフラインで動作）
// 問題演習だけでなく、トラブル対応・ショートカット・実技課題の結果を合わせて
// 分野ごとの「現場で使える度合い」を推定する。デイリーミッションと出題の重み付けに使う。
import type { CategoryId, ProgressData } from "../types";
import { allQuestions, categories, getLesson, getQuestion, getShortcut, getTrouble, lessons, practiceTasks, shortcuts, troubles } from "./content";
import { currentLevel, lessonMastery, levelMastery, overallMastery, pct } from "./metrics";
import { dueItems } from "./review";

/** ショートカットのカテゴリー（日本語）→ 学習分野 */
const SHORTCUT_CATEGORY: Record<string, CategoryId> = {
  セッション: "session",
  ウィンドウ: "session",
  トランスポート: "recording",
  "Edit Mode / Tool": "editing",
  編集: "editing",
  ミックス: "mixing",
};

const RECENT_MS = 60 * 24 * 3600 * 1000; // 直近60日の結果を重視

export interface CategoryPerformance {
  id: CategoryId;
  label: string;
  /** 0〜1。問題・トラブル・ショートカットの成績を重み付けして合成 */
  performance: number;
  /** 判定材料の量（重みの合計） */
  evidence: number;
  detail: { questions: number | null; troubles: number | null; shortcuts: number | null; practicePending: number };
}

export function categoryPerformance(d: ProgressData): CategoryPerformance[] {
  const now = Date.now();
  return categories.map((c) => {
    let w = 0;
    let s = 0;
    // 問題（直近60日、1問 = 重み1）
    let qn = 0;
    let qc = 0;
    for (const q of allQuestions) {
      if (q.category !== c.id) continue;
      const r = d.questions[q.id];
      if (!r || now - r.lastAt > RECENT_MS) continue;
      qn++;
      if (r.correct) qc++;
    }
    w += qn;
    s += qc;
    // トラブル対応（1件 = 重み2、最新の点数）
    let tn = 0;
    let ts = 0;
    for (const t of troubles) {
      if (t.category !== c.id) continue;
      const r = d.troubles[t.id];
      if (!r) continue;
      tn++;
      ts += r.last;
    }
    w += tn * 2;
    s += ts * 2;
    // ショートカット（1件 = 最大重み1）
    let sw = 0;
    let ss = 0;
    for (const sc of shortcuts) {
      if (SHORTCUT_CATEGORY[sc.category] !== c.id) continue;
      const r = d.shortcuts[sc.id];
      if (!r) continue;
      const wt = Math.min(1, r.attempts / 3);
      sw += wt;
      ss += wt * (r.correct / r.attempts);
    }
    w += sw;
    s += ss;
    const practicePending = practiceTasks.filter((p) => p.category === c.id && d.practice[p.id]?.status === "in_progress").length;
    return {
      id: c.id,
      label: c.label,
      performance: w ? s / w : 0,
      evidence: w,
      detail: { questions: qn ? qc / qn : null, troubles: tn ? ts / tn : null, shortcuts: sw ? ss / sw : null, practicePending },
    };
  });
}

/** 学習者の状況をテキストにまとめる（AI 講師・AI アドバイスの文脈として送信） */
export function learnerContext(d: ProgressData): string {
  const lv = currentLevel(d);
  const perf = categoryPerformance(d);
  const wrong = dueItems(d.review)
    .slice(0, 6)
    .map((r) => {
      if (r.kind === "question") return `問題：${getQuestion(r.id)?.q}`;
      if (r.kind === "shortcut") return `ショートカット：${getShortcut(r.id)?.action}`;
      return `トラブル対応：${getTrouble(r.id)?.title}`;
    });
  const last = d.lastLessonId ? getLesson(d.lastLessonId)?.title : undefined;
  return [
    `- 使用 OS：${d.settings.os === "mac" ? "macOS" : "Windows"} / Pro Tools：${d.settings.ptVersion}`,
    `- 現在の LEVEL：${lv}（全体の習得率 ${pct(overallMastery(d))}、LEVEL ${lv} の習熟度 ${pct(levelMastery(lv, d))}）`,
    `- 最後に学んだ教材：${last ?? "なし"}`,
    `- 分野別の成績：${perf
      .filter((p) => p.evidence > 0)
      .map((p) => `${p.label} ${pct(p.performance)}`)
      .join(" / ") || "まだデータなし"}`,
    `- 復習が必要な項目：${wrong.length ? `\n  - ${wrong.join("\n  - ")}` : "なし"}`,
  ].join("\n");
}

/** AI アドバイス用：学習状況 + 推薦候補の一覧（ID 付き） */
export function coachSummary(d: ProgressData): string {
  const lessonList = lessons
    .map((l) => `${l.id} | L${l.level} | ${l.title} | ${d.lessons[l.id]?.status ?? "not_started"} | 習熟 ${pct(lessonMastery(l, d))}`)
    .join("\n");
  const taskList = practiceTasks.map((t) => `${t.id} | L${t.level} | ${t.title} | ${d.practice[t.id]?.status ?? "not_started"}`).join("\n");
  const troubleList = troubles.map((t) => `${t.id} | ${t.title} | ${d.troubles[t.id] ? `最新 ${pct(d.troubles[t.id].last)}` : "未実施"}`).join("\n");
  const perf = categoryPerformance(d)
    .map(
      (p) =>
        `- ${p.label}：総合 ${p.evidence ? pct(p.performance) : "データなし"}（問題 ${p.detail.questions === null ? "—" : pct(p.detail.questions)} / トラブル ${p.detail.troubles === null ? "—" : pct(p.detail.troubles)} / ショートカット ${p.detail.shortcuts === null ? "—" : pct(p.detail.shortcuts)}、取り組み中の実技 ${p.detail.practicePending}件）`,
    )
    .join("\n");
  return `## 学習状況\n${learnerContext(d)}\n\n## 分野別の詳細\n${perf}\n\n## 教材一覧（ID | LEVEL | タイトル | 状態 | 習熟）\n${lessonList}\n\n## 実技課題一覧（ID | LEVEL | タイトル | 状態）\n${taskList}\n\n## トラブル演習一覧（ID | タイトル | 成績）\n${troubleList}`;
}

export function validIds<T extends { id: string }>(ids: string[], pool: T[]): T[] {
  return ids.map((id) => pool.find((p) => p.id === id)).filter((x): x is T => !!x);
}
