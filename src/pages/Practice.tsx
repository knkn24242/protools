import { useEffect, useRef, useState } from "react";
import { categoryLabel, getLesson, getTask, levels, practiceTasks } from "../lib/content";
import { compressImage, kvDelete, kvGet, kvSet } from "../lib/db";
import { pct, practiceStats } from "../lib/metrics";
import { emptyPractice, useProgress, useStudyTimer } from "../lib/store";
import { Bar, Card, Difficulty, Rich } from "../components/ui";
import type { PracticeProgress, PracticeTask } from "../types";
import { checkScreenshots } from "../lib/ai";
import { useAi } from "../lib/useAi";

const STATUS_LABEL: Record<PracticeProgress["status"], string> = {
  not_started: "未着手",
  in_progress: "取り組み中",
  passed: "合格",
};

function PracticeStatus({ status }: { status: PracticeProgress["status"] }) {
  const cls = status === "passed" ? "completed" : status;
  return <span className={`status status-${cls}`}>{STATUS_LABEL[status]}</span>;
}

export function PracticeIndex() {
  const { data } = useProgress();
  const st = practiceStats(data);
  return (
    <div className="page">
      <h1>Practice</h1>
      <p className="lead">Pro Tools を実際に操作する課題です。完成条件を自分でチェックし、スクリーンショットを記録として残せます。</p>
      <Card>
        <div className="row-between">
          <span>
            実技課題の達成率 <strong>{pct(st.rate)}</strong>（{st.passed}/{st.total}）
          </span>
        </div>
        <Bar value={st.rate} />
      </Card>
      {levels.map((lv) => {
        const ts = practiceTasks.filter((t) => t.level === lv.level);
        if (!ts.length) return null;
        return (
          <Card key={lv.level} title={`LEVEL ${lv.level}：${lv.title}`}>
            <ul className="lesson-list">
              {ts.map((t) => {
                const p = data.practice[t.id];
                return (
                  <li key={t.id}>
                    <a className="lesson-row" href={`#/practice/${t.id}`}>
                      <span className="lesson-main">
                        <span className="lesson-title">
                          {t.capstone && <span className="badge good">総合課題</span>} {t.title}
                        </span>
                        <span className="muted small">
                          {categoryLabel(t.category)} ・ 約{t.minutes}分 ・ <Difficulty n={t.difficulty} />
                          {p?.shots.length ? ` ・ 📷 ${p.shots.length}` : ""}
                        </span>
                      </span>
                      <span className="lesson-side always">
                        <PracticeStatus status={p?.status ?? "not_started"} />
                        <span className="small muted">
                          {p?.checked.length ?? 0}/{t.conditions.length}
                        </span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

export function PracticeDetail({ id }: { id: string }) {
  const task = getTask(id);
  const store = useProgress();
  useStudyTimer(null);
  if (!task) return <div className="page">課題が見つかりません。</div>;
  const p = store.data.practice[task.id] ?? emptyPractice();
  const allChecked = task.conditions.every((_, i) => p.checked.includes(i));

  const toggle = (i: number) =>
    store.updatePractice(task.id, (cur) => {
      const checked = cur.checked.includes(i) ? cur.checked.filter((x) => x !== i) : [...cur.checked, i];
      const status = cur.status === "passed" && checked.length < task.conditions.length ? "in_progress" : cur.status === "not_started" ? "in_progress" : cur.status;
      return { ...cur, checked, status, passedAt: status === "passed" ? cur.passedAt : undefined };
    });

  return (
    <div className="page">
      <a className="back" href="#/practice">
        ← Practice
      </a>
      <div className="muted small">
        LEVEL {task.level} ・ {categoryLabel(task.category)} ・ 約{task.minutes}分 ・ 難易度 <Difficulty n={task.difficulty} />
      </div>
      <h1>{task.title}</h1>
      <div className="lesson-badges">
        <PracticeStatus status={p.status} />
        {task.capstone && <span className="badge good">LEVEL {task.level} 総合課題</span>}
      </div>

      <Card title="課題内容">
        <p className="prose">
          <Rich text={task.description} />
        </p>
      </Card>

      <div className="grid two">
        <Card title="完成条件（自己チェック）">
          <ul className="checklist">
            {task.conditions.map((c, i) => (
              <li key={i}>
                <label>
                  <input type="checkbox" checked={p.checked.includes(i)} onChange={() => toggle(i)} />
                  <span>
                    <Rich text={c} />
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <h4>合格条件</h4>
          <p className="small">{task.passCriteria}</p>
          {p.status === "passed" ? (
            <button className="btn ghost" onClick={() => store.updatePractice(task.id, (cur) => ({ ...cur, status: "in_progress", passedAt: undefined }))}>
              合格を取り消す
            </button>
          ) : (
            <button
              className="btn primary"
              disabled={!allChecked}
              title={allChecked ? "" : "すべての完成条件をチェックすると合格にできます"}
              onClick={() => store.updatePractice(task.id, (cur) => ({ ...cur, status: "passed", passedAt: Date.now() }))}
            >
              合格にする
            </button>
          )}
        </Card>

        <Card title="操作手順のヒント">
          <ul className="list">
            {task.hints.map((h) => (
              <li key={h}>
                <Rich text={h} />
              </li>
            ))}
          </ul>
          <div className="logic-box">
            <span className="logic-label">Logic Proでの類似操作</span>
            {task.logicSimilar}
          </div>
          <p className="small">
            <a href={`#/tutor/task/${task.id}`}>この課題について講師に質問する →</a>
          </p>
          {task.relatedLessons.length > 0 && (
            <>
              <h4>関連教材</h4>
              <ul className="list">
                {task.relatedLessons.map((lid) => (
                  <li key={lid}>
                    <a href={`#/lesson/${lid}`}>{getLesson(lid)?.title ?? lid}</a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <Screenshots task={task} progress={p} />

      <Card title="メモ">
        <textarea
          className="note"
          rows={4}
          value={p.note}
          placeholder="気づいたこと・つまずいた操作・エンジニアに確認したいことなど"
          onChange={(e) => store.updatePractice(task.id, (cur) => ({ ...cur, note: e.target.value }))}
        />
      </Card>
    </div>
  );
}

function Screenshots({ task, progress }: { task: PracticeTask; progress: PracticeProgress }) {
  const store = useProgress();
  const inputRef = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    (async () => {
      const next: Record<string, string> = {};
      for (const s of progress.shots) {
        const blob = await kvGet<Blob>(`shot:${s.id}`);
        if (blob) {
          const u = URL.createObjectURL(blob);
          made.push(u);
          next[s.id] = u;
        }
      }
      if (alive) setUrls(next);
    })();
    return () => {
      alive = false;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [progress.shots]);

  const add = async (files: FileList) => {
    setBusy(true);
    setError("");
    try {
      for (const f of Array.from(files)) {
        if (!f.type.startsWith("image/")) continue;
        const blob = await compressImage(f);
        const id = `${task.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        await kvSet(`shot:${id}`, blob);
        store.addShot(task.id, { id, taskId: task.id, name: f.name, createdAt: Date.now(), aiReview: null });
      }
    } catch (e) {
      setError(`画像を保存できませんでした：${(e as Error).message}`);
    }
    setBusy(false);
  };

  const remove = async (sid: string) => {
    if (!confirm("このスクリーンショットを削除します。よろしいですか？")) return;
    await kvDelete(`shot:${sid}`);
    store.updatePractice(task.id, (cur) => ({ ...cur, shots: cur.shots.filter((s) => s.id !== sid) }));
  };

  return (
    <Card
      title={`スクリーンショット（${progress.shots.length}）`}
      action={
        <button className="btn small" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? "保存中…" : "画像を追加"}
        </button>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) add(e.target.files);
          e.target.value = "";
        }}
      />
      {progress.shots.length === 0 ? (
        <p className="muted small">完成した画面（Edit / Mix Window、I/O Setup など）のスクリーンショットを記録として保存できます。画像はこのブラウザ内にのみ保存されます。</p>
      ) : (
        <div className="shots">
          {progress.shots.map((s) => (
            <figure key={s.id} className="shot">
              {urls[s.id] ? <img src={urls[s.id]} alt={s.name} onClick={() => setZoom(urls[s.id])} /> : <div className="shot-missing">読み込み中</div>}
              <figcaption>
                <span className="small muted">{new Date(s.createdAt).toLocaleString("ja-JP")}</span>
                <button className="link-btn" onClick={() => remove(s.id)}>
                  削除
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {error && <p className="notice">{error}</p>}
      <AiCheckPanel task={task} progress={progress} />
      {zoom && (
        <div className="lightbox" onClick={() => setZoom(null)}>
          <img src={zoom} alt="拡大表示" />
        </div>
      )}
    </Card>
  );
}

const ST_LABEL = { met: "確認できた", not_met: "未達成", cannot_determine: "判定不可" } as const;

function AiCheckPanel({ task, progress }: { task: PracticeTask; progress: PracticeProgress }) {
  const store = useProgress();
  const { ready, config } = useAi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const check = progress.aiCheck;
  const stale = check && progress.shots.some((s) => !check.shotIds.includes(s.id));

  const runCheck = async () => {
    setBusy(true);
    setError("");
    try {
      const blobs: Blob[] = [];
      const ids: string[] = [];
      for (const s of progress.shots.slice(-6)) {
        const b = await kvGet<Blob>(`shot:${s.id}`);
        if (b) {
          blobs.push(b);
          ids.push(s.id);
        }
      }
      if (!blobs.length) throw new Error("画像が見つかりません。");
      const r = await checkScreenshots(task, blobs);
      const conditions = r.conditions.filter((c) => c.index >= 0 && c.index < task.conditions.length);
      const met = conditions.filter((c) => c.status === "met").length;
      const verdict = met === task.conditions.length ? "すべて確認できた" : `${met}/${task.conditions.length} 確認`;
      store.updatePractice(task.id, (cur) => ({
        ...cur,
        aiCheck: { at: Date.now(), model: config?.model ?? "", shotIds: ids, conditions, comment: r.comment, advice: r.advice },
        shots: cur.shots.map((s) => (ids.includes(s.id) ? { ...s, aiReview: { verdict, comment: r.comment, at: Date.now() } } : s)),
      }));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <div className="ai-panel">
      <div className="row-between">
        <strong>
          AI による画面確認 <span className="ai-badge">AI</span>
        </strong>
        {ready ? (
          <button className="btn small" disabled={busy || progress.shots.length === 0} onClick={runCheck}>
            {busy ? "確認中…" : check ? "もう一度確認する" : "AI で画面を確認"}
          </button>
        ) : (
          <a className="small" href="#/settings">
            API キーを設定すると使えます
          </a>
        )}
      </div>
      {progress.shots.length === 0 && <p className="ai-note">スクリーンショットを追加すると、完成条件が画面から確認できるかを AI が判定します（最新6枚まで）。</p>}
      {error && <p className="notice">{error}</p>}
      {check && (
        <>
          {stale && <p className="ai-note">判定後にスクリーンショットが追加されています。もう一度確認できます。</p>}
          <ul className="cond-result">
            {task.conditions.map((c, i) => {
              const r = check.conditions.find((x) => x.index === i);
              const st = r?.status ?? "cannot_determine";
              return (
                <li key={i}>
                  <span className={`cond-st ${st}`}>{ST_LABEL[st]}</span>
                  <span>
                    {c}
                    {r && (
                      <span className="small muted">
                        <br />
                        {r.evidence}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="small">{check.comment}</p>
          {check.advice.length > 0 && (
            <>
              <h4>次に確認すること</h4>
              <ul className="list small">
                {check.advice.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </>
          )}
          <div className="btn-row">
            <button
              className="btn small"
              onClick={() =>
                store.updatePractice(task.id, (cur) => ({
                  ...cur,
                  status: cur.status === "not_started" ? "in_progress" : cur.status,
                  checked: [...new Set([...cur.checked, ...check.conditions.filter((x) => x.status === "met").map((x) => x.index)])],
                }))
              }
            >
              「確認できた」条件を自己チェックに反映
            </button>
          </div>
          <p className="ai-note">
            {new Date(check.at).toLocaleString("ja-JP")} ・ {check.model}。AI の判定は補助です。音の確認など画面では判断できない条件は、自分で確認してから合格にしてください。画像は Anthropic API に送信されます。
          </p>
        </>
      )}
    </div>
  );
}
