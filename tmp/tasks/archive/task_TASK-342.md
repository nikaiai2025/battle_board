---
task_id: TASK-342
sprint_id: Sprint-134
status: completed
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-342
depends_on: []
created_at: 2026-03-27T21:30:00+09:00
updated_at: 2026-03-27T21:30:00+09:00
---

## タスク概要

`npx cucumber-js features/command_copipe.feature` で 8 シナリオが失敗している原因を調査し、
修正方針を設計する。Sprint-127 で `!copipe` のコストを 0 → 3 に変更した際に発生したと推定される。
BDDテストコード（ステップ定義）のバグであり、本番コードへの影響はない。

## 症状

```
8 scenarios failed in features/command_copipe.feature
エラー: "通貨が不足しています\n📝 new_thread_join +3"
```

`!copipe`（コスト3）を実行しようとするが、テストユーザーの通貨残高が足りずに失敗している。

## 既知の情報

- `command_system.steps.ts` の「本文に {string} を含めて投稿する」ステップには
  コスト > 0 のコマンド実行前に残高を自動補填するロジックがある（`commandRegistry` 参照）
- 上記の自動補填が `command_copipe.feature` のシナリオでは機能していない
- `command_copipe.feature` の Background は以下の順序:
  1. `Given コマンドレジストリに以下のコマンドが登録されている:` (creates user + thread, sets commandRegistry)
  2. `And ユーザーがログイン済みである` (creates ANOTHER user)
  3. `And 以下のコピペAAが登録されている:`
- `features/command_copipe.feature` 自体は人間承認なしに変更不可

## 調査してほしいこと

1. 自動補填ロジック（`command_system.steps.ts` L841-870）がなぜ機能していないか
2. 根本原因の特定（ユーザーIDの不一致？ストアの参照先の違い？など）
3. 修正方針（どのファイルのどこを変えれば直るか）
4. 修正がスコープ外のファイルに影響しないかの確認

## 必読ファイル

1. `features/command_copipe.feature` — Background 構造確認
2. `features/step_definitions/command_system.steps.ts` L683-900 — 「本文に...を含めて投稿する」ステップ全体
3. `features/step_definitions/command_copipe.steps.ts` — copipe固有のステップ
4. `features/support/in-memory/currency-repository.ts` — _upsert, create, getBalance 実装
5. `features/support/hooks.ts` — Before フック、resetAllStores の内容
6. `src/lib/services/auth-service.ts` — issueEdgeToken（initializeBalance 呼び出し）
7. `src/lib/services/currency-service.ts` — INITIAL_BALANCE の値

## 出力

`tmp/workers/bdd-architect_TASK-342/analysis.md` に以下を記載:
- 根本原因
- 修正方針（変更ファイル・変更箇所・変更内容）
- 影響範囲

## 作業ログ

### チェックポイント
- 状態: 完了（調査・設計）
- 完了済み: 根本原因特定、修正方針設計、影響範囲分析
- 次にすべきこと: コーディングAIによる修正実装
- 未解決の問題: なし

### 調査結果サマリー

**根本原因:** `本文に {string} を含めて投稿する` ステップ (L691-723) に通貨自動補填ロジックがない。
`command_copipe.feature` の Background で `ユーザーがログイン済みである` が別ユーザー (残高0) を作成し、
`!copipe` (コスト3) 実行時に通貨不足で失敗する。

**修正方針:** `command_system.steps.ts` の `本文に {string} を含めて投稿する` ステップに、
`{string} を実行する` ステップ (L841-890) と同等の (a) 通貨自動補填ブロック と (b) IncentiveLog事前挿入ブロック を追加する。

**詳細:** `tmp/workers/bdd-architect_TASK-342/analysis.md`
