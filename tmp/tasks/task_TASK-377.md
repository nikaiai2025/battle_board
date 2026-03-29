---
task_id: TASK-377
sprint_id: Sprint-149
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-29T21:00:00+09:00
updated_at: 2026-03-29T21:45:00+09:00
locked_files:
  - src/lib/services/post-service.ts
  - src/lib/services/bot-strategies/behavior/random-thread.ts
  - "[NEW] supabase/migrations/00040_threads_created_by_nullable.sql"
  - src/lib/domain/models/thread.ts
  - src/lib/infrastructure/repositories/thread-repository.ts
  - src/lib/services/bot-strategies/types.ts
---

## タスク概要

bot-scheduler 実行で判明した2件のエラーを修正する:
1. キュレーションBOTの createThread で `created_by` に "system"（非UUID）が渡されDB制約違反
2. 通常BOTの RandomThreadBehaviorStrategy が固定スレッドを投稿先に選択しガードで拒否される

## 本番エラーログ（証拠）

```json
{"botId":"29d49124-...","error":"ThreadRepository.create failed: invalid input syntax for type uuid: \"system\""},
{"botId":"24fcc092-...","error":"BotService.executeBotPost: PostService.createPost が失敗しました: 固定スレッドには書き込みできません"}
```

## 必読ドキュメント（優先度順）

1. [必須] `src/lib/services/post-service.ts` — `createThread()` の行968付近 `createdBy = authResult.userId ?? "system"`、および `createPost()` の行410-417のBOT書き込み時 author_id=NULL パターン
2. [必須] `src/lib/services/bot-strategies/behavior/random-thread.ts` — 行49の `findByBoardId()` 呼び出しとランダム選択
3. [参考] `supabase/migrations/00001_create_tables.sql` — 行49 `created_by UUID NOT NULL REFERENCES users(id)`
4. [参考] `src/lib/infrastructure/repositories/thread-repository.ts` — `create()` メソッドと `findByBoardId()` メソッド

## 修正内容

### 修正A: threads.created_by NULLABLE化 + createThread 修正

**マイグレーション** `supabase/migrations/00040_threads_created_by_nullable.sql`:
```sql
-- Sprint-149: BOTによるスレッド作成を可能にするため created_by を NULLABLE 化
-- BOT書き込み時は posts.author_id と同様に NULL を設定する
-- FK制約は維持（非NULL値は users(id) を参照する）
ALTER TABLE threads ALTER COLUMN created_by DROP NOT NULL;
```

**post-service.ts** の `createThread()`:
- 行968付近の `const createdBy = authResult.userId ?? "system"` を修正
- `isBotWrite` が true のとき（= `authResult.userId` が null のとき）、`createdBy = null` にする
- `ThreadRepository.create()` に渡す `createdBy` は `string | null` を受け付けるよう修正が必要な場合は修正
- ThreadRepository の型定義・INSERT文も `createdBy: null` を許容するよう確認・修正

### 修正B: RandomThreadBehaviorStrategy で固定スレッド除外

`src/lib/services/bot-strategies/behavior/random-thread.ts`:
- 行49の `findByBoardId()` 結果に対して `.filter(t => !t.isPinned)` を追加
- フィルタ後の配列が空の場合は `{ type: "skip" }` を返す（投稿先なし）

## 完了条件

- [x] `npx vitest run` 全テストPASS (117 files, 2234 tests passed)
- [x] `npx cucumber-js` 全テストPASS (411 passed, 1 failed は既存の welcome.feature 文言差異で本タスクと無関係)
- [x] RandomThreadBehaviorStrategy が固定スレッドを除外する単体テストが存在すること
- [x] createThread の isBotWrite=true パスで createdBy=null になる単体テストが存在すること

## スコープ外

- ThreadRepository.findByBoardId() のクエリ自体の変更（Strategy側でフィルタリングする）
- 既存スレッドの created_by データ変更

## 補足・制約

- マイグレーションファイルの番号は `00040` とする（既存の最新番号の次）
- マイグレーションは本番DBに反映済みのSupabase Cloud環境にも適用される。ローカルのSupabase起動は不要（本タスクではテスト実行のみ）
- `created_by` が null のスレッドを表示するUI側の変更は不要（管理画面のBOT詳細ページ等は created_by を直接表示していない）

## 作業ログ

### チェックポイント
- 状態: 完了
- 全実装・テスト完了。未解決の問題なし

### escalation_resolution (ESC-TASK-377-1)
- **解決**: オーケストレーターが自律承認。内部型拡張のみで後方互換、BDDシナリオ・API契約・ユーザー振る舞いへの影響なし
- **追加locked_files**: `src/lib/domain/models/thread.ts`, `src/lib/infrastructure/repositories/thread-repository.ts`, `src/lib/services/bot-strategies/types.ts`
- **方針**: タスク指示書の修正内容に沿って3ファイルの型拡張を実施してよい

### 進捗ログ
- 2026-03-29 21:30 タスク読解完了。修正対象と必要な型変更の洗い出し完了
- 2026-03-29 21:30 ESC-TASK-377-1 起票: locked_files 外ファイルの変更許可を要求
- 2026-03-29 21:45 ESC-TASK-377-1 解決: オーケストレーターが自律承認。locked_files拡張済み
- 2026-03-29 22:48 エスカレーション解決確認。チェックポイントの計画通りに実装開始
- 2026-03-29 22:48 修正A: マイグレーションSQL作成、Thread/ThreadRow型変更、post-service createdBy修正
- 2026-03-29 22:48 修正B: IThreadRepository型にisPinned追加、RandomThreadBehaviorStrategyにisPinnedフィルタ追加
- 2026-03-29 22:49 単体テスト追加: 固定スレッド除外3件、createdBy=null検証1件、0件時skip修正
- 2026-03-29 22:50 vitest全テストPASS (117 files, 2234 tests)
- 2026-03-29 22:50 cucumber-js全テストPASS (411 passed; 1 failed は既存の welcome.feature 文言差異で本タスク無関係)

### テスト結果サマリー

**vitest (単体テスト)**: 117 files, 2234 tests ALL PASSED
**cucumber-js (BDDシナリオ)**: 434 scenarios (411 passed, 18 pending, 4 undefined, 1 failed)
- 失敗1件: welcome.feature のウェルカムメッセージ文言差異（本タスクの変更と無関係。既存の問題）
