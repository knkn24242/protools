import { categoryLabel, getLevel, lessonsOfLevel, levels, practiceTasks } from "../lib/content";
import { lessonMastery, levelCompletion, levelMastery, pct } from "../lib/metrics";
import { useProgress } from "../lib/store";
import { Bar, Card, Difficulty, StatusDot } from "../components/ui";

export function CurriculumIndex() {
  const { data } = useProgress();
  return (
    <div className="page">
      <h1>Curriculum</h1>
      <p className="lead">全8 LEVEL。各教材は Pro Tools の機能を Logic Pro の知識と対応づけて解説します。</p>
      <div className="level-list">
        {levels.map((lv) => {
          const c = levelCompletion(lv.level, data);
          return (
            <a key={lv.level} className="level-row" href={`#/curriculum/${lv.level}`}>
              <div className="level-no">LEVEL {lv.level}</div>
              <div className="level-body">
                <div className="level-title">
                  {lv.title} <span className="muted small">{lv.titleEn}</span>
                </div>
                <div className="muted small">{lv.summary}</div>
              </div>
              <div className="level-meta">
                {c.total ? (
                  <>
                    <Bar value={levelMastery(lv.level, data)} />
                    <span className="small muted">
                      {c.done}/{c.total} 完了 ・ 習熟度 {pct(levelMastery(lv.level, data))}
                    </span>
                  </>
                ) : (
                  <span className="badge">教材準備中</span>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

export function LevelDetail({ level }: { level: number }) {
  const { data } = useProgress();
  const lv = getLevel(level);
  if (!lv) return <div className="page">LEVELが見つかりません。</div>;
  const ls = lessonsOfLevel(level);
  return (
    <div className="page">
      <a className="back" href="#/curriculum">← Curriculum</a>
      <h1>
        LEVEL {lv.level}：{lv.title}
      </h1>
      <p className="lead">{lv.summary}</p>

      <Card title={`教材（${ls.length}）`}>
        {ls.length ? (
          <ul className="lesson-list">
            {ls.map((l) => (
              <li key={l.id}>
                <a href={`#/lesson/${l.id}`} className="lesson-row">
                  <span className="lesson-no">
                    {l.level}-{l.order}
                  </span>
                  <span className="lesson-main">
                    <span className="lesson-title">{l.title}</span>
                    <span className="muted small">
                      {categoryLabel(l.category)} ・ 約{l.minutes}分 ・ <Difficulty n={l.difficulty} />
                    </span>
                  </span>
                  <span className="lesson-side">
                    <StatusDot status={data.lessons[l.id]?.status ?? "not_started"} />
                    <span className="small muted">習熟 {pct(lessonMastery(l, data))}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">このLEVELの教材は準備中です。content/lessons/level-{level}.json を追加すると表示されます。</p>
        )}
      </Card>

      <div className="grid two">
        <Card title="学習トピック">
          <ul className="topic-list">
            {lv.topics.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Card>
        <Card title="実技課題">
          <ul className="list">
            {practiceTasks
              .filter((t) => t.level === level)
              .map((t) => (
                <li key={t.id}>
                  {t.capstone && <span className="badge good">総合課題</span>} <a href={`#/practice/${t.id}`}>{t.title}</a>{" "}
                  <span className="small muted">{data.practice[t.id]?.status === "passed" ? "✓ 合格" : ""}</span>
                </li>
              ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
