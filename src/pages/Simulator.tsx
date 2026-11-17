import { useState } from "react";
import { categoryLabel, getProject, getTrouble, simProjects, troubles } from "../lib/content";
import { pct } from "../lib/metrics";
import { buildEvents, pickTroubles, rankOf, runScore } from "../lib/simulator";
import { useProgress, useStudyTimer } from "../lib/store";
import { go } from "../lib/router";
import TroubleRunner from "../components/TroubleRunner";
import { Card, Difficulty, Rich } from "../components/ui";
import type { SimEventResult, SimRun, SimStage } from "../types";
import { useShuffle } from "../lib/shuffle";

type Tab = "projects" | "troubles" | "history";

export function SimulatorIndex({ tab: initialTab }: { tab?: string }) {
  const store = useProgress();
  const { data } = store;
  const [tab, setTab] = useState<Tab>(initialTab === "troubles" ? "troubles" : initialTab === "history" ? "history" : "projects");
  const active = data.simActive;

  const start = (projectId: string) => {
    const p = getProject(projectId);
    if (!p) return;
    if (active && !confirm("進行中の案件を破棄して新しく開始しますか？")) return;
    store.setSimActive({ projectId, startedAt: Date.now(), troubleIds: pickTroubles(p), results: [] });
    go("simulator/run");
  };

  return (
    <div className="page">
      <h1>Studio Simulator</h1>
      <p className="lead">架空のスタジオ案件をアシスタントエンジニアとして進行します。途中でトラブルが発生し、原因の特定と対応の順序が評価されます。</p>
      <div className="tabs">
        <button className={tab === "projects" ? "on" : ""} onClick={() => setTab("projects")}>
          案件
        </button>
        <button className={tab === "troubles" ? "on" : ""} onClick={() => setTab("troubles")}>
          トラブル演習（{troubles.length}）
        </button>
        <button className={tab === "history" ? "on" : ""} onClick={() => setTab("history")}>
          履歴（{data.simRuns.length}）
        </button>
      </div>

      {tab === "projects" &&
        simProjects.map((p) => {
          const runs = data.simRuns.filter((r) => r.projectId === p.id);
          const best = runs.reduce((m, r) => Math.max(m, r.score ?? 0), 0);
          const isActive = active?.projectId === p.id;
          return (
            <Card key={p.id} className="project-card">
              <div className="project-code">{p.code}</div>
              <h2 className="project-title">{p.title}</h2>
              <p>{p.summary}</p>
              <div className="grid two">
                <div>
                  <h4>編成</h4>
                  <ul className="list small">
                    {p.lineup.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4>仕様</h4>
                  <ul className="list small">
                    {p.spec.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                  <h4>工程</h4>
                  <ol className="list small">
                    {p.stages.map((s) => (
                      <li key={s.id}>{s.title}</li>
                    ))}
                  </ol>
                </div>
              </div>
              <p className="small muted">
                推奨 LEVEL {p.level} 以上 ・ 1回の実行でトラブルが {p.troubleCount} 件ランダムに発生
                {runs.length > 0 && ` ・ 実施 ${runs.length}回 ・ 最高 ${pct(best)}（${rankOf(best)}）`}
              </p>
              <div className="btn-row">
                {isActive && (
                  <a className="btn primary" href="#/simulator/run">
                    続きから（{active.results.length}/{buildEvents(active).length}）
                  </a>
                )}
                <button className={`btn ${isActive ? "" : "primary"}`} onClick={() => start(p.id)}>
                  {isActive ? "最初からやり直す" : "案件を開始"}
                </button>
              </div>
            </Card>
          );
        })}

      {tab === "troubles" && (
        <Card>
          <p className="small muted">案件の中で発生するトラブルを個別に練習できます。評価が 70% 未満、または原因を誤った場合は復習リストに追加されます。</p>
          <ul className="lesson-list">
            {troubles.map((t) => {
              const r = data.troubles[t.id];
              return (
                <li key={t.id}>
                  <a className="lesson-row" href={`#/simulator/trouble/${t.id}`}>
                    <span className="lesson-main">
                      <span className="lesson-title">{t.title}</span>
                      <span className="muted small">
                        {categoryLabel(t.category)} ・ <Difficulty n={t.difficulty} />
                      </span>
                    </span>
                    <span className="lesson-side always">
                      {r ? (
                        <>
                          <span className={`badge ${r.best >= 0.7 ? "good" : "bad"}`}>最高 {pct(r.best)}</span>
                          <span className="small muted">{r.attempts}回</span>
                        </>
                      ) : (
                        <span className="small muted">未実施</span>
                      )}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {tab === "history" && (
        <Card>
          {data.simRuns.length === 0 ? (
            <p className="muted">まだ実施した案件はありません。</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>日時</th>
                  <th>案件</th>
                  <th>評価</th>
                  <th>発生したトラブル</th>
                </tr>
              </thead>
              <tbody>
                {data.simRuns
                  .slice()
                  .reverse()
                  .map((r) => (
                    <tr key={r.startedAt}>
                      <td className="small">{new Date(r.finishedAt ?? r.startedAt).toLocaleString("ja-JP")}</td>
                      <td>{getProject(r.projectId)?.code}</td>
                      <td>
                        <span className={`rank rank-${r.rank}`}>{r.rank}</span> {pct(r.score ?? 0)}
                      </td>
                      <td className="small">{r.troubleIds.map((id) => getTrouble(id)?.title).join(" / ")}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}

export function TroubleDrill({ id }: { id: string }) {
  const t = getTrouble(id);
  const store = useProgress();
  const [round, setRound] = useState(0);
  const [finished, setFinished] = useState(false);
  useStudyTimer(null);
  if (!t) return <div className="page">トラブルが見つかりません。</div>;
  return (
    <div className="page">
      <a className="back" href="#/simulator/troubles">
        ← トラブル演習
      </a>
      <h1>トラブル演習</h1>
      <Card>
        {finished ? (
          <div>
            <p>記録しました。</p>
            <div className="btn-row">
              <button
                className="btn primary"
                onClick={() => {
                  setFinished(false);
                  setRound(round + 1);
                }}
              >
                もう一度
              </button>
              <a className="btn" href="#/simulator/troubles">
                一覧に戻る
              </a>
            </div>
          </div>
        ) : (
          <TroubleRunner
            key={round}
            t={t}
            nextLabel="記録して終了"
            onDone={(r) => {
              store.recordTrouble(t.id, r);
              setFinished(true);
            }}
          />
        )}
      </Card>
    </div>
  );
}

export function SimRunPage() {
  const store = useProgress();
  const run = store.data.simActive;
  useStudyTimer(null);
  if (!run) {
    const last = store.data.simRuns[store.data.simRuns.length - 1];
    return last ? <SimResult run={last} /> : <div className="page">進行中の案件はありません。<a href="#/simulator">案件一覧へ</a></div>;
  }
  const p = getProject(run.projectId);
  if (!p) return <div className="page">案件が見つかりません。</div>;
  const events = buildEvents(run);
  const idx = run.results.length;
  const ev = events[idx];

  const push = (r: SimEventResult) => {
    const results = [...run.results, r];
    if (results.length >= events.length) {
      const score = runScore(results);
      store.finishSim({ ...run, results, finishedAt: Date.now(), score, rank: rankOf(score) });
    } else store.setSimActive({ ...run, results });
    window.scrollTo(0, 0);
  };

  return (
    <div className="page">
      <a className="back" href="#/simulator">
        ← Studio Simulator
      </a>
      <div className="project-code">
        {p.code}：{p.title}
      </div>
      <div className="sim-timeline">
        {events.map((e, i) => (
          <span
            key={`${e.type}-${e.id}`}
            className={`${e.type} ${i < idx ? "done" : i === idx ? "cur" : ""}`}
            title={e.type === "stage" ? p.stages.find((s) => s.id === e.id)?.title : getTrouble(e.id)?.title}
          />
        ))}
      </div>
      {ev?.type === "stage" && (
        <StageView key={ev.id} stage={p.stages.find((s) => s.id === ev.id)!} no={p.stages.findIndex((s) => s.id === ev.id) + 1} onDone={push} />
      )}
      {ev?.type === "trouble" && (
        <Card>
          <TroubleRunner
            key={ev.id}
            t={getTrouble(ev.id)!}
            nextLabel="対応完了 — 案件を続ける"
            onDone={(r) => {
              store.recordTrouble(ev.id, r);
              push({ type: "trouble", id: ev.id, trouble: r });
            }}
          />
        </Card>
      )}
    </div>
  );
}

function StageView({ stage, no, onDone }: { stage: SimStage; no: number; onDone: (r: SimEventResult) => void }) {
  const [checked, setChecked] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const d = stage.decision;
  const perm = useShuffle(d.choices.length, stage.id);
  return (
    <Card>
      <div className="muted small">STEP {no}</div>
      <h2 className="stage-title">{stage.title}</h2>
      <div className="brief">
        <Rich text={stage.brief} />
      </div>
      <h4>Pro Tools での作業（実機で行い、自己チェック）</h4>
      <ul className="checklist">
        {stage.actions.map((a, i) => (
          <li key={a}>
            <label>
              <input type="checkbox" checked={checked.includes(i)} onChange={() => setChecked(checked.includes(i) ? checked.filter((x) => x !== i) : [...checked, i])} />
              <span>{a}</span>
            </label>
          </li>
        ))}
      </ul>
      <h4>判断</h4>
      <p>{d.q}</p>
      <div className="choices">
        {perm.map((i) => {
          const c = d.choices[i];
          let cls = "choice";
          if (picked !== null && i === d.answer) cls += " correct";
          else if (picked !== null && i === picked) cls += " wrong";
          return (
            <button key={i} className={cls} disabled={picked !== null && i !== picked && i !== d.answer} onClick={() => picked === null && setPicked(i)}>
              {c}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div className={`explain ${picked === d.answer ? "ok" : "ng"}`}>
          <strong>{picked === d.answer ? "正解" : "不正解"}</strong>
          <p>{d.explanation}</p>
          {d.logicNote && (
            <div className="logic-box">
              <span className="logic-label">Logic Proとの比較</span>
              {d.logicNote}
            </div>
          )}
          <button className="btn primary" onClick={() => onDone({ type: "stage", id: stage.id, decisionCorrect: picked === d.answer, actionsDone: checked.length })}>
            次へ進む
          </button>
        </div>
      )}
    </Card>
  );
}

function SimResult({ run }: { run: SimRun }) {
  const p = getProject(run.projectId);
  const stageResults = run.results.filter((r) => r.type === "stage");
  const troubleResults = run.results.filter((r) => r.type === "trouble");
  return (
    <div className="page">
      <a className="back" href="#/simulator">
        ← Studio Simulator
      </a>
      <h1>案件完了：{p?.code}</h1>
      <Card>
        <div className="score-row">
          <div>
            <span className="stat-label">総合評価</span>
            <span className={`rank big rank-${run.rank}`}>{run.rank}</span>
            <span className="big">{pct(run.score ?? 0)}</span>
          </div>
          <ul className="score-break small">
            <li>工程の判断：{stageResults.filter((r) => r.decisionCorrect).length} / {stageResults.length} 正解</li>
            <li>実機作業の自己チェック：{stageResults.reduce((a, r) => a + (r.actionsDone ?? 0), 0)} 項目</li>
            <li>トラブル対応：平均 {pct(troubleResults.reduce((a, r) => a + (r.trouble?.score ?? 0), 0) / Math.max(1, troubleResults.length))}</li>
          </ul>
        </div>
        <p className="small muted">評価基準：S 90%以上 / A 75%以上 / B 60%以上 / C それ未満。工程の判断 10点 × 工程数、トラブル対応 25点 × 発生数で算出。</p>
      </Card>
      <Card title="トラブル対応の振り返り">
        <table className="table">
          <thead>
            <tr>
              <th>トラブル</th>
              <th>原因</th>
              <th>最初の一手</th>
              <th>順序</th>
              <th>評価</th>
            </tr>
          </thead>
          <tbody>
            {troubleResults.map((r) => (
              <tr key={r.id}>
                <td>
                  <a href={`#/simulator/trouble/${r.id}`}>{getTrouble(r.id)?.title}</a>
                </td>
                <td>{r.trouble?.causeCorrect ? "○" : "×"}</td>
                <td>{r.trouble?.firstCorrect ? "○" : "×"}</td>
                <td>{pct(r.trouble?.orderScore ?? 0)}</td>
                <td>{pct(r.trouble?.score ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="工程の判断">
        <ul className="result-list">
          {stageResults.map((r) => (
            <li key={r.id} className={r.decisionCorrect ? "ok" : "ng"}>
              <span>{r.decisionCorrect ? "○" : "×"}</span>
              {p?.stages.find((s) => s.id === r.id)?.title}
            </li>
          ))}
        </ul>
      </Card>
      <div className="btn-row">
        <a className="btn primary" href="#/simulator">
          案件一覧へ
        </a>
      </div>
    </div>
  );
}
