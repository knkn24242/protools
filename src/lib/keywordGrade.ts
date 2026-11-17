// 記述式問題のキーワード採点（API 不要）
// 採点ポイントごとに「キーワードのグループ」を持ち、全グループで1語以上含まれていればそのポイントを満たすとみなす。
import type { Question } from "../types";

function norm(s: string): string {
  return s
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toLowerCase()
    .replace(/\s+/g, "");
}

export interface KeywordGrade {
  points: { covered: boolean; found: string[] }[];
  covered: number;
  total: number;
  verdict: "pass" | "partial" | "fail";
}

export function keywordGrade(q: Question, answer: string): KeywordGrade | null {
  if (!q.points?.length || !q.pointKeywords?.length) return null;
  const a = norm(answer);
  const points = q.pointKeywords.map((groups) => {
    const found: string[] = [];
    const covered = groups.every((g) => {
      const hit = g.find((k) => a.includes(norm(k)));
      if (hit) found.push(hit);
      return !!hit;
    });
    return { covered, found };
  });
  const covered = points.filter((p) => p.covered).length;
  const total = points.length;
  const verdict = covered / total >= 0.75 ? "pass" : covered / total >= 0.4 ? "partial" : "fail";
  return { points, covered, total, verdict };
}
