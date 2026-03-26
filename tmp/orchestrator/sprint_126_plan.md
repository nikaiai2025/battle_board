# Sprint-126: !copipe コマンド実装

> 開始: 2026-03-26
> ステータス: **completed**

## 目的

承認済みBDDシナリオ `features/command_copipe.feature` を実装し、`!copipe` コマンドを本番稼働させる。

## スコープ

- DB migration (copipe_entries テーブル)
- CopipeRepository (Supabase + InMemory)
- CopipeHandler (コマンドハンドラ)
- commands.yaml への copipe 追加
- 単体テスト + BDDステップ定義
- Seed スクリプト + GHA ワークフロー + ci-failure-notifier 更新

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-328 | !copipe メイン実装（Migration + Repository + Handler + Config + Tests + BDD Steps） | bdd-coding | なし | **completed** |
| TASK-329 | !copipe インフラ（Seed Script + GHA Workflow + ci-failure-notifier） | bdd-coding | なし | **completed** |

## locked_files 照合

| ファイル | TASK-328 | TASK-329 |
|---|---|---|
| `supabase/migrations/00032_copipe_entries.sql` [NEW] | x | |
| `src/lib/services/handlers/copipe-handler.ts` [NEW] | x | |
| `src/lib/infrastructure/repositories/copipe-repository.ts` [NEW] | x | |
| `src/__tests__/lib/services/handlers/copipe-handler.test.ts` [NEW] | x | |
| `features/support/in-memory/copipe-repository.ts` [NEW] | x | |
| `features/step_definitions/command_copipe.steps.ts` [NEW] | x | |
| `config/commands.yaml` | x | |
| `src/lib/services/command-service.ts` | x | |
| `features/support/mock-installer.ts` | x | |
| `scripts/seed-copipe.ts` [NEW] | | x |
| `.github/workflows/seed-copipe.yml` [NEW] | | x |
| `.github/workflows/ci-failure-notifier.yml` | | x |

**重複なし → 並行実行可能**

## 結果

### TASK-328: メイン実装
- 新規ファイル6件 + 既存変更4件
- vitest: 1916 passed / 1 failed (schema-consistency — copipe_entries未適用のため想定内)
- BDD: 340 passed (+6) / 16 pending / 0 failed — 既存334件退行なし
- copipe-handler.test.ts: 21テスト全PASS

### TASK-329: インフラ
- 新規ファイル2件 + 既存変更1件
- tsc --noEmit: PASS
- seed-copipe.ts / seed-copipe.yml / ci-failure-notifier.yml 全て完了

### 判定
- エスカレーション: なし
- BDDシナリオ変更: なし（feature ファイル未変更）
- **自律進行可能** → Git コミット・プッシュへ
