// オフライン講師：API を使わず、アプリ内の教材・用語辞典・トラブル事例・ショートカットから
// 質問に関連する情報を探して提示する。AI のように文章を生成するのではなく、
// 収録済み（出典・要確認情報つき）の内容だけを返すため、架空の情報が混ざらない。
import type { GlossaryEntry, Lesson, ShortcutItem, Trouble } from "../types";
import { glossary, lessons, shortcuts, troubles } from "./content";

export type HitKind = "term" | "lesson" | "trouble" | "shortcut";

export interface Hit {
  kind: HitKind;
  id: string;
  score: number;
  /** 質問に関係する行（教材の手順・ポイントなど） */
  snippets: string[];
}

interface Doc {
  kind: HitKind;
  id: string;
  /** 見出し（強く一致させる） */
  title: string;
  /** 本文の各行 */
  lines: string[];
}

/** 全角英数→半角、小文字化、空白除去 */
function norm(s: string): string {
  return s
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toLowerCase()
    .replace(/\s+/g, "");
}

/** 質問を検索語に分解：英単語（連続する英語は熟語としても扱う）＋ 日本語の2文字組 */
function tokenize(q: string): { words: string[]; grams: string[] } {
  const lower = q.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).toLowerCase();
  const words = new Set<string>();
  // 英語：連続部分（例 "take folder"）と各単語
  for (const m of lower.matchAll(/[a-z0-9][a-z0-9 /.+-]*[a-z0-9]|[a-z0-9]/g)) {
    const phrase = m[0].trim();
    if (phrase.length >= 2) words.add(phrase.replace(/\s+/g, ""));
    for (const w of phrase.split(/[\s/]+/)) if (w.length >= 2 && !STOP_EN.has(w)) words.add(w);
  }
  // 日本語：2文字組（ひらがなだけの組は助詞などが多いので除外）
  const grams = new Set<string>();
  const ja = lower.replace(/[a-z0-9\s]+/g, "|");
  for (const seg of ja.split("|")) {
    const t = seg.replace(/[、。？！?!「」『』（）()・,.\-ー]/g, (c) => (c === "ー" ? c : "|"));
    for (const part of t.split("|")) {
      for (let i = 0; i < part.length - 1; i++) {
        const g = part.slice(i, i + 2);
        if (/^[ぁ-ゖ]{2}$/.test(g)) continue;
        if (STOP_JA.has(g)) continue;
        grams.add(g);
      }
    }
  }
  return { words: [...words], grams: [...grams] };
}

const STOP_EN = new Set(["the", "and", "or", "to", "of", "in", "is", "a", "an", "pro", "tools", "logic", "how", "what"]);
const STOP_JA = new Set(["方法", "違い", "教え", "知り", "使い", "やり", "とは", "場合", "どう", "何で", "って", "する", "して", "ます", "です", "でき", "ため"]);

let index: Doc[] | null = null;

function buildIndex(): Doc[] {
  const docs: Doc[] = [];
  for (const g of glossary) docs.push(termDoc(g));
  for (const l of lessons) docs.push(lessonDoc(l));
  for (const t of troubles) docs.push(troubleDoc(t));
  for (const s of shortcuts) docs.push(shortcutDoc(s));
  return docs;
}

const termDoc = (g: GlossaryEntry): Doc => ({
  kind: "term",
  id: g.term,
  title: `${g.term} ${g.ja} ${g.logic.name}`,
  lines: [g.desc, g.logic.note ?? "", g.howto ?? "", g.example ?? "", g.related.join(" ")],
});

const lessonDoc = (l: Lesson): Doc => ({
  kind: "lesson",
  id: l.id,
  title: `${l.title} ${l.titleEn} ${l.logic.logicName}`,
  lines: [
    l.overview,
    ...l.steps.map((s) => s.text + (s.shortcut ? `（${s.shortcut.mac} / ${s.shortcut.win}）` : "")),
    l.logic.equivalent,
    ...l.logic.differences,
    ...l.useCases,
    ...l.cautions,
    ...l.mistakes,
    ...l.keyPoints,
    ...l.terms.map((t) => `${t.term}：${t.desc}`),
  ],
});

const troubleDoc = (t: Trouble): Doc => ({
  kind: "trouble",
  id: t.id,
  title: t.title,
  lines: [t.situation, t.cause.explanation, ...t.steps, t.stepNotes],
});

const shortcutDoc = (s: ShortcutItem): Doc => ({
  kind: "shortcut",
  id: s.id,
  title: `${s.action} ${s.actionEn}`,
  lines: [s.category, s.logic ?? "", s.note ?? ""],
});

const wordRe = new Map<string, RegExp>();
function wordMatch(lowerText: string, compactText: string, w: string): boolean {
  if (/^[a-z0-9]+$/.test(w)) {
    let re = wordRe.get(w);
    if (!re) {
      re = new RegExp(`(?<![a-z])${w}(?:s|es)?(?![a-z])`);
      wordRe.set(w, re);
    }
    return re.test(lowerText);
  }
  return compactText.includes(w); // 熟語（空白を除いた "takefolder" など）
}

function scoreText(text: string, words: string[], grams: string[]): number {
  const lower = text.replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).toLowerCase();
  const t = norm(text);
  let s = 0;
  for (const w of words) if (wordMatch(lower, t, w)) s += w.length >= 6 ? 4 : 3;
  for (const g of grams) if (t.includes(g)) s += 1;
  return s;
}

const KIND_WEIGHT: Record<HitKind, number> = { term: 1.3, lesson: 1, trouble: 1, shortcut: 0.9 };

/** 質問に関連する項目を検索する。contextLessonId があればその教材を優先 */
export function search(q: string, contextLessonId?: string): Hit[] {
  index ??= buildIndex();
  // 意図を表すだけの語は検索語から外す
  const { words, grams } = tokenize(q.replace(/ショートカット|キーボード|のやり方|について|教えて/g, " "));
  if (!words.length && !grams.length) return [];
  const want = /ショートカット|キー|shortcut|押す/.test(q);
  const troubleQ = /トラブル|聞こえない|来ない|出ない|鳴らない|遅れ|ノイズ|エラー|原因/.test(q);
  const hits: Hit[] = [];
  for (const d of index) {
    const titleScore = scoreText(d.title, words, grams) * 3;
    const lineScores = d.lines.map((line) => ({ line, s: scoreText(line, words, grams) }));
    const body = lineScores.reduce((a, x) => a + x.s, 0);
    let score = (titleScore + Math.min(body, 30)) * KIND_WEIGHT[d.kind];
    if (d.kind === "shortcut" && want) score *= 1.6;
    if (d.kind === "trouble" && troubleQ) score *= 1.6;
    if (d.kind === "lesson" && d.id === contextLessonId) score *= 1.5;
    if (score < 4) continue;
    const snippets = lineScores
      .filter((x) => x.s > 0 && x.line)
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map((x) => x.line);
    hits.push({ kind: d.kind, id: d.id, score, snippets });
  }
  hits.sort((a, b) => b.score - a.score);
  const priority = (k: HitKind) => (want && k === "shortcut" ? 0 : troubleQ && k === "trouble" ? 0 : 1);
  // 種類ごとの上限：用語2・教材3・トラブル2・ショートカット3
  const limit: Record<HitKind, number> = { term: 2, lesson: 3, trouble: 2, shortcut: 3 };
  const count: Record<HitKind, number> = { term: 0, lesson: 0, trouble: 0, shortcut: 0 };
  const top = hits[0]?.score ?? 0;
  return hits
    .filter((h) => h.score >= top * 0.35 && count[h.kind]++ < limit[h.kind])
    .slice(0, 6)
    .sort((a, b) => priority(a.kind) - priority(b.kind));
}
