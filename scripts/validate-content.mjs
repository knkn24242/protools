// 教材JSONの整合性チェック: npm run validate
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = new URL("../content/lessons/", import.meta.url);
const levels = JSON.parse(readFileSync(new URL("../content/levels.json", import.meta.url), "utf8"));
const cats = new Set(levels.categories.map((c) => c.id));
const required = ["id","level","order","title","titleEn","category","difficulty","minutes","prerequisites","ptVersion","reviewStatus","overview","steps","logic","useCases","cautions","mistakes","keyPoints","terms","quiz","related","sources","unverified"];
const all = [];
let errors = 0;
const err = (m) => { console.error("NG:", m); errors++; };

for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  let arr;
  try { arr = JSON.parse(readFileSync(join(dir.pathname.replace(/^\/(\w:)/, "$1"), f), "utf8")); }
  catch (e) { err(`${f}: JSONの構文エラー ${e.message}`); continue; }
  for (const l of arr) {
    all.push(l);
    for (const k of required) if (!(k in l)) err(`${l.id ?? f}: ${k} がありません`);
    if (!cats.has(l.category)) err(`${l.id}: 不明なカテゴリー ${l.category}`);
    if (!["exact","similar","none"].includes(l.logic?.match)) err(`${l.id}: logic.match が不正`);
    l.quiz?.forEach((q, i) => {
      if (!(q.answer >= 0 && q.answer < q.choices.length)) err(`${l.id} Q${i + 1}: answer が範囲外`);
      if (!q.explanation) err(`${l.id} Q${i + 1}: 解説がありません`);
    });
    if (!l.sources?.length) err(`${l.id}: 出典がありません`);
  }
}
const ids = new Set();
for (const l of all) { if (ids.has(l.id)) err(`ID重複: ${l.id}`); ids.add(l.id); }
for (const l of all) for (const r of [...l.prerequisites, ...l.related]) if (!ids.has(r)) err(`${l.id}: 参照先 ${r} が存在しません`);
// ---- PHASE 2 データ ----
const readArr = (rel) => {
  try { return JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8")); }
  catch (e) { err(`${rel}: ${e.message}`); return []; }
};
const readDir = (rel) => readdirSync(new URL(rel, import.meta.url)).filter((f) => f.endsWith(".json")).flatMap((f) => readArr(rel + f));
const tasks = readDir("../content/practice/");
const questions = readDir("../content/questions/");
const sc = readArr("../content/shortcuts.json");
const gl = readArr("../content/glossary.json");
const seen = new Set();
const uniq = (kind, id) => { if (seen.has(kind + id)) err(`${kind} ID重複: ${id}`); seen.add(kind + id); };
for (const t of tasks) {
  uniq("task", t.id);
  if (!cats.has(t.category)) err(`${t.id}: 不明なカテゴリー`);
  if (!t.conditions?.length || !t.passCriteria) err(`${t.id}: 完成条件/合格条件がありません`);
  for (const r of t.relatedLessons ?? []) if (!ids.has(r)) err(`${t.id}: 関連教材 ${r} が存在しません`);
}
for (const q of questions) {
  uniq("q", q.id);
  if (!cats.has(q.category)) err(`${q.id}: 不明なカテゴリー`);
  if (!q.explanation) err(`${q.id}: 解説がありません`);
  if (q.lessonId && !ids.has(q.lessonId)) err(`${q.id}: 教材 ${q.lessonId} が存在しません`);
  if (["choice", "trouble"].includes(q.type) && !(q.answer >= 0 && q.answer < q.choices.length)) err(`${q.id}: answer が範囲外`);
  if (q.type === "truefalse" && ![0, 1].includes(q.answer)) err(`${q.id}: ○×の answer は 0/1`);
  if (q.type === "fill" && !q.accept?.length) err(`${q.id}: accept がありません`);
  if (q.type === "written" && !q.modelAnswer) err(`${q.id}: modelAnswer がありません`);
  if (q.type === "order" && !(q.choices?.length >= 3)) err(`${q.id}: 並べ替えの手順が不足`);
}
for (const s of sc) { uniq("sc", s.id); if (!s.mac || !s.win) err(`${s.id}: mac/win がありません`); }
const terms = new Set(gl.map((g) => g.term));
for (const g of gl) {
  uniq("term", g.term);
  if (!cats.has(g.category)) err(`${g.term}: 不明なカテゴリー`);
  if (g.lessonId && !ids.has(g.lessonId)) err(`${g.term}: 教材 ${g.lessonId} が存在しません`);
}
// ---- PHASE 3 データ ----
const tr = readArr("../content/troubles.json");
const sims = readdirSync(new URL("../content/simulator/", import.meta.url)).filter((f) => f.endsWith(".json")).map((f) => readArr("../content/simulator/" + f));
const stageIds = new Set(sims.flatMap((p) => p.stages.map((s) => s.id)));
for (const t of tr) {
  uniq("trouble", t.id);
  if (!cats.has(t.category)) err(`${t.id}: 不明なカテゴリー`);
  if (!(t.cause?.answer >= 0 && t.cause.answer < t.cause.choices.length)) err(`${t.id}: cause.answer が範囲外`);
  if (!(t.steps?.length >= 3)) err(`${t.id}: 対応手順が不足`);
  for (const s of t.stages) if (!stageIds.has(s)) err(`${t.id}: ステージ ${s} が存在しません`);
  if (t.lessonId && !ids.has(t.lessonId)) err(`${t.id}: 教材 ${t.lessonId} が存在しません`);
}
for (const p of sims) {
  uniq("sim", p.id);
  for (const s of p.stages) if (!(s.decision.answer >= 0 && s.decision.answer < s.decision.choices.length)) err(`${p.id}/${s.id}: answer が範囲外`);
  const pool = tr.filter((t) => t.stages.some((s) => p.stages.some((ps) => ps.id === s))).length;
  if (pool < p.troubleCount) err(`${p.id}: 発生可能なトラブル(${pool})が troubleCount(${p.troubleCount}) より少ない`);
}
console.log(`シミュレーター案件 ${sims.length} / トラブル ${tr.length}`);
const missingRel =gl.flatMap((g) => g.related).filter((r) => !terms.has(r));
console.log(`実技課題 ${tasks.length} / 問題バンク ${questions.length} / ショートカット ${sc.length} / 用語 ${gl.length}（関連語のうち未登録 ${missingRel.length}: ${[...new Set(missingRel)].join(", ")}）`);
console.log(`教材 ${all.length} 本 / 問題 ${all.reduce((n, l) => n + l.quiz.length, 0)} 問 / エラー ${errors} 件`);
process.exit(errors ? 1 : 0);
