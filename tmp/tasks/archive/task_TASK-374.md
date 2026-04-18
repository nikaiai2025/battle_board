---
task_id: TASK-374
sprint_id: Sprint-147
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-29T18:00:00+09:00
updated_at: 2026-03-29T18:00:00+09:00
locked_files:
  - src/app/api/admin/bots/route.ts
  - src/app/(admin)/admin/bots/page.tsx
---

## タスク概要

管理画面のBOT一覧（活動中タブ）に「次回投稿予定」列を追加する。DB（`bots.next_post_at`）・Repository（`Bot.nextPostAt`）は既に対応済みのため、APIレスポンスとUIの2箇所のみ変更する。

## 必読ドキュメント（優先度順）

1. [必須] `src/app/api/admin/bots/route.ts` — 変更対象API
2. [必須] `src/app/(admin)/admin/bots/page.tsx` — 変更対象UI
3. [参考] `src/lib/infrastructure/repositories/bot-repository.ts` — `findActive()` が返す Bot 型に `nextPostAt: Date | null` が既に含まれている

## 修正内容

### 1. API レスポンスに nextPostAt を追加

`src/app/api/admin/bots/route.ts`:
- 活動中BOTのレスポンスマッピング（行84-93）に `nextPostAt: bot.nextPostAt?.toISOString() ?? null` を追加
- JSDoc のレスポンスフィールド一覧にも `nextPostAt` を追記

### 2. UI テーブルに列を追加

`src/app/(admin)/admin/bots/page.tsx`:
- `ActiveBot` インターフェースに `nextPostAt: string | null` を追加
- 活動中BOTテーブルのヘッダーに「次回投稿予定」列を追加（「告発回数」と「操作」の間）
- テーブルボディに対応するセルを追加
  - `nextPostAt` が null の場合は「-」を表示
  - null でない場合は `formatDateTime(bot.nextPostAt)` で表示（既存の `formatDateTime` を使う）
  - 過去の日時の場合（＝投稿待ち状態）は視覚的に区別できるとよい（例: テキスト色を変える）
- `colSpan` の数値を更新する（7→8）

## 完了条件

- [ ] `npx vitest run` 全テストPASS（回帰なし）
- [ ] API レスポンスに `nextPostAt` が含まれること
- [ ] UI テーブルに「次回投稿予定」列が表示されること

## スコープ外

- 撃破済みBOTテーブルへの追加は不要（撃破済みはスケジュールが無意味）
- BDDシナリオの変更（管理画面の内部改善のため不要）
- テストの新規追加（既存テストの回帰確認のみ）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: API・UI両方の変更完了、全テストPASS
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `src/app/api/admin/bots/route.ts`: 活動中BOTレスポンスに `nextPostAt: bot.nextPostAt?.toISOString() ?? null` を追加。JSDocのフィールド一覧も更新。
2. `src/app/(admin)/admin/bots/page.tsx`:
   - `ActiveBot` インターフェースに `nextPostAt: string | null` を追加
   - テーブルヘッダーに「次回投稿予定」列を追加（「告発回数」と「操作」の間）
   - テーブルボディに対応するセルを追加（null→「-」、過去日時→amber色、未来日時→通常）
   - `colSpan` を 7→8 に更新（活動中テーブルの2箇所）
   - JSDocのコメントを更新

### テスト結果サマリー

- 単体テスト: 116 ファイル / 2218 テスト 全PASS（回帰なし）
- BDDシナリオ: 対象なし（タスク指示書「BDDシナリオの変更不要」）
