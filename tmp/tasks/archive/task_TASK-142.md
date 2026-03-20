---
task_id: TASK-142
sprint_id: Sprint-50
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-18T03:00:00+09:00
updated_at: 2026-03-18T03:00:00+09:00
locked_files:
  - features/step_definitions/admin.steps.ts
  - features/step_definitions/ai_accusation.steps.ts
  - features/step_definitions/bot_system.steps.ts
  - features/step_definitions/reactions.steps.ts
---

## タスク概要

InMemoryリポジトリにUUIDバリデーションが追加されたことで、ステップ定義内で使われている非UUID文字列（`nonexistent-XXX`等）がエラーになるようになった。これらを `crypto.randomUUID()` に修正する。

## 対象BDDシナリオ

カテゴリA: ステップ定義が非UUID文字列を使っているために失敗する6シナリオ

## 必読ドキュメント（優先度順）

1. [必須] `features/step_definitions/admin.steps.ts` — L296, L1089, L1152, L1492 周辺
2. [必須] `features/step_definitions/ai_accusation.steps.ts` — L186 周辺
3. [必須] `features/step_definitions/bot_system.steps.ts` — L273 周辺
4. [必須] `features/step_definitions/reactions.steps.ts` — L715 周辺
5. [参考] admin.steps.ts L269 — `crypto.randomUUID()` を使った正しい実装パターン

## 出力（生成すべきファイル）

- `features/step_definitions/admin.steps.ts` — 非UUID文字列を修正
- `features/step_definitions/ai_accusation.steps.ts` — 非UUID文字列を修正
- `features/step_definitions/bot_system.steps.ts` — 非UUID文字列を修正
- `features/step_definitions/reactions.steps.ts` — 非UUID文字列を修正

## 完了条件

- [ ] 修正した箇所で `crypto.randomUUID()` を使用している
- [ ] 既存テストのうちカテゴリA（非UUID文字列起因）のFAILが解消される
- [ ] カテゴリB（`>>N → UUID` 変換起因）のFAILは別タスク（TASK-143）で対応するため、本タスクでは解消不要
- [ ] テストコマンド: `npx cucumber-js`（全体実行で22 failed → 16 failedに減ることを確認）

## スコープ外

- `>>N → UUID` 変換ロジックの実装（TASK-143）
- BDDシナリオ（features/*.feature）の変更
- InMemoryリポジトリの変更
- src/ 配下のプロダクションコードの変更

## 補足・制約

- 正しい実装パターンは `admin.steps.ts` L269: `crypto.randomUUID()` で存在しないが有効なUUID形式の文字列を使う
- 修正対象はステップ定義のみ。テストの意図（「存在しないリソースへの操作」の検証）は変えない
- admin.steps.ts 内にも非UUID文字列がある可能性あり（L296, L1089, L1152, L1492を確認すること）
- 変更箇所は全てgrep `nonexistent` で検索して網羅的に確認すること

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全修正完了、テストPASS確認済み
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- [x] タスク指示書の内容確認
- [x] 対象ファイルのnonexistent文字列をgrepで特定
- [x] cucumber-jsを実行してFAIL22件の原因を特定
- [x] admin.steps.ts の TEST_ADMIN_ID / TEST_NON_ADMIN_USER_ID を crypto.randomUUID() に修正
- [x] bot_system.steps.ts の非UUID文字列（nonexistent-post-、attacker-post-、bot-dummy、test-attacker）を修正
- [x] ai_accusation.steps.ts の非UUID文字列（nonexistent-${postNumber}）を修正
- [x] reactions.steps.ts の非UUID文字列（nonexistent-post-${postNumber}）を修正
- [x] テスト実行（22 failed → 12 failed に減少を確認）

### テスト結果サマリー

- 修正前: 234 scenarios (22 failed, 7 pending, 205 passed)
- 修正後: 234 scenarios (12 failed, 7 pending, 215 passed)
- 修正により解消したFAIL: 10件（カテゴリA：非UUID文字列起因）
  - admin.feature: 6件解消（TEST_ADMIN_ID / TEST_NON_ADMIN_USER_ID を UUID に変更）
  - ai_accusation.feature: 1件解消（存在しないレスへのAI告発テスト）
  - bot_system.feature: 3件解消（存在しないレスへの攻撃、ランダムスレッド選択、生存日数リセット）
- 残存FAIL: 12件（全てカテゴリB: >>N → UUID変換未実装、TASK-143対象）
  - command_system.feature: 8件
  - reactions.feature: 4件
