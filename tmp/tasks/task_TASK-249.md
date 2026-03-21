---
task_id: TASK-249
sprint_id: Sprint-85
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-21T22:00:00+09:00
updated_at: 2026-03-21T22:00:00+09:00
locked_files:
  - src/lib/services/bot-service.ts
  - src/app/api/internal/bot/execute/route.ts
  - src/lib/services/__tests__/bot-service.test.ts
  - src/__tests__/lib/services/bot-execute.test.ts
---

## タスク概要

TASK-243（processPendingTutorials実装）の再実装。前回のワーカー出力がworktreeごと消失したため再実施する。
チュートリアルBOTのスポーン処理をBotServiceに追加し、`/api/internal/bot/execute`ルートに統合する。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-236/design.md` §3.4 — スポーンフロー設計
2. [必須] `tmp/tasks/task_TASK-243.md` — 元タスク指示書（実装内容の詳細）
3. [必須] `src/lib/services/bot-service.ts` — 既存BotService
4. [必須] `src/lib/infrastructure/repositories/pending-tutorial-repository.ts` — PendingTutorialRepository
5. [参考] `src/app/api/internal/bot/execute/route.ts` — 既存ルート

## 実装内容

TASK-243の指示書の「実装内容」セクションに従う。要点:

### 1. BotService に processPendingTutorials メソッド追加

- `IPendingTutorialRepository` インターフェース定義
- `TutorialResult` 型定義
- コンストラクタに `pendingTutorialRepository` パラメータ追加
- `processPendingTutorials()`: pending取得 → BOT生成 → executeBotPost(contextOverrides付き) → pending削除
- `createBotService()` に PendingTutorialRepository の依存注入追加

### 2. executeBotPost の拡張

第3引数に `contextOverrides?` を追加:
```typescript
contextOverrides?: {
  tutorialTargetPostNumber?: number;
  tutorialThreadId?: string;
}
```

### 3. bot/execute route.ts 拡張

- Step 4として `processPendingTutorials()` 呼び出しを追加
- レスポンスに `tutorials` フィールドを追加

### 4. 単体テスト追加

- processPendingTutorials: pending取得 → BOT生成 → executeBotPost → pending削除
- processPendingTutorials: pending 0件 → 何もしない
- route.ts: tutorials フィールドの後方互換テスト
- 合計7件程度追加（1628 → 1635テスト目標）

## 完了条件
- [ ] processPendingTutorials が BotService に実装されている
- [ ] executeBotPost が contextOverrides に対応している
- [ ] bot/execute route.ts が拡張されている
- [ ] `npx vitest run` で全テストPASS
- [ ] `npx tsc --noEmit` でコンパイルエラーなし

## スコープ外
- BDD step definitions（実装済み）
- InMemoryリポジトリ修正（TASK-250で実施）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全実装完了・全テストPASS
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. タスク指示書・設計書・元タスク指示書を読み込み、実装内容を把握
2. bot-service.ts: IBotRepositoryに`create`メソッドを追加（チュートリアルBOTスポーン用）
3. bot-service.ts: `IPendingTutorialRepository`インターフェースを定義（findAll, deletePendingTutorial）
4. bot-service.ts: `TutorialResult`型を定義（pendingId, success, botId, postId, postNumber, error）
5. bot-service.ts: BotServiceコンストラクタに`pendingTutorialRepository`パラメータを追加（第8引数）
6. bot-service.ts: `executeBotPost`に第3引数`contextOverrides?`（tutorialTargetPostNumber, tutorialThreadId）を追加。BehaviorContext/ContentGenerationContextにチュートリアル用フィールドを渡すよう修正
7. bot-service.ts: `processPendingTutorials`メソッドを実装（pending取得→BOT作成→executeBotPost→pending削除、エラー時はスキップして続行）
8. bot-service.ts: `createBotService`にPendingTutorialRepositoryの依存を追加
9. route.ts: Step 4として`processPendingTutorials()`呼び出しを追加、レスポンスにtutorialsフィールドを追加
10. bot-service.test.ts: createMockBotRepositoryにcreateモック追加
11. bot-service.test.ts: createMockPendingTutorialRepositoryヘルパー追加
12. bot-service.test.ts: processPendingTutorialsのテスト5件追加（0件、1件、複数件、エラー続行、未注入時）
13. bot-execute.test.ts: mockProcessPendingTutorialsモック追加、beforeEachにデフォルト戻り値設定
14. bot-execute.test.ts: tutorialsフィールドのテスト2件追加（後方互換、結果反映）
15. bot-service-scheduling.test.ts: createMockBotRepositoryにcreateモック追加

### テスト結果サマリー

- 全テスト: 1635 PASS / 0 FAIL（78ファイル）
- TypeScriptコンパイル: 0エラー
- 追加テスト: processPendingTutorials 5件 + routeのtutorials 2件 = 計7件追加
