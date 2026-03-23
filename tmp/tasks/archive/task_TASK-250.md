---
task_id: TASK-250
sprint_id: Sprint-85
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-21T22:00:00+09:00
updated_at: 2026-03-21T22:00:00+09:00
locked_files:
  - features/support/in-memory/bot-repository.ts
  - src/app/(web)/mypage/page.tsx
  - docs/architecture/components/bot.md
  - docs/architecture/components/posting.md
  - docs/architecture/components/currency.md
---

## タスク概要

Sprint-85のworktree消失で失われた3つの小規模変更を再実装する。
(1) InMemory bulkReviveEliminatedのチュートリアルBOT除外
(2) page.tsx へのPostHistorySection統合
(3) D-08ドキュメント更新

## 必読ドキュメント（優先度順）
1. [必須] `src/lib/infrastructure/repositories/bot-repository.ts` — 本番bulkReviveEliminated（チュートリアル除外あり）
2. [必須] `src/app/(web)/mypage/_components/PostHistorySection.tsx` — 既に作成済みのコンポーネント
3. [参考] `tmp/workers/bdd-architect_TASK-236/design.md` — ウェルカムシーケンス設計
4. [参考] `tmp/workers/bdd-architect_TASK-237/design.md` — マイページ設計

## 実装内容

### 1. InMemory bulkReviveEliminated のチュートリアルBOT除外

ファイル: `features/support/in-memory/bot-repository.ts`

本番実装 `src/lib/infrastructure/repositories/bot-repository.ts` の bulkReviveEliminated は
`.or("bot_profile_key.is.null,bot_profile_key.neq.tutorial")` で**チュートリアルBOTを除外**している。

InMemory版も同様に修正:
```typescript
export async function bulkReviveEliminated(): Promise<number> {
  let count = 0;
  for (const bot of store) {
    // チュートリアルBOTは復活させない（本番実装と一致）
    if (!bot.isActive && bot.botProfileKey !== "tutorial") {
      bot.isActive = true;
      bot.isRevealed = false;
      // ... 以下同じ
      count++;
    }
  }
  return count;
}
```

### 2. page.tsx へのPostHistorySection統合

ファイル: `src/app/(web)/mypage/page.tsx`

`src/app/(web)/mypage/_components/PostHistorySection.tsx` は既に作成済み。
page.tsx の書き込み履歴セクション（インライン実装）を `<PostHistorySection />` に置き換える。

- PostHistorySection をインポート
- 書き込み履歴の既存インライン表示部分を `<PostHistorySection userId={...} />` に置換
- PostHistorySection が必要とするprops（userId等）を渡す
- PostHistorySection.tsx の実装を確認し、必要なAPIルートが存在するか確認

### 3. D-08 ドキュメント更新

以下3ファイルをSprint-84実装内容に合わせて更新:

**bot.md** — チュートリアルBOT Strategy、processPendingTutorials、CF Cron統合、日次リセット除外を追記
**posting.md** — ウェルカムシーケンス（Step 6.5 初回検出 + Step 11.5 ウェルカムメッセージ）、botUserId を追記
**currency.md** — Currency v5（INITIAL_BALANCE 0→初回書き込みボーナスに移管）、welcome_bonus を追記

実装コードを読んで実際の振る舞いをドキュメントに反映すること。

## 完了条件
- [ ] InMemory bulkReviveEliminated がチュートリアルBOTを除外する
- [ ] page.tsx が PostHistorySection コンポーネントを使用している
- [ ] D-08 3ファイルが Sprint-84/85 実装を反映している
- [ ] `npx vitest run` で全テストPASS
- [ ] `npx cucumber-js features/welcome.feature` でチュートリアルBOT日次リセットシナリオがPASS

## スコープ外
- PostHistorySection.tsx 自体の変更
- processPendingTutorials 実装（TASK-249で実施）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全3タスク完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

#### (1) InMemory bulkReviveEliminated チュートリアルBOT除外
- `features/support/in-memory/bot-repository.ts` の `bulkReviveEliminated` に `bot.botProfileKey !== "tutorial"` 条件を追加
- 本番実装 `src/lib/infrastructure/repositories/bot-repository.ts` の `.or("bot_profile_key.is.null,bot_profile_key.neq.tutorial")` と動作を一致させた

#### (2) page.tsx への PostHistorySection 統合
- `src/app/(web)/mypage/page.tsx` に `PostHistorySection` をインポート
- `PostHistoryItem` 型定義、`posts` 状態変数、`fetchPostHistory` 関数を削除
- インライン書き込み履歴セクションを `<PostHistorySection />` に置き換え
- PostHistorySection は引数なし（内部でAPIを呼ぶ設計）

#### (3) D-08 ドキュメント更新
- `docs/architecture/components/bot.md`: チュートリアルBOT Strategy（§2.13.3）、processPendingTutorials（§2.11）、CF Cron統合（§3.2）、日次リセット除外・クリーンアップ（§2.10）、設計判断（§6.10）を追記。セクション番号を §2.11-2.12 → §2.12-2.13 に繰り下げ
- `docs/architecture/components/posting.md`: `PostInput.botUserId` フィールドと、ウェルカムシーケンス（Step 6.5・Step 11.5）を追記
- `docs/architecture/components/currency.md`: Currency v5（INITIAL_BALANCE 0への変更理由）と `welcome_bonus` CreditReason を追記

### テスト結果サマリー

#### npx vitest run
- 78テストファイル / 1633テスト: **全PASS**

#### npx cucumber-js features/welcome.feature
- 290シナリオ: 1 failed（既存・スコープ外）, 16 pending, 273 passed
- 「チュートリアルBOTは日次リセットで復活しない」シナリオ: **PASS**
- 1件のfail「チュートリアルBOTに偽装IDと名無しさん表示名が割り当てられる」はTASK-249スコープの既存fail（今回の修正とは無関係）
