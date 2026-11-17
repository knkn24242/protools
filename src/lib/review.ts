// 復習システム（間隔反復 / Leitner方式）
//  - 間違えると box 0・今日が復習日として追加される
//  - 復習日以降に正解すると box が上がり、次の復習日が [1, 3, 7, 14] 日後になる
//  - box 4 の状態で正解すると「定着」とみなし復習リストから外れる
//  - 復習日前に正解しても間隔は変えない（覚えたての一時的な正解を除外するため）
import type { ReviewItem, ReviewKind } from "../types";

export const INTERVALS = [1, 3, 7, 14];
export const MAX_BOX = 4;

export function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayStr(): string {
  return dateStr(new Date());
}

export function addDays(base: string, days: number): string {
  const [y, m, d] = base.split("-").map(Number);
  return dateStr(new Date(y, m - 1, d + days));
}

export function applyReview(list: ReviewItem[], kind: ReviewKind, id: string, correct: boolean): ReviewItem[] {
  const today = todayStr();
  const i = list.findIndex((r) => r.kind === kind && r.id === id);
  const cur = i >= 0 ? list[i] : undefined;
  const rest = list.filter((_, n) => n !== i);
  if (!correct) {
    return [...rest, { kind, id, box: 0, due: today, addedAt: cur?.addedAt ?? Date.now(), lapses: (cur?.lapses ?? 0) + (cur ? 1 : 0) }];
  }
  if (!cur) return list;
  if (cur.due > today) return list; // まだ復習日ではない
  if (cur.box >= MAX_BOX) return rest; // 定着
  const box = cur.box + 1;
  const next = [...rest, { ...cur, box, due: addDays(today, INTERVALS[cur.box]) }];
  return next;
}

export function dueItems(list: ReviewItem[], kind?: ReviewKind): ReviewItem[] {
  const today = todayStr();
  return list.filter((r) => r.due <= today && (!kind || r.kind === kind)).sort((a, b) => a.due.localeCompare(b.due) || a.box - b.box);
}

export function upcoming(list: ReviewItem[], days: number): { date: string; count: number }[] {
  const today = todayStr();
  return Array.from({ length: days }, (_, n) => {
    const date = addDays(today, n);
    return { date, count: list.filter((r) => (n === 0 ? r.due <= date : r.due === date)).length };
  });
}
