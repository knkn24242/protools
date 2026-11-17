import { useMemo, useState } from "react";
import { getQuestion, getShortcut, getTrouble } from "../lib/content";
import { dueItems, INTERVALS, MAX_BOX, upcoming } from "../lib/review";
import { useProgress, useStudyTimer } from "../lib/store";
import QuestionCard from "../components/QuestionCard";
import TroubleRunner from "../components/TroubleRunner";
import { Card, Unverified } from "../components/ui";
import { makeChoices } from "./Shortcuts";
import type { ReviewItem, ReviewKind, ShortcutItem } from "../types";

export const KIND_LABEL: Record<ReviewKind, string> = { question: "問題", shortcut: "ショートカット", trouble: "トラブル対応" };

export function itemTitle(r: ReviewItem): string {
  if (r.kind === "question") return getQuestion(r.id)?.q ?? r.id;
  if (r.kind === "shortcut") return getShortcut(r.id)?.action ?? r.id;
  return getTrouble(r.id)?.title ?? r.id;
}

export default function ReviewPage() {
  const store = useProgress();
  const { data } = store;
  useStudyTimer(null);
  const [session, setSession] = useState<ReviewItem[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [results, setResults] = useState<boolean[]>([]);

  const due = dueItems(data.review);
  const plan = upcoming(data.review, 7);
  const maxCount = Math.max(1, ...plan.map((p) => p.count));

  const start = (kind?: ReviewKind) => {
    const items = dueItems(data.review, kind).slice(0, 20);
    if (!items.length) return;
    setSession(items);
    setIdx(0);
    setResults([]);
    setAnswered(false);
  };

  const record = (ok: boolean) => {
    setResults((r) => [...r, ok]);
    setAnswered(true);
  };

  if (session) {
    if (idx >= session.length) {
      const ok = results.filter(Boolean).length;
      return (
        <div className="page">
          <h1>復習 — 完了</h1>
          <Card>
            <div className="big">
              {ok} / {session.length}
            </div>
            <p className="muted small">正解した項目は次の復習日が先に延び、間違えた項目は明日以降も出題されます。</p>
            <div className="btn-row">
              <button className="btn" onClick={() => setSession(null)}>
                復習トップへ
              </button>
              <a className="btn" href="#/dashboard">
                Dashboard へ
              </a>
            </div>
          </Card>
        </div>
      );
    }
    const item = session[idx];
    return (
      <div className="page">
        <div className="row-between">
          <h1>復習</h1>
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
            {idx + 1} / {session.length} ・ {KIND_LABEL[item.kind]} ・ 段階 {item.box}/{MAX_BOX}
            {item.lapses > 0 && ` ・ 間違えた回数 ${item.lapses + 1}`}
          </div>
          {item.kind === "question" && getQuestion(item.id) && <QuestionCard key={item.id} q={getQuestion(item.id)!} showPrevious={false} onAnswered={record} />}
          {item.kind === "shortcut" && getShortcut(item.id) && <ShortcutReview key={item.id} s={getShortcut(item.id)!} onAnswered={record} />}
          {item.kind === "trouble" && getTrouble(item.id) && (
            <TroubleRunner
              key={item.id}
              t={getTrouble(item.id)!}
              nextLabel="記録する"
              onDone={(r) => {
                store.recordTrouble(item.id, r);
                record(r.causeCorrect && r.score >= 0.7);
              }}
            />
          )}
          {answered && (
            <button
              className="btn primary"
              onClick={() => {
                setIdx(idx + 1);
                setAnswered(false);
              }}
            >
              {idx + 1 < session.length ? "次へ" : "結果を見る"}
            </button>
          )}
        </Card>
      </div>
    );
  }

  const byKind = (k: ReviewKind) => due.filter((r) => r.kind === k).length;

  return (
    <div className="page">
      <h1>復習</h1>
      <p className="lead">
        間違えた問題・ショートカット・トラブル対応は自動で復習リストに入り、間隔反復で出題されます。正解するたびに次の復習までの間隔が {INTERVALS.join(" → ")} 日と延び、{MAX_BOX + 1}回目の正解で定着とみなしてリストから外れます。
      </p>
      <div className="stat-row three">
        <div className="stat">
          <span className="stat-label">今日の復習</span>
          <span className="stat-value">{due.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">復習リスト全体</span>
          <span className="stat-value">{data.review.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">内訳（今日）</span>
          <span className="small">
            問題 {byKind("question")} ・ ショートカット {byKind("shortcut")} ・ トラブル {byKind("trouble")}
          </span>
        </div>
      </div>
      <div className="grid two">
        <Card title="今日の復習を始める">
          <div className="btn-row">
            <button className="btn primary" disabled={!due.length} onClick={() => start()}>
              すべて（{Math.min(20, due.length)}件）
            </button>
            {(["question", "shortcut", "trouble"] as ReviewKind[]).map((k) => (
              <button key={k} className="btn" disabled={!byKind(k)} onClick={() => start(k)}>
                {KIND_LABEL[k]}のみ
              </button>
            ))}
          </div>
          {!due.length && <p className="muted small">今日の復習はありません。</p>}
        </Card>
        <Card title="今後7日間の復習予定">
          <div className="week">
            {plan.map((p) => (
              <div key={p.date} className="week-col" title={`${p.date}: ${p.count}件`}>
                <span className="small">{p.count || ""}</span>
                <div className="week-bar">
                  <div style={{ height: `${(p.count / maxCount) * 100}%` }} />
                </div>
                <span className="small muted">{p.date.slice(5).replace("-", "/")}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <ReviewList items={data.review} />
    </div>
  );
}

function ReviewList({ items }: { items: ReviewItem[] }) {
  const sorted = useMemo(() => items.slice().sort((a, b) => a.due.localeCompare(b.due)), [items]);
  if (!items.length) return null;
  return (
    <Card title={`復習リスト（${items.length}）`}>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>種類</th>
              <th>内容</th>
              <th>段階</th>
              <th>次回</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={`${r.kind}-${r.id}`}>
                <td className="small">{KIND_LABEL[r.kind]}</td>
                <td className="small">{itemTitle(r).slice(0, 70)}</td>
                <td className="small">
                  {r.box}/{MAX_BOX}
                </td>
                <td className="small">{r.due}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ShortcutReview({ s, onAnswered }: { s: ShortcutItem; onAnswered: (ok: boolean) => void }) {
  const store = useProgress();
  const os = store.data.settings.os;
  const [choices] = useState(() => makeChoices(s, os));
  const [picked, setPicked] = useState<string | null>(null);
  const [start] = useState(() => performance.now());
  const correct = os === "mac" ? s.mac : s.win;
  return (
    <div className="quiz">
      <div className="sc-action">{s.action}</div>
      <div className="lesson-en">{s.actionEn}</div>
      <div className="choices">
        {choices.map((c) => {
          let cls = "choice mono";
          if (picked && c === correct) cls += " correct";
          else if (picked === c) cls += " wrong";
          return (
            <button
              key={c}
              className={cls}
              disabled={!!picked && c !== picked && c !== correct}
              onClick={() => {
                if (picked) return;
                setPicked(c);
                store.recordShortcut(s.id, c === correct, Math.round(performance.now() - start));
                onAnswered(c === correct);
              }}
            >
              {c}
            </button>
          );
        })}
      </div>
      {picked && (
        <div className={`explain ${picked === correct ? "ok" : "ng"}`}>
          <strong>{picked === correct ? "正解" : "不正解"}</strong>
          <p>
            正解：<kbd>{correct}</kbd>
            {s.unverified && <Unverified />}
          </p>
          {s.logic && (
            <div className="logic-box">
              <span className="logic-label">Logic Pro</span>
              {s.logic}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
