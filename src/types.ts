// ===== 教材データの型 (content/*.json はこの形に従う) =====

/** Logic Pro との対応関係の種類 */
export type LogicMatch = "exact" | "similar" | "none";

export interface Shortcut {
  mac: string;
  win: string;
  /** 確証がないショートカットは true にして「要確認」表示する */
  unverified?: boolean;
}

export interface LessonStep {
  text: string;
  shortcut?: Shortcut;
}

export interface LogicComparison {
  /** exact = 完全一致 / similar = 類似概念 / none = 対応機能なし */
  match: LogicMatch;
  /** Logic Pro 側の機能名（対応なしの場合は最も近いもの、または "—"） */
  logicName: string;
  /** Logic Pro でいうと何に相当するか */
  equivalent: string;
  /** Logic Pro との違い */
  differences: string[];
  /** Logic Pro での操作（参考） */
  logicShortcut?: string;
}

export interface QuizQuestion {
  q: string;
  choices: string[];
  /** 正解の choices インデックス */
  answer: number;
  explanation: string;
  /** 解説内の Logic Pro 比較 */
  logicNote?: string;
}

export interface Source {
  title: string;
  /** 該当章・項目など。ページ番号は確認できたものだけ記載する */
  section?: string;
  url?: string;
}

export interface Term {
  term: string;
  desc: string;
}

export interface Lesson {
  id: string;
  level: number;
  order: number;
  title: string;
  titleEn: string;
  category: CategoryId;
  difficulty: 1 | 2 | 3 | 4 | 5;
  minutes: number;
  prerequisites: string[];
  ptVersion: string;
  /** draft = AI作成の下書き（公式ガイドとの照合待ち） / reviewed = 照合済み */
  reviewStatus: "draft" | "reviewed";
  overview: string;
  steps: LessonStep[];
  logic: LogicComparison;
  useCases: string[];
  cautions: string[];
  mistakes: string[];
  keyPoints: string[];
  terms: Term[];
  quiz: QuizQuestion[];
  related: string[];
  sources: Source[];
  /** 確証がない情報の一覧（画面上で「要確認」として表示） */
  unverified: string[];
}

export interface PracticeTask {
  id: string;
  level: number;
  category: CategoryId;
  /** LEVELの総合実技課題 */
  capstone?: boolean;
  title: string;
  description: string;
  /** 完成条件（チェック項目） */
  conditions: string[];
  /** 合格条件の説明 */
  passCriteria: string;
  hints: string[];
  logicSimilar: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  minutes: number;
  relatedLessons: string[];
}

export interface Level {
  level: number;
  title: string;
  titleEn: string;
  summary: string;
  topics: string[];
}

// ===== 問題バンク =====

export type QuestionType = "choice" | "truefalse" | "fill" | "written" | "trouble" | "order";

export interface Question {
  id: string;
  level: number;
  category: CategoryId;
  type: QuestionType;
  difficulty: 1 | 2 | 3 | 4 | 5;
  q: string;
  /** choice / trouble：選択肢、order：正しい順序で並べた手順 */
  choices?: string[];
  /** choice / trouble：正解インデックス、truefalse：0=○ 1=× */
  answer?: number;
  /** fill：許容する解答（表記ゆれ含む） */
  accept?: string[];
  /** written：模範解答と採点ポイント */
  modelAnswer?: string;
  points?: string[];
  /** written：採点ポイントごとのキーワード。[ポイント][グループ][同義語]。全グループで1語以上含まれればそのポイントを満たす */
  pointKeywords?: string[][][];
  explanation: string;
  logicNote?: string;
  lessonId?: string;
  unverified?: boolean;
}

// ===== ショートカット =====

export interface ShortcutItem {
  id: string;
  action: string;
  actionEn: string;
  category: string;
  mac: string;
  win: string;
  /** キー入力判定用（KeyboardEvent の修飾キー + code）。例 "Meta+Equal" */
  macKeys?: string[];
  winKeys?: string[];
  logic?: string;
  note?: string;
  versions: string;
  unverified?: boolean;
}

// ===== 用語辞典 =====

export interface GlossaryEntry {
  term: string;
  ja: string;
  category: CategoryId;
  desc: string;
  logic: { match: LogicMatch; name: string; note?: string };
  howto?: string;
  example?: string;
  related: string[];
  lessonId?: string;
  /** 英語のまま使われる用語 */
  keepEnglish?: boolean;
}

export type CategoryId =
  | "session"
  | "recording"
  | "editing"
  | "routing"
  | "mixing"
  | "delivery"
  | "studio";

export interface Category {
  id: CategoryId;
  label: string;
  labelEn: string;
}

// ===== 学習進捗データの型 (IndexedDB に保存) =====

export type LessonStatus = "not_started" | "in_progress" | "completed";

export interface QuizRecord {
  correct: boolean;
  attempts: number;
  lastAt: number;
}

export interface LessonProgress {
  status: LessonStatus;
  startedAt?: number;
  completedAt?: number;
  timeSec: number;
}

export type ReviewKind = "question" | "shortcut" | "trouble";

/** 復習アイテム（間隔反復：Leitner方式） */
export interface ReviewItem {
  kind: ReviewKind;
  /** 問題ID（教材の確認問題は "lessonId#index"）/ ショートカットID / トラブルID */
  id: string;
  /** 0〜4。正解するたびに上がり、上限を超えると復習完了 */
  box: number;
  /** 次回の復習日 "YYYY-MM-DD" */
  due: string;
  addedAt: number;
  lapses: number;
}

// ===== Studio Simulator =====

export interface Decision {
  q: string;
  choices: string[];
  answer: number;
  explanation: string;
  logicNote?: string;
}

export interface SimStage {
  id: string;
  title: string;
  brief: string;
  /** Pro Tools 上で実際に行う操作（自己チェック、採点外） */
  actions: string[];
  decision: Decision;
}

export interface SimProject {
  id: string;
  code: string;
  title: string;
  client: string;
  summary: string;
  spec: string[];
  lineup: string[];
  level: number;
  stages: SimStage[];
  /** 1回の実行で発生させるトラブルの数 */
  troubleCount: number;
}

export interface Trouble {
  id: string;
  title: string;
  category: CategoryId;
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** 案件内で発生しうるステージID（空ならトラブル演習のみ） */
  stages: string[];
  /** 現場の状況描写 */
  situation: string;
  cause: Decision;
  /** 対応手順（正しい順序で記述） */
  steps: string[];
  /** やってはいけない／不要な対応 */
  distractors: string[];
  stepNotes: string;
  /** エンジニアへの報告例 */
  report: string;
  logicNote?: string;
  lessonId?: string;
  unverified?: boolean;
}

export interface TroubleResult {
  causeCorrect: boolean;
  orderScore: number;
  firstCorrect: boolean;
  distractorsChosen: number;
  /** 0〜1 の総合点 */
  score: number;
  sequence: number[];
}

export interface SimEventResult {
  type: "stage" | "trouble";
  id: string;
  decisionCorrect?: boolean;
  actionsDone?: number;
  trouble?: TroubleResult;
}

export interface SimRun {
  projectId: string;
  startedAt: number;
  finishedAt?: number;
  troubleIds: string[];
  results: SimEventResult[];
  score?: number;
  rank?: string;
}

export interface TroubleRecord {
  attempts: number;
  best: number;
  last: number;
  lastAt: number;
}

// ===== デイリーミッション =====

export type MissionKind = "text" | "practice" | "quiz" | "review" | "shortcut" | "simulator";

export interface MissionItem {
  kind: MissionKind;
  label: string;
  /** 対象（教材ID・課題IDなど） */
  ref?: string;
  minutes: number;
  /** 問題演習などの目標数 */
  target?: number;
  done: boolean;
  /** 自動調整の理由（例：苦手分野「編集」を優先） */
  reason?: string;
}

export interface DailyMission {
  date: string;
  minutes: 60 | 30;
  items: MissionItem[];
  /** その日に回答した問題数・復習数（達成判定用） */
  answered: number;
  reviewed: number;
  shortcutAnswered: number;
}

export interface Screenshot {
  id: string;
  taskId: string;
  name: string;
  createdAt: number;
  /** PHASE 4：AIによる画面確認結果を格納する予定 */
  aiReview: null | { verdict: string; comment: string; at: number };
}

/** AI によるスクリーンショット確認の結果（PHASE 4） */
export interface AiShotCheck {
  at: number;
  model: string;
  shotIds: string[];
  conditions: { index: number; status: "met" | "not_met" | "cannot_determine"; evidence: string }[];
  comment: string;
  advice: string[];
}

export interface PracticeProgress {
  aiCheck?: AiShotCheck;
  status: "not_started" | "in_progress" | "passed";
  checked: number[];
  note: string;
  shots: Screenshot[];
  passedAt?: number;
  updatedAt: number;
}

export interface ShortcutRecord {
  attempts: number;
  correct: number;
  totalMs: number;
  lastAt: number;
  /** 連続正解数（習得判定に使用） */
  streak: number;
}

export interface Settings {
  os: "mac" | "win";
  ptVersion: string;
  dailyMinutes: 60 | 30;
  shortcutTimeLimit: number;
  shortcutMode: "choice" | "keys";
}

export interface ProgressData {
  schema: 3;
  lessons: Record<string, LessonProgress>;
  simActive?: SimRun;
  simRuns: SimRun[];
  troubles: Record<string, TroubleRecord>;
  /** "YYYY-MM-DD" -> その日のミッション */
  missions: Record<string, DailyMission>;
  /** 問題ID -> 最新の回答結果（教材の確認問題と問題バンクの共通） */
  questions: Record<string, QuizRecord>;
  lastLessonId?: string;
  review: ReviewItem[];
  practice: Record<string, PracticeProgress>;
  shortcuts: Record<string, ShortcutRecord>;
  /** "YYYY-MM-DD" -> 学習秒数 */
  studyLog: Record<string, number>;
  settings: Settings;
}
