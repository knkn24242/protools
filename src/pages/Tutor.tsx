import { useEffect, useRef, useState } from "react";
import { getLesson, getTask, getTrouble } from "../lib/content";
import { learnerContext } from "../lib/adaptive";
import { tutorStream, type TutorMessage } from "../lib/ai";
import { kvGet, kvSet } from "../lib/db";
import { useAi } from "../lib/useAi";
import { useProgress, useStudyTimer } from "../lib/store";
import { Card, Rich } from "../components/ui";
import OfflineTutor from "../components/OfflineTutor";

interface TutorContext {
  key: string;
  label: string;
  offlineSuggestions: string[];
  text: string;
  suggestions: string[];
}

function buildContext(kind?: string, id?: string): TutorContext {
  if (kind === "lesson" && id) {
    const l = getLesson(id);
    if (l)
      return {
        key: `lesson:${id}`,
        label: `教材：${l.title}`,
        text: `学習者は教材「${l.title}」（LEVEL ${l.level}、${l.ptVersion}）を読んでいます。教材の内容（AI が作成した下書きで公式照合前。誤りに気づいたら指摘してください）：\n${JSON.stringify(
          { overview: l.overview, steps: l.steps, logic: l.logic, cautions: l.cautions, mistakes: l.mistakes, unverified: l.unverified },
        )}`,
        offlineSuggestions: [...l.terms.map((t) => t.term).slice(0, 4), `${l.logic.logicName.split("／")[0].split("/")[0].trim()} との違い`],
        suggestions: [
          "この機能を Logic Pro ユーザー向けにもう一度かみ砕いて説明して",
          "現場でこの機能を使う具体的な場面をもう1つ教えて",
          "この教材の「要確認」項目について、どう確認すればいい？",
          "理解度を確かめる問題を1問出して",
        ],
      };
  }
  if (kind === "trouble" && id) {
    const t = getTrouble(id);
    if (t)
      return {
        key: `trouble:${id}`,
        label: `トラブル演習：${t.title}`,
        text: `学習者はトラブル演習「${t.title}」に取り組みました。状況：${t.situation}\n想定している対応手順：${t.steps.join(" → ")}`,
        offlineSuggestions: [t.title, ...t.cause.choices.slice(0, 0)],
        suggestions: ["なぜこの順番で確認するのが良いの？", "似たトラブルで別の原因が考えられるケースは？", "エンジニアへの報告の仕方をもっと教えて"],
      };
  }
  if (kind === "task" && id) {
    const t = getTask(id);
    if (t)
      return {
        key: `task:${id}`,
        label: `実技課題：${t.title}`,
        text: `学習者は実技課題「${t.title}」に取り組んでいます。内容：${t.description}\n完成条件：${t.conditions.join(" / ")}`,
        offlineSuggestions: [t.title.split(/[：:]/)[0], ...t.hints.slice(0, 2)],
        suggestions: ["この課題の進め方を順番に教えて", "うまくいかないときに確認すべきポイントは？", "Logic Pro でのやり方とどこが違う？"],
      };
  }
  return {
    key: "general",
    label: "全般",
    text: "学習者は特定の教材を開いていません。",
    offlineSuggestions: ["Take Folder と Playlist", "Clip Gain", "Smart Tool のショートカット", "クリックが聞こえない", "Flex Time", "Save Copy In"],
    suggestions: ["今の自分の苦手分野に合わせて、今日やるべきことを教えて", "Logic Pro の Take Folder と Pro Tools の Playlist の違いを整理して", "アシスタントエンジニアがセッション前に確認すべきことは？", "Pro Tools の Edit Mode でよくある事故と防ぎ方は？"],
  };
}

export default function TutorPage({ kind, id }: { kind?: string; id?: string }) {
  const { ready } = useAi();
  useStudyTimer(null);
  const ctx = buildContext(kind, id);
  const [mode, setMode] = useState<"offline" | "ai">("offline");
  return (
    <div className="page">
      <h1>Tutor</h1>
      <p className="lead">質問すると、アプリに収録された教材・用語辞典・トラブル事例・ショートカットから関連する内容を探して表示します。API なし・オフラインで動作し、収録済みの内容だけを返すため架空の情報は混ざりません。</p>
      <div className="row-between">
        <span className="context-chip">
          文脈：{ctx.label}
          {ctx.key !== "general" && <a href="#/tutor">全般に切り替え</a>}
        </span>
        {ready && (
          <div className="seg small-seg">
            <button className={mode === "offline" ? "on" : ""} onClick={() => setMode("offline")}>
              オフライン講師
            </button>
            <button className={mode === "ai" ? "on" : ""} onClick={() => setMode("ai")}>
              AI講師（API）
            </button>
          </div>
        )}
      </div>
      {mode === "ai" && ready ? <AiChat ctx={ctx} /> : <OfflineTutor ctxKey={ctx.key} lessonId={kind === "lesson" ? id : undefined} suggestions={ctx.offlineSuggestions} />}
    </div>
  );
}

function AiChat({ ctx }: { ctx: TutorContext }) {
  const { data } = useProgress();
  const { config, online, ready } = useAi();
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const storeKey = `tutor:${ctx.key}`;

  useEffect(() => {
    kvGet<TutorMessage[]>(storeKey).then((m) => setMessages(m ?? []));
    setError("");
  }, [storeKey]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, streaming]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: TutorMessage[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError("");
    setStreaming("");
    try {
      let acc = "";
      const answer = await tutorStream(next, `${learnerContext(data)}\n\n${ctx.text}`, (d) => {
        acc += d;
        setStreaming(acc);
      });
      const saved: TutorMessage[] = [...next, { role: "assistant", content: answer }];
      setMessages(saved);
      kvSet(storeKey, saved.slice(-40));
    } catch (e) {
      setError((e as Error).message);
      setMessages(messages); // 送信できなかった質問は入力欄に戻す
      setInput(q);
    }
    setStreaming("");
    setBusy(false);
  };

  return (
    <div className="ai-chat-wrap">
      <div className="row-between">
        <span className="small muted">{config ? `AI講師（${config.model}）。質問と学習状況の要約が Anthropic API に送信されます。` : ""}</span>
        {messages.length > 0 && (
          <button
            className="btn ghost small"
            onClick={() => {
              if (!confirm("この会話を消去しますか？")) return;
              setMessages([]);
              kvSet(storeKey, []);
            }}
          >
            会話をクリア
          </button>
        )}
      </div>
      {!ready ? (
        <Card>
          {!config?.apiKey ? (
            <p>
              AI Tutor を使うには <a href="#/settings">Settings</a> で Claude API キーを設定してください。教材・問題演習・シミュレーターなどは API なしで利用できます。
            </p>
          ) : (
            !online && <p>オフラインのため AI Tutor は使えません。オンラインになると利用できます。</p>
          )}
        </Card>
      ) : (
        <>
          <div className="chat" aria-live="polite">
            {messages.length === 0 && !busy && (
              <Card>
                <p className="small muted">質問の例：</p>
                <div className="suggest">
                  {ctx.suggestions.map((s) => (
                    <button key={s} onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </Card>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.role === "assistant" ? <AssistantText text={m.content} /> : m.content}
              </div>
            ))}
            {busy && <div className="msg assistant">{streaming ? <AssistantText text={streaming} /> : <span className="muted">考えています…</span>}</div>}
            {error && <div className="msg error">{error}</div>}
            <div ref={bottom} />
          </div>
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="質問を入力（Ctrl / Cmd + Enter で送信）"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  send(input);
                }
              }}
              disabled={busy}
            />
            <button className="btn primary" type="submit" disabled={busy || !input.trim()}>
              送信
            </button>
          </form>
          <p className="ai-note">
            AI の回答には誤りが含まれる可能性があります。操作方法・ショートカットは Avid 公式ガイドで確認してください。質問と学習状況の要約は Anthropic API に送信されます。
          </p>
        </>
      )}
    </div>
  );
}

/** 回答テキストの簡易表示（見出し・箇条書き・太字） */
function AssistantText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        const h = line.match(/^#{1,4}\s+(.*)/);
        if (h)
          return (
            <strong key={i} className="msg-h">
              {h[1]}
              {"\n"}
            </strong>
          );
        return (
          <span key={i}>
            <Rich text={line} />
            {"\n"}
          </span>
        );
      })}
    </>
  );
}
