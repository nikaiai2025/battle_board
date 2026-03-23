---
task_id: TASK-268
sprint_id: Sprint-95
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-22T23:30:00+09:00
updated_at: 2026-03-22T23:30:00+09:00
locked_files:
  - src/lib/services/post-service.ts
---

## タスク概要

BOT書き込み時に `posts.author_id` にbotId（botsテーブルのID）がINSERTされ、`posts_author_id_fkey` FK制約違反で全BOT投稿が失敗するバグを修正する。

## 必読ドキュメント（優先度順）

1. [必須] `tmp/reports/2026-03-22_cf_error_investigation.md` — 障害調査レポート（根本原因・修正方針）
2. [必須] `src/lib/services/post-service.ts` — 修正対象（L415-417付近）

## 修正内容

`post-service.ts` L415-417付近:

```typescript
// 現状（バグ）:
if (input.botUserId) {
  resolvedAuthorId = input.botUserId;  // ← botsテーブルのIDがposts.author_idに入る → FK違反
}
```

スキーマ設計の意図:
- BOTの `posts.author_id` は **NULL** のまま維持する（00001_create_tables.sql L60のコメントに明記）
- BOTとの紐付けは `bot_posts` テーブルで行う

修正方針:
- `resolvedAuthorId` へのbotUserId代入を除去する
- コマンドパイプライン等で `botUserId` が必要な場合は別変数で管理する
- BOT書き込み時の `author_id` が NULL になることを確認

## 完了条件

- [ ] BOT書き込み時に `posts.author_id` が NULL でINSERTされる
- [ ] コマンドパイプラインの既存動作が維持される（`botUserId` を使う箇所がないか確認）
- [ ] `npx vitest run` 全テストPASS

## スコープ外

- IncentiveServiceのスキップ（Sprint-93 TASK-263で修正済み）
- BOTの本番動作検証（デプロイ後のcron検証は別途）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. 障害レポートと修正対象ファイルを読んで根本原因を確認
2. TDD Red: `createPost` のBOT書き込みテストを追加（authorId=nullを期待 → Red確認）
3. TDD Green: `post-service.ts` を修正（Step 3a と Step 5）
4. 全テスト実行でPass確認

### 修正内容

`src/lib/services/post-service.ts`:
- **Step 3a（L410-417）**: `resolvedAuthorId = input.botUserId` の代入を削除。
  BOT書き込み時の `posts.author_id` は NULL のまま維持（FK制約準拠）。
- **Step 5（L463-467）**: コマンドパイプラインの `userId` を `input.botUserId ?? resolvedAuthorId ?? ""` に変更。
  BOT書き込み時は `input.botUserId` を直接参照する。
- **PostInput.botUserId JSDoc**: 実態に合わせたコメントに更新。

`src/__tests__/lib/services/post-service.test.ts`:
- `createPost — BOT書き込み` テストスイートを追加（3テスト）
- 必要なモック（ThreadRepository、AuthService、CurrencyService、IncentiveService等）を追加

### テスト結果サマリー

- 単体テスト: 82 ファイル、1678 テスト PASS
- BDD テスト: 285 scenarios PASS、16 pending（既存の未実装スケルトン）、FAIL なし
