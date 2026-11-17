import { useMemo, useState } from "react";
import type { Trouble, TroubleResult } from "../types";
import { scoreTrouble } from "../lib/simulator";
import { pct } from "../lib/metrics";
import { Unverified } from "./ui";
import { useShuffle } from "../lib/shuffle";

/**
 * トラブル対応演習：状況 → 原因の特定 → 対応手順の組み立て → 評価
 * 手順の選択肢には「不要／不適切な対応」が混ざっている。
 */
export default function TroubleRunner({ t, onDone, nextLabel }: { t: Trouble; onDone: (r: TroubleResult) => void; nextLabel?: string }) {
  const [cause, setCause] = useState<number | null>(null);
  const [seq, setSeq] = useState<number[]>([]);
  const [result, setResult] = useState<TroubleResult | null>(null);
  const all = useMemo(() => [...t.steps, ...t.distractors], [t]);
  const order = useMemo(
    () =>
      all
        .map((_, i) => ({ i, r: Math.random() }))
        .sort((a, b) => a.r - b.r)
        .map((x) => x.i),
    [all],
  );

  const causeAnswered = cause !== null;
  const causePerm = useShuffle(t.cause.choices.length, t.id);

  return (
    <div className="trouble">
      <div className="trouble-alert">
        <span className="trouble-tag">TROUBLE</span>
        <strong>{t.title}</strong>
        {t.unverified && <Unverified />}
      </div>
      <p className="trouble-situation">{t.situation}</p>

      <h4>1. 原因を特定する</h4>
      <p>{t.cause.q}</p>
      <div className="choices">
        {causePerm.map((i) => {
          const c = t.cause.choices[i];
          let cls = "choice";
          if (causeAnswered && i === t.cause.answer) cls += " correct";
          else if (causeAnswered && i === cause) cls += " wrong";
          return (
            <button key={i} className={cls} disabled={causeAnswered && i !== cause && i !== t.cause.answer} onClick={() => !causeAnswered && setCause(i)}>
              {c}
            </button>
          );
        })}
      </div>
      {causeAnswered && (
        <div className={`explain ${cause === t.cause.answer ? "ok" : "ng"}`}>
          <strong>{cause === t.cause.answer ? "正解" : "不正解"}</strong>
          <p>{t.cause.explanation}</p>
        </div>
      )}

      {causeAnswered && (
        <>
          <h4>2. 対応の順序を組み立てる</h4>
          <p className="small muted">実際に行う順にクリック。不要・不適切な対応も混ざっています。必要な対応をすべて選んだら「この順序で対応する」。</p>
          <ol className="order-seq">
            {seq.map((i, n) => {
              const mark = result ? (i >= t.steps.length ? "ng" : i === n ? "ok" : "") : "";
              return (
                <li key={i} className={mark}>
                  {all[i]}
                  {result && i >= t.steps.length && <span className="badge bad">不要な対応</span>}
                </li>
              );
            })}
          </ol>
          {!result && (
            <>
              <div className="choices">
                {order
                  .filter((i) => !seq.includes(i))
                  .map((i) => (
                    <button key={i} className="choice" onClick={() => setSeq([...seq, i])}>
                      {all[i]}
                    </button>
                  ))}
              </div>
              <div className="btn-row">
                <button className="btn primary" disabled={seq.length === 0} onClick={() => setResult(scoreTrouble(t, cause === t.cause.answer, seq))}>
                  この順序で対応する
                </button>
                {seq.length > 0 && (
                  <button className="btn ghost" onClick={() => setSeq(seq.slice(0, -1))}>
                    1つ戻す
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}

      {result && (
        <div className="trouble-result">
          <div className="score-row">
            <div>
              <span className="stat-label">対応評価</span>
              <span className="big">{pct(result.score)}</span>
            </div>
            <ul className="score-break small">
              <li className={result.causeCorrect ? "ok" : "ng"}>原因の特定：{result.causeCorrect ? "○" : "×"}</li>
              <li className={result.firstCorrect ? "ok" : "ng"}>最初の一手：{result.firstCorrect ? "○" : "×"}</li>
              <li>手順の網羅と順序：{pct(result.orderScore)}</li>
              {result.distractorsChosen > 0 && <li className="ng">不要な対応：{result.distractorsChosen}件（減点）</li>}
            </ul>
          </div>
          <div className="model">
            <span className="logic-label">現場での適切な対応順序</span>
            <ol className="list">
              {t.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <span className="logic-label">やってはいけない／不要な対応</span>
            <ul className="list">
              {t.distractors.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <p className="small">{t.stepNotes}</p>
            <span className="logic-label">エンジニアへの報告例</span>
            <p className="report">{t.report}</p>
          </div>
          {t.logicNote && (
            <div className="logic-box">
              <span className="logic-label">Logic Proとの比較</span>
              {t.logicNote}
            </div>
          )}
          <p className="small">
            {t.lessonId && <a href={`#/lesson/${t.lessonId}`}>関連教材を読む →</a>} <a href={`#/tutor/trouble/${t.id}`}>講師に質問する →</a>
          </p>
          <button className="btn primary" onClick={() => onDone(result)}>
            {nextLabel ?? "完了"}
          </button>
        </div>
      )}
    </div>
  );
}
