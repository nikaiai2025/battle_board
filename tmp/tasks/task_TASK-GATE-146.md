---
task_id: TASK-GATE-146
sprint_id: Sprint-146
status: done
assigned_to: bdd-gate
depends_on: [TASK-373]
created_at: 2026-03-29T16:30:00+09:00
updated_at: 2026-03-29T16:30:00+09:00
locked_files: []
---

## タスク概要

Sprint-146（キュレーションBOT仕様変更 v3）のコミット前品質ゲート。

## 完了条件

- [x] vitest 全PASS
- [x] cucumber-js 全PASS（pending/undefinedは既知のもののみ許容）
- [x] playwright E2E 実行（既知の1件失敗は許容）
- [x] playwright API 全PASS

## 変更ファイル一覧

- `features/curation_bot.feature` — v3に更新（13→11シナリオ）
- `src/lib/services/bot-strategies/types.ts` — content フィールド削除
- `src/lib/collection/adapters/subject-txt.ts` — DAT取得削除
- `src/lib/collection/collection-job.ts` — upsert化
- `src/lib/services/bot-strategies/behavior/thread-creator.ts` — formatBody変更
- `features/step_definitions/curation_bot.steps.ts` — ステップ更新
- リポジトリ・テストファイル複数

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全テストスイート実行
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- 2026-03-29 Supabase Local 起動確認済み（一部サービス停止は既知、主要APIは稼働）
- 2026-03-29 全テストスイート実行完了

### テスト結果サマリー

| テスト種別 | 結果 | PASS/TOTAL | 所要時間 |
|---|---|---|---|
| 単体テスト (Vitest) | PASS | 2215/2215 (116 files) | 14.02s |
| BDD (Cucumber.js) | PASS | 412 passed / 433 scenarios (pending/undefined は既知) | 3.0s |
| E2E (Playwright) | PASS ※1 | 62/63 | 2.7m |
| API (Playwright) | PASS | 27/27（api project 内） | ↑同上 |

※1 既知の1件失敗を許容済み:
- テスト名: `[e2e] › e2e/flows/auth-flow.spec.ts:51:6 › 認証UI連結フロー（ローカル限定） › 未認証でスレッド作成→AuthModal認証→作成成功→レス書き込みが完結する`
- エラー: `expect(page).toHaveTitle(/BattleBoard/i)` が失敗。実際のタイトルは `"ボットちゃんねる"`
- 原因: サイトリネーム Phase 3（ドメイン変更）が未実施のため、現サイトタイトルが旧名称のまま。テストの期待値がリネーム後の名称を前提にしている。`pending_domain_change.md` に記録済みの既知問題。

**BDD Cucumber.js 内訳（既知の pending/undefined）:**
- 18 pending: FAB（フローティングメニュー）・撃破済みBOT表示など、実装作業中のステップ
- 3 undefined: `@fab @wip` タグのシナリオで未定義ステップ
- これらは既存の pending/undefined であり Sprint-146 の変更に起因しない

**総合判定: PASS**（タスク指示書の完了条件をすべて満たす）
