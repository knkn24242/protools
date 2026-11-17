import { useEffect } from "react";
import { categoryLabel, getLesson, getQuestion, lessons } from "../lib/content";
import { formatDuration, lessonMastery, pct } from "../lib/metrics";
import { useProgress, useStudyTimer } from "../lib/store";
import QuestionCard from "../components/QuestionCard";
import { Card, Difficulty, Kbd, MatchBadge, Rich, StatusDot, Unverified } from "../components/ui";
import type { Lesson } from "../types";

const SECTIONS = [
  ["overview", "概要"],
  ["steps", "操作手順"],
  ["logic", "Logic Pro比較"],
  ["usecases", "使用場面"],
  ["cautions", "実務上の注意"],
  ["mistakes", "よくある失敗"],
  ["keypoints", "重要ポイント"],
  ["terms", "用語"],
  ["quiz", "理解度確認"],
  ["sources", "出典"],
] as const;

export default function LessonPage({ id, anchor }: { id: string; anchor?: string }) {
  const lesson = getLesson(id);
  const store = useProgress();
  const { loaded, openLesson } = store;
  useStudyTimer(lesson ? lesson.id : null);

  useEffect(() => {
    if (loaded && lesson) openLesson(lesson.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, id]);

  useEffect(() => {
    if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth" });
  }, [anchor, id]);

  if (!lesson) return <div className="page">教材が見つかりません。</div>;
  const p = store.lesson(lesson.id);
  const idx = lessons.findIndex((l) => l.id === lesson.id);
  const prev = lessons[idx - 1];
  const next = lessons[idx + 1];

  return (
    <div className="page lesson-page">
      <a className="back" href={`#/curriculum/${lesson.level}`}>
        ← LEVEL {lesson.level}
      </a>
      <header className="lesson-head">
        <div className="muted small">
          LEVEL {lesson.level}-{lesson.order} ・ {categoryLabel(lesson.category)} ・ 約{lesson.minutes}分 ・ <Difficulty n={lesson.difficulty} />
        </div>
        <h1>{lesson.title}</h1>
        <div className="lesson-en">{lesson.titleEn}</div>
        <div className="lesson-badges">
          <StatusDot status={p.status} />
          <span className="badge">{lesson.ptVersion}</span>
          {lesson.reviewStatus === "draft" ? (
            <span className="badge warn" title="AIが作成した下書きです。Avid公式ガイドとの照合が完了していません。">公式照合前</span>
          ) : (
            <span className="badge good">公式照合済み</span>
          )}
          <span className="muted small">
            習熟 {pct(lessonMastery(lesson, store.data))} ・ 学習時間 {formatDuration(p.timeSec)}
          </span>
        </div>
        {lesson.prerequisites.length > 0 && (
          <div className="small muted">
            前提：
            {lesson.prerequisites.map((pid, i) => {
              const pl = getLesson(pid);
              return (
                <span key={pid}>
                  {i > 0 && " / "}
                  <a href={`#/lesson/${pid}`}>{pl?.title ?? pid}</a>
                </span>
              );
            })}
          </div>
        )}
      </header>

      <nav className="toc" aria-label="目次">
        {SECTIONS.map(([k, label]) => (
          <a key={k} href={`#/lesson/${lesson.id}/${k}`}>
            {label}
          </a>
        ))}
      </nav>

      <Card className="section" title={<span id="overview">概要</span>}>
        <p className="prose">
          <Rich text={lesson.overview} />
        </p>
      </Card>

      <Card className="section" title={<span id="steps">操作手順</span>}>
        <ol className="steps">
          {lesson.steps.map((s, i) => (
            <li key={i}>
              <Rich text={s.text} />
              {s.shortcut && (
                <div>
                  <Kbd sc={s.shortcut} />
                </div>
              )}
            </li>
          ))}
        </ol>
      </Card>

      <LogicSection lesson={lesson} />

      <div className="grid two">
        <ListCard id="usecases" title="スタジオでの使用場面" items={lesson.useCases} />
        <ListCard id="cautions" title="実務上の注意点" items={lesson.cautions} />
        <ListCard id="mistakes" title="よくある失敗" items={lesson.mistakes} tone="bad" />
        <ListCard id="keypoints" title="覚えておくべきポイント" items={lesson.keyPoints} tone="good" />
      </div>

      <Card className="section" title={<span id="terms">用語</span>}>
        <dl className="terms">
          {lesson.terms.map((t) => (
            <div key={t.term}>
              <dt>{t.term}</dt>
              <dd>{t.desc}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="section" title={<span id="quiz">理解度確認</span>}>
        {lesson.quiz.map((_, i) => {
          const q = getQuestion(`${lesson.id}#${i}`);
          return q ? <QuestionCard key={q.id} q={q} index={i} /> : null;
        })}
      </Card>

      <Card className="section" title={<span id="sources">出典・確認状況</span>}>
        <ul className="list">
          {lesson.sources.map((s, i) => (
            <li key={i}>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                </a>
              ) : (
                s.title
              )}
              {s.section && <span className="muted"> — {s.section}</span>}
            </li>
          ))}
        </ul>
        {lesson.unverified.length > 0 && (
          <>
            <h4>
              <Unverified /> 公式資料で確認が必要な項目
            </h4>
            <ul className="list">
              {lesson.unverified.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </>
        )}
        {lesson.related.length > 0 && (
          <div className="small">
            関連教材：
            {lesson.related.map((rid, i) => (
              <span key={rid}>
                {i > 0 && " / "}
                <a href={`#/lesson/${rid}`}>{getLesson(rid)?.title ?? rid}</a>
              </span>
            ))}
          </div>
        )}
      </Card>

      <div className="lesson-foot">
        {p.status === "completed" ? (
          <button className="btn ghost" onClick={() => store.setStatus(lesson.id, "in_progress")}>
            完了を取り消す
          </button>
        ) : (
          <button className="btn primary" onClick={() => store.setStatus(lesson.id, "completed")}>
            この教材を完了にする
          </button>
        )}
        <a className="btn" href={`#/tutor/lesson/${lesson.id}`}>
          講師に質問する
        </a>
        <div className="pager">
          {prev && <a href={`#/lesson/${prev.id}`}>← {prev.title}</a>}
          {next && <a href={`#/lesson/${next.id}`}>{next.title} →</a>}
        </div>
      </div>
    </div>
  );
}

function LogicSection({ lesson }: { lesson: Lesson }) {
  const l = lesson.logic;
  return (
    <Card
      className="section logic-card"
      title={
        <span id="logic">
          Logic Pro翻訳 <MatchBadge match={l.match} />
        </span>
      }
    >
      <table className="translate">
        <tbody>
          <tr>
            <th>Pro Tools</th>
            <td>{lesson.titleEn}</td>
          </tr>
          <tr>
            <th>Logic Pro</th>
            <td>{l.logicName}</td>
          </tr>
          <tr>
            <th>Logic Proでいうと</th>
            <td>
              <Rich text={l.equivalent} />
            </td>
          </tr>
          <tr>
            <th>違い</th>
            <td>
              <ul className="list">
                {l.differences.map((d) => (
                  <li key={d}>
                    <Rich text={d} />
                  </li>
                ))}
              </ul>
            </td>
          </tr>
          {l.logicShortcut && (
            <tr>
              <th>Logic Pro操作</th>
              <td>
                <kbd>{l.logicShortcut}</kbd>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

function ListCard({ id, title, items, tone }: { id: string; title: string; items: string[]; tone?: "good" | "bad" }) {
  return (
    <Card className={`section ${tone ? `tone-${tone}` : ""}`} title={<span id={id}>{title}</span>}>
      <ul className="list">
        {items.map((t) => (
          <li key={t}>
            <Rich text={t} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
