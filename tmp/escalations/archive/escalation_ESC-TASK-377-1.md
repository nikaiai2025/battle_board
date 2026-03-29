---
escalation_id: ESC-TASK-377-1
task_id: TASK-377
status: open
created_at: 2026-03-29T21:30:00+09:00
---

## 問題

TASK-377 の修正を実装するにあたり、`locked_files` に含まれていない以下のファイルの変更が必要です。

### 変更が必要なファイル一覧

| ファイル | 変更内容 | 必要な理由 |
|---|---|---|
| `src/lib/domain/models/thread.ts` | `createdBy: string` を `createdBy: string \| null` に変更 | 修正A: BOT作成スレッドの created_by=null を型レベルで許容するため |
| `src/lib/infrastructure/repositories/thread-repository.ts` | `ThreadRow.created_by: string` を `string \| null` に変更 | 修正A: DB側の NULLABLE 化に合わせてリポジトリの型を同期するため |
| `src/lib/services/bot-strategies/types.ts` | `IThreadRepository.findByBoardId` の返り値型を `{ id: string }[]` から `{ id: string; isPinned?: boolean }[]` に拡張 | 修正B: RandomThreadBehaviorStrategy が `.filter(t => !t.isPinned)` で固定スレッドを除外するために isPinned 情報が必要 |

### 補足

- いずれもタスク指示書の修正内容を実装するために不可避な変更です
- タスク指示書の「修正A」セクションに「ThreadRepository の型定義・INSERT文も createdBy: null を許容するよう確認・修正」と記載されています
- タスク指示書の「修正B」セクションに `.filter(t => !t.isPinned)` と記載されており、IThreadRepository の返り値型に isPinned が含まれる必要があります
- すべて後方互換性のある型拡張であり、既存コードを破壊しません

## 選択肢

### A. locked_files に上記3ファイルを追加して変更を許可する（推奨）

- 影響: 最小限の型拡張のみ。既存の動作に影響なし
- 所要時間: 追加なし（通常の修正作業の一部として実施）

### B. locked_files の変更なしで対応する（非推奨）

- 影響: `as any` 等の型アサーションが必要になり、型安全性が低下する
- thread-repository.ts の ThreadRow.created_by を変更できず、ランタイムエラーの可能性あり

## 関連ファイル

- `features/bot_system.feature` @荒らし役ボットは表示中のスレッドからランダムに書き込み先を選ぶ
- `features/curation_bot.feature` @キュレーションBOTが蓄積データから新規スレッドを立てる
