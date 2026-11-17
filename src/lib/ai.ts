// ===== AI 機能（PHASE 4）=====
// API 接続が必要な機能はこのファイルに集約し、オフライン機能から分離している。
//  - SDK は使用時に動的 import するため、AI を使わなければ読み込まれない（オフライン動作に影響しない）
//  - API キーは このブラウザの IndexedDB にのみ保存し、送信先は Anthropic API（api.anthropic.com）だけ
//  - 進捗のエクスポートには API キーを含めない
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { kvDelete, kvGet, kvSet } from "./db";

export type AiModel = "claude-opus-5-5" | "claude-sonnet-5-5" | "claude-haiku-5-5";

export interface AiConfig {
  apiKey: string;
  model: AiModel;
}

export const MODEL_LABEL: Record<AiModel, string> = {
  "claude-opus-5-5": "Claude Opus 5.5（推奨・最も高精度）",
  "claude-sonnet-5-5": "Claude Sonnet 5.5（高速・低コスト）",
  "claude-haiku-5-5": "Claude Haiku 5.5（最速・最低コスト）",
};

const CONFIG_KEY = "ai-config";
let cached: AiConfig | null | undefined;

export async function loadAiConfig(): Promise<AiConfig | null> {
  if (cached !== undefined) return cached;
  cached = (await kvGet<AiConfig>(CONFIG_KEY)) ?? null;
  return cached;
}

export async function saveAiConfig(c: AiConfig): Promise<void> {
  cached = c;
  await kvSet(CONFIG_KEY, c);
}

export async function clearAiConfig(): Promise<void> {
  cached = null;
  await kvDelete(CONFIG_KEY);
}

export class AiError extends Error {}

async function getClient(): Promise<{ client: Anthropic; model: AiModel; mod: typeof import("@anthropic-ai/sdk") }> {
  const cfg = await loadAiConfig();
  if (!cfg?.apiKey) throw new AiError("AI 機能を使うには Settings で API キーを設定してください。");
  if (!navigator.onLine) throw new AiError("オフラインのため AI 機能は使えません。教材・問題演習などは引き続き利用できます。");
  const mod = await import("@anthropic-ai/sdk");
  // 個人用のローカルアプリで、本人の API キーを本人のブラウザから使う前提でブラウザ実行を許可している
  const client = new mod.default({ apiKey: cfg.apiKey, dangerouslyAllowBrowser: true });
  return { client, model: cfg.model, mod };
}

/** 安全分類器による拒否時に、サーバー側で別モデルへ自動フォールバックする（Opus 5.5 / Sonnet 5.5） */
function fallbackParams(model: AiModel) {
  return model === "claude-haiku-5-5" ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };
}

/** SDK の例外を利用者向けの日本語メッセージに変換 */
export function describeError(e: unknown, mod?: typeof import("@anthropic-ai/sdk")): string {
  if (e instanceof AiError) return e.message;
  const A = mod?.default;
  if (A) {
    if (e instanceof A.AuthenticationError) return "API キーが無効です。Settings で確認してください。";
    if (e instanceof A.PermissionDeniedError) return "この API キーでは選択したモデルを利用できません。";
    if (e instanceof A.RateLimitError) return "利用制限に達しました。しばらく待ってから再試行してください。";
    if (e instanceof A.BadRequestError) return `リクエストエラー：${e.message}`;
    if (e instanceof A.APIConnectionError) return "API に接続できません。ネットワークを確認してください。";
    if (e instanceof A.APIError) return `API エラー（${e.status}）：${e.message}`;
  }
  return `エラー：${(e as Error)?.message ?? String(e)}`;
}

async function run<T>(fn: (c: Awaited<ReturnType<typeof getClient>>) => Promise<T>): Promise<T> {
  let ctx: Awaited<ReturnType<typeof getClient>> | undefined;
  try {
    ctx = await getClient();
    return await fn(ctx);
  } catch (e) {
    throw new AiError(describeError(e, ctx?.mod));
  }
}

function checkRefusal(res: { stop_reason: string | null }) {
  if (res.stop_reason === "refusal") throw new AiError("AI がこのリクエストへの回答を控えました。質問の表現を変えてお試しください。");
}

// ===== 共通のシステムプロンプト（固定部分はキャッシュ対象）=====

const BASE_SYSTEM = `あなたは「Pro Tools Academy」の講師です。学習者は Logic Pro での音楽制作経験があり、Pro Tools を習得して商業スタジオのアシスタントエンジニアになることを目指しています。

## 正確性のルール（最重要）
- Pro Tools の操作方法・メニュー名・ショートカット・仕様について、確証のないことを事実として述べないでください。確信が持てない点は「要確認」と明記し、Avid 公式ユーザーガイド（Pro Tools Reference Guide）や Avid ナレッジベースでの確認を勧めてください。
- 仕様が Pro Tools のバージョンやエディション（Artist / Studio / Ultimate、HDX / ネイティブ）で異なる可能性がある場合は、そう伝えてください。
- Logic Pro と比較するときは「完全一致」「類似概念」「対応機能なし」を区別し、似ているだけの機能を同一視しないでください。
- 架空のメニュー、架空のショートカット、架空の機能名を作らないでください。

## 教え方
- DAW の一般的な概念は理解している前提で、Logic Pro の知識を Pro Tools の知識に「翻訳」する形で説明してください。
- 現場で英語のまま使われる用語は英語のまま使ってください。
- 操作だけでなく、スタジオ現場での判断（優先順位、エンジニアへの報告、演奏者への配慮）にも触れてください。
- 回答は日本語で、要点を先に、簡潔に。必要に応じて箇条書きを使ってください。`;

// ===== AI 講師（チャット）=====

export interface TutorMessage {
  role: "user" | "assistant";
  content: string;
}

export async function tutorStream(history: TutorMessage[], context: string, onText: (delta: string) => void): Promise<string> {
  return run(async ({ client, model }) => {
    const stream = client.beta.messages.stream({
      model,
      max_tokens: 16000,
      ...fallbackParams(model),
      output_config: { effort: "medium" },
      system: [
        { type: "text", text: BASE_SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: `## 学習者と画面の状況\n${context}` },
      ],
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });
    stream.on("text", onText);
    const final = await stream.finalMessage();
    checkRefusal(final);
    return final.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");
  });
}

// ===== 実技課題のスクリーンショット確認 =====

const ShotCheckSchema = z.object({
  conditions: z.array(
    z.object({
      index: z.number().describe("完成条件の番号（0始まり）"),
      status: z.enum(["met", "not_met", "cannot_determine"]),
      evidence: z.string().describe("画像から読み取れた根拠、または判定できない理由"),
    }),
  ),
  comment: z.string().describe("全体の所見"),
  advice: z.array(z.string()).describe("次に確認・修正すべき点"),
});
export type ShotCheck = z.infer<typeof ShotCheckSchema>;

export async function checkScreenshots(task: { title: string; description: string; conditions: string[] }, images: Blob[]): Promise<ShotCheck> {
  const encoded = await Promise.all(images.slice(0, 6).map(blobToBase64));
  return run(async ({ client, model, mod }) => {
    const { betaZodOutputFormat } = await import("@anthropic-ai/sdk/helpers/beta/zod");
    void mod;
    const res = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      ...fallbackParams(model),
      output_config: { effort: "high", format: betaZodOutputFormat(ShotCheckSchema) },
      system: [{ type: "text", text: BASE_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            ...encoded.map((data) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data } })),
            {
              type: "text",
              text: `学習者が Pro Tools の実技課題に取り組み、画面のスクリーンショットを提出しました。各完成条件が画像から確認できるかを判定してください。

課題：${task.title}
内容：${task.description}
完成条件：
${task.conditions.map((c, i) => `${i}. ${c}`).join("\n")}

判定のルール：
- 画像から明確に読み取れる場合だけ "met" または "not_met" にしてください。
- 画像に写っていない、解像度が足りない、画面だけでは判断できない条件（音が鳴るか、クリックノイズの有無など）は "cannot_determine" にし、どの画面を撮れば確認できるかを evidence に書いてください。
- 推測で合格にしないでください。`,
            },
          ],
        },
      ],
    });
    checkRefusal(res);
    if (!res.parsed_output) throw new AiError("AI の判定結果を読み取れませんでした。もう一度お試しください。");
    return res.parsed_output;
  });
}

// ===== 記述式問題の採点 =====

const GradeSchema = z.object({
  verdict: z.enum(["pass", "partial", "fail"]),
  score: z.number().describe("0〜100"),
  covered: z.array(z.string()).describe("解答に含まれていた採点ポイント"),
  missing: z.array(z.string()).describe("不足していた採点ポイント"),
  errors: z.array(z.string()).describe("解答中の事実誤り（なければ空）"),
  comment: z.string(),
});
export type Grade = z.infer<typeof GradeSchema>;

export async function gradeWritten(q: { q: string; modelAnswer?: string; points?: string[] }, answer: string): Promise<Grade> {
  return run(async ({ client, model }) => {
    const { betaZodOutputFormat } = await import("@anthropic-ai/sdk/helpers/beta/zod");
    const res = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      ...fallbackParams(model),
      output_config: { effort: "medium", format: betaZodOutputFormat(GradeSchema) },
      system: [{ type: "text", text: BASE_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: `記述式問題の解答を採点してください。採点ポイントの半分以上を正しく含み、重大な誤りがなければ pass、一部のみなら partial、それ以外は fail としてください。

問題：${q.q}
模範解答：${q.modelAnswer ?? "（なし）"}
採点ポイント：
${(q.points ?? []).map((p) => `- ${p}`).join("\n")}

学習者の解答：
"""
${answer}
"""`,
        },
      ],
    });
    checkRefusal(res);
    if (!res.parsed_output) throw new AiError("採点結果を読み取れませんでした。");
    return res.parsed_output;
  });
}

// ===== 学習アドバイス（苦手分野に応じた学習計画）=====

const CoachSchema = z.object({
  summary: z.string().describe("現在の状況の要約（2〜3文）"),
  focus: z.array(
    z.object({
      area: z.string(),
      reason: z.string(),
      actions: z.array(z.string()),
    }),
  ),
  lessonIds: z.array(z.string()).describe("次に学ぶべき教材のID（提示された一覧から選ぶ）"),
  taskIds: z.array(z.string()).describe("取り組むべき実技課題のID（提示された一覧から選ぶ）"),
  troubleIds: z.array(z.string()).describe("練習すべきトラブル演習のID（提示された一覧から選ぶ）"),
  weekPlan: z.array(z.object({ day: z.string(), plan: z.string() })).describe("今後7日間の学習プラン"),
  encouragement: z.string(),
});
export type Coach = z.infer<typeof CoachSchema>;

export async function coachAdvice(progressSummary: string, dailyMinutes: number): Promise<Coach> {
  return run(async ({ client, model }) => {
    const { betaZodOutputFormat } = await import("@anthropic-ai/sdk/helpers/beta/zod");
    const res = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      ...fallbackParams(model),
      output_config: { effort: "high", format: betaZodOutputFormat(CoachSchema) },
      system: [{ type: "text", text: BASE_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: `学習者の進捗データをもとに、苦手分野を克服し「実際のスタジオで操作・判断・対応できる」状態に近づくための学習計画を作ってください。1日の学習時間は ${dailyMinutes} 分です。
推薦する教材・課題・トラブル演習は、必ず下の一覧にある ID から選んでください。一覧にないものを作らないでください。

${progressSummary}`,
        },
      ],
    });
    checkRefusal(res);
    if (!res.parsed_output) throw new AiError("アドバイスを読み取れませんでした。");
    return res.parsed_output;
  });
}

/** 接続テスト（短い応答だけを要求） */
export async function testConnection(): Promise<string> {
  return run(async ({ client, model }) => {
    const res = await client.beta.messages.create({
      model,
      max_tokens: 1024,
      ...fallbackParams(model),
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "「接続OK」とだけ返してください。" }],
    });
    checkRefusal(res);
    return res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
  });
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}
