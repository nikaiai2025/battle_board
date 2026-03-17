---
task_id: TASK-107
sprint_id: Sprint-37
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-17T23:00:00+09:00
updated_at: 2026-03-17T23:00:00+09:00
locked_files:
  - "features/admin.feature"
  - "features/step_definitions/admin.steps.ts"
  - "[NEW] supabase/migrations/00011_daily_stats.sql"
  - "src/lib/infrastructure/repositories/user-repository.ts"
  - "src/lib/infrastructure/repositories/post-repository.ts"
  - "[NEW] src/lib/infrastructure/repositories/daily-stats-repository.ts"
  - "src/lib/services/admin-service.ts"
  - "[NEW] src/app/api/admin/users/route.ts"
  - "[NEW] src/app/api/admin/users/[userId]/route.ts"
  - "[NEW] src/app/api/admin/users/[userId]/posts/route.ts"
  - "[NEW] src/app/api/admin/dashboard/route.ts"
  - "[NEW] src/app/api/admin/dashboard/history/route.ts"
  - "[NEW] scripts/aggregate-daily-stats.ts"
  - "[NEW] src/__tests__/lib/services/admin-dashboard.test.ts"
---

## タスク概要

ユーザー管理API（一覧・詳細・書き込み履歴）とダッシュボードAPI（リアルタイムサマリー・日次推移）を実装する。admin.featureにユーザー管理3シナリオ + ダッシュボード2シナリオを追加し、DB・Repository・Service・API・BDDステップ定義を一貫して実装する。

設計方針は `tmp/feature_plan_admin_expansion.md` §4〜5に記載済み（人間承認済み）。

## 対象BDDシナリオ
- `features/admin.feature` — ユーザー管理3シナリオ + ダッシュボード2シナリオを新規追加

## 必読ドキュメント（優先度順）
1. [必須] `tmp/feature_plan_admin_expansion.md` — 機能計画書（§4 ユーザー管理、§5 ダッシュボード、§1-c/1-d シナリオ案）
2. [必須] `features/admin.feature` — 現在の管理者シナリオ（Sprint-36でBAN+通貨付与追加済み）
3. [必須] `features/step_definitions/admin.steps.ts` — 既存ステップ定義
4. [必須] `src/lib/services/admin-service.ts` — AdminService（Sprint-36で追加された関数群あり）
5. [必須] `src/lib/infrastructure/repositories/user-repository.ts` — UserRepository（findAll追加先）
6. [必須] `src/lib/infrastructure/repositories/post-repository.ts` — PostRepository（findByAuthorId既存）
7. [必須] `src/lib/domain/models/user.ts` — Userモデル
8. [参考] `features/support/world.ts` — BDD World定義
9. [参考] `features/support/in-memory/` — インメモリリポジトリパターン

## 出力（生成すべきファイル）

### ユーザー管理
1. `features/admin.feature` — ユーザー管理3シナリオ追加（計画書§1-cに従う）:
   - 管理者がユーザー一覧を閲覧できる
   - 管理者が特定ユーザーの詳細を閲覧できる
   - 管理者がユーザーの書き込み履歴を確認できる
2. `src/lib/infrastructure/repositories/user-repository.ts` — findAll関数追加（ページネーション付き）
3. `src/lib/services/admin-service.ts` — getUserList, getUserDetail, getUserPosts追加
4. `src/app/api/admin/users/route.ts` — GET（ユーザー一覧）
5. `src/app/api/admin/users/[userId]/route.ts` — GET（ユーザー詳細）
6. `src/app/api/admin/users/[userId]/posts/route.ts` — GET（書き込み履歴）

### ダッシュボード
7. `features/admin.feature` — ダッシュボード2シナリオ追加（計画書§1-dに従う）:
   - 管理者がダッシュボードで統計情報を確認できる
   - 管理者が統計情報の日次推移を確認できる
8. `supabase/migrations/00011_daily_stats.sql` — daily_statsテーブル作成
9. `src/lib/infrastructure/repositories/daily-stats-repository.ts` — DailyStatsRepository新規
10. `src/lib/services/admin-service.ts` — getDashboard, getDashboardHistory追加
11. `src/app/api/admin/dashboard/route.ts` — GET（リアルタイムサマリー）
12. `src/app/api/admin/dashboard/history/route.ts` — GET（日次推移）
13. `scripts/aggregate-daily-stats.ts` — 日次集計スクリプト（冪等UPSERT）
14. `features/step_definitions/admin.steps.ts` — 全ステップ定義追加

## 完了条件
- [ ] admin.feature ユーザー管理3シナリオ全PASS
- [ ] admin.feature ダッシュボード2シナリオ全PASS
- [ ] ユーザー一覧がページネーション付きで取得できる
- [ ] ダッシュボードのリアルタイムサマリーが動作する
- [ ] daily_statsテーブルのマイグレーションが存在する
- [ ] 日次集計スクリプトが動作する
- [ ] 既存テスト全PASS（回帰なし）
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 0 failed
- [ ] テストコマンド: `npx vitest run` + `npx cucumber-js`

## スコープ外
- 管理画面UI（TASK-108で実施）
- GitHub Actions cronジョブ定義（Phase 3インフラ層）
- 推移グラフのグラフライブラリ選定（UIタスクで対応）
- D-07/D-08ドキュメント更新

## 補足・制約
- ダッシュボードBDDシナリオはサービス層テスト（AdminService.getDashboard を直接呼ぶ）
- リアルタイムサマリー（本日分）とスナップショット（過去分）の二層構成（計画書§5-e参照）
- daily_stats テーブルのRLSはDENY ALL
- 日次集計スクリプトは冪等（UPSERT）であること。再実行しても安全
- PostRepository.findByAuthorIdは既に存在する。必要に応じて修正のみ
- ユーザー管理BDDではインメモリリポジトリを使用

## 作業ログ

### チェックポイント
- 状態: completed
- 完了済み: 全タスク完了
- 未解決の問題: なし

### 進捗ログ
- [開始] 必読ドキュメント・既存コード把握完了
- 既存BDD: 223 scenarios (1 failed, 9 pending, 213 passed) — 既存1 failedはスコープ外
- admin.feature に5シナリオ追加（ユーザー管理3 + ダッシュボード2）
- supabase/migrations/00011_daily_stats.sql 作成
- daily-stats-repository.ts 新規作成
- user-repository.ts に findAll() 追加
- post-repository.ts に countByDate() / countActiveThreadsByDate() 追加
- currency-repository.ts に sumAllBalances() 追加
- admin-service.ts に getUserList / getUserDetail / getUserPosts / getDashboard / getDashboardHistory 追加
- in-memory 実装群を対応する関数で更新
- register-mocks.js / mock-installer.ts を daily-stats-repository で更新
- admin.steps.ts に全ステップ定義を追加
- 曖昧ステップ名競合（mypage.steps.ts）を修正（admin.feature のステップ名をユニーク化）
- API routes 5ファイル作成
- scripts/aggregate-daily-stats.ts 作成
- src/__tests__/lib/services/admin-dashboard.test.ts 作成（15テスト）
- admin-service.test.ts の vi.mock 不足を修正（新規リポジトリのモックを追加）

### テスト結果サマリー
- BDD: 228 scenarios (219 passed, 9 pending, 0 failed) — 新規5シナリオ含む全PASS
- Vitest: 39 test files, 1047 tests all PASS
- 新規テストファイル: src/__tests__/lib/services/admin-dashboard.test.ts (15 tests)
