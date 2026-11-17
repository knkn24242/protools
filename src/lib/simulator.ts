// Studio Simulator の進行と採点
import type { SimEventResult, SimProject, SimRun, Trouble, TroubleResult } from "../types";
import { getProject, troubles } from "./content";

export interface SimEvent {
  type: "stage" | "trouble";
  id: string;
}

/** 案件ごとに発生しうるトラブルからランダムに選ぶ */
export function pickTroubles(p: SimProject): string[] {
  const stageIds = new Set(p.stages.map((s) => s.id));
  const pool = troubles.filter((t) => t.stages.some((s) => stageIds.has(s)));
  return pool
    .map((t) => ({ t, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .slice(0, p.troubleCount)
    .map((x) => x.t.id);
}

/** ステージの後に、そのステージで発生するトラブルを挿入したイベント列 */
export function buildEvents(run: SimRun): SimEvent[] {
  const p = getProject(run.projectId);
  if (!p) return [];
  const out: SimEvent[] = [];
  for (const s of p.stages) {
    out.push({ type: "stage", id: s.id });
    for (const tid of run.troubleIds) {
      const t = troubles.find((x) => x.id === tid);
      // 複数ステージに該当する場合は最初に該当したステージで1回だけ発生
      if (t && t.stages.find((sid) => p.stages.some((ps) => ps.id === sid)) === s.id) out.push({ type: "trouble", id: tid });
    }
  }
  return out;
}

/**
 * 対応手順の採点
 *  - 原因の特定 30%
 *  - 正しい手順の網羅 × 前後関係の正しさ（ペア比較）50%
 *  - 最初の一手が正しいか 20%
 *  - 不要／不適切な対応を選ぶごとに -0.15
 */
export function scoreTrouble(t: Trouble, causeCorrect: boolean, sequence: number[]): TroubleResult {
  const n = t.steps.length;
  const chosen = sequence.filter((i) => i < n);
  const distractorsChosen = sequence.filter((i) => i >= n).length;
  const coverage = chosen.length / n;
  let pairs = 0;
  let ok = 0;
  for (let a = 0; a < chosen.length; a++)
    for (let b = a + 1; b < chosen.length; b++) {
      pairs++;
      if (chosen[a] < chosen[b]) ok++;
    }
  const orderScore = (pairs ? ok / pairs : chosen.length ? 1 : 0) * coverage;
  const firstCorrect = sequence[0] === 0;
  const score = Math.max(0, Math.min(1, (causeCorrect ? 0.3 : 0) + orderScore * 0.5 + (firstCorrect ? 0.2 : 0) - distractorsChosen * 0.15));
  return { causeCorrect, orderScore, firstCorrect, distractorsChosen, score, sequence };
}

export function runScore(results: SimEventResult[]): number {
  let total = 0;
  let got = 0;
  for (const r of results) {
    if (r.type === "stage") {
      total += 10;
      if (r.decisionCorrect) got += 10;
    } else if (r.trouble) {
      total += 25;
      got += 25 * r.trouble.score;
    }
  }
  return total ? got / total : 0;
}

export function rankOf(score: number): string {
  if (score >= 0.9) return "S";
  if (score >= 0.75) return "A";
  if (score >= 0.6) return "B";
  return "C";
}
