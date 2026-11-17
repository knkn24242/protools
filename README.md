# Pro Tools Academy

Logic Pro 経験者が Pro Tools とレコーディング実務を習得するための個人向け学習 Web アプリ。
オフライン動作・データはブラウザ内（IndexedDB）に保存。

## 起動

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ に静的ファイル（PWA・オフライン対応）
npm run validate   # 教材JSONの整合性チェック
```

## 構成

```
content/                 ← 教材データ（アプリ本体から分離）
  levels.json            LEVEL 1〜8 の定義・トピック・カテゴリー
  lessons/level-N.json   各LEVELの教材（配列）。ファイルを置くだけで自動で読み込まれる
  practice/*.json        実技課題（capstones.json = 各LEVELの総合課題、drills.json = 個別ドリル）
  questions/*.json       問題バンク（choice / truefalse / fill / written / trouble / order）
  shortcuts.json         ショートカット（mac / win 表記、キー判定用 macKeys / winKeys、Logic Pro 比較）
  glossary.json          用語辞典
  simulator/*.json       Studio Simulator の案件（工程・判断問題）
  troubles.json          トラブル対応（状況・原因・正しい対応順序・不要な対応・報告例）
src/
  lib/content.ts         教材ローダー
  lib/store.tsx          学習進捗（IndexedDB 自動保存）
  lib/metrics.ts         習熟度・苦手分野などの集計
  pages/                 Dashboard / Curriculum / Lesson / Progress / Settings
scripts/validate-content.mjs
```

## 教材の追加・修正

`content/lessons/level-N.json` に、`src/types.ts` の `Lesson` 型に沿ったオブジェクトを追加する。

- `logic.match`：`exact`（完全一致）/ `similar`（類似概念）/ `none`（対応機能なし）を必ず区別する
- `sources`：出典（Avid Pro Tools Reference Guide の章名など）。ページ番号は確認できたものだけ書く
- `unverified`：確証のない情報を列挙 → 画面に「要確認」表示
- ショートカットに確証がない場合は `"unverified": true`
- `reviewStatus`：公式ガイドと照合したら `"reviewed"` に変更
- 本文中で `**太字**`、`` `コード` ``、`[要確認]` が使える

### 問題・ショートカットの書き方

- 教材の確認問題は自動的に問題バンクにも入る（ID は `教材ID#番号`）
- `order` 型は `choices` に**正しい順序で**手順を書く（画面ではシャッフルされる）
- `fill` 型の `accept` は表記ゆれを列挙（全角/半角・大文字小文字・空白は自動で吸収）
- ショートカットの `macKeys` / `winKeys` は `修飾キー+キー`（例 `meta+shift+i`、`alt+;`、`f12`、`numpad3`）。ブラウザ予約キーと重なるものは省略するとキー入力モードで出題されない

### シミュレーター・トラブルの書き方

- トラブルの `steps` は**正しい順序で**書く。`distractors` は選ぶと減点される不要・不適切な対応
- `stages` に案件のステージIDを書くと、その案件の実行中にランダムで発生する（空ならトラブル演習のみ）
- 採点：原因 30% ＋ 手順の網羅と順序 50% ＋ 最初の一手 20% − 不要な対応 15%/件

追加後は `npm run validate` で ID 重複・参照切れ・正解インデックスなどを確認する。

## 開発フェーズ

- [x] PHASE 1：基本UI / Dashboard / カリキュラム / 教材閲覧 / Logic Pro比較 / 進捗管理（LEVEL 1〜3 教材 20本・問題 44問）
- [x] PHASE 2：実技課題 18件（自己チェック・スクショ保存）/ 問題演習 6形式・74問（難易度自動調整）/ ショートカット 49件（4択・キー入力）/ 用語辞典 67語
- [x] PHASE 3：Studio Simulator（PROJECT 001・トラブル8種をランダム発生・対応順序評価）/ トラブル演習 / 間隔反復の復習システム / デイリーミッション（60分・30分、進捗と苦手分野で自動生成）
- [x] PHASE 4：AI Tutor（教材・課題・トラブルの文脈つきチャット）/ スクリーンショットの AI 確認 / 記述式の AI 採点 / 苦手分析（問題・トラブル・ショートカットの総合成績）と AI 学習アドバイス

## API なしで使える代替機能（標準）

- **Tutor（オフライン講師）**：`src/lib/offlineTutor.ts`。質問をキーワード（英単語＋日本語の2文字組）に分解し、教材・用語辞典・トラブル事例・ショートカットから関連項目を検索して表示。文章を生成しないので収録外の情報は出ない
- **記述式のキーワード採点**：`src/lib/keywordGrade.ts`。問題データの `pointKeywords`（[ポイント][グループ][同義語]、全グループで1語以上含めばそのポイントを満たす）で判定し、自己採点の目安を表示
- **学習アドバイス（標準）**：`src/lib/offlineCoach.ts`。苦手分析から重点分野・おすすめ教材/課題/トラブル・7日間プランをルールで作成
- スクリーンショットの内容確認だけは代替がなく、自己チェックのみ

## AI 機能について（任意）

- AI 機能は `src/lib/ai.ts` に集約。Anthropic 公式 TypeScript SDK（`@anthropic-ai/sdk`）を**使う時だけ動的 import** するため、AI を使わなければ読み込まれず、オフライン機能に影響しない
- API キーは Settings で入力し、ブラウザの IndexedDB にのみ保存（進捗エクスポートには含まない）。送信先は api.anthropic.com のみ
- 既定モデルは `claude-opus-5-5`（Settings で Sonnet 5.5 / Haiku 5.5 に変更可）。Opus / Sonnet では拒否時のサーバー側フォールバック（`fallbacks: "default"`）を有効化
- 構造化出力（スクショ判定・採点・アドバイス）は Zod スキーマ + `betaZodOutputFormat`
- 個人用ローカルアプリとしてブラウザから直接 API を呼ぶ（`dangerouslyAllowBrowser`）。公開サーバーに置く場合は、キーをサーバー側に移すこと
