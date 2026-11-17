// 教材データの読み込み。content/ 配下の JSON をビルド時にバンドルする。
// 新しい教材は content/lessons/level-N.json に追加するだけで自動的に反映される。
import levelsData from "../../content/levels.json";
import type { Category, Lesson, Level } from "../types";

const lessonModules = import.meta.glob<{ default: Lesson[] }>(
  "../../content/lessons/*.json",
  { eager: true },
);

export const categories = levelsData.categories as Category[];
export const levels = levelsData.levels as Level[];

export const lessons: Lesson[] = Object.values(lessonModules)
  .flatMap((m) => m.default)
  .sort((a, b) => a.level - b.level || a.order - b.order);

const byId = new Map(lessons.map((l) => [l.id, l]));

export function getLesson(id: string): Lesson | undefined {
  return byId.get(id);
}

export function lessonsOfLevel(level: number): Lesson[] {
  return lessons.filter((l) => l.level === level);
}

export function getLevel(level: number): Level | undefined {
  return levels.find((l) => l.level === level);
}

export function categoryLabel(id: string): string {
  return categories.find((c) => c.id === id)?.label ?? id;
}



// ===== PHASE 2：実技課題・問題バンク・ショートカット・用語辞典 =====
import type { GlossaryEntry, PracticeTask, Question, ShortcutItem } from "../types";
import shortcutData from "../../content/shortcuts.json";
import glossaryData from "../../content/glossary.json";

const practiceModules = import.meta.glob<{ default: PracticeTask[] }>("../../content/practice/*.json", { eager: true });
const questionModules = import.meta.glob<{ default: Question[] }>("../../content/questions/*.json", { eager: true });

export const practiceTasks: PracticeTask[] = Object.values(practiceModules)
  .flatMap((m) => m.default)
  .sort((a, b) => a.level - b.level || Number(!!a.capstone) - Number(!!b.capstone) || a.difficulty - b.difficulty);

export function getTask(id: string) {
  return practiceTasks.find((t) => t.id === id);
}

/** 教材の理解度確認問題（選択式）を問題バンク形式に変換したもの */
const lessonQuestions: Question[] = lessons.flatMap((l) =>
  l.quiz.map((q, i) => ({
    id: `${l.id}#${i}`,
    level: l.level,
    category: l.category,
    type: "choice" as const,
    difficulty: l.difficulty,
    q: q.q,
    choices: q.choices,
    answer: q.answer,
    explanation: q.explanation,
    logicNote: q.logicNote,
    lessonId: l.id,
  })),
);

export const bankQuestions: Question[] = Object.values(questionModules).flatMap((m) => m.default);
export const allQuestions: Question[] = [...lessonQuestions, ...bankQuestions];
const qById = new Map(allQuestions.map((q) => [q.id, q]));
export function getQuestion(id: string) {
  return qById.get(id);
}

export const shortcuts = shortcutData as ShortcutItem[];
export const glossary = (glossaryData as GlossaryEntry[]).slice().sort((a, b) => a.term.localeCompare(b.term));

// ===== PHASE 3：Studio Simulator・トラブル演習 =====
import type { SimProject, Trouble } from "../types";
import troubleData from "../../content/troubles.json";

const simModules = import.meta.glob<{ default: SimProject }>("../../content/simulator/*.json", { eager: true });
export const simProjects: SimProject[] = Object.values(simModules)
  .map((m) => m.default)
  .sort((a, b) => a.id.localeCompare(b.id));
export const troubles = troubleData as Trouble[];

export function getProject(id: string) {
  return simProjects.find((p) => p.id === id);
}
export function getTrouble(id: string) {
  return troubles.find((t) => t.id === id);
}
export function getShortcut(id: string) {
  return shortcuts.find((s) => s.id === id);
}
