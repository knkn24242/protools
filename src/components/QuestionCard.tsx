import { useMemo, useState } from "react";
import type { Question, QuestionType } from "../types";
import { useProgress } from "../lib/store";
import { Rich, Unverified } from "./ui";
import { useShuffle } from "../lib/shuffle";
import { gradeWritten, type Grade } from "../lib/ai";
import { useAi } from "../lib/useAi";
import { keywordGrade } from "../lib/keywordGrade";

export const TYPE_LABEL: Record<QuestionType, string> = {
  choice: "選択式",
  truefalse: "○×",
  fill: "穴埋め",
  written: "記述式",
  trouble: "トラブルシューティング",
  order: "手順の並べ替え",
};

/** 表記ゆれを吸収して比較（全角→半角、空白除去、小文字化） */
function normalize(s: string): string {
  return s
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, "")
    .toLowerCase();
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Props {
  q: Question;
  index?: number;
  /** 回答確定時に呼ばれる */
  onAnswered?: (correct: boolean) => void;
  showPrevious?: boolean;
}

export default function QuestionCard({ q, index, onAnswered, showPrevious = true }: Props) {
  const store = useProgress();
  const prev = store.data.questions[q.id];
  const [result, setResult] = useState<null | boolean>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [seq, setSeq] = useState<number[]>([]);
  const [round, setRound] = useState(0);
  const { ready } = useAi();
  const [grade, setGrade] = useState<Grade | null>(null);
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState("");
  const kwGrade = q.type === "written" && revealed ? keywordGrade(q, text) : null;
  const perm = useShuffle(q.choices?.length ?? 0, `${q.id}-${round}`);
  const orderPool = useMemo(() => shuffle((q.choices ?? []).map((_, i) => i)), [q.id, round]);

  const finish = (correct: boolean) => {
    setResult(correct);
    store.answer(q.id, correct);
    onAnswered?.(correct);
  };

  const reset = () => {
    setResult(null);
    setPicked(null);
    setText("");
    setRevealed(false);
    setSeq([]);
    setGrade(null);
    setGradeError("");
    setRound((r) => r + 1);
  };

  const answered = result !== null;

  return (
    <div className="quiz">
      <div className="quiz-q">
        {index !== undefined && <span className="quiz-no">Q{index + 1}</span>}
        <span className="badge">{TYPE_LABEL[q.type]}</span>
        {q.unverified && <Unverified />}
        {showPrevious && prev && !answered && <span className={`badge ${prev.correct ? "good" : "bad"}`}>前回 {prev.correct ? "正解" : "不正解"}</span>}
      </div>
      <p className="quiz-text">
        <Rich text={q.q} />
      </p>

      {(q.type === "choice" || q.type === "trouble" || q.type === "truefalse") && (
        <div className={`choices ${q.type === "truefalse" ? "tf" : ""}`}>
          {(q.type === "truefalse" ? [0, 1] : perm).map((i) => {
            const c = q.type === "truefalse" ? ["○", "×"][i] : q.choices![i];
            let cls = "choice";
            if (answered && i === q.answer) cls += " correct";
            else if (answered && i === picked) cls += " wrong";
            return (
              <button
                key={i}
                className={cls}
                disabled={answered && i !== picked && i !== q.answer}
                onClick={() => {
                  if (answered) return;
                  setPicked(i);
                  finish(i === q.answer);
                }}
              >
                {c}
              </button>
            );
          })}
        </div>
      )}

      {q.type === "fill" && (
        <form
          className="fill"
          onSubmit={(e) => {
            e.preventDefault();
            if (answered || !text.trim()) return;
            finish((q.accept ?? []).some((a) => normalize(a) === normalize(text)));
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} disabled={answered} placeholder="解答を入力" aria-label="解答" />
          <button className="btn" type="submit" disabled={answered}>
            回答
          </button>
          {answered && <span className="small muted">正解例：{q.accept?.[0]}</span>}
        </form>
      )}

      {q.type === "written" && (
        <div className="written">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="自分の言葉で説明してください" disabled={revealed} />
          {!revealed ? (
            <button className="btn" onClick={() => setRevealed(true)} disabled={!text.trim()}>
              模範解答と比べる
            </button>
          ) : (
            <div className="model">
              <span className="logic-label">模範解答</span>
              <p>{q.modelAnswer}</p>
              {q.points && (
                <>
                  <span className="logic-label">採点ポイント（キーワードによる自動チェック）</span>
                  <ul className="kw-points">
                    {q.points.map((p, i) => {
                      const r = kwGrade?.points[i];
                      return (
                        <li key={p} className={r === undefined ? "" : r.covered ? "ok" : "ng"}>
                          <span className="kw-mark">{r === undefined ? "□" : r.covered ? "✓" : "×"}</span>
                          <span>
                            {p}
                            {r && r.found.length > 0 && <span className="small muted">（検出：{r.found.join("、")}）</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {kwGrade && (
                    <p className="small">
                      判定の目安：<strong>{kwGrade.verdict === "pass" ? "合格" : kwGrade.verdict === "partial" ? "一部できている" : "不十分"}</strong>（{kwGrade.covered}/{kwGrade.total} ポイント）。
                      <span className="muted">キーワードの有無だけで判定しているため、言い換えた表現は検出されないことがあります。最終的には下のボタンで自己採点してください。</span>
                    </p>
                  )}
                </>
              )}
              {ready && !answered && (
                <div className="ai-panel">
                  {!grade ? (
                    <button
                      className="btn small"
                      disabled={grading}
                      onClick={async () => {
                        setGrading(true);
                        setGradeError("");
                        try {
                          setGrade(await gradeWritten(q, text));
                        } catch (e) {
                          setGradeError((e as Error).message);
                        }
                        setGrading(false);
                      }}
                    >
                      {grading ? "採点中…" : "AI に採点してもらう"}
                    </button>
                  ) : (
                    <>
                      <strong>
                        AI 採点：{grade.verdict === "pass" ? "合格" : grade.verdict === "partial" ? "一部できている" : "不十分"}（{Math.round(grade.score)}点）
                      </strong>
                      <p className="small">{grade.comment}</p>
                      {grade.missing.length > 0 && <p className="small">不足：{grade.missing.join(" / ")}</p>}
                      {grade.errors.length > 0 && <p className="small">誤り：{grade.errors.join(" / ")}</p>}
                      <button className="btn small primary" onClick={() => finish(grade.verdict === "pass")}>
                        AI の判定で記録する
                      </button>
                    </>
                  )}
                  {gradeError && <p className="notice">{gradeError}</p>}
                  <p className="ai-note">解答は Anthropic API に送信されます。AI の判定に納得できない場合は、下のボタンで自己採点できます。</p>
                </div>
              )}
              {!answered && (
                <div className="btn-row">
                  <button className="btn primary" onClick={() => finish(true)}>
                    ポイントを押さえていた
                  </button>
                  <button className="btn" onClick={() => finish(false)}>
                    不十分だった
                  </button>
                </div>
              )}
              {!ready && <p className="small muted">記述式は自己採点です。Settings で API キーを設定すると AI 採点も使えます。</p>}
            </div>
          )}
        </div>
      )}

      {q.type === "order" && (
        <div className="order">
          <ol className="order-seq">
            {seq.map((i, n) => {
              const ok = answered ? i === n : undefined;
              return (
                <li key={i} className={ok === undefined ? "" : ok ? "ok" : "ng"}>
                  {q.choices![i]}
                </li>
              );
            })}
          </ol>
          {!answered && (
            <>
              <div className="choices">
                {orderPool
                  .filter((i) => !seq.includes(i))
                  .map((i) => (
                    <button
                      key={i}
                      className="choice"
                      onClick={() => {
                        const next = [...seq, i];
                        setSeq(next);
                        if (next.length === q.choices!.length) finish(next.every((v, n) => v === n));
                      }}
                    >
                      {q.choices![i]}
                    </button>
                  ))}
              </div>
              <p className="small muted">最初に行うものから順にクリック。</p>
              {seq.length > 0 && (
                <button className="btn ghost small" onClick={() => setSeq([])}>
                  並べ直す
                </button>
              )}
            </>
          )}
          {answered && result === false && (
            <div className="model">
              <span className="logic-label">正しい順序</span>
              <ol className="list">
                {q.choices!.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {answered && (
        <div className={`explain ${result ? "ok" : "ng"}`}>
          <strong>{result ? "正解" : "不正解（復習リストに追加しました）"}</strong>
          <p>
            <Rich text={q.explanation} />
          </p>
          {q.logicNote && (
            <div className="logic-box">
              <span className="logic-label">Logic Proとの比較</span>
              {q.logicNote}
            </div>
          )}
          {q.lessonId && (
            <p className="small">
              <a href={`#/lesson/${q.lessonId}`}>関連教材を読む →</a>
            </p>
          )}
          {!onAnswered && (
            <button className="btn ghost small" onClick={reset}>
              もう一度解く
            </button>
          )}
        </div>
      )}
    </div>
  );
}
