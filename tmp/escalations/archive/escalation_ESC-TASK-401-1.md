---
escalation_id: ESC-TASK-401-1
task_id: TASK-401
status: open
created_at: 2026-05-30T00:00:00+09:00
---

## 問題の内容

`curation_bot.feature` の「BOTの投稿間隔は120時間〜240時間のランダム間隔である」シナリオが FAIL している。

原因: `features/step_definitions/curation_bot.steps.ts` の `When` ステップが `TopicDrivenSchedulingStrategy` をデフォルトコンストラクタでインスタンス化しており、`bot_profiles.yaml` の設定値を参照しない。
そのため、`topic-driven.ts` 自体のデフォルト定数（`DEFAULT_MIN_MINUTES = 720`, `DEFAULT_MAX_MINUTES = 1440`）が使われ、テストが期待する 7200〜14400 分の範囲外になる。

変更が必要なファイル:
- `src/lib/services/bot-strategies/scheduling/topic-driven.ts`（locked_files 外）

必要な変更（機械的な数値置換）:
- `DEFAULT_MIN_MINUTES = 720` → `7200`
- `DEFAULT_MAX_MINUTES = 1440` → `14400`
- コメント・JSDoc 内の「720〜1440分」「12〜24時間」→「7200〜14400分（120〜240時間）」

## 選択肢と影響

| 選択肢 | 影響 |
|---|---|
| A. `topic-driven.ts` を locked_files に追加して変更を許可する | TASK-401 の変更内容と完全に整合し、テストが PASS になる |
| B. `curation_bot.steps.ts` の When ステップを修正して bot_profiles から値を読み込む | ステップ定義が複雑化する。ステップ定義ファイルは locked_files に含まれるため変更可能だが、設計的には実装側（topic-driven.ts）の定数変更が自然 |

推奨: 選択肢 A（`topic-driven.ts` を変更対象に追加）

## 関連シナリオ

- `features/curation_bot.feature` `@BOTの投稿間隔は120時間〜240時間のランダム間隔である`
