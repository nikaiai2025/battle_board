---
task_id: TASK-243
sprint_id: Sprint-85
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-21T19:50:00+09:00
updated_at: 2026-03-21T19:50:00+09:00
locked_files:
  - src/lib/services/bot-service.ts
  - src/app/api/internal/bot/execute/route.ts
---

## タスク概要

チュートリアルBOTのスポーン処理（processPendingTutorials）を実装し、`/api/internal/bot/execute` ルートに統合する。
Sprint-84で pending_tutorials テーブル・PendingTutorialRepository・Tutorial Strategy は実装済み。
本タスクではそれらを組み合わせて「pending検出 → BOT生成 → 書き込み実行 → pending削除」のフローを完成させる。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-236/design.md` §3.4 — スポーンフロー設計
2. [必須] `src/lib/services/bot-service.ts` — 既存BotService（executeBotPost, createBotService）
3. [必須] `src/lib/infrastructure/repositories/pending-tutorial-repository.ts` — 既存PendingTutorialRepository
4. [必須] `src/app/api/internal/bot/execute/route.ts` — 既存ルート（拡張先）
5. [参考] `src/lib/infrastructure/repositories/bot-repository.ts` — BotRepository.create
6. [参考] `src/lib/services/bot-strategies/strategy-resolver.ts` — tutorial分岐

## 実装内容

### 1. BotService に processPendingTutorials メソッド追加

設計書 §3.4 に従い:

```typescript
async processPendingTutorials(): Promise<{ processed: number; results: TutorialResult[] }> {
  // 1. PendingTutorialRepository.findAll() で未処理を取得
  // 2. 各 pending に対して:
  //    a. BotRepository.create() でチュートリアルBOT新規作成
  //       - bot_profile_key: "tutorial"
  //       - hp: 10, max_hp: 10
  //       - is_active: true
  //       - display_name: "名無しさん"
  //       - daily_id: generateFakeDailyId()
  //    b. ContentGenerationContext に tutorialTargetPostNumber を設定
  //    c. BehaviorContext に tutorialThreadId を設定
  //    d. executeBotPost(newBotId) で書き込み実行
  //    e. PendingTutorialRepository.delete(pendingId)
  // 3. 結果を返す
}
```

### 2. bot/execute route.ts の拡張

既存の荒らし役BOT処理の後に、processPendingTutorials 呼び出しを追加:

```typescript
// 既存 Step 3 (荒らし役BOT処理) の後:
// Step 4: チュートリアルBOT pending 処理
const tutorialResult = await botService.processPendingTutorials();

// レスポンスに tutorialResult を追加
return NextResponse.json({
  ...既存フィールド,
  tutorials: tutorialResult,
});
```

### 3. executeBotPost のコンテキスト受け渡し対応

現在の `executeBotPost(botId)` はBOTのIDのみを受け取り、Strategy のコンテキストは固定値。
チュートリアルBOTではコンテキスト（tutorialTargetPostNumber, tutorialThreadId）を外部から渡す必要がある。

方法: `executeBotPost` にオプショナルなコンテキストオーバーライド引数を追加する。

```typescript
async executeBotPost(
  botId: string,
  contextOverrides?: {
    tutorialTargetPostNumber?: number;
    tutorialThreadId?: string;
  }
): Promise<BotPostResult | null>
```

### 4. 単体テスト

- processPendingTutorials: pending取得 → BOT生成 → executeBotPost → pending削除の一連フロー
- processPendingTutorials: pending が0件の場合は何もしない
- route.ts拡張: レスポンスに tutorials フィールドが含まれること（既存テストの後方互換）

## 完了条件
- [ ] processPendingTutorials が実装されている
- [ ] bot/execute route.ts が拡張されている
- [ ] executeBotPost がコンテキストオーバーライドに対応している
- [ ] 単体テスト全PASS（`npx vitest run`）
- [ ] TypeScriptコンパイルが通る（`npx tsc --noEmit`）

## スコープ外
- BDD step definitions（TASK-246で実施）
- E2Eテスト
- wrangler dev でのローカル動作確認

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全実装完了・全テストPASS
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. design.md §3.4 スポーンフロー設計を読み込み
2. bot-service.ts: IBotRepositoryに`create`メソッド追加
3. bot-service.ts: IPendingTutorialRepositoryインターフェース追加
4. bot-service.ts: TutorialResult型定義追加
5. bot-service.ts: BotServiceコンストラクタにpendingTutorialRepository追加
6. bot-service.ts: executeBotPostに`contextOverrides?`（第3引数）追加。BehaviorContext/ContentGenerationContextにチュートリアル用フィールドを渡すよう修正
7. bot-service.ts: processPendingTutorialsメソッドを実装（pending取得→BOT作成→executeBotPost→pending削除）
8. bot-service.ts: createBotServiceにPendingTutorialRepositoryの依存を追加
9. route.ts: processPendingTutorials呼び出しを追加（Step 4）、レスポンスにtutorialsフィールドを追加
10. 既存テスト修正: bot-service.test.ts / bot-service-scheduling.test.ts の createMockBotRepositoryにcreateモック追加
11. 既存テスト修正: bot-execute.test.tsのモックにprocessPendingTutorialsを追加
12. 新規テスト追加: bot-service.test.tsにprocessPendingTutorialsのテスト5件追加
13. 新規テスト追加: bot-execute.test.tsにtutorialsフィールドのテスト2件追加

### テスト結果サマリー

- 全テスト: 1635 PASS / 0 FAIL（78ファイル）
- TypeScriptコンパイル: 0エラー
- 追加テスト: processPendingTutorials 5件 + routeのtutorials 2件 = 計7件追加
