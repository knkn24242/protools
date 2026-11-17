import type { ReactNode } from "react";
import type { LogicMatch, Shortcut } from "../types";
import { useProgress } from "../lib/store";

/** 教材テキストの簡易マークアップ：**太字**、`コード`、[要確認] */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[要確認\])/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (p.startsWith("`") && p.endsWith("`")) return <code key={i}>{p.slice(1, -1)}</code>;
        if (p === "[要確認]") return <Unverified key={i} />;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

export function Unverified({ label = "要確認" }: { label?: string }) {
  return (
    <span className="badge warn" title="公式資料での確認が取れていない情報です">
      {label}
    </span>
  );
}

export function Kbd({ sc }: { sc: Shortcut }) {
  const { data } = useProgress();
  const os = data.settings.os;
  return (
    <span className="shortcut">
      <span className="os-tag">{os === "mac" ? "Mac" : "Win"}</span>
      <kbd>{os === "mac" ? sc.mac : sc.win}</kbd>
      {sc.unverified && <Unverified />}
    </span>
  );
}

const MATCH_LABEL: Record<LogicMatch, string> = {
  exact: "完全一致",
  similar: "類似概念",
  none: "対応機能なし",
};

export function MatchBadge({ match }: { match: LogicMatch }) {
  return <span className={`badge match-${match}`}>{MATCH_LABEL[match]}</span>;
}

export function Bar({ value, label }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="bar" role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="bar-fill" style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function Card({ title, children, action, className = "" }: { title?: ReactNode; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Difficulty({ n }: { n: number }) {
  return (
    <span className="difficulty" title={`難易度 ${n}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < n ? "on" : ""} />
      ))}
    </span>
  );
}

export function StatusDot({ status }: { status: "not_started" | "in_progress" | "completed" }) {
  const label = { not_started: "未着手", in_progress: "学習中", completed: "完了" }[status];
  return <span className={`status status-${status}`}>{label}</span>;
}
