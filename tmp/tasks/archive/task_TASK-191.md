---
task_id: TASK-191
sprint_id: Sprint-70
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-19T12:00:00+09:00
updated_at: 2026-03-19T12:00:00+09:00
locked_files:
  - src/lib/services/command-service.ts
  - src/lib/services/handlers/attack-handler.ts
  - src/lib/services/post-service.ts
  - features/step_definitions/bot_system.steps.ts
---

## タスク概要

`!attack` でBOTを撃破した際、BDD仕様で定義されている「★システム」名義の独立レス（撃破通知）が投稿されないバグを修正する。
現状は `CommandHandlerResult` 型に独立レス情報を伝える経路がなく、攻撃結果はインライン表示（レス末尾マージ）のみ。
AdminService の削除通知（`PostService.createPost()` で★システム名義の独立レスを投稿）と同じパターンを採用する。

## 対象BDDシナリオ

- `features/bot_system.feature` L228-243 @HPが0になったボットが撃破され戦歴が全公開される

## 必読ドキュメント（優先度順）

1. [必須] `docs/operations/incidents/2026-03-19_attack_elimination_no_system_post.md` — インシデントレポート（修正方針・根本原因の詳細）
2. [必須] `features/bot_system.feature` L228-243 — 撃破通知の期待される振る舞い
3. [必須] `src/lib/services/admin-service.ts` L117-138 — ★システム独立レス投稿の先行パターン
4. [参考] `docs/architecture/components/attack.md` — !attack コンポーネント設計

## 入力（前工程の成果物）

- インシデントレポートの修正方針「案A」をそのまま採用する

## 修正方針（案A: CommandHandlerResult に独立レス情報を追加）

### 1. `src/lib/services/command-service.ts`

`CommandHandlerResult` に `eliminationNotice` フィールドを追加:

```typescript
interface CommandHandlerResult {
  success: boolean;
  systemMessage: string | null;       // インライン表示用（既存）
  eliminationNotice?: string | null;   // ★システム名義の独立レス本文（新規）
}
```

`CommandExecutionResult` にも同様に `eliminationNotice` を追加:

```typescript
interface CommandExecutionResult {
  success: boolean;
  systemMessage: string | null;
  currencyCost: number;
  eliminationNotice?: string | null;   // 新規
}
```

`executeCommand()` 内で `result.eliminationNotice` を伝播する。

### 2. `src/lib/services/handlers/attack-handler.ts`

`executeFlowB()` の撃破時（L295-317）で、`eliminationNotice` に撃破通知の本文を返すよう変更。
`systemMessage` にはインラインメッセージのみを設定し、`eliminationNotice` に独立レス用の撃破通知を設定する。

### 3. `src/lib/services/post-service.ts`

`createPost()` 内で、コマンド実行後に `commandResult.eliminationNotice` が存在する場合、AdminServiceと同じパターンで `PostService.createPost()` を呼び出して★システム名義の独立レスを投稿する:

```typescript
if (commandResult?.eliminationNotice) {
  try {
    await createPost({
      threadId: input.threadId,
      body: commandResult.eliminationNotice,
      edgeToken: null,
      ipHash: "system",
      displayName: "★システム",
      isBotWrite: true,
      isSystemMessage: true,
    });
  } catch (err) {
    console.error("[PostService] 撃破通知レス挿入失敗:", err);
  }
}
```

注意: この独立レス投稿は、攻撃者のレスのINSERT（Step 9）より後に実行する。

### 4. `features/step_definitions/bot_system.steps.ts`

L1490-1501 のスタブ検証を実検証に格上げ。★システム名義の独立レスがInMemoryリポジトリに存在することを検証する。
`PostService.createPost()` を呼び出す統合的な検証のため、World の InMemory PostRepository に★システム名義のレスが追加されていることを確認する。

## 出力（生成すべきファイル）

- `src/lib/services/command-service.ts` — 型にeliminationNoticeフィールド追加 + 伝播
- `src/lib/services/handlers/attack-handler.ts` — 撃破時にeliminationNotice返却
- `src/lib/services/post-service.ts` — eliminationNotice時の独立レス投稿ロジック追加
- `features/step_definitions/bot_system.steps.ts` — スタブ→実検証
- 既存テスト（attack-handler.test.ts等）の型変更への追従

## 完了条件

- [ ] `npx cucumber-js --tags @HPが0になったボットが撃破され戦歴が全公開される` がPASS
- [ ] `npx vitest run` 全件PASS（既存テストへの回帰なし）
- [ ] ★システム名義の独立レスが実際にInMemory PostRepositoryに投稿されることをステップ定義で検証

## スコープ外

- BDDシナリオ（`features/*.feature`）の変更
- 問題 #2（ボット「既存スレッドのみ書き込み」検証）→ TASK-192で対応
- AdminServiceの変更

## 補足・制約

- AdminService（L117-138）の先行パターンを参考にすること。`displayName: "★システム"`, `isBotWrite: true`, `isSystemMessage: true` の3つを設定
- `eliminationNotice` の投稿はStep 9（レス作成）以降に行うこと（攻撃者のレスが先に存在する必要がある）
- 独立レス投稿失敗は攻撃レスの成功を巻き戻さない（try-catch で保護）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み:
  1. command-service.ts: CommandHandlerResult / CommandExecutionResult に eliminationNotice フィールド追加 + executeCommand() で伝播
  2. attack-handler.ts: 撃破時に systemMessage をインライン（HP変化）のみ、eliminationNotice に独立レス本文を設定
  3. post-service.ts: Step 9b として eliminationNotice がある場合に ★システム名義の独立レスを投稿するロジックを追加
  4. bot_system.steps.ts: L1490-1501 スタブ → InMemory PostRepository 実検証に格上げ。撃破報酬確認ステップも独立レス本文から確認する形に変更。executeAttackCommand に eliminationNotice 処理追加
  5. attack-handler.test.ts: 型変更への追従（BOT撃破時のテストを eliminationNotice 検証に更新）
- 次にすべきこと: なし（完了）
- 未解決の問題: なし

### 進捗ログ
- 2026-03-19: タスク開始、必読ドキュメント・ソースコード確認完了
- 2026-03-19: 全4ファイル修正完了、attack-handler.test.ts も型追従済み
- 2026-03-19: BDD テスト PASS、Vitest 全件 PASS 確認

### テスト結果サマリー
- Vitest 単体テスト: 1381件 全PASS（64ファイル）
- BDD テスト: 254シナリオ（238 PASS / 16 pending / 0 failed）
  - pending は既存のWebブラウザUI系シナリオのみ（本タスクとは無関係）
  - 対象シナリオ「HPが0になったボットが撃破され戦歴が全公開される」: PASS
  - ★システム名義の独立レスが InMemory PostRepository に存在することを実検証で確認済み
