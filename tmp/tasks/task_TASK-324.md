---
task_id: TASK-324
sprint_id: Sprint-123
status: completed
assigned_to: bdd-coding
depends_on: [TASK-323]
created_at: 2026-03-26T19:00:00+09:00
updated_at: 2026-03-26T21:00:00+09:00
locked_files:
  - "src/lib/infrastructure/repositories/thread-repository.ts"
  - "src/lib/infrastructure/repositories/post-repository.ts"
  - "features/support/in-memory/thread-repository.ts"
  - "features/support/in-memory/post-repository.ts"
  - "src/lib/services/admin-service.ts"
  - "features/admin.feature"
  - "features/step_definitions/admin.steps.ts"
---

## タスク概要

soft delete（論理削除）のフィルタが一部のRepository関数に欠落しており、管理者が削除したスレッド・レスがURL直接アクセスで閲覧可能になっている。Repository層にフィルタを追加し、BDDシナリオで検証する。

## 対象BDDシナリオ
- `features/admin.feature` — 管理者削除関連シナリオ（既存 + 新規追加）

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_ATK-THREAD-001/assessment.md` — アーキテクト評価・修正方針
2. [必須] `src/lib/infrastructure/repositories/thread-repository.ts` — 現行実装
3. [必須] `src/lib/infrastructure/repositories/post-repository.ts` — 現行実装
4. [必須] `src/lib/services/admin-service.ts` — deleteThread の findById 呼び出し
5. [参考] `features/admin.feature` — 既存の管理者シナリオ

## 出力（生成すべきファイル）
- `src/lib/infrastructure/repositories/thread-repository.ts` — フィルタ追加版
- `src/lib/infrastructure/repositories/post-repository.ts` — フィルタ追加版
- `features/support/in-memory/thread-repository.ts` — フィルタ追加版（本番と対称化）
- `features/admin.feature` — 削除済みコンテンツ非表示シナリオ追加
- `features/step_definitions/admin.steps.ts` — 新シナリオのステップ定義
- `src/lib/services/admin-service.ts` — findById呼び出し調整

## 完了条件
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 全PASS（failed: 0）
- [ ] `findById`, `findByThreadKey` に `is_deleted=false` フィルタが追加されていること
- [ ] `findByThreadId` に `is_deleted=false` フィルタが追加されていること
- [ ] InMemory `findById`/`findByThreadKey` に `!t.isDeleted` が追加されていること
- [ ] AdminService の deleteThread が正常動作すること（削除済みスレッドの再削除は冪等）
- [ ] 新規BDDシナリオで削除済みスレッド/レスの非表示を検証すること

## スコープ外
- `findByBoardId`（既にフィルタあり、変更不要）
- 管理者画面の削除済み表示機能（管理者は削除済みを見える必要があるが、現在の管理APIは別の関数を使用）
- posting.feature のATK-002-3（存在しないスレッドへの書き込みFK制約問題）は別タスク

## 補足・制約

### 修正方針（アーキテクト推奨: 方針A）

**thread-repository.ts:**
```typescript
// findById: L76付近に追加
.eq("is_deleted", false)

// findByThreadKey: L97付近に追加
.eq("is_deleted", false)
```

**post-repository.ts:**
```typescript
// findByThreadId: L142付近に追加
.eq("is_deleted", false)
```

**InMemory thread-repository.ts:**
```typescript
// findById: isDeleted チェック追加
if (thread && thread.isDeleted) return null;

// findByThreadKey: isDeleted チェック追加
if (thread && thread.isDeleted) return null;
```

**AdminService.deleteThread 対応:**
- `findById` にフィルタ追加後、削除済みスレッドの再削除は `null` → not_found になる
- これは冪等性の観点から正常動作（既に削除済み）
- `AdminService.deleteThread` で `findById` の代わりに直接 Supabase クエリを使うか、`findByIdIncludeDeleted` を追加するか、いずれかで対応

### 追加BDDシナリオ案

`features/admin.feature` に以下を追加:

```gherkin
Scenario: 管理者が削除したスレッドはURL直接アクセスでも表示されない
  Given 管理者がログイン済みである
  And スレッド "問題のスレッド" が存在する
  When 管理者がスレッド "問題のスレッド" を削除する
  Then スレッド "問題のスレッド" のURLに直接アクセスしてもスレッドが表示されない

Scenario: 管理者が削除したレスはスレッド閲覧時に表示されない
  Given 管理者がログイン済みである
  And スレッドにレス "不適切な内容" が存在する
  When 管理者がそのレスを削除する
  Then スレッドを閲覧してもそのレスは表示されない
```

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

#### 修正方針の整理
1. `thread-repository.ts`: `findById`, `findByThreadKey` に `.eq("is_deleted", false)` 追加
2. `post-repository.ts`: `findByThreadId` に `.eq("is_deleted", false)` 追加 (latestCount分岐含む)
3. InMemory `thread-repository.ts`: `findById`, `findByThreadKey` に `isDeleted` チェック追加 + `_findByIdIncludeDeleted` ヘルパー追加
4. InMemory `post-repository.ts`: 変更不要（既にフィルタあり）
5. `admin-service.ts`: 変更不要（findById が null を返すことで not_found が冪等に返る）
6. `admin.feature`: 削除済みコンテンツ非表示シナリオ3件追加
7. `admin.steps.ts`: 新シナリオのステップ定義追加 + 既存テスト修正（_findByIdIncludeDeleted使用）
8. `PostRepository.create` -> `createWithAtomicNumber` 置換: 対象なし（ステップ定義では `_insert` または `createWithAtomicNumber` を使用済み）

#### 実装内容
- `src/lib/infrastructure/repositories/thread-repository.ts`: findById, findByThreadKey に `.eq("is_deleted", false)` 追加
- `src/lib/infrastructure/repositories/post-repository.ts`: findByThreadId の latestCount 分岐と通常分岐の両方に `.eq("is_deleted", false)` 追加
- `features/support/in-memory/thread-repository.ts`: findById, findByThreadKey に `isDeleted` チェック追加。テスト用 `_findByIdIncludeDeleted` ヘルパー追加
- `features/admin.feature`: 3シナリオ追加（削除済みスレッド非表示、削除済みレス非表示、再削除冪等性）
- `features/step_definitions/admin.steps.ts`: 5ステップ定義追加 + 既存テスト修正

### テスト結果サマリー
- **vitest**: 98 test files, 1896 tests passed, 0 failed
- **cucumber-js**: 355 scenarios (334 passed, 5 undefined, 16 pending, 0 failed), 1862 steps (1793 passed, 0 failed)
- undefined/pending はこのタスクとは無関係の既存状態
