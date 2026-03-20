---
task_id: TASK-132
sprint_id: Sprint-45
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-17T23:00:00+09:00
updated_at: 2026-03-17T23:00:00+09:00
locked_files:
  - src/lib/services/bot-service.ts
  - src/lib/services/bot-strategies/types.ts
  - src/lib/services/bot-strategies/strategy-resolver.ts
  - src/lib/services/bot-strategies/behavior/random-thread.ts
  - src/__tests__/lib/services/bot-service.test.ts
  - src/__tests__/lib/services/bot-strategies/strategy-resolver.test.ts
  - src/__tests__/lib/services/bot-strategies/random-thread.test.ts
---

## タスク概要

Phase 5コードレビュー（TASK-129）で検出されたHIGH指摘3件を修正する。全て内部リファクタリングであり、外部振る舞いの変更なし。

## 修正対象

### HIGH-001: 依存方向違反の解消
`strategy-resolver.ts` と `behavior/random-thread.ts` が `bot-service.ts` から `IThreadRepository` をインポートしている。
設計書 (D-08) の依存方向に反するため、`IThreadRepository` を `bot-strategies/types.ts` に移動する。

**修正手順:**
1. `src/lib/services/bot-strategies/types.ts` に `IThreadRepository` インターフェースを追加
2. `strategy-resolver.ts` と `random-thread.ts` のimport先を `types.ts` に変更
3. `bot-service.ts` からは `types.ts` の `IThreadRepository` を re-export するか、import先を変更

### HIGH-002: 型定義重複の解消
`BotProfileReward` が `bot-service.ts` と `types.ts` の両方で定義されている。
`BotProfileInternal` は `types.ts` の `BotProfile` とほぼ同一。

**修正手順:**
1. `bot-service.ts` 内の `BotProfileReward` / `BotProfileInternal` を削除
2. `types.ts` の `BotProfileReward` / `BotProfile` を import して使用
3. `getBotProfileForStrategy` の変換処理を簡素化

### HIGH-003: ダミーBotオブジェクトの除去
`selectTargetThread` (L757-776) と `getNextPostDelay` (L820-839) にハードコードされたダミーBotオブジェクトが存在。

**修正手順:**
1. `selectTargetThread` と `getNextPostDelay` で bot が null の場合はエラーをスロー（`executeBotPost` と同じパターン）
2. もしくは共通のデフォルトBot生成ファクトリを1箇所に集約
3. テストを更新してエラーケースを検証

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-code-reviewer_TASK-129/code_review_report.md` — レビュー指摘の詳細
2. [必須] `docs/architecture/components/bot.md` — BOTコンポーネント設計（SS 2.12 Strategy）
3. [参考] `src/lib/services/bot-strategies/types.ts` — 現在の型定義

## 完了条件
- [x] `IThreadRepository` が `types.ts` に移動し、逆依存が解消
- [x] `BotProfileReward` / `BotProfileInternal` の重複が解消
- [x] ダミーBotオブジェクトが除去 or 共通化
- [x] `npx vitest run` 全件PASS (44ファイル / 1138テスト)
- [x] `npx cucumber-js` 221 passed, 7 pending, 0 failed

## スコープ外
- MEDIUM指摘（ファイルサイズ分割、require置換、N+1修正等）は本タスク対象外
- features/ の変更は禁止
- locked_files外のファイル変更が必要な場合はエスカレーション

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: HIGH-001/002/003 全修正完了、全テストPASS確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- 2026-03-17: タスク開始。全対象ファイル・レビューレポート読み込み完了
- 2026-03-17: HIGH-001: IThreadRepository を bot-strategies/types.ts に移動、bot-service.ts から re-export、strategy-resolver.ts と random-thread.ts のimport先変更
- 2026-03-17: HIGH-002: bot-service.ts 内の BotProfileReward/BotProfileInternal を削除、BotProfilesYaml を Record<string, BotProfile> に変更、getBotProfileForStrategy の変換処理を簡素化
- 2026-03-17: HIGH-003: selectTargetThread のダミーBot除去（createBotForStrategyResolution ファクトリに共通化）。getNextPostDelay も同様のファクトリ使用。ハードコード値を1箇所に集約
- 2026-03-17: テスト実行 → selectTargetThread でBot未検出時にBDDシナリオがFAIL。設計検討の結果、「Phase 2では Bot引数は未使用のため、Bot未検出でもcreateBotForStrategyResolutionでフォールバックして継続」に決定（locked_files 内のみで解決）
- 2026-03-17: bot-service.test.ts のテストケースを「ファクトリ共通化」の振る舞いを検証する内容に更新
- 2026-03-17: 全テスト PASS 確認

### テスト結果サマリー

- `npx vitest run`: 44 ファイル / 1138 テスト 全PASS（修正前比: +1ファイル, +43テスト）
- `npx cucumber-js`: 228 scenarios (221 passed, 7 pending, 0 failed) — タスク完了条件達成
