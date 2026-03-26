---
task_id: TASK-327
sprint_id: Sprint-125
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-26T12:00:00+09:00
updated_at: 2026-03-26T12:00:00+09:00
locked_files:
  - src/lib/infrastructure/repositories/post-repository.ts
  - features/support/in-memory/post-repository.ts
  - features/admin.feature
  - features/step_definitions/admin.steps.ts
---

## タスク概要

Sprint-123で `findByThreadId` に `.eq("is_deleted", false)` フィルタを追加したことにより、スレッド閲覧時に削除済みレスが完全に非表示になるバグが発生。設計意図は「削除レスもスレッド表示に含め、プレゼンテーション層で "このレスは削除されました" を表示する」であり、フィルタが過剰。

## 修正内容

`findByThreadId` から is_deleted フィルタを除去する（2ファイル・計3箇所）:

### 1. Supabase実装: `src/lib/infrastructure/repositories/post-repository.ts`
- L132付近（latestCount分岐）: `.eq("is_deleted", false)` を削除
- L148付近（通常分岐）: `.eq("is_deleted", false)` を削除

### 2. InMemory実装: `features/support/in-memory/post-repository.ts`
- L83付近: `.filter((p) => p.threadId === threadId && !p.isDeleted)` から `&& !p.isDeleted` を除去

### 注意: 他の関数のis_deletedフィルタは正しいので変更しないこと
- `findByAuthorId` — 投稿履歴検索（削除済みは不要）
- `findByDailyId` — 日次ID検索（削除済みは不要）
- `countByAuthorSince` 等 — 集計（削除済みは除外が正しい）
- `findPostsByAuthor` — 管理者用投稿検索（削除済みは除外が正しい）

## 完了条件
- [ ] `findByThreadId` の2ファイル3箇所から is_deleted フィルタを除去
- [ ] 単体テスト全件PASS: `npx vitest run`
- [ ] BDDテスト全件PASS: `npx cucumber-js`

## スコープ外
- UI層の変更（PostItem.tsx のプレースホルダー表示は実装済み）
- findByThreadId 以外の関数

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み:
  - `src/lib/infrastructure/repositories/post-repository.ts` の `findByThreadId` から `is_deleted` フィルタを2箇所除去（latestCount分岐・通常分岐）
  - `features/support/in-memory/post-repository.ts` の `findByThreadId` から `&& !p.isDeleted` を除去
  - `features/admin.feature` L69-73 シナリオを設計意図に合致する内容に書き換え
  - `features/step_definitions/admin.steps.ts` 修正B-1: スレッド削除時の全レス isDeleted 検証方式に変更
  - `features/step_definitions/admin.steps.ts` 修正B-2: 新ステップ定義「削除済みレスが一覧に含まれ isDeleted=true」を実装
- 未解決の問題: なし

### escalation_resolution (ESC-TASK-327-1)

人間が承認済み。以下2点を修正する:

#### 修正A: `features/admin.feature` L69-73 シナリオ書き換え（人間承認済み）

Feature説明（L6: 「レス削除時は "このレスは削除されました" に置き換わりレス番号は保持される」）と矛盾していたシナリオを修正する。

**Before:**
```gherkin
  Scenario: 管理者が削除したレスはスレッド閲覧時に表示されない
    Given 管理者がログイン済みである
    And スレッド "今日の雑談" にレス >>5 が存在する
    When レス >>5 の削除をコメントなしで実行する
    Then スレッドのレス一覧に削除済みレスが含まれない
```

**After:**
```gherkin
  Scenario: 管理者が削除したレスはスレッド閲覧時に「削除されました」と表示される
    Given 管理者がログイン済みである
    And スレッド "今日の雑談" にレス >>5 が存在する
    When レス >>5 の削除をコメントなしで実行する
    Then スレッドのレス一覧で削除済みレスが「このレスは削除されました」と表示される
```

#### 修正B: `features/step_definitions/admin.steps.ts` 2箇所の修正

1. **失敗1（admin.feature:50「管理者が指定したスレッドを削除する」）**: `Then スレッドとその中の全レスが削除される` のステップ定義で、`findByThreadId` の件数0検証ではなく、全レスの `isDeleted === true` をチェックする方式に変更
2. **失敗2（admin.feature:69 書き換え後）**: 新しいThenステップ `スレッドのレス一覧で削除済みレスが「このレスは削除されました」と表示される` のステップ定義を実装。`findByThreadId` で取得したレスのうち、削除されたレスの `isDeleted === true` を確認する（プレゼンテーション層のプレースホルダー表示はUI実装済みなので、BDDレベルではフラグの検証でOK）

### 進捗ログ
- 2026-03-26: `post-repository.ts`（Supabase実装）の`findByThreadId` からis_deletedフィルタ2箇所除去完了
- 2026-03-26: `features/support/in-memory/post-repository.ts` の`findByThreadId` からis_deletedフィルタ除去完了
- 2026-03-26: 単体テスト（`npx vitest run`）: 98ファイル・1896件全PASS
- 2026-03-26: BDDテスト（`npx cucumber-js`）: 355シナリオ中2件FAIL（admin.feature 2シナリオ）→ エスカレーション起票
- 2026-03-26: エスカレーション解決後再開。修正A（feature書き換え）+ 修正B（ステップ定義2箇所）実施
- 2026-03-26: 単体テスト全PASS（98ファイル 1896件）、BDDテスト全PASS（334 PASS / 0 FAIL）

### テスト結果サマリー（最終）
- 単体テスト: 98ファイル 1896件 全PASS
- BDDテスト: 355シナリオ中 334 PASS / 0 FAIL / 5 undefined / 16 pending
  - 前回FAIL2件 -> 修正後0件FAIL（admin.feature:50, admin.feature:69 ともにPASS確認済み）
