---
escalation_id: ESC-TASK-080-1
task_id: TASK-080
status: open
created_at: 2026-03-16T14:35:00+09:00
---

## 問題

TASK-080 で `config/commands.yaml` の `tell.cost` を 50 から 10 に変更したところ、`features/phase2/command_system.feature` の以下のシナリオが失敗する:

1. **「コマンド実行に通貨コストが必要な場合は通貨が消費される」シナリオ**:
   - `Then 通貨が 50 消費される` → 実際のコストは 10 なので失敗
   - `And 通貨残高が 50 になる` → 初期残高100 - コスト10 = 90 なので失敗

2. **「通貨不足でコマンドが実行できない場合はエラーになる」シナリオ**:
   - `Given ユーザーの通貨残高が 10 である` → cost=10 で残高10は十分であり、通貨不足にならない
   - `And レス末尾にエラー "通貨が不足しています"` が表示されない

3. **Background DataTable**: `| !tell | 50 | ...` はドキュメント目的だが、値が不一致

## 制約

- TASK-080 のタスク指示書は `command_system.feature` の変更を「スコープ外」と明記
- `command_system.feature` は locked_files に含まれていない（変更権限なし）
- しかし完了条件は「`npx cucumber-js` 全シナリオPASS」

## 選択肢

### A: command_system.feature を修正する（推奨）
- cost=50 を cost=10 に合わせて修正（Background DataTable + Then ステップの数値を更新）
- 影響: feature ファイル変更は人間承認が必要（CLAUDE.md の禁止事項）
- **この選択肢の場合、修正内容を承認してください**:
  - `| !tell | 50 |` → `| !tell | 10 |`
  - `通貨が 50 消費される` → `通貨が 10 消費される`
  - `通貨残高が 50 になる` → `通貨残高が 90 になる`
  - `ユーザーの通貨残高が 10 である`（通貨不足シナリオ）→ `ユーザーの通貨残高が 5 である`

### B: command_system.feature の修正を別タスクにする
- TASK-080 では ai_accusation.feature のみPASSさせる
- command_system.feature の修正は別タスクとして起票する
- 影響: 完了条件「全シナリオPASS」を満たさない（部分完了）

## 関連ファイル
- `features/phase2/command_system.feature` — 失敗するシナリオ
- `config/commands.yaml` — cost 変更元
- `features/phase2/ai_accusation.feature` — 今回の変更対象
