---
task_id: TASK-318
sprint_id: Sprint-120
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-26T06:30:00+09:00
updated_at: 2026-03-26T06:30:00+09:00
locked_files:
  - src/lib/services/post-service.ts
  - src/lib/services/handlers/grass-handler.ts
  - src/lib/services/command-service.ts
---

## タスク概要

ウェルカムBOT（チュートリアルBOT）の `!w` コマンドが、BOT投稿自体は成功するがコマンド効果（レス内マージ: inlineSystemInfo への草メッセージ表示）が発揮されない問題を調査・修正する。

Sprint-119 で `isBotGiver` フラグによる FK 制約違反修正を実施済みだが、本番(CF Workers)ではまだ `!w` 効果が発動しない。コード追跡では論理的に正しく見えるため、**本番実行パスでの実際の失敗箇所を特定する**必要がある。

## 調査戦略

コードを静的に読んでも発見できなかった問題のため、以下のアプローチで調査する:

### Phase 1: 単体テストで再現試行

**BOT !w の統合的な実行パスを再現する単体テストを書いて実行する。** 以下の3つのレベルで段階的にテスト:

1. **GrassHandler 単体**: `isBotGiver: true` で `execute()` を呼び、`systemMessage` が非nullで返ることを確認
2. **CommandService 経由**: `executeCommand({rawCommand: ">>N !w\\n新参おるやん🤣", isBotGiver: true, ...})` でコマンド結果を確認
3. **PostService 経由**: `createPost({body: ">>N !w\\n新参おるやん🤣", isBotWrite: true, botUserId: ...})` で投稿結果の `inlineSystemInfo` を確認

テスト失敗で原因特定できれば、直接修正に進む。

### Phase 2: 診断ログ追加（Phase 1 で再現できない場合）

以下の箇所に `console.error` ログを追加して本番デプロイ後に確認する:

1. `post-service.ts` — `isBotWrite=true` 時の `executeCommand` 呼び出し前後
   - before: `[PostService][BOT-DIAG] executeCommand input: {rawCommand, isBotGiver, threadId}`
   - after: `[PostService][BOT-DIAG] executeCommand result: {success, systemMessage, ...}`
   - catch: `[PostService][BOT-DIAG] executeCommand error: {error}`
2. `command-service.ts` — `isBotGiver=true` 時の `parseCommand` 結果とハンドラ結果
3. `grass-handler.ts` — `isBotGiver=true` 時の各ステップ通過確認

## 対象BDDシナリオ

- `features/welcome.feature` @チュートリアルBOTがスポーンしてユーザーの初回書き込みに!wで反応する
- `features/reactions.feature` @草を生やした結果がレス末尾にマージ表示される

## 必読ドキュメント

1. [必須] `docs/operations/incidents/2026-03-24_welcome_bot_w_command_silent_failure.md` — 過去のインシデント記録（パーサー問題 + FK問題の経緯）
2. [必須] `src/lib/services/post-service.ts` L450-480 — コマンド実行フロー
3. [必須] `src/lib/services/handlers/grass-handler.ts` — GrassHandler（isBotGiver パス）
4. [必須] `src/lib/services/command-service.ts` L720-860 — executeCommand
5. [参考] `src/lib/services/bot-strategies/content/tutorial.ts` — BOT本文生成
6. [参考] `src/lib/domain/rules/command-parser.ts` — コマンドパーサー

## 入力（前工程の成果物）

- `tmp/reports/debug_TASK-DEBUG-119.md` — Sprint-119 調査レポート

## 出力（生成すべきファイル）

- テストコード（Phase 1 のテスト）
- 必要に応じた修正コード

## 完了条件

- [ ] BOT !w の実行パスを検証するテストが存在し、PASS
- [ ] 原因が特定され、修正コードが適用されている（Phase 1 で特定できた場合）
- [ ] または、診断ログが追加されデプロイ準備完了（Phase 2 の場合）
- [ ] `npx vitest run` 全PASS

## スコープ外

- `!newspaper` の修正（TASK-317 で対応）
- ウェルカムシーケンス全体の変更
- features/ の変更

## 補足・制約

- Sprint-119 で追加された BOT !w テスト 10件は全 PASS している（vitest 1877件）
- 本番 CF Workers ではコマンド効果が発動しない — テスト環境と本番環境の差異に注意
- コード追跡上は正しいため、**実際に実行して確認する**アプローチが必要
- 診断ログは `[BOT-DIAG]` プレフィックスを使用し、問題解決後に除去する

## 作業ログ

### チェックポイント
- 状態: Phase 1 完了 — テスト環境では再現不可。Phase 2 診断ログは既存コードに実装済み
- 完了済み: Phase 1 テスト（3段階14本）全PASS、全テスト1891件PASS、BDDシナリオ331件PASS
- 次にすべきこと: 本番CF Workers ログの確認が必要（人間の作業）
- 未解決の問題: テスト環境ではバグが再現しない。本番特有の問題の可能性あり

### 進捗ログ
- [Phase 1 開始] コード追跡完了。post-service.ts, command-service.ts, grass-handler.ts の全実行パスを把握
- BOT !w のフロー: PostService.createPost(isBotWrite=true, body=">>N !w\n...") -> CommandService.executeCommand(isBotGiver=true) -> GrassHandler.execute(isBotGiver=true)
- Sprint-119 修正（isBotGiver フラグ）は論理的に正しく見える。テストで実際の実行を再現する
- [Phase 1 テスト作成] 3段階統合テスト14本を作成・全PASS
  - Level 1: GrassHandler 単体 (isBotGiver=true) — 3テスト PASS
  - Level 2: CommandService 経由 (parseCommand + PostNumberResolver + isBotGiver 伝播) — 5テスト PASS
  - Level 3: PostService 経由 (createPost(isBotWrite=true) -> inlineSystemInfo マージ) — 6テスト PASS
- [Phase 1 結論] テスト環境ではバグが再現しない。コードロジックは正しい
- [Phase 2 確認] 診断ログ（[BOT-DIAG]プレフィックス）は既にSprint-119でpost-service.ts, command-service.tsに追加済み
  - post-service.ts L461-513: executeCommand 呼び出し前後の入出力、スキップ理由
  - command-service.ts L734-743: parseCommand 結果
- [CF ログ確認] tmp/cf_tail.log を確認 — BOT-DIAG ログの出力なし（BOT書き込みがキャプチャ期間中に発生していない）
- [parseCommand 直接検証] npx tsx で parseCommand(">>5 !w\n新参おるやん", ["w",...]) を実行 -> 正常に { name: "w", args: [">>5"] } を返す

### Phase 1 調査結論

テスト環境では全実行パスが正常動作する。コードロジック上のバグは発見されなかった。
本番 CF Workers で失敗する可能性のある箇所（仮説）:

1. **getCommandService() 初期化失敗**（最有力仮説）
   - post-service.ts L160-184 の lazy init が失敗すると commandServiceInstance が null になる
   - その場合 BOT-DIAG ログに `executeCommand SKIPPED: { cmdServiceExists: false }` が出力される
   - 原因候補: CommandService コンストラクタ内の動的 require() チェーン失敗（AttackHandler -> createBotService -> require("./post-service") の循環依存）

2. **PostNumberResolver の DB クエリ失敗**
   - 対象レス（ユーザーの初回書き込み）が DB に存在しない場合
   - その場合 BOT-DIAG ログに `executeCommand result: { success: false, systemMessage: "指定されたレスが見つかりません" }` が出力される

3. **チュートリアルBOTが Sprint-119 デプロイ後に1度もトリガーされていない**
   - Cloudflare Cron によるチュートリアルBOTスポーンが新規ユーザー不在で発動していない可能性

### 次のステップ（人間の作業）

CF Workers ログで BOT-DIAG の出力を確認する必要がある:
- `wrangler tail` で BOT 書き込み時のログを捕捉するか、テスト用の新規ユーザーを作成して初回書き込みを行い、チュートリアルBOTを発動させる

### テスト結果サマリー
- 単体テスト: 1891件 全PASS（うち BOT !w 統合テスト 14件を新規追加）
- BDDシナリオ: 347件中 331件 PASS / 16件 Pending（UI系の未実装シナリオ）
