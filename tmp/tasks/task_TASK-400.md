---
task_id: TASK-400
sprint_id: Sprint-157
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-05-30T00:00:00+09:00
updated_at: 2026-05-30T00:00:00+09:00
locked_files:
  - src/__tests__/lib/services/post-service.test.ts
---

## タスク概要

`src/__tests__/lib/services/post-service.test.ts` の `PostService.createThread — BOT書き込み（isBotWrite）` describe ブロック内、3件のテストが失敗している。
原因: `ThreadRepository` のモック（L70付近）に `findByThreadKey` が未登録のため、`generateUniqueThreadKey` から呼び出した際に Vitest が「No "findByThreadKey" export is defined」エラーを返す。
`findByThreadKey: vi.fn().mockResolvedValue(null)` をモック定義に追加して3件すべてを PASSさせる。

## 対象BDDシナリオ

なし（単体テストのモック誤検知修正）

## 必読ドキュメント（優先度順）

1. [必須] `src/__tests__/lib/services/post-service.test.ts` — L70 の `vi.mock("../../../lib/infrastructure/repositories/thread-repository", ...)` と L783〜 の `describe("PostService.createThread — BOT書き込み（isBotWrite）")` を確認

## 出力（生成すべきファイル）

- `src/__tests__/lib/services/post-service.test.ts` — `findByThreadKey: vi.fn().mockResolvedValue(null)` 追加

## 完了条件

- [ ] `npx vitest run src/__tests__/lib/services/post-service.test.ts` が全件PASS
- [ ] 既存のテストに回帰なし

## スコープ外

- post-service.ts 本体の変更
- 他のテストファイルの変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: findByThreadKey モック追加、全件PASS確認
- 未解決の問題: なし

### 進捗ログ

- `src/__tests__/lib/services/post-service.test.ts` L78 に `findByThreadKey: vi.fn().mockResolvedValue(null)` を追加

### テスト結果サマリー

- `npx vitest run src/__tests__/lib/services/post-service.test.ts`: 22件 PASS / 0件 FAIL
