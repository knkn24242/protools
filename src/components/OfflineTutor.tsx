import { useEffect, useRef, useState } from "react";
import { getLesson, getShortcut, getTrouble, glossary } from "../lib/content";
import { kvGet, kvSet } from "../lib/db";
import { search, type Hit } from "../lib/offlineTutor";
import { useProgress } from "../lib/store";
import { Card, MatchBadge, Rich, Unverified } from "./ui";

interface Turn {
  q: string;
  hits: Hit[];
}

/** API を使わないオフライン講師（収録済みの教材・用語・事例を検索して提示） */
export default function OfflineTutor({ ctxKey, lessonId, suggestions }: { ctxKey: string; lessonId?: string; suggestions: string[] }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const storeKey = `tutor-offline:${ctxKey}`;

  useEffect(() => {
    kvGet<Turn[]>(storeKey).then((t) => setTurns(t ?? []));
  }, [storeKey]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [turns]);

  const ask = (text: string) => {
    const q = text.trim();
    if (!q) return;
    const next = [...turns, { q, hits: search(q, lessonId) }].slice(-20);
    setTurns(next);
    setInput("");
    kvSet(storeKey, next);
  };

  return (
    <>
      <div className="chat">
        {turns.length === 0 && (
          <Card>
            <p className="small muted">
              Pro Tools の機能名・Logic Pro の機能名・困っている症状などで質問してください。例（クリックで質問）：
            </p>
            <div className="suggest">
              {suggestions.filter(Boolean).map((s) => (
                <button key={s} onClick={() => ask(s)}>
                  {s}
                </button>
              ))}
            </div>
          </Card>
        )}
        {turns.map((t, i) => (
          <div key={i} className="offline-turn">
            <div className="msg user">{t.q}</div>
            <div className="msg assistant offline-answer">
              {t.hits.length === 0 ? (
                <NoHit />
              ) : (
                <>
                  <span className="small muted">収録されている内容から、関連する項目が {t.hits.length} 件見つかりました。</span>
                  {t.hits.map((h) => (
                    <HitCard key={`${h.kind}-${h.id}`} hit={h} />
                  ))}
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          placeholder="例：Take Folder は Pro Tools で何？ / クリックが聞こえない / Fade のショートカット"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              ask(input);
            }
          }}
        />
        <button className="btn primary" type="submit" disabled={!input.trim()}>
          質問
        </button>
        {turns.length > 0 && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setTurns([]);
              kvSet(storeKey, []);
            }}
          >
            クリア
          </button>
        )}
      </form>
      <p className="ai-note">オフライン講師はキーワードで収録内容を探す仕組みです。文章を生成しないので、質問の意図までは汲み取れません。見つからないときは、機能名（Playlist、Clip Gain など）や症状（聞こえない、遅れる など）を含めて質問してください。</p>
    </>
  );
}

function NoHit() {
  const sample = ["Playlist", "Clip Gain", "Smart Tool", "Aux Input", "Elastic Audio", "Beat Detective"];
  return (
    <span>
      関連する内容が見つかりませんでした。機能名や症状を含めて言い換えてみてください。
      <br />
      <span className="small muted">収録されている用語の例：{sample.join("、")} … </span>
      <a className="small" href="#/glossary">
        用語辞典を見る
      </a>
    </span>
  );
}

function HitCard({ hit }: { hit: Hit }) {
  const { data } = useProgress();
  const os = data.settings.os;

  if (hit.kind === "term") {
    const g = glossary.find((x) => x.term === hit.id);
    if (!g) return null;
    return (
      <div className="hit">
        <div className="hit-head">
          <span className="hit-kind">用語</span>
          <a href={`#/glossary/${encodeURIComponent(g.term)}`}>
            <strong>{g.term}</strong>
          </a>
          <span className="muted small">{g.ja}</span>
        </div>
        <p>{g.desc}</p>
        <div className="logic-box">
          <span className="logic-label">
            Logic Pro：{g.logic.name} <MatchBadge match={g.logic.match} />
          </span>
          {g.logic.note}
        </div>
        {g.howto && <p className="small">操作：{g.howto}</p>}
      </div>
    );
  }

  if (hit.kind === "lesson") {
    const l = getLesson(hit.id);
    if (!l) return null;
    return (
      <div className="hit">
        <div className="hit-head">
          <span className="hit-kind">教材</span>
          <a href={`#/lesson/${l.id}`}>
            <strong>{l.title}</strong>
          </a>
          <span className="muted small">LEVEL {l.level}</span>
        </div>
        <ul className="list small">
          {hit.snippets.map((s) => (
            <li key={s}>
              <Rich text={s} />
            </li>
          ))}
        </ul>
        <div className="logic-box">
          <span className="logic-label">
            Logic Pro：{l.logic.logicName} <MatchBadge match={l.logic.match} />
          </span>
          {l.logic.equivalent}
        </div>
        {l.unverified.length > 0 && (
          <p className="small muted">
            <Unverified /> この教材には公式資料での確認が必要な項目があります
          </p>
        )}
      </div>
    );
  }

  if (hit.kind === "trouble") {
    const t = getTrouble(hit.id);
    if (!t) return null;
    return (
      <div className="hit">
        <div className="hit-head">
          <span className="hit-kind trouble-kind">トラブル</span>
          <a href={`#/simulator/trouble/${t.id}`}>
            <strong>{t.title}</strong>
          </a>
        </div>
        <p className="small">{t.cause.explanation}</p>
        <span className="small muted">対応の順序：</span>
        <ol className="list small">
          {t.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="small">
          <a href={`#/simulator/trouble/${t.id}`}>このトラブルを演習する →</a>
        </p>
      </div>
    );
  }

  const s = getShortcut(hit.id);
  if (!s) return null;
  return (
    <div className="hit">
      <div className="hit-head">
        <span className="hit-kind">ショートカット</span>
        <strong>{s.action}</strong>
        <kbd>{os === "mac" ? s.mac : s.win}</kbd>
        {s.unverified && <Unverified />}
      </div>
      {s.logic && <p className="small muted">Logic Pro：{s.logic}</p>}
    </div>
  );
}
