import { useEffect } from "react";
import { getLesson, getLevel, levels } from "../lib/content";
import { currentLevel, formatDuration, levelCompletion, levelMastery, overallMastery, pct, quizStats, weakCategories } from "../lib/metrics";
import { generateMission, isItemDone, KIND_TAG, missionLink, missionStreak } from "../lib/mission";
import { dueItems } from "../lib/review";
import { today, useProgress } from "../lib/store";
import { Bar, Card, StatusDot } from "../components/ui";

function DailyMissionCard() {
  const store = useProgress();
  const { data } = store;
  const minutes = data.settings.dailyMinutes;
  const m = data.missions[today()];

  // 今日のミッションがなければ生成。時間プランを切り替えた場合、未着手なら作り直す
  useEffect(() => {
    if (!m) store.setMission(generateMission(data, minutes));
    else if (m.minutes !== minutes && !m.items.some((it) => isItemDone(it, m, data))) store.setMission({ ...generateMission(data, minutes), answered: m.answered, reviewed: m.reviewed, shortcutAnswered: m.shortcutAnswered });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.date, minutes]);

  if (!m) return <Card title="今日の学習" className="span-2"><span className="muted">準備中…</span></Card>;
  const done = m.items.filter((it) => isItemDone(it, m, data)).length;
  const doneMin = m.items.filter((it) => isItemDone(it, m, data)).reduce((a, it) => a + it.minutes, 0);
  const totalMin = m.items.reduce((a, it) => a + it.minutes, 0);
  const streak = missionStreak(data);

  const toggle = (i: number) => store.setMission({ ...m, items: m.items.map((it, n) => (n === i ? { ...it, done: !it.done } : it)) });

  return (
    <Card
      title="今日の学習（デイリーミッション）"
      className="span-2"
      action={
        <div className="seg small-seg">
          {([60, 30] as const).map((n) => (
            <button key={n} className={minutes === n ? "on" : ""} onClick={() => store.setSettings({ dailyMinutes: n })} title={n === 30 ? "忙しい日用" : "標準"}>
              {n}分
            </button>
          ))}
        </div>
      }
    >
      <div className="mission-head">
        <span>
          {done}/{m.items.length} 達成 ・ {doneMin}/{totalMin}分
        </span>
        <span className="muted small">本日の学習時間 {formatDuration(data.studyLog[today()] ?? 0)}</span>
        {streak > 0 && <span className="badge good">{streak}日連続達成</span>}
        {done === m.items.length && <span className="badge good">今日のミッション完了</span>}
      </div>
      <Bar value={done / m.items.length} />
      <ol className="plan mission">
        {m.items.map((it, i) => {
          const ok = isItemDone(it, m, data);
          const progress =
            it.kind === "quiz" ? m.answered : it.kind === "review" ? m.reviewed : it.kind === "shortcut" ? m.shortcutAnswered : null;
          return (
            <li key={i} className={ok ? "is-done" : ""}>
              <input type="checkbox" checked={ok} onChange={() => toggle(i)} aria-label={`${it.label} を完了にする`} title="自動で判定されます。手動でもチェックできます" />
              <span className="plan-tag">{KIND_TAG[it.kind]}</span>
              <span className="mission-body">
                <a href={missionLink(it)}>{it.label}</a>
                {it.reason && <span className="small muted mission-reason">{it.reason}</span>}
              </span>
              <span className="muted small mission-meta">
                {progress !== null && it.target ? `${Math.min(progress, it.target)}/${it.target} ・ ` : ""}
                {it.minutes}分
              </span>
            </li>
          );
        })}
      </ol>
      <p className="small muted">教材の完了・課題の合格・回答数などから自動で達成判定します。内容は進捗と苦手分野に応じて毎日組み直されます。</p>
    </Card>
  );
}

export default function Dashboard() {
  const { data } = useProgress();
  const lv = currentLevel(data);
  const level = getLevel(lv);
  const last = data.lastLessonId ? getLesson(data.lastLessonId) : undefined;
  const weak = weakCategories(data);
  const qs = quizStats(data);
  const comp = levelCompletion(lv, data);
  const due = dueItems(data.review);

  return (
    <div className="page">
      <h1>Dashboard</h1>
      <div className="grid dash-grid">
        <DailyMissionCard />

        <Card title="現在のLEVEL">
          <div className="big">LEVEL {lv}</div>
          <div className="muted">{level?.title}</div>
          <Bar value={levelMastery(lv, data)} />
          <div className="muted small">
            習熟度 {pct(levelMastery(lv, data))} ・ 教材 {comp.done}/{comp.total} 完了
          </div>
          <a className="btn" href={`#/curriculum/${lv}`}>
            カリキュラムを見る
          </a>
        </Card>

        <Card title="全体進捗">
          <div className="big">{pct(overallMastery(data))}</div>
          <Bar value={overallMastery(data)} />
          <ul className="mini-levels">
            {levels.map((l) => (
              <li key={l.level} title={l.title}>
                <span>L{l.level}</span>
                <Bar value={levelMastery(l.level, data)} />
              </li>
            ))}
          </ul>
          <div className="muted small">
            問題正解率 {qs.answered ? pct(qs.accuracy) : "—"}（{qs.answered}/{qs.total}問回答）
          </div>
        </Card>

        <Card title="前回の続き">
          {last ? (
            <>
              <div className="muted small">LEVEL {last.level}</div>
              <a className="strong-link" href={`#/lesson/${last.id}`}>
                {last.title}
              </a>
              <div>
                <StatusDot status={data.lessons[last.id]?.status ?? "not_started"} />
              </div>
            </>
          ) : (
            <span className="muted">まだ学習履歴がありません。「今日の学習」から始めましょう。</span>
          )}
          {data.simActive && (
            <p className="small">
              <a href="#/simulator/run">進行中の Studio Simulator 案件を再開 →</a>
            </p>
          )}
        </Card>

        <Card title="苦手分野">
          {weak.length ? (
            <ul className="list">
              {weak.map((c) => (
                <li key={c.id}>
                  {c.label} <span className="badge bad">総合 {pct(c.accuracy)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="muted">問題・トラブル演習・ショートカットの総合成績が70%未満の分野がここに表示されます。</span>
          )}
        </Card>

        <Card title="復習リスト" action={due.length ? <a className="btn small" href="#/review">復習する</a> : undefined}>
          <div className="big">{due.length}</div>
          <div className="muted small">今日が復習日の項目（リスト全体 {data.review.length}件）</div>
          {!data.review.length && <span className="muted small">間違えた問題・ショートカット・トラブル対応は自動でここに追加されます。</span>}
        </Card>
      </div>
    </div>
  );
}
