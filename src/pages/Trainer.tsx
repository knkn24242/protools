import { useState } from "react";
import { allQuestions, categories, getQuestion, levels } from "../lib/content";
import { currentLevel, pct, quizStats, weakCategories } from "../lib/metrics";
import { useProgress, useStudyTimer } from "../lib/store";
import { dueItems } from "../lib/review";
import QuestionCard, { TYPE_LABEL } from "../components/QuestionCard";
import { Card } from "../components/ui";
import type { ProgressData, Question, QuestionType } from "../types";

type Mode = "auto" | "review" | "level" | "type";

/** 進捗に応じた目標難易度：正解率が高いほど難しい問題を出す */
export function targetDifficulty(d: ProgressData): number {
  const s = quizStats(d);
  if (s.answered < 5) return 2;
  return Math.max(1, Math.min(5, Math.round(1 + s.accuracy * 4)));
}

function pickAdaptive(d: ProgressData, pool: Question[], n: number): Question[] {
  const target = targetDifficulty(d);
  const weak = new Set(weakCategories(d).map((c) => c.id));
  const weighted = pool.map((q) => {
    const r = d.questions[q.id];
    let w = !r ? 2 : r.correct ? 0.4 : 3;
    w *= 1 / (1 + Math.abs(q.difficulty - target));
    if (weak.has(q.category)) w *= 1.5;
    if (q.type !== "choice") w *= 1.3; // 教材内で解いていない形式を優先
    return { q, w };
  });
  const out: Question[] = [];
  while (out.length < n && weighted.length) {
    const total = weighted.reduce((a, x) => a + x.w, 0);
    let r = Math.random() * total;
    const i = weighted.findIndex((x) => (r -= x.w) <= 0);
    out.push(weighted.splice(i < 0 ? 0 : i, 1)[0].q);
  }
  return out;
}

export default function Trainer() {
  const { data } = useProgress();
  useStudyTimer(null);
  const [mode, setMode] = useState<Mode>("auto");
  const [level, setLevel] = useState(1);
  const [qtype, setQtype] = useState<QuestionType>("trouble");
  const [count, setCount] = useState(10);
  const [session, setSession] = useState<Question[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [answered, setAnswered] = useState(false);

  const cur = currentLevel(data);
  const reviewQs = dueItems(data.review, "question").map((r) => getQuestion(r.id)).filter((q): q is Question => !!q);

  const start = () => {
    let qs: Question[];
    if (mode === "review") qs = reviewQs.slice(0, count);
    else {
      const pool =
        mode === "level"
          ? allQuestions.filter((q) => q.level === level)
          : mode === "type"
            ? allQuestions.filter((q) => q.type === qtype)
            : allQuestions.filter((q) => q.level <= Math.max(cur, 1));
      qs = pickAdaptive(data, pool, count);
    }
    if (!qs.length) return;
    setSession(qs);
    setIdx(0);
    setResults([]);
    setAnswered(false);
  };

  if (session) {
    const done = idx >= session.length;
    if (done) {
      const correct = results.filter(Boolean).length;
      return (
        <div className="page">
          <h1>AI Trainer — 結果</h1>
          <Card>
            <div className="big">
              {correct} / {session.length}
            </div>
            <div className="muted">正解率 {pct(correct / session.length)}</div>
            <ul className="result-list">
              {session.map((q, i) => (
                <li key={q.id} className={results[i] ? "ok" : "ng"}>
                  <span>{results[i] ? "○" : "×"}</span>
                  <span className="badge">{TYPE_LABEL[q.type]}</span>
                  {q.q.length > 60 ? `${q.q.slice(0, 60)}…` : q.q}
                </li>
              ))}
            </ul>
            <p className="small muted">間違えた問題は復習リストに追加されました。</p>
            <div className="btn-row">
              <button className="btn primary" onClick={start}>
                同じ条件でもう一度
              </button>
              <button className="btn" onClick={() => setSession(null)}>
                設定に戻る
              </button>
            </div>
          </Card>
        </div>
      );
    }
    const q = session[idx];
    return (
      <div className="page">
        <div className="row-between">
          <h1>AI Trainer</h1>
          <button className="btn ghost small" onClick={() => setSession(null)}>
            中断
          </button>
        </div>
        <div className="progress-dots">
          {session.map((_, i) => (
            <span key={i} className={i < results.length ? (results[i] ? "ok" : "ng") : i === idx ? "cur" : ""} />
          ))}
        </div>
        <Card>
          <div className="muted small">
            {idx + 1} / {session.length} ・ LEVEL {q.level} ・ {categories.find((c) => c.id === q.category)?.label} ・ 難易度 {q.difficulty}
          </div>
          <QuestionCard
            key={`${q.id}-${idx}`}
            q={q}
            showPrevious={false}
            onAnswered={(ok) => {
              setResults((r) => [...r, ok]);
              setAnswered(true);
            }}
          />
          {answered && (
            <button
              className="btn primary"
              onClick={() => {
                setIdx((i) => i + 1);
                setAnswered(false);
              }}
            >
              {idx + 1 < session.length ? "次の問題へ" : "結果を見る"}
            </button>
          )}
        </Card>
      </div>
    );
  }

  const stats = quizStats(data);
  const typeCounts = (Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => [t, allQuestions.filter((q) => q.type === t).length] as const);

  return (
    <div className="page">
      <h1>AI Trainer</h1>
      <p className="lead">選択式・○×・穴埋め・記述式・トラブルシューティング・手順の並べ替えで問題演習を行います。回答後は必ず解説と Logic Pro との比較が表示されます。</p>
      <div className="grid two">
        <Card title="出題設定">
          <div className="field">
            <span>出題モード</span>
            <div className="seg wrap">
              {(
                [
                  ["auto", "おまかせ（進捗に応じて）"],
                  ["review", `今日の復習（${reviewQs.length}）`],
                  ["level", "LEVEL別"],
                  ["type", "形式別"],
                ] as [Mode, string][]
              ).map(([m, l]) => (
                <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {mode === "auto" && (
            <p className="small muted">
              LEVEL {cur} までの問題から、未回答・間違えた問題・苦手分野を優先して出題します。現在の目標難易度：{targetDifficulty(data)} / 5
            </p>
          )}
          {mode === "level" && (
            <label className="field">
              <span>LEVEL</span>
              <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
                {levels
                  .filter((lv) => allQuestions.some((q) => q.level === lv.level))
                  .map((lv) => (
                    <option key={lv.level} value={lv.level}>
                      LEVEL {lv.level}：{lv.title}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {mode === "type" && (
            <label className="field">
              <span>形式</span>
              <select value={qtype} onChange={(e) => setQtype(e.target.value as QuestionType)}>
                {typeCounts.map(([t, n]) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}（{n}問）
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>問題数</span>
            <div className="seg">
              {[5, 10, 20].map((n) => (
                <button key={n} className={count === n ? "on" : ""} onClick={() => setCount(n)}>
                  {n}問
                </button>
              ))}
            </div>
          </label>
          <button className="btn primary" onClick={start} disabled={mode === "review" && reviewQs.length === 0}>
            開始
          </button>
          {mode === "review" && reviewQs.length === 0 && <p className="small muted">今日が復習日の問題はありません。ショートカット・トラブルも含めた復習は「復習」ページで行えます。</p>}
        </Card>
        <Card title="これまでの成績">
          <div className="big">{stats.answered ? pct(stats.accuracy) : "—"}</div>
          <div className="muted small">
            {stats.answered} / {stats.total} 問回答 ・ 復習待ち {data.review.length} 問
          </div>
          <h4>形式別の問題数</h4>
          <ul className="list">
            {typeCounts.map(([t, n]) => (
              <li key={t}>
                {TYPE_LABEL[t]}：{n}問
              </li>
            ))}
          </ul>
          <p className="small muted">AI による問題生成・記述式の採点は PHASE 4 で API 接続機能として追加予定です。現在の問題はすべてオフラインで動作します。</p>
        </Card>
      </div>
    </div>
  );
}
