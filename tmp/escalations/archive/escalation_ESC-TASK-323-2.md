---
escalation_id: ESC-TASK-323-2
task_id: TASK-323
status: open
created_at: 2026-03-26T18:25:00+09:00
---

## 問題

BDDステップ定義ファイル2件が旧API（`PostRepository.create` / `InMemoryPostRepo.getNextPostNumber`）を呼び出しており、`npx cucumber-js` で12件のfailure（failed: 12）が発生している。

これらのファイルは locked_files に含まれていないため、修正権限がない。

## 影響範囲

### 修正が必要なファイル

1. **`features/step_definitions/thread.steps.ts`**
   - L969: `await PostRepository.create({...})` -> `await PostRepository.createWithAtomicNumber({...})`
   - L1416: `await PostRepository.create({...})` -> `await PostRepository.createWithAtomicNumber({...})`
   - 影響シナリオ: 9件 failed

2. **`features/step_definitions/incentive.steps.ts`**
   - L1128: `await InMemoryPostRepo.getNextPostNumber(...)` -> 削除して `createWithAtomicNumber` 結果の `postNumber` を使用
   - 影響シナリオ: 3件 failed（1件は getNextPostNumber not a function、2件はキリ番ボーナス未付与）

### 修正内容の性質

全て機械的なAPI名の置換であり、振る舞いの変更はない。TASK-323で実施した `getNextPostNumber` + `create` -> `createWithAtomicNumber` の統合に伴うAPI名変更のみ。

## 選択肢

### A. locked_files に2ファイルを追加して修正を許可する（推奨）
- `features/step_definitions/thread.steps.ts`
- `features/step_definitions/incentive.steps.ts`
- メリット: TASK-323の完了条件（cucumber-js 全PASS）を達成できる
- 影響: 機械的置換のみ、振る舞い変更なし

### B. TASK-323の完了条件を「vitest全PASS」のみに緩和する
- メリット: ステップ定義の修正を別タスクに分離できる
- デメリット: BDDテストが12件failedのまま残る

## 関連情報
- Feature: `features/posting.feature`, `features/thread.feature`, `features/incentive.feature`
- 現在の vitest 結果: 98ファイル 1896テスト 全PASS
- 現在の cucumber-js 結果: 352 scenarios (12 failed, 5 undefined, 13 pending, 322 passed)
