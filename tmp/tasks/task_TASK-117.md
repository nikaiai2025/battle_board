---
task_id: TASK-117
sprint_id: Sprint-40
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-17T12:00:00+09:00
updated_at: 2026-03-17T12:00:00+09:00
locked_files:
  - src/lib/services/auth-service.ts
  - src/lib/infrastructure/repositories/auth-code-repository.ts
---

## タスク概要

Sprint-39で実施した `new Date()` → `new Date(Date.now())` 統一作業（30ファイル/120箇所）の残存箇所3箇所を修正する。
テスト環境で `Date.now` をモックする際、`new Date()` は `Date.now()` のスタブが反映されないケースがあるため、プロダクションコードでは `new Date(Date.now())` を使用する規約となっている。

## 対象BDDシナリオ

- なし（内部実装の一貫性修正。振る舞いの変更なし）

## 必読ドキュメント（優先度順）

1. [必須] `src/lib/services/auth-service.ts` — 修正対象（L325, L406）
2. [必須] `src/lib/infrastructure/repositories/auth-code-repository.ts` — 修正対象（L232）
3. [参考] `src/lib/services/post-service.ts` L145 — 修正パターンの参考コメント

## 入力（前工程の成果物）

- なし

## 出力（生成すべきファイル）

- `src/lib/services/auth-service.ts` — L325, L406 の `new Date()` → `new Date(Date.now())` 修正
- `src/lib/infrastructure/repositories/auth-code-repository.ts` — L232 の `new Date()` → `new Date(Date.now())` 修正

## 完了条件

- [x] auth-service.ts 内のプロダクションコードに `new Date()` が存在しないこと（`new Date(Date.now())` に置換済み）
- [x] auth-code-repository.ts 内のプロダクションコードに `new Date()` が存在しないこと
- [x] `npx vitest run` 全件PASS
- [ ] テストコマンド: `npx vitest run`

## スコープ外

- テストファイル内の `new Date()` は対象外（テストでのフィクスチャ生成は `new Date()` で問題ない）
- aggregate-daily-stats.ts の `new Date()` は対象外（Next.jsランタイム外のスクリプト。タイムゾーン問題と合わせて別途対応）

## 補足・制約

- 変更は3行のみ。機能的な振る舞いは変わらない（`new Date(Date.now())` === `new Date()` と同等）
- 修正パターンの参考: `src/lib/services/post-service.ts` L145 にコメント付きの例がある

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全3箇所の修正およびテスト全件PASS確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- src/lib/services/auth-service.ts L325: `new Date()` → `new Date(Date.now())` 修正済み
- src/lib/services/auth-service.ts L406: `new Date()` → `new Date(Date.now())` 修正済み
- src/lib/infrastructure/repositories/auth-code-repository.ts L232: `new Date().toISOString()` → `new Date(Date.now()).toISOString()` 修正済み

### テスト結果サマリー
- 実行コマンド: `npx vitest run`
- テストファイル数: 39 passed (39)
- テストケース数: 1047 passed (1047)
- FAIL件数: 0
- 所要時間: 2.65s
