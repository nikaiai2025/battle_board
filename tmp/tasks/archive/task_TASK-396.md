---
task_id: TASK-396
sprint_id: Sprint-155
status: completed
assigned_to: bdd-coding
depends_on: [TASK-392]
created_at: 2026-04-19
updated_at: 2026-04-19
locked_files:
  - "config/commands.ts"
---

## タスク概要

TASK-392 で `config/commands.yaml` に `yomiage` エントリを追加したが、
Cloudflare Workers 用の TypeScript ミラー `config/commands.ts` への反映が漏れていた。
CF Workers 環境では `commands.ts` をランタイム設定として使用するため、本ファイルに yomiage を追加しないと本番で動作しない。
`commands.yaml` の yomiage 定義を `commands.ts` に機械的に同期する。

## 対象BDDシナリオ

- `features/command_yomiage.feature` — 既存BDDテストへの影響なし（BDDはモック経由のため）

## 必読ドキュメント

1. [必須] `config/commands.yaml` L107-115 — 追加済みの yomiage エントリ（コスト・設定の正本）
2. [必須] `config/commands.ts` — 追記先ファイル（既存コマンドのパターンを踏襲）

## 出力

`config/commands.ts` の `commands:` オブジェクトに以下を追加する（`copipe` の直後）:

```typescript
    // TASK-392: !yomiage コマンド追加（指定レス音声化・非ステルス）
    // See: features/command_yomiage.feature
    yomiage: {
      description: "指定レスを音声化する",
      cost: 30,
      targetFormat: ">>postNumber" as const,
      responseType: "independent" as const,
      enabled: true,
      stealth: false,
    },
```

**注意**: `config/commands.yaml` が正本。`commands.ts` は CF Workers 用のミラー。
コスト・設定値は yaml に完全一致させること。

## 完了条件

- [ ] `config/commands.ts` に yomiage エントリが追加されていること
- [ ] `npx tsc --noEmit` が PASS すること
- [ ] `npx vitest run` 全体で回帰なし

## 補足

- TASK-395 の BDD Before フックに追加した `commandsConfig.commands.yomiage` 補完ワークアラウンドは本修正後も残してよい（BDD 環境では harmless）
- `commands.ts` の型 `CommandsYaml` が yomiage を許容するか確認し、型エラーがあれば型定義側も確認すること（ただし型定義変更は通常不要）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: config/commands.ts に yomiage エントリ追加、tsc PASS、vitest PASS
- 未解決の問題: なし

### 進捗ログ
- config/commands.yaml L107-113 の yomiage 定義を確認
- config/commands.ts の copipe エントリ直後に yomiage エントリを追加
- `npx tsc --noEmit` → エラーなし PASS
- `npx vitest run` → 129 ファイル / 2344 テスト PASS（回帰なし）

### テスト結果サマリー
| テスト種別 | 結果 | 件数 |
|---|---|---|
| npx tsc --noEmit | PASS | - |
| npx vitest run | PASS | 129 files / 2344 tests |
