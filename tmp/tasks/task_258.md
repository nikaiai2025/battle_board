---
task_id: TASK-258
sprint_id: Sprint-89
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-22T00:00:00+09:00
updated_at: 2026-03-22T00:00:00+09:00
locked_files:
  - scripts/upsert-pinned-thread.ts
---

## タスク概要

固定スレッド（案内板）のコマンド一覧に隠しコマンド `!abeshinzo` が表示されるバグを修正する。`scripts/upsert-pinned-thread.ts` の `loadCommandConfigs()` が `hidden` フラグを無視しているのが原因。

## 必読ドキュメント（優先度順）

1. [必須] `scripts/upsert-pinned-thread.ts` — 修正対象スクリプト
2. [参考] `config/commands.yaml` — コマンド定義（hidden フラグ確認）

## 修正内容

### Step 1: フィルタ修正

`scripts/upsert-pinned-thread.ts` の `loadCommandConfigs()` 関数内:

```typescript
// 修正前
.filter(([, config]) => config.enabled)

// 修正後
.filter(([, config]) => config.enabled && !config.hidden)
```

型定義にも `hidden` フィールドが含まれているか確認し、なければ追加する。

### Step 2: テスト

- `npx vitest run` で既存テスト全PASSを確認
- 可能であれば `pinned-thread.test.ts` に隠しコマンド除外のテストケースを追加

## 完了条件

- [ ] `loadCommandConfigs()` が `hidden: true` のコマンドを除外する
- [ ] `npx vitest run` 全テストPASS

## スコープ外

- スクリプトの実行（本番DBへの反映）はデプロイ後に人間が手動で行う
- BDDシナリオの変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `scripts/upsert-pinned-thread.ts` の `CommandConfig` 型に `hidden?: boolean` フィールドを追加
2. `loadCommandConfigs()` のフィルタに `!config.hidden` を追加（`config.enabled && !config.hidden`）
3. `src/__tests__/lib/services/pinned-thread.test.ts` に `loadCommandConfigs — hidden コマンドの除外` describe ブロック（3ケース）を追加
   - `hidden: true` のコマンドが除外されることを確認
   - `hidden` フィールドなしのコマンドが除外されないことを確認
   - `enabled: false` のコマンドが除外されることを確認

### テスト結果サマリー

- `pinned-thread.test.ts`: 14件 PASS（既存11件 + 新規3件）
- 全体: 78ファイル 1638件 PASS
