import { lessons, levels } from "../lib/content";
import { itemTitle, KIND_LABEL } from "./Review";
import { categorySkills, formatDuration, levelCompletion, levelMastery, overallMastery, pct, practiceStats, quizStats, shortcutStats, totalStudySec, weakCategories } from "../lib/metrics";
import { useProgress } from "../lib/store";
import { Bar, Card } from "../components/ui";
import { AiCoachCard, WeaknessBreakdown } from "../components/AiCoach";

function lastDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}

export default function ProgressPage() {
  const { data } = useProgress();
  const qs = quizStats(data);
  const ps = practiceStats(data);
  const ss = shortcutStats(data);
  const skills = categorySkills(data);
  const weak = weakCategories(data);
  const completed = lessons.filter((l) => data.lessons[l.id]?.status === "completed").length;
  const days = lastDays(7);
  const maxSec = Math.max(60 * 30, ...days.map((d) => data.studyLog[d] ?? 0));

  return (
    <div className="page">
      <h1>Progress</h1>
      <div className="stat-row">
        <div className="stat">
          <span className="stat-label">全体の習得率</span>
          <span className="stat-value">{pct(overallMastery(data))}</span>
        </div>
        <div className="stat">
          <span className="stat-label">教材完了</span>
          <span className="stat-value">
            {completed}/{lessons.length}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">テスト正解率</span>
          <span className="stat-value">{qs.answered ? pct(qs.accuracy) : "—"}</span>
          <span className="small muted">
            {qs.answered}/{qs.total}問回答
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">学習時間（累計）</span>
          <span className="stat-value">{formatDuration(totalStudySec(data))}</span>
        </div>
        <div className="stat">
          <span className="stat-label">実技課題達成率</span>
          <span className="stat-value">{pct(ps.rate)}</span>
          <span className="small muted">
            {ps.passed}/{ps.total}合格
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">ショートカット習得率</span>
          <span className="stat-value">{pct(ss.rate)}</span>
          <span className="small muted">
            {ss.mastered}/{ss.total}
          </span>
        </div>
      </div>

      <div className="grid two">
        <Card title="スキルマップ">
          <p className="muted small">習熟度 = 教材（完了＋確認問題）50% ＋ 実技課題の合格 30% ＋ 問題演習の正解 20%。学習時間ではなく「できること」で評価します。</p>
          <ul className="skill-map">
            {skills.map((s) => (
              <li key={s.id}>
                <span className="skill-name">{s.label}</span>
                <Bar value={s.mastery} label={s.label} />
                <span className="small muted skill-val">{s.lessonCount ? pct(s.mastery) : "教材準備中"}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="LEVELごとの進捗">
          <ul className="skill-map">
            {levels.map((lv) => {
              const c = levelCompletion(lv.level, data);
              return (
                <li key={lv.level}>
                  <a className="skill-name" href={`#/curriculum/${lv.level}`}>
                    L{lv.level} {lv.title}
                  </a>
                  <Bar value={levelMastery(lv.level, data)} />
                  <span className="small muted skill-val">{c.total ? `${c.done}/${c.total}` : "準備中"}</span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="苦手分野">
          {weak.length ? (
            <ul className="list">
              {weak.map((c) => (
                <li key={c.id}>
                  {c.label}：総合成績 {pct(c.accuracy)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">現在、総合成績（問題・トラブル対応・ショートカットを合成）が70%未満の分野はありません。</p>
          )}
        </Card>

        <Card title="直近7日の学習時間">
          <div className="week">
            {days.map((d) => {
              const sec = data.studyLog[d] ?? 0;
              return (
                <div key={d} className="week-col" title={`${d}: ${formatDuration(sec)}`}>
                  <div className="week-bar">
                    <div style={{ height: `${(sec / maxSec) * 100}%` }} />
                  </div>
                  <span className="small muted">{d.slice(5).replace("-", "/")}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid two">
        <WeaknessBreakdown />
        <AiCoachCard />
      </div>

      <Card title={`復習が必要な項目（${data.review.length}）`} action={data.review.length ? <a className="btn small" href="#/review">復習する</a> : undefined}>
        {data.review.length ? (
          <ul className="list">
            {data.review.slice(0, 15).map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <span className="badge">{KIND_LABEL[r.kind]}</span> {itemTitle(r).slice(0, 80)} <span className="small muted">— 次回 {r.due}</span>
              </li>
            ))}
            {data.review.length > 15 && <li className="muted">ほか {data.review.length - 15} 件</li>}
          </ul>
        ) : (
          <p className="muted">間違えた問題はここに自動で追加され、正解すると外れます。</p>
        )}
      </Card>
    </div>
  );
}
