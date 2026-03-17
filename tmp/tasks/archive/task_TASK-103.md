---
task_id: TASK-103
sprint_id: Sprint-35
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-17T14:00:00+09:00
updated_at: 2026-03-17T14:00:00+09:00
locked_files:
  - "features/thread.feature"
  - "features/step_definitions/thread.steps.ts"
  - "[NEW] supabase/migrations/00009_pinned_thread.sql"
  - "src/lib/services/post-service.ts"
  - "src/lib/domain/models/thread.ts"
  - "src/lib/infrastructure/repositories/thread-repository.ts"
  - "[NEW] scripts/upsert-pinned-thread.ts"
  - "[NEW] src/__tests__/lib/services/pinned-thread.test.ts"
---

## タスク概要

固定スレッド（案内板）を実装する。スレッド一覧の先頭に常時表示され、一般ユーザーは書き込めない読み専用スレッド。コマンド一覧やリンクを含む案内情報を表示する。

設計方針は `tmp/feature_plan_pinned_thread_and_dev_board.md` に記載済み（人間承認済み）。

## 対象BDDシナリオ
- `features/thread.feature` — 固定スレッド関連シナリオを新規追加

## 必読ドキュメント（優先度順）
1. [必須] `tmp/feature_plan_pinned_thread_and_dev_board.md` — 機能計画書（§2 固定スレッド部分）
2. [必須] `features/thread.feature` — 現在のスレッド管理シナリオ
3. [必須] `features/step_definitions/thread.steps.ts` — 既存ステップ定義
4. [必須] `src/lib/services/post-service.ts` — PostService（書き込みガード追加先）
5. [必須] `src/lib/domain/models/thread.ts` — Threadモデル（isPinned追加先）
6. [必須] `src/lib/infrastructure/repositories/thread-repository.ts` — ThreadRepository
7. [参考] `config/commands.yaml` — コマンド一覧（固定スレッド本文の情報源）
8. [参考] `src/lib/services/command-service.ts` — getRegisteredCommandNames参照

## 出力（生成すべきファイル）
1. `features/thread.feature` — 固定スレッドシナリオ追加（修正）。計画書§1-aのシナリオ案に従う:
   - 固定スレッドが常にスレッド一覧の先頭に表示される
   - 固定スレッドには一般ユーザーが書き込みできない
   - 固定スレッドに案内情報が表示される
2. `supabase/migrations/00009_pinned_thread.sql` — threads.is_pinned カラム追加
3. `src/lib/domain/models/thread.ts` — isPinnedフィールド追加
4. `src/lib/infrastructure/repositories/thread-repository.ts` — rowToThread修正
5. `src/lib/services/post-service.ts` — 固定スレッドへの書き込み拒否ガード
6. `scripts/upsert-pinned-thread.ts` — 固定スレッド生成スクリプト（config/commands.yaml読み込み→案内テキスト生成→DB upsert）
7. `features/step_definitions/thread.steps.ts` — 固定スレッドステップ定義追加
8. 必要に応じて単体テスト

## 完了条件
- [x] thread.featureの固定スレッドシナリオ全PASS
- [x] 固定スレッドへの書き込みがPostServiceレベルで拒否される
- [x] threads.is_pinnedカラムのマイグレーションが存在
- [x] 固定スレッド生成スクリプトが動作する
- [x] `npx vitest run` 全PASS
- [x] `npx cucumber-js` 0 failed
- [x] テストコマンド: `npx vitest run` + `npx cucumber-js`

## スコープ外
- dev板の実装（TASK-104で実施）
- Next.js instrumentation.tsへのスクリプト統合（デプロイ後に検討）
- D-07/D-08ドキュメント更新

## 補足・制約
- thread.featureへのシナリオ追加は人間承認済み。計画書§1-aのシナリオ案に従うこと
- 固定スレッドの`last_post_at`を`2099-01-01T00:00:00Z`に設定して先頭表示を実現
- is_pinnedは書き込みガードに使用（last_post_atだけでは不十分。API直叩きで上書き可能なため）
- 生成スクリプトはconfig/commands.yamlからコマンド一覧を読み取り、案内テキストを動的生成する

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全実装・テスト完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. thread.feature に @pinned_thread タグ付きシナリオ3件追加
2. supabase/migrations/00009_pinned_thread.sql 作成（is_pinned カラム追加）
3. src/lib/domain/models/thread.ts に isPinned フィールド追加
4. src/lib/infrastructure/repositories/thread-repository.ts の rowToThread・create を修正
5. features/support/in-memory/thread-repository.ts の create を修正（isPinned オプショナル対応）
6. src/lib/services/post-service.ts に固定スレッドへの書き込みガード（Step 0）追加
7. scripts/upsert-pinned-thread.ts 新規作成（commands.yaml読み込み→案内テキスト生成→DB upsert）
8. features/step_definitions/thread.steps.ts に固定スレッドステップ定義追加
9. src/__tests__/lib/services/pinned-thread.test.ts 新規作成（11件）

### テスト結果サマリー

- vitest: 1016 tests passed (37 files)
- cucumber-js: 214 scenarios, 0 failed（9 pending は既存スコープ外シナリオ）
- @pinned_thread BDDシナリオ: 3 scenarios, 12 steps — 全PASS
