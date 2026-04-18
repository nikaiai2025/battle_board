---
task_id: TASK-373
sprint_id: Sprint-146
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-29T15:30:00+09:00
updated_at: 2026-03-29T15:30:00+09:00
locked_files:
  - src/lib/services/bot-strategies/types.ts
  - src/lib/collection/adapters/subject-txt.ts
  - src/lib/collection/collection-job.ts
  - src/lib/services/bot-strategies/behavior/thread-creator.ts
  - features/step_definitions/curation_bot.steps.ts
  - features/support/in-memory/collected-topic-repository.ts
  - src/lib/infrastructure/repositories/collected-topic-repository.ts
---

## タスク概要

curation_bot.feature v3（承認済み）に合わせ、「投稿内容（本文/content）」の収集・保存・表示を全廃する。併せて collect-topics の INSERT ユニーク制約違反を修正する。

## 対象BDDシナリオ

- `features/curation_bot.feature` 全11シナリオ（v3）

## 必読ドキュメント（優先度順）

1. [必須] `features/curation_bot.feature` — v3に更新済み。11シナリオ
2. [必須] `src/lib/services/bot-strategies/types.ts` — CollectedItem/CollectedTopic 型定義
3. [必須] `src/lib/collection/collection-job.ts` — 収集ジョブ（INSERT修正対象）
4. [必須] `src/lib/collection/adapters/subject-txt.ts` — SubjectTxtAdapter（DAT取得削除対象）
5. [必須] `src/lib/services/bot-strategies/behavior/thread-creator.ts` — formatBody変更対象

## 修正内容

### 1. 型定義から content を削除

`src/lib/services/bot-strategies/types.ts`:
- `CollectedTopic` から `content: string | null` を削除
- `CollectedItem` から `content: string | null` を削除

### 2. SubjectTxtAdapter から DAT 取得を削除

`src/lib/collection/adapters/subject-txt.ts`:
- `extractFirstPostBody()` 関数を削除
- `collect()` 内の DAT ファイル fetch ループを削除。subject.txt のパース結果から直接 CollectedItem[] を構築
- 結果として subject.txt の fetch のみで完結（DATアクセス不要 → 5ch負荷軽減）

### 3. collection-job.ts の INSERT 修正

`src/lib/collection/collection-job.ts`:
- `save()` の rows から `content` フィールドを除去
- Supabase の `.insert(rows)` を `.upsert(rows, { onConflict: 'source_bot_id,collected_date,source_url' })` に変更
  - これにより、同一エントリの再INSERT時にユニーク制約違反ではなくUPDATEになる
  - 注意: DBにユニーク制約 `idx_collected_topics_unique_entry` が既に存在する（00034_curation_bot.sql参照）

### 4. formatBody() の変更

`src/lib/services/bot-strategies/behavior/thread-creator.ts`:
- `formatBody()` を変更: content 参照を削除し、「勢い: {buzzScore}\n{sourceUrl}」形式にする
- JSDoc・コメントを v3 仕様に合わせて更新

### 5. BDDステップ定義の更新

`features/step_definitions/curation_bot.steps.ts`:
- 削除された2シナリオ（「投稿内容の取得に失敗した場合」「投稿内容がない場合」）のステップ定義を削除
- 修正されたシナリオのステップ定義を更新（「記事タイトル・元ネタURL・バズスコアをDBに保存する」等）
- InMemory リポジトリの content 参照を除去

### 6. リポジトリ・テストのcontent除去

- `features/support/in-memory/collected-topic-repository.ts` — content フィールド除去
- `src/lib/infrastructure/repositories/collected-topic-repository.ts` — content フィールド除去
- 関連する全テストファイルから content 参照を除去

## 完了条件

- [ ] `npx cucumber-js --tags @curation` 等で curation_bot.feature 11シナリオ全PASS（tagがなければ全実行で確認）
- [ ] `npx vitest run` で全テストPASS（回帰なし）
- [ ] content フィールドがコード内に残っていないこと（collected_topics 関連のみ。他機能の content は対象外）
- [ ] テストコマンド: `npx vitest run` および `npx cucumber-js`

## スコープ外

- DBマイグレーション（content カラムの DROP）— 既存データとの互換性のため今回は実施しない。NULLが入るだけで害はない
- locked_files以外のファイル変更（ただし、content 参照の除去に伴い関連テストファイルの修正は許可）

## 補足・制約

- collected_topics テーブルの content カラムは物理的に残す（DROP しない）。INSERT/SELECT から除外するだけでよい
- `supabase/migrations/00034_curation_bot.sql` に `idx_collected_topics_unique_entry` ユニーク制約が既に定義されている。upsert はこの制約を利用する

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全6修正項目の実装・テスト完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- 起動: 全必読ファイルを読み込み、変更対象を把握完了
- 修正1: CollectedTopic/CollectedItem 型から content フィールドを削除
- 修正2: SubjectTxtAdapter から extractFirstPostBody() と DAT fetch ループを削除。subject.txt パースのみに簡素化
- 修正3: collection-job.ts の rows から content を除去、.insert() を .upsert() に変更（onConflict: source_bot_id,collected_date,source_url）
- 修正4: formatBody() を「勢い: {buzzScore}\n{sourceUrl}」形式に変更
- 修正5: BDDステップ定義の更新 -- 削除2シナリオ（S3,S7）のステップ除去、既存ステップの content 参照除去、ステップテキスト更新
- 修正6: InMemory/Supabase リポジトリ・単体テストから content フィールド除去
- テスト実行: vitest 全PASS、cucumber-js 全PASS

### テスト結果サマリー
- vitest: 116 test files, 2215 tests passed, 0 failed
- cucumber-js: 433 scenarios (412 passed, 18 pending, 3 undefined), 2344 steps (2275 passed)
  - curation_bot.feature: 11シナリオ全PASS（v3 の10シナリオ + HP検証1シナリオ）
- content フィールド残存チェック: collected_topics 関連の全ファイルで content 参照なし（確認済み）
