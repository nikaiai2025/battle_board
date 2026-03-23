---
task_id: TASK-282
sprint_id: Sprint-104
status: assigned
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_282
depends_on: []
created_at: 2026-03-23T05:30:00+09:00
updated_at: 2026-03-23T05:30:00+09:00
locked_files: []
---

## タスク概要

直近で発生した本番障害2件のインシデント分析を実施する。根本原因・影響範囲・再発防止策をまとめた障害記録を `docs/operations/incidents/` に出力する。

## 対象インシデント

### インシデント1: CF Workers サブリクエスト上限エラー（500）
- **発生日**: 2026-03-23
- **症状**: !livingbot を含む書き込みで 500 エラー（`{"error":"INTERNAL_ERROR","message":"サーバー内部エラーが発生しました"}`）
- **CFログ**: `Error: Too many subrequests by single Worker invocation.`
- **根本原因**: `countLivingBots()` の区分B（スレッド固定BOT）がN+1クエリパターン（1 + 3N クエリ）。BOT数増加に伴いCF Workersの1000サブリクエスト上限に到達
- **修正**: Sprint-102（コミット a880754）でSupabaseネストselectに最適化
- **関連ファイル**: `src/lib/infrastructure/repositories/bot-repository.ts`

### インシデント2: PostgREST many-to-one 型不整合による「無反応」
- **発生日**: 2026-03-23（Sprint-102デプロイ直後）
- **症状**: !livingbot で 500 エラーは解消したが、コマンド応答なし（「無反応」）
- **根本原因**: Sprint-102の修正でSupabaseネストselectを導入したが、PostgRESTのmany-to-one FK関係（bot_posts→posts, posts→threads）が**単一オブジェクト**を返すのに対し、`ThreadFixedBotRow`型が**配列**として定義されていた。`.some()`がTypeErrorを引き起こし、PostServiceのtry-catch（line 471-475）で黙殺
- **修正**: Sprint-103（コミット 0a0962d）でネストselectを廃止し2クエリに分離。Array.isArray()で安全にハンドリング
- **関連ファイル**: `src/lib/infrastructure/repositories/bot-repository.ts`, `src/lib/services/post-service.ts`

## 出力（生成すべきファイル）
- `docs/operations/incidents/2026-03-23_livingbot_subrequest_limit.md` — 障害記録

## 分析観点
1. **根本原因分析（RCA）**: なぜ発生したか。設計・レビュー・テストのどこで検出できたか
2. **影響範囲**: !livingbot以外にも影響があったか（他のコマンド、BOT書き込み等）
3. **時系列**: 発生→検知→原因特定→修正→検証の流れ
4. **再発防止策**: 同種の問題（N+1クエリ、PostgREST型不整合）を今後どう防ぐか
5. **教訓**: CF Workers環境固有の制約に関するナレッジ

## 参考情報
- Sprint-102計画書: `tmp/orchestrator/sprint_102_plan.md`
- Sprint-103計画書: `tmp/orchestrator/sprint_103_plan.md`
- TASK-279（N+1最適化）: `tmp/tasks/task_279.md`
- TASK-280（型不整合修正）: `tmp/tasks/task_280.md`
- アーキテクチャ設計書: `docs/architecture/architecture.md`
- bot-repository.ts: `src/lib/infrastructure/repositories/bot-repository.ts`
- post-service.ts: `src/lib/services/post-service.ts`（line 458-475 try-catch）

## 完了条件
- [ ] 障害記録が `docs/operations/incidents/` に出力されている
- [ ] 根本原因・影響範囲・再発防止策が記載されている
- [ ] 必要に応じてアーキテクチャ設計書（D-07）やコンポーネント設計書（D-08）への追記提案を含む

## スコープ外
- コード修正（既にSprint-102/103で修正済み）
- features/ の変更

## 作業ログ
<!-- ワーカーAIが以下に追記 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全作業
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. タスク指示書および関連資料を読み込み（Sprint-102/103計画書、TASK-279/280、bot-repository.ts、post-service.ts、既存インシデント記録）
2. 障害記録を `docs/operations/incidents/2026-03-23_livingbot_subrequest_limit.md` に出力
   - 2件のインシデントを1つの連鎖障害として構造化（インシデント1: N+1 → インシデント2: 型不整合）
   - 根本原因分析: CF Workers サブリクエスト上限の未考慮、PostgREST many-to-one FK の戻り値型の誤認識
   - 影響範囲: !livingbot コマンドのみ。他コマンド・BOT書き込み・通貨/報酬には影響なし
   - 検出困難だった理由: BDDテストがインメモリ実装で動作、CF Workers固有制約はデプロイ後にしか検証不可
   - 再発防止策: 短期（実施済み3件）、中期（提案3件: クエリ数ガードレール、PostgRESTガイドライン、ログ強化）、長期（検討2件: クエリカウンター、E2Eスモークテスト）
   - D-07/D-08 への追記提案を再発防止策セクションに含めた
