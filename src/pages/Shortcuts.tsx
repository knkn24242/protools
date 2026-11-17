import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shortcuts } from "../lib/content";
import { pct, SHORTCUT_MASTER_STREAK, shortcutStats } from "../lib/metrics";
import { useProgress, useStudyTimer } from "../lib/store";
import { Bar, Card, Unverified } from "../components/ui";
import type { ProgressData, ShortcutItem } from "../types";

// ===== キー入力の判定 =====
const MOD_ORDER = ["ctrl", "alt", "shift", "meta"];
const CODE_MAP: Record<string, string> = {
  Equal: "=",
  Minus: "-",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  IntlYen: "\\",
  IntlRo: "\\",
  Semicolon: ";",
  Space: "space",
  Escape: "escape",
  Enter: "enter",
  NumpadEnter: "numpadenter",
  Tab: "tab",
  ArrowUp: "arrowup",
  ArrowDown: "arrowdown",
  ArrowLeft: "arrowleft",
  ArrowRight: "arrowright",
};
const SYMBOLS = new Set(["=", "-", "[", "]", "\\", ";"]);

function normalizeCombo(s: string): string {
  const parts = s.toLowerCase().split("+");
  // "+" 自体はキーとして使っていないので単純分割でよい
  const key = parts.pop()!;
  const mods = MOD_ORDER.filter((m) => parts.includes(m));
  return [...mods, key].join("+");
}

/** KeyboardEvent から判定候補の文字列を作る（物理キー基準と文字基準の両方） */
function eventCombos(e: KeyboardEvent): string[] {
  if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return [];
  const mods = (shift: boolean) =>
    MOD_ORDER.filter((m) => (m === "ctrl" ? e.ctrlKey : m === "alt" ? e.altKey : m === "shift" ? shift && e.shiftKey : e.metaKey));
  let codeKey: string | undefined;
  if (e.code.startsWith("Key")) codeKey = e.code.slice(3).toLowerCase();
  else if (e.code.startsWith("Digit")) codeKey = e.code.slice(5);
  else if (/^Numpad\d$/.test(e.code)) codeKey = e.code.toLowerCase();
  else if (/^F\d{1,2}$/.test(e.code)) codeKey = e.code.toLowerCase();
  else codeKey = CODE_MAP[e.code];
  const out: string[] = [];
  if (codeKey) out.push([...mods(true), codeKey].join("+"));
  // JIS配列などで記号の位置が違う場合に備え、入力文字でも判定（Shiftは無視）
  if (SYMBOLS.has(e.key)) out.push([...mods(false), e.key].join("+"));
  return out;
}

function describeEvent(e: KeyboardEvent, os: "mac" | "win"): string {
  const names: string[] = [];
  if (e.ctrlKey) names.push(os === "mac" ? "Control" : "Ctrl");
  if (e.altKey) names.push(os === "mac" ? "Option" : "Alt");
  if (e.shiftKey) names.push("Shift");
  if (e.metaKey) names.push(os === "mac" ? "Cmd" : "Win");
  names.push(e.code === "Space" ? "Space" : e.code.replace(/^Key|^Digit/, ""));
  return names.join(" + ");
}

const keysFor = (s: ShortcutItem, os: "mac" | "win") => (os === "mac" ? s.macKeys : s.winKeys) ?? [];

// ===== 出題 =====
function weight(s: ShortcutItem, d: ProgressData): number {
  const r = d.shortcuts[s.id];
  if (!r) return 2;
  const acc = r.correct / r.attempts;
  const avgMs = r.totalMs / r.attempts;
  let w = 0.3 + (1 - acc) * 3 + Math.min(2, avgMs / 4000);
  if (r.streak >= SHORTCUT_MASTER_STREAK) w *= 0.3;
  return w;
}

function pick(pool: ShortcutItem[], d: ProgressData, n: number, weakFocus: boolean): ShortcutItem[] {
  const items = pool.map((s) => ({ s, w: weakFocus ? weight(s, d) : 1 }));
  const out: ShortcutItem[] = [];
  while (out.length < n && items.length) {
    const total = items.reduce((a, x) => a + x.w, 0);
    let r = Math.random() * total;
    const i = items.findIndex((x) => (r -= x.w) <= 0);
    out.push(items.splice(i < 0 ? 0 : i, 1)[0].s);
  }
  return out;
}

export function makeChoices(target: ShortcutItem, os: "mac" | "win"): string[] {
  const label = (s: ShortcutItem) => (os === "mac" ? s.mac : s.win);
  const others = [...new Set(shortcuts.filter((s) => label(s) !== label(target)).map(label))];
  // 同じカテゴリーの紛らわしい選択肢を優先
  const same = shortcuts.filter((s) => s.category === target.category && label(s) !== label(target)).map(label);
  const pool = [...new Set([...same.sort(() => Math.random() - 0.5).slice(0, 2), ...others.sort(() => Math.random() - 0.5)])];
  return [label(target), ...pool.slice(0, 3)].sort(() => Math.random() - 0.5);
}

type Tab = "train" | "list";

export default function ShortcutsPage() {
  const store = useProgress();
  const { data } = store;
  useStudyTimer(null);
  const os = data.settings.os;
  const [tab, setTab] = useState<Tab>("train");
  const [category, setCategory] = useState("all");
  const [count, setCount] = useState(10);
  const [weakFocus, setWeakFocus] = useState(true);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [session, setSession] = useState<ShortcutItem[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [log, setLog] = useState<{ ok: boolean; ms: number }[]>([]);
  const [feedback, setFeedback] = useState<null | { ok: boolean; pressed?: string; timeout?: boolean }>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  const mode = data.settings.shortcutMode;
  const limit = data.settings.shortcutTimeLimit;
  const categoriesList = useMemo(() => [...new Set(shortcuts.map((s) => s.category))], []);

  const pool = shortcuts.filter((s) => {
    if (category !== "all" && s.category !== category) return false;
    if (mode === "keys" && keysFor(s, os).length === 0) return false;
    if (reviewOnly) {
      const r = data.shortcuts[s.id];
      return !!r && r.streak < SHORTCUT_MASTER_STREAK;
    }
    return true;
  });

  const current = session?.[idx];

  const begin = () => {
    const qs = pick(pool, data, Math.min(count, pool.length), weakFocus);
    if (!qs.length) return;
    setSession(qs);
    setIdx(0);
    setLog([]);
    setFeedback(null);
  };

  // 問題が変わるたびにタイマーと選択肢を初期化
  useEffect(() => {
    if (!current) return;
    startedAt.current = performance.now();
    setElapsed(0);
    setChoices(makeChoices(current, os));
  }, [current, os]);

  const answer = useCallback(
    (ok: boolean, extra?: { pressed?: string; timeout?: boolean }) => {
      if (!current || feedback) return;
      const ms = Math.round(performance.now() - startedAt.current);
      store.recordShortcut(current.id, ok, ms);
      setLog((l) => [...l, { ok, ms }]);
      setFeedback({ ok, ...extra });
    },
    [current, feedback, store],
  );

  // 制限時間
  useEffect(() => {
    if (!current || feedback) return;
    const t = window.setInterval(() => {
      const e = (performance.now() - startedAt.current) / 1000;
      setElapsed(e);
      if (limit > 0 && e >= limit) answer(false, { timeout: true });
    }, 100);
    return () => window.clearInterval(t);
  }, [current, feedback, limit, answer]);

  // キー入力モード
  useEffect(() => {
    if (!current || feedback || mode !== "keys") return;
    const on = (e: KeyboardEvent) => {
      const combos = eventCombos(e);
      if (!combos.length) return;
      e.preventDefault();
      e.stopPropagation();
      const targets = keysFor(current, os).map(normalizeCombo);
      answer(
        combos.some((c) => targets.includes(c)),
        { pressed: describeEvent(e, os) },
      );
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [current, feedback, mode, os, answer]);

  const next = () => {
    setFeedback(null);
    setIdx((i) => i + 1);
  };

  // 正解時は自動で次へ
  useEffect(() => {
    if (feedback?.ok) {
      const t = window.setTimeout(next, 1100);
      return () => window.clearTimeout(t);
    }
  }, [feedback]);

  const st = shortcutStats(data);

  // ===== セッション中 =====
  if (session) {
    if (idx >= session.length) {
      const ok = log.filter((l) => l.ok).length;
      const avg = log.length ? log.reduce((a, l) => a + l.ms, 0) / log.length : 0;
      return (
        <div className="page">
          <h1>Shortcut Training — 結果</h1>
          <Card>
            <div className="big">
              {ok} / {session.length}
            </div>
            <div className="muted">
              正解率 {pct(ok / session.length)} ・ 平均回答時間 {(avg / 1000).toFixed(1)} 秒
            </div>
            <table className="table">
              <tbody>
                {session.map((s, i) => (
                  <tr key={s.id} className={log[i]?.ok ? "" : "row-ng"}>
                    <td>{log[i]?.ok ? "○" : "×"}</td>
                    <td>{s.action}</td>
                    <td>
                      <kbd>{os === "mac" ? s.mac : s.win}</kbd>
                    </td>
                    <td className="muted small">{((log[i]?.ms ?? 0) / 1000).toFixed(1)}秒</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="btn-row">
              <button className="btn primary" onClick={begin}>
                もう一度
              </button>
              <button className="btn" onClick={() => setSession(null)}>
                設定に戻る
              </button>
            </div>
          </Card>
        </div>
      );
    }
    const s = session[idx];
    const remain = limit > 0 ? Math.max(0, limit - elapsed) : null;
    return (
      <div className="page">
        <div className="row-between">
          <h1>Shortcut Training</h1>
          <button className="btn ghost small" onClick={() => setSession(null)}>
            中断
          </button>
        </div>
        <div className="progress-dots">
          {session.map((_, i) => (
            <span key={i} className={i < log.length ? (log[i].ok ? "ok" : "ng") : i === idx ? "cur" : ""} />
          ))}
        </div>
        <Card className="sc-card">
          <div className="muted small">
            {idx + 1} / {session.length} ・ {s.category} ・ {os === "mac" ? "macOS" : "Windows"}
          </div>
          <div className="sc-action">{s.action}</div>
          <div className="lesson-en">{s.actionEn}</div>
          {remain !== null && !feedback && (
            <div className="timer">
              <Bar value={remain / limit} />
              <span className="small muted">{remain.toFixed(1)}秒</span>
            </div>
          )}

          {mode === "keys" && !feedback && <div className="key-wait">キーを押してください</div>}
          {mode === "choice" && (
            <div className="choices">
              {choices.map((c) => {
                const correct = c === (os === "mac" ? s.mac : s.win);
                let cls = "choice mono";
                if (feedback && correct) cls += " correct";
                return (
                  <button key={c} className={cls} disabled={!!feedback && !correct} onClick={() => answer(correct, { pressed: c })}>
                    {c}
                  </button>
                );
              })}
            </div>
          )}

          {feedback && (
            <div className={`explain ${feedback.ok ? "ok" : "ng"}`}>
              <strong>{feedback.ok ? "正解" : feedback.timeout ? "時間切れ" : "不正解"}</strong>
              {!feedback.ok && feedback.pressed && <span className="small muted"> （あなたの入力：{feedback.pressed}）</span>}
              <p>
                正解：<kbd>{os === "mac" ? s.mac : s.win}</kbd>
                {s.unverified && <Unverified />}
              </p>
              {s.logic && (
                <div className="logic-box">
                  <span className="logic-label">Logic Pro</span>
                  {s.logic}
                </div>
              )}
              {s.note && <p className="small muted">{s.note}</p>}
              {!feedback.ok && (
                <button className="btn primary" onClick={next} autoFocus>
                  次へ
                </button>
              )}
            </div>
          )}
        </Card>
      </div>
    );
  }

  // ===== 設定・一覧 =====
  return (
    <div className="page">
      <h1>Shortcut Training</h1>
      <div className="stat-row three">
        <div className="stat">
          <span className="stat-label">習得率（{SHORTCUT_MASTER_STREAK}回連続正解）</span>
          <span className="stat-value">{pct(st.rate)}</span>
          <span className="small muted">
            {st.mastered}/{st.total}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">正解率</span>
          <span className="stat-value">{st.attempts ? pct(st.accuracy) : "—"}</span>
          <span className="small muted">{st.attempts}回回答</span>
        </div>
        <div className="stat">
          <span className="stat-label">平均回答時間</span>
          <span className="stat-value">{st.attempts ? `${(st.avgMs / 1000).toFixed(1)}秒` : "—"}</span>
        </div>
      </div>

      <div className="tabs">
        <button className={tab === "train" ? "on" : ""} onClick={() => setTab("train")}>
          トレーニング
        </button>
        <button className={tab === "list" ? "on" : ""} onClick={() => setTab("list")}>
          一覧・記録
        </button>
      </div>

      {tab === "train" ? (
        <Card title="出題設定">
          <div className="field">
            <span>回答方法</span>
            <div className="seg">
              <button className={mode === "choice" ? "on" : ""} onClick={() => store.setSettings({ shortcutMode: "choice" })}>
                4択
              </button>
              <button className={mode === "keys" ? "on" : ""} onClick={() => store.setSettings({ shortcutMode: "keys" })}>
                実際にキーを押す
              </button>
            </div>
            {mode === "keys" && (
              <span className="small muted">ブラウザが予約しているキー（Cmd/Ctrl + N・T・W など）や同時押しが必要な操作は、キー入力モードでは出題しません。</span>
            )}
          </div>
          <div className="field">
            <span>制限時間</span>
            <div className="seg">
              {[5, 10, 15, 0].map((n) => (
                <button key={n} className={limit === n ? "on" : ""} onClick={() => store.setSettings({ shortcutTimeLimit: n })}>
                  {n ? `${n}秒` : "なし"}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span>カテゴリー</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">すべて</option>
              {categoriesList.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>問題数</span>
            <div className="seg">
              {[10, 20, 30].map((n) => (
                <button key={n} className={count === n ? "on" : ""} onClick={() => setCount(n)}>
                  {n}問
                </button>
              ))}
            </div>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={weakFocus} onChange={(e) => setWeakFocus(e.target.checked)} />
            苦手な操作（不正解・回答が遅いもの）を重点的に出題
          </label>
          <label className="check-row">
            <input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} />
            復習モード（出題済みで、まだ習得していないものだけ）
          </label>
          <p className="small muted">
            OS は Settings の設定（現在：{os === "mac" ? "macOS" : "Windows"}）に従います。出題対象：{pool.length}件
          </p>
          <button className="btn primary" onClick={begin} disabled={pool.length === 0}>
            開始
          </button>
        </Card>
      ) : (
        <ShortcutTable data={data} os={os} />
      )}
    </div>
  );
}

function ShortcutTable({ data, os }: { data: ProgressData; os: "mac" | "win" }) {
  return (
    <Card>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>操作</th>
              <th>{os === "mac" ? "macOS" : "Windows"}</th>
              <th>Logic Pro</th>
              <th>正解率</th>
              <th>平均</th>
            </tr>
          </thead>
          <tbody>
            {shortcuts.map((s) => {
              const r = data.shortcuts[s.id];
              const mastered = (r?.streak ?? 0) >= SHORTCUT_MASTER_STREAK;
              return (
                <tr key={s.id}>
                  <td>
                    {s.action}
                    {mastered && <span className="badge good">習得</span>}
                    <div className="small muted">{s.category}</div>
                  </td>
                  <td>
                    <kbd>{os === "mac" ? s.mac : s.win}</kbd>
                    {s.unverified && <Unverified />}
                  </td>
                  <td className="small">{s.logic ?? "—"}</td>
                  <td className="small">{r ? `${pct(r.correct / r.attempts)}（${r.attempts}）` : "—"}</td>
                  <td className="small">{r ? `${(r.totalMs / r.attempts / 1000).toFixed(1)}秒` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted">対応バージョン：Pro Tools 2023.x〜2024.x。「要確認」は公式資料での確認が取れていないショートカットです。</p>
    </Card>
  );
}
