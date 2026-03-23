---
task_id: TASK-220
sprint_id: Sprint-79
status: completed
assigned_to: bdd-coding
depends_on: [TASK-219]
created_at: 2026-03-21T22:30:00+09:00
updated_at: 2026-03-21T22:30:00+09:00
locked_files:
  - "src/lib/services/post-service.ts"
  - "src/lib/infrastructure/repositories/post-repository.ts"
  - "src/lib/infrastructure/repositories/bot-post-repository.ts"
  - "src/lib/infrastructure/repositories/bot-repository.ts"
  - "src/app/(web)/_components/PostItem.tsx"
  - "src/app/(web)/_components/PostList.tsx"
  - "src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx"
  - "src/app/api/threads/[threadId]/route.ts"
  - "[NEW] src/types/post-with-bot-mark.ts"
  - "[NEW] src/app/(web)/_components/EliminatedBotToggleContext.tsx"
  - "[NEW] src/app/(web)/_components/EliminatedBotToggle.tsx"
  - "e2e/flows/bot-display.spec.ts"
  - "e2e/fixtures/data.fixture.ts"
  - "src/__tests__/lib/services/post-service.test.ts"
---

## タスク概要
設計書TASK-219に基づき、撃破済みBOT表示機能を実装する。バックエンドでbotMark情報を合成してフロントエンドに渡し、PostItem.tsxで目立たない表示（opacity 0.5）+ トグルUIによる表示/非表示切替を実現する。

## 対象BDDシナリオ
- `features/bot_system.feature` — 撃破済みボットのレスはWebブラウザで目立たない表示になる
- `features/bot_system.feature` — 撃破済みボットのレス表示をトグルで切り替えられる

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-219/design.md` — 設計書（全5章、本タスクの根拠）
2. [必須] `features/bot_system.feature` — 対象BDDシナリオ
3. [必須] `e2e/flows/bot-display.spec.ts` — E2Eテスト（test.fixme → 有効化する）
4. [必須] `e2e/fixtures/data.fixture.ts` — seedEliminatedBotThreadLocal（bot_posts INSERT修正）
5. [必須] `src/lib/services/post-service.ts` — PostService（getPostListWithBotMark新設）
6. [必須] `src/lib/infrastructure/repositories/bot-post-repository.ts` — findByPostIds新設
7. [必須] `src/lib/infrastructure/repositories/bot-repository.ts` — findByIds新設
8. [必須] `src/app/(web)/_components/PostItem.tsx` — opacity表示 + トグル条件レンダリング
9. [必須] `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` — Provider追加 + getPostListWithBotMark呼出
10. [必須] `src/app/api/threads/[threadId]/route.ts` — ポーリングAPI botMark対応
11. [参考] `src/lib/domain/models/post.ts` — Postドメインモデル（変更しない）
12. [参考] `src/lib/domain/models/bot.ts` — Botドメインモデル（isActive等）
13. [参考] `src/__tests__/lib/services/post-service.test.ts` — 既存単体テスト（追記先）

## 出力（生成すべきファイル）

### 新規作成
- `src/types/post-with-bot-mark.ts` — PostWithBotMark型定義
- `src/app/(web)/_components/EliminatedBotToggleContext.tsx` — トグル状態Context
- `src/app/(web)/_components/EliminatedBotToggle.tsx` — トグルUIコンポーネント

### 修正
- `src/lib/infrastructure/repositories/bot-post-repository.ts` — findByPostIds追加
- `src/lib/infrastructure/repositories/bot-repository.ts` — findByIds追加
- `src/lib/services/post-service.ts` — getPostListWithBotMark追加
- `src/app/(web)/_components/PostItem.tsx` — opacity表示 + トグル条件レンダリング
- `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` — Provider追加 + データフロー変更
- `src/app/api/threads/[threadId]/route.ts` — getPostListWithBotMark呼出
- `e2e/flows/bot-display.spec.ts` — test.fixme() を test() に変更
- `e2e/fixtures/data.fixture.ts` — seedEliminatedBotThreadLocal に bot_posts INSERT追加
- `src/__tests__/lib/services/post-service.test.ts` — getPostListWithBotMark テスト追加

## 完了条件
- [ ] `npx vitest run` 全テストPASS
- [ ] `npx tsc --noEmit` 0エラー
- [ ] `npx playwright test e2e/flows/bot-display.spec.ts` — 2テスト全PASS（fixme解除）
- [ ] `npx playwright test --project=e2e` — 既存テスト回帰なし
- [ ] 単体テスト: getPostListWithBotMark のセキュリティテスト（is_active=true → botMark=null）

## 実装手順（設計書に準拠）

### Step 1: 型定義
- `src/types/post-with-bot-mark.ts` を作成

### Step 2: リポジトリ拡張
- `BotPostRepository.findByPostIds()` を追加
- `BotRepository.findByIds()` を追加

### Step 3: サービス層
- `PostService.getPostListWithBotMark()` を追加（設計書§1.4の合成ロジック）
- セキュリティ: is_active=false のBOTのみ botMark を付与

### Step 4: フロントエンド
- `EliminatedBotToggleContext.tsx` 作成（設計書§3.2）
- `EliminatedBotToggle.tsx` 作成（設計書§3.3）
- `PostItem.tsx` 修正: opacity 0.5 + トグル条件レンダリング（設計書§2.2, §3.4）
- `page.tsx` 修正: EliminatedBotToggleProvider + getPostListWithBotMark呼出（設計書§4.1, §4.2）
- `route.ts` (threads/[threadId]) 修正: getPostListWithBotMark呼出（設計書§4.3）

### Step 5: E2Eフィクスチャ修正
- `seedEliminatedBotThreadLocal()` に bot_posts INSERT追加（設計書§6）
  - posts INSERT後にレスポンスからpost_idを取得し、bot_postsに紐付け

### Step 6: テスト
- `src/__tests__/lib/services/post-service.test.ts` にgetPostListWithBotMark テスト追加
- `e2e/flows/bot-display.spec.ts` のtest.fixme() を test() に変更
- 全テスト実行

## スコープ外
- featureファイルの変更
- Postドメインモデル（src/lib/domain/models/post.ts）の変更
- OpenAPI仕様の変更
- PostListLiveWrapper.tsx 内部のデータ取得ロジック変更（APIレスポンスにbotMarkが含まれれば自動的に対応される）

## 補足・制約
- **セキュリティ最重要**: is_active=true のBOTの書き込みにbotMarkを付与してはならない。これはゲームの根幹「AIか人間か分からない」を破壊する
- **E2Eテスト**: bot-display.spec.ts のtest.fixme()を外してテストが全PASSすることが最終確認
- **seedの修正**: bot_postsテーブルへのINSERTが欠落している。postsのバッチINSERTをレスポンス取得形式（return=representation）に変更してpost_idを取得する必要あり
- **ローカル環境**: Supabase Local + Next.js dev が起動している必要がある

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全ステップ完了
- 未解決の問題: なし

### 進捗ログ
- [x] Step 1: src/types/post-with-bot-mark.ts 作成
- [x] Step 2: BotPostRepository.findByPostIds 追加
- [x] Step 2: BotRepository.findByIds 追加
- [x] Step 3: PostService.getPostListWithBotMark 追加
- [x] Step 4: EliminatedBotToggleContext.tsx 作成
- [x] Step 4: EliminatedBotToggle.tsx 作成
- [x] Step 4: PostItem.tsx 修正（opacity 0.5 + トグル条件レンダリング）
- [x] Step 4: page.tsx 修正（EliminatedBotToggleProvider + EliminatedBotToggle + getPostListWithBotMark）
- [x] Step 4: route.ts 修正（getPostListWithBotMark呼出）
- [x] Step 5: data.fixture.ts 修正（bots/posts INSERTをreturn=representation形式に変更、bot_posts INSERT追加）
- [x] Step 6: src/__tests__/lib/services/post-service.test.ts 新規作成（8テスト）
- [x] Step 6: bot-display.spec.ts の test.fixme() を test() に変更（2テスト有効化）
- [x] 回帰修正: pinned-thread.test.ts, lib/services/__tests__/post-service.test.ts にBotPostRepository/BotRepositoryモック追加

### テスト結果サマリー
- 単体テスト（Vitest）: 72ファイル 1535テスト 全PASS
- TypeScript型チェック: 0エラー
- E2E bot-display.spec.ts: 2テスト全PASS（fixme解除）
- E2E --project=e2e 全体: 16テスト全PASS（回帰なし）
