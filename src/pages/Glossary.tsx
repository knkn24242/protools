import { useMemo, useState } from "react";
import { categories, categoryLabel, getLesson, glossary } from "../lib/content";
import { Card, MatchBadge } from "../components/ui";
import type { LogicMatch } from "../types";

function norm(s: string) {
  return s.toLowerCase().replace(/[\s\-/]/g, "");
}

export default function GlossaryPage({ initial }: { initial?: string }) {
  const [query, setQuery] = useState(initial ? decodeURIComponent(initial) : "");
  const [cat, setCat] = useState("all");
  const [match, setMatch] = useState<"all" | LogicMatch>("all");

  const results = useMemo(() => {
    const q = norm(query);
    return glossary.filter((g) => {
      if (cat !== "all" && g.category !== cat) return false;
      if (match !== "all" && g.logic.match !== match) return false;
      if (!q) return true;
      return [g.term, g.ja, g.desc, g.logic.name, ...g.related].some((t) => norm(t).includes(q));
    });
  }, [query, cat, match]);

  const exists = (t: string) => glossary.some((g) => g.term === t);

  return (
    <div className="page">
      <h1>Glossary</h1>
      <p className="lead">Pro Tools とスタジオの用語辞典（{glossary.length}語）。現場で英語のまま使われる用語は英語表記を優先しています。</p>
      <div className="filters">
        <input className="search" type="search" placeholder="用語・日本語訳・Logic Pro の機能名で検索" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus aria-label="用語検索" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="カテゴリー">
          <option value="all">全カテゴリー</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select value={match} onChange={(e) => setMatch(e.target.value as "all" | LogicMatch)} aria-label="Logic Pro との対応">
          <option value="all">Logic Pro 対応：すべて</option>
          <option value="exact">完全一致</option>
          <option value="similar">類似概念</option>
          <option value="none">対応機能なし</option>
        </select>
      </div>
      <p className="small muted">{results.length}件</p>
      <div className="glossary">
        {results.map((g) => (
          <Card key={g.term} className="term-card">
            <div className="term-head">
              <h3 id={`term-${g.term}`}>{g.term}</h3>
              <span className="muted">{g.ja}</span>
              {g.keepEnglish && (
                <span className="badge" title="現場では英語のまま使われることが多い用語">
                  英語のまま使用
                </span>
              )}
              <span className="badge">{categoryLabel(g.category)}</span>
            </div>
            <p>{g.desc}</p>
            <div className="logic-box">
              <span className="logic-label">
                Logic Pro：{g.logic.name} <MatchBadge match={g.logic.match} />
              </span>
              {g.logic.note}
            </div>
            {(g.howto || g.example) && (
              <dl className="term-meta">
                {g.howto && (
                  <>
                    <dt>操作</dt>
                    <dd>{g.howto}</dd>
                  </>
                )}
                {g.example && (
                  <>
                    <dt>現場での例</dt>
                    <dd>{g.example}</dd>
                  </>
                )}
              </dl>
            )}
            <div className="term-foot small">
              {g.related.length > 0 && (
                <span>
                  関連：
                  {g.related.map((r, i) => (
                    <span key={r}>
                      {i > 0 && "、"}
                      {exists(r) ? (
                        <button className="link-btn" onClick={() => setQuery(r)}>
                          {r}
                        </button>
                      ) : (
                        <span className="muted">{r}</span>
                      )}
                    </span>
                  ))}
                </span>
              )}
              {g.lessonId && <a href={`#/lesson/${g.lessonId}`}>教材：{getLesson(g.lessonId)?.title} →</a>}
            </div>
          </Card>
        ))}
        {results.length === 0 && <p className="muted">該当する用語がありません。</p>}
      </div>
    </div>
  );
}
