import { useEffect, useState } from "react";
import { categoryPerformance, coachSummary, validIds } from "../lib/adaptive";
import { coachAdvice, type Coach } from "../lib/ai";
import { lessons, practiceTasks, troubles } from "../lib/content";
import { kvGet, kvSet } from "../lib/db";
import { pct } from "../lib/metrics";
import { useProgress } from "../lib/store";
import { useAi } from "../lib/useAi";
import { Bar, Card } from "./ui";
import { offlinePlan } from "../lib/offlineCoach";

/** 分野別の総合成績（オフライン） */
export function WeaknessBreakdown() {
  const { data } = useProgress();
  const perf = categoryPerformance(data);
  const fmt = (v: number | null) => (v === null ? "—" : pct(v));
  return (
    <Card title="分野別の総合成績（苦手分析）">
      <p className="small muted">問題（直近60日）・トラブル対応・ショートカットの結果を合成した成績です。70%未満の分野が「苦手分野」として、デイリーミッションと出題の優先度に反映されます。</p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>分野</th>
              <th>総合</th>
              <th>問題</th>
              <th>トラブル</th>
              <th>ショートカット</th>
            </tr>
          </thead>
          <tbody>
            {perf.map((p) => (
              <tr key={p.id} className={p.evidence >= 2 && p.performance < 0.7 ? "row-ng" : ""}>
                <td>{p.label}</td>
                <td style={{ minWidth: "7rem" }}>
                  {p.evidence ? (
                    <>
                      <Bar value={p.performance} />
                      <span className="small">{pct(p.performance)}</span>
                    </>
                  ) : (
                    <span className="small muted">データなし</span>
                  )}
                </td>
                <td className="small">{fmt(p.detail.questions)}</td>
                <td className="small">{fmt(p.detail.troubles)}</td>
                <td className="small">{fmt(p.detail.shortcuts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

interface SavedCoach {
  at: number;
  advice: Coach;
}

/** 学習アドバイス：標準はルールベース（API 不要）、API キー設定時は AI 版も選べる */
export function AiCoachCard() {
  const { data } = useProgress();
  const { ready } = useAi();
  const [saved, setSaved] = useState<SavedCoach | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    kvGet<SavedCoach>("coach").then((c) => setSaved(c ?? null));
  }, []);

  const ask = async () => {
    setBusy(true);
    setError("");
    try {
      const advice = await coachAdvice(coachSummary(data), data.settings.dailyMinutes);
      const s = { at: Date.now(), advice };
      setSaved(s);
      kvSet("coach", s);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  const a = saved?.advice;
  const [mode, setMode] = useState<"offline" | "ai">("offline");
  const showAi = mode === "ai" && !!a;
  const offline = offlinePlan(data);
  const plan = showAi ? a! : offline;

  return (
    <Card
      title="学習アドバイス"
      action={
        <div className="seg small-seg">
          <button className={!showAi ? "on" : ""} onClick={() => setMode("offline")}>
            標準
          </button>
          {ready && (
            <button
              className={showAi ? "on" : ""}
              disabled={busy}
              onClick={async () => {
                setMode("ai");
                if (!a) await ask();
              }}
            >
              {busy ? "分析中…" : "AI（API）"}
            </button>
          )}
        </div>
      }
    >
      {error && <p className="notice">{error}</p>}
      <PlanView
        summary={plan.summary}
        focus={plan.focus}
        lessonIds={plan.lessonIds}
        taskIds={plan.taskIds}
        troubleIds={plan.troubleIds}
        weekPlan={plan.weekPlan}
      />
      {showAi ? (
        <>
          <p className="small">{a!.encouragement}</p>
          <div className="btn-row">
            <button className="btn small" onClick={ask} disabled={busy}>
              {busy ? "分析中…" : "最新の進捗で作り直す"}
            </button>
          </div>
          <p className="ai-note">
            {new Date(saved!.at).toLocaleString("ja-JP")} に AI が作成。学習状況の要約（成績と教材・課題の一覧）が Anthropic API に送信されます。
          </p>
        </>
      ) : (
        <p className="ai-note">苦手分析（問題・トラブル対応・ショートカットの総合成績）と教材・課題の状況から自動で作成しています。API は使いません。進捗に合わせて毎回更新されます。</p>
      )}
    </Card>
  );
}

function PlanView(p: { summary: string; focus: { area: string; reason: string; actions: string[] }[]; lessonIds: string[]; taskIds: string[]; troubleIds: string[]; weekPlan: { day: string; plan: string }[] }) {
  const recLessons = validIds(p.lessonIds, lessons);
  const recTasks = validIds(p.taskIds, practiceTasks);
  const recTroubles = validIds(p.troubleIds, troubles);
  return (
    <>
      <p>{p.summary}</p>
      {p.focus.length > 0 && <h4>重点分野</h4>}
      {p.focus.map((f) => (
        <div key={f.area} className="coach-focus">
          <strong>{f.area}</strong>
          <span className="small muted"> — {f.reason}</span>
          <ul className="list small">
            {f.actions.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      ))}
      {(recLessons.length > 0 || recTasks.length > 0 || recTroubles.length > 0) && (
        <>
          <h4>おすすめ</h4>
          <ul className="list small">
            {recLessons.map((l) => (
              <li key={l.id}>
                教材：<a href={`#/lesson/${l.id}`}>{l.title}</a>
              </li>
            ))}
            {recTasks.map((t) => (
              <li key={t.id}>
                実技：<a href={`#/practice/${t.id}`}>{t.title}</a>
              </li>
            ))}
            {recTroubles.map((t) => (
              <li key={t.id}>
                トラブル演習：<a href={`#/simulator/trouble/${t.id}`}>{t.title}</a>
              </li>
            ))}
          </ul>
        </>
      )}
      {p.weekPlan.length > 0 && (
        <>
          <h4>今後7日間のプラン</h4>
          <table className="table">
            <tbody>
              {p.weekPlan.map((w) => (
                <tr key={w.day}>
                  <td className="small" style={{ whiteSpace: "nowrap" }}>
                    {w.day}
                  </td>
                  <td className="small">{w.plan}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
