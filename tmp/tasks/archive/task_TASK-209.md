---
task_id: TASK-209
sprint_id: Sprint-76
status: completed
assigned_to: bdd-coding
depends_on: [TASK-208]
created_at: 2026-03-20T19:00:00+09:00
updated_at: 2026-03-20T19:00:00+09:00
locked_files:
  - src/lib/services/command-service.ts
  - src/lib/services/post-service.ts
  - src/lib/infrastructure/repositories/post-repository.ts
  - "[NEW] src/lib/services/handlers/hissi-handler.ts"
  - "[NEW] src/lib/services/handlers/kinou-handler.ts"
  - config/commands.yaml
  - config/commands.ts
---

## タスク概要
調査系コマンド（!hissi, !kinou）の基盤拡張とハンドラ実装を行う。CommandServiceの型にindependentMessage/responseTypeを追加し、PostServiceのStep 9bを汎用化し、PostRepositoryに日付フィルタ付き検索を追加し、2つのハンドラを新規作成する。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-208/implementation_plan.md` — 実装計画書（全設計詳細）
2. [必須] `features/investigation.feature` — BDDシナリオ（振る舞い定義）
3. [必須] `src/lib/services/command-service.ts` — 型定義・ハンドラ登録の変更元
4. [必須] `src/lib/services/post-service.ts` — Step 9b拡張先
5. [必須] `src/lib/infrastructure/repositories/post-repository.ts` — 新関数追加先
6. [参考] `src/lib/services/handlers/grass-handler.ts` — DI・バリデーションパターンの参考
7. [参考] `src/lib/services/handlers/abeshinzo-handler.ts` — 独立システムレスパターンの参考

## 出力（生成すべきファイル）
- `src/lib/services/handlers/hissi-handler.ts` — !hissi ハンドラ
- `src/lib/services/handlers/kinou-handler.ts` — !kinou ハンドラ
- `src/lib/services/command-service.ts` — 型追加 + ハンドラ登録
- `src/lib/services/post-service.ts` — Step 9b 独立レス投稿汎用化
- `src/lib/infrastructure/repositories/post-repository.ts` — findByAuthorIdAndDate追加
- `config/commands.yaml` — hissi, kinou エントリ追加
- `config/commands.ts` — hissi, kinou エントリ追加
- 単体テストファイル — ハンドラ・リポジトリ関数のテスト

## 完了条件
- [ ] CommandConfig に `responseType?: "inline" | "independent"` が追加されている
- [ ] CommandHandlerResult / CommandExecutionResult に `independentMessage?: string | null` が追加されている
- [ ] PostService Step 9b が `eliminationNotice ?? independentMessage` で独立レスを投稿する
- [ ] PostRepository.findByAuthorIdAndDate が実装されている
- [ ] HissiHandler が実装計画書§3.1の仕様を満たす
- [ ] KinouHandler が実装計画書§3.2の仕様を満たす
- [ ] config/commands.yaml, commands.ts に hissi, kinou が追加されている
- [ ] `npx tsc --noEmit` がエラー0件
- [ ] `npx vitest run` が全件PASS
- [ ] `npx cucumber-js` が既存シナリオを壊していない

## スコープ外
- BDDステップ定義（TASK-210で実施）
- インメモリpost-repositoryの変更（TASK-210で実施）
- BDDシナリオ（.feature）の変更

## 補足・制約

### 実装計画書の参照
全ての設計詳細は `tmp/workers/bdd-architect_TASK-208/implementation_plan.md` に記載。§3.1〜§3.6の設計に従うこと。

### 重要な設計判断
- independentMessage と eliminationNotice は統合しない（用途が異なる）
- !kinou の昨日のIDはDB検索方式（generateDailyId計算方式は不採用）
- findByAuthorIdAndDate は既存findByAuthorIdを変更せず新設
- 日付フィルタはUTCベース（既存countByDateと同方式）
- authorIdがnullのレスに対するコマンドは「このレスは対象にできません」エラー

### メッセージフォーマット
実装計画書§3.1のフォーマット例に従うこと。最新3件は created_at DESC で取得し、表示時はASC（時系列順）に並べ替える。

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし（TASK-210 BDDステップ定義へ引き継ぎ）
- 未解決の問題: なし

### 進捗ログ

1. **config/commands.yaml** — hissi, kinou エントリ追加（responseType: independent）
2. **config/commands.ts** — hissi, kinou エントリ追加（responseType: "independent"）
3. **src/lib/services/command-service.ts** — 型変更（CommandConfig.responseType, CommandHandlerResult.independentMessage, CommandExecutionResult.independentMessage）+ HissiHandler/KinouHandler 登録
4. **src/lib/infrastructure/repositories/post-repository.ts** — findByAuthorIdAndDate 追加
5. **src/lib/services/handlers/hissi-handler.ts** — 新規作成（IHissiPostRepository, IHissiThreadRepository, HissiHandler）
6. **src/lib/services/handlers/kinou-handler.ts** — 新規作成（IKinouPostRepository, KinouHandler）
7. **src/lib/services/post-service.ts** — Step 9b を独立システムレス投稿共通パターンに汎用化（eliminationNotice ?? independentMessage）
8. **src/__tests__/lib/services/handlers/hissi-handler.test.ts** — 新規作成（15テスト）
9. **src/__tests__/lib/services/handlers/kinou-handler.test.ts** — 新規作成（12テスト）
10. **src/__tests__/lib/infrastructure/repositories/post-repository-find-by-author-date.test.ts** — 新規作成（8テスト）

### テスト結果サマリー

- `npx tsc --noEmit`: エラー 0件
- `npx vitest run`: 70ファイル / 1481テスト PASS（作業前: 67ファイル / 1446テスト）
  - 新規追加: 35テスト（HissiHandler 15 + KinouHandler 12 + PostRepository.findByAuthorIdAndDate 8）
- `npx cucumber-js`: 256シナリオ PASS（16 pending は事前から存在）
