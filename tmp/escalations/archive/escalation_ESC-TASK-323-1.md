---
escalation_id: ESC-TASK-323-1
task_id: TASK-323
status: open
created_at: 2026-03-26T18:30:00+09:00
---

## 問題

TASK-323 の locked_files に含まれていない3つのテストファイルが、PostRepository のインターフェース変更（`getNextPostNumber` + `create` -> `createWithAtomicNumber`）により壊れている。

### 影響を受けるファイル

1. `src/lib/services/__tests__/post-service.test.ts` -- 38テスト失敗
   - `PostRepository.create` と `getNextPostNumber` をモック化しており、`createWithAtomicNumber` に置換が必要
2. `src/__tests__/lib/services/bot-w-command-integration.test.ts` -- 5テスト失敗
   - 同上
3. `src/__tests__/lib/services/pinned-thread.test.ts` -- 2テスト失敗
   - 同上
4. `src/__tests__/lib/services/ban-system.test.ts` -- 0テスト失敗（現時点）
   - `getNextPostNumber` をモックに含んでいるが、`create` も含むため将来的に壊れる可能性あり

### 必要な変更内容

全ファイルとも機械的なモック名置換のみ:
- `getNextPostNumber: vi.fn()` -> 削除
- `create: vi.fn()` -> `createWithAtomicNumber: vi.fn()`
- `vi.mocked(PostRepository.getNextPostNumber).mockResolvedValue(N)` -> 削除
- `vi.mocked(PostRepository.create).mockResolvedValue(...)` -> `vi.mocked(PostRepository.createWithAtomicNumber).mockResolvedValue(...)`

### 選択肢と影響

**選択肢A: locked_files にこれら4ファイルを追加し、ワーカーが修正する（推奨）**
- 影響: 機械的な置換のみ。振る舞い変更なし。テストの検証対象は変わらない
- リスク: 低。テスト内部のモック名変更のみ

**選択肢B: エスカレーション解決を待たず、別タスクで対応する**
- 影響: TASK-323 の完了条件「npx vitest run 全PASS」を満たせない
- リスク: タスクがブロックされる

### 関連 feature ファイル
- `features/posting.feature` -- 全書き込みシナリオ
