# Sprint-133 計画書

## 目的

コピペボット（HP:100 運営BOT）と運営BOTコマンドコスト免除の実装を完成させる。
アーキテクト側での変更（featureシナリオ・config・command-service）は完了済み。
コーディングAIが BDD ステップ定義・マイグレーション適用・テスト確認を担う。

## 背景

`tmp/orchestrator/memo_copipe_bot.md` 参照。
以下のファイルはすでに変更済み（未コミット）:

| ファイル | 変更内容 |
|---|---|
| `features/bot_system.feature` | 3シナリオ追加（コスト免除・コピペBOT書き込み・HP:100生存） |
| `config/bot_profiles.yaml` | コピペプロファイル追加（HP:100, reward: 50/20/3） |
| `config/bot-profiles.ts` | 同上のTSミラー同期 |
| `src/lib/services/command-service.ts` | `isBotGiver` 時のコスト免除（Step 3 + 戻り値） |
| `supabase/migrations/00033_seed_copipe_bot.sql` | DB配置用マイグレーション（untracked） |

## タスク

| TASK_ID | 内容 | 担当 | 状態 |
|---|---|---|---|
| TASK-341 | BDDステップ定義実装 + マイグレーション適用 + テスト確認 | bdd-coding | assigned |

### locked_files

**TASK-341:**
- `features/step_definitions/bot_system.steps.ts`

## 結果

| TASK_ID | 結果 | 備考 |
|---|---|---|
| TASK-341 | completed | 新規3シナリオ PASS / vitest 2003テスト PASS |

### テスト結果

- vitest: 102ファイル・2003テスト全PASS
- cucumber-js: 374 scenarios (8 failed, 5 undefined, 16 pending, 345 passed)
  - 新規3シナリオすべてPASS
  - 8 failed は Sprint-131 以前から存在する既存問題（command_copipe.feature の通貨不足エラー）。今回の変更による新規失敗なし

### マイグレーション

- `00033_seed_copipe_bot.sql` を本番DBに適用済み（supabase db push --linked）
