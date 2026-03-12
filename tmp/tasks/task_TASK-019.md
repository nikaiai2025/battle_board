---
task_id: TASK-019
sprint_id: Sprint-8
status: completed
assigned_to: bdd-coding
depends_on: [TASK-018]
created_at: 2026-03-12T23:00:00+09:00
updated_at: 2026-03-12T23:00:00+09:00
locked_files:
  - src/lib/services/incentive-service.ts
  - features/step_definitions/incentive.steps.ts
---

## タスク概要

`incentive-service.ts` の `evaluateOnPost` には、呼び出し元の `post-service.ts` が「DB更新を全て完了してからインセンティブ評価を呼ぶ」ことに起因するバグが2件ある。`evaluateOnPost` 内のロジックが「今回の書き込み前の状態」を前提としているが、実際には「今回の書き込み後の状態」が渡されるため、判定が誤る。これを修正する。

### post-service.ts の実行順序（変更不可・参考情報）

```
PostRepository.create          ← ①レスがDBに存在する状態になる
ThreadRepository.updateLastPostAt ← ②lastPostAtが現在時刻に更新される
IncentiveService.evaluateOnPost  ← ③この時点で①②が完了済み
```

## 修正すべきバグ（2件）

### バグ1: new_thread_join（L248-249）

**現状:** `existingPosts` に今回の書き込み（`ctx.postId`）が含まれるため、初参加でも `isFirstTimeInThread = false` になる。

```typescript
// 現在（バグ）
const existingPosts = await PostRepository.findByThreadId(ctx.threadId)
const isFirstTimeInThread = !existingPosts.some(p => p.authorId === ctx.userId)
```

**修正:** 今回の書き込み（`ctx.postId`）を除外して判定する。

```typescript
const existingPosts = await PostRepository.findByThreadId(ctx.threadId)
const isFirstTimeInThread = !existingPosts.some(
  p => p.authorId === ctx.userId && p.id !== ctx.postId
)
```

### バグ2: thread_revival（L497, L501-502）

**現状:** `thread.lastPostAt` が既に現在時刻に更新されているため、`isInactiveThread` が常に `false` を返す。また `revivalPost` の検索（`p.createdAt > thread.lastPostAt`）も機能しない。

```typescript
// 現在（バグ）
if (!isInactiveThread(thread.lastPostAt, ctx.createdAt)) return

const revivalPost = threadPosts.find(p => p.createdAt > thread.lastPostAt)
```

**修正方針:** `evaluateOnPost` が呼ばれた時点で `thread.lastPostAt` は既に更新済みであることを前提とし、`threadPosts` から実態を判定する。

具体的には、復興書き込みの特定に `thread.lastPostAt` ではなく、レス一覧の時系列から低活性期間を判定する。考えられるアプローチ:

- threadPosts を createdAt 昇順でソートし、隣接レス間の間隔が24時間以上ある箇所を見つけ、その直後のレスを revivalPost とする
- または `ctx.postId` の `createdAt` と、その直前のレスの `createdAt` の差が24時間以上かを判定する

**注意:** `isInactiveThread` 関数（`incentive-rules.ts`）のシグネチャ変更は最小限にすること。rules層の純粋関数を活かし、service層で適切な入力を渡す形が望ましい。

## 対象BDDシナリオ

- `features/phase1/incentive.feature`
  - `未参加のスレッドに初めて書き込むと +3 ボーナスが付与される`（シナリオ10）
  - `低活性スレッドに書き込み後30分以内に他ユーザーのレスが付くと +10 ボーナスが付与される`（シナリオ13）

## 必読ドキュメント（優先度順）

1. [必須] `src/lib/services/incentive-service.ts` — 修正対象
2. [必須] `src/lib/services/post-service.ts` — 呼び出し元の実行順序を理解する（変更不可）
3. [必須] `src/lib/domain/rules/incentive-rules.ts` — `isInactiveThread`, `shouldGrantThreadRevivalBonus` 等
4. [必須] `features/phase1/incentive.feature` — 正しい振る舞いの定義
5. [参考] `tmp/escalations/escalation_ESC-TASK-018-2.md` — バグの詳細分析

## 完了条件

- [ ] `npx cucumber-js` で56シナリオ全PASS
- [ ] `npx vitest run` で既存330テスト全PASS
- [ ] テストコマンド: `npx cucumber-js` および `npx vitest run`

## スコープ外

- `post-service.ts` の実行順序変更（影響範囲が大きいため不可）
- `features/step_definitions/incentive.steps.ts` の変更 → ESC-TASK-019-1解決により許可（locked_filesに追加済み）
- featureファイルの変更（禁止）
- `incentive-rules.ts` のシグネチャ変更（必要な場合はエスカレーション）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全修正完了
- 未解決の問題: なし

### escalation_resolution
ESC-TASK-019-1: オーケストレーターが自律判断で解決。`features/step_definitions/incentive.steps.ts` をTASK-019のlocked_filesに追加。

修正方針: `incentive.steps.ts` の BeforeStep フックまたは各Whenステップで、書き込みを行うシナリオでユーザー自身の「参加済みダミーレス」が適切に追加されるよう修正する。`new_thread_join` を意図的にテストするシナリオ以外では、ユーザーがそのスレッドに参加済みである前提を設定すること。

### 進捗ログ
- 2026-03-12: タスク開始。必読ドキュメント確認完了
- 2026-03-12: 現状テスト: 56シナリオ中 54 PASS / 2 FAIL を確認
  - FAIL1: シナリオ10「未参加のスレッドに初めて書き込むと +3 ボーナスが付与される」
  - FAIL2: シナリオ13「低活性スレッドに書き込み後30分以内に他ユーザーのレスが付くと +10 ボーナスが付与される」
- 2026-03-12: バグ1修正（`incentive-service.ts` L249: `p.id !== ctx.postId` 条件追加）
- 2026-03-12: バグ2修正（`evaluateThreadRevivalBonus`: `threadPosts` 時系列から低活性判定に変更）
- 2026-03-12: テスト実行 → 56シナリオ中 12 FAIL（バグ1修正の副作用）
- 2026-03-12: ESC-TASK-019-1 起票

### テスト結果サマリー
- BDD (cucumber-js): 56シナリオ 56 PASS / 0 FAIL、303ステップ 303 PASS
- 単体テスト (vitest): 8ファイル、330テスト 330 PASS / 0 FAIL
- 最終確認日時: 2026-03-12
