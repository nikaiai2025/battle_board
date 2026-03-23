---
task_id: TASK-259
sprint_id: Sprint-90
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-22T00:00:00+09:00
updated_at: 2026-03-22T00:00:00+09:00
locked_files:
  - src/lib/services/post-service.ts
---

## タスク概要

独立システムレスの dailyId がハッシュ値で生成されているバグを修正する。モデル定義 (`src/lib/domain/models/post.ts` L22) では「システムメッセージの場合は "SYSTEM"」と規定されているが、実装ではシステムレスも通常レスと同じく `generateDailyId()` でハッシュ計算してしまっている。

## 必読ドキュメント（優先度順）

1. [必須] `src/lib/services/post-service.ts` — 修正対象（Step 4: 日次リセットID 生成）
2. [参考] `src/lib/domain/models/post.ts` — Post.dailyId の仕様コメント（L22）

## 修正内容

`post-service.ts` の Step 4（日次リセットID 生成、L433-438付近）を修正:

```typescript
// 修正前
const dailyId = generateDailyId(authorIdSeed, boardId, dateJst);

// 修正後
const isSystemMessage = input.isSystemMessage ?? false;
const dailyId = isSystemMessage ? "SYSTEM" : generateDailyId(authorIdSeed, boardId, dateJst);
```

注意: `isSystemMessage` 変数は現在 L445 で宣言されている。dailyId生成（L438）より後。変数の宣言位置を調整するか、`input.isSystemMessage` を直接参照する。

## 完了条件

- [x] `isSystemMessage=true` の場合、dailyId が `"SYSTEM"` になる
- [x] 通常レスの dailyId 生成に影響がない
- [x] `npx vitest run` 全テストPASS

## スコープ外

- BDDシナリオの変更
- 既存DBデータの修正（過去のシステムレスのdailyIdは変更しない）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `src/lib/services/post-service.ts` Step 4 を修正
   - `isSystemMessage` 変数を L438 の `dailyId` 生成より前（L438）に移動
   - `dailyId` 生成を `isSystemMessage ? "SYSTEM" : generateDailyId(...)` に変更
2. 新規テストファイルを作成: `src/__tests__/lib/services/post-service-system-message-daily-id.test.ts`
   - 5件のテストケースを追加（isSystemMessage=true で SYSTEM 固定、通常レスは SYSTEM でない等）

### テスト結果サマリー

- `npx vitest run` 実行結果: 79 テストファイル PASS / 1643 テスト PASS
- 新規追加テスト 5件: 全 PASS
- 既存テスト回帰: 変化なし（全 PASS）
