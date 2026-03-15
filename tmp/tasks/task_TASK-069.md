---
task_id: TASK-069
sprint_id: Sprint-24
status: completed
assigned_to: bdd-coding
depends_on: [TASK-067, TASK-068]
created_at: 2026-03-16T15:00:00+09:00
updated_at: 2026-03-16T15:00:00+09:00
locked_files:
  - src/lib/services/post-service.ts
  - src/lib/services/__tests__/post-service.test.ts
  - src/lib/infrastructure/adapters/dat-formatter.ts
  - src/lib/infrastructure/adapters/__tests__/dat-formatter.test.ts
  - src/lib/services/admin-service.ts
  - src/lib/services/__tests__/admin-service.test.ts
  - src/app/api/admin/posts/[postId]/route.ts
  - features/step_definitions/command_system.steps.ts
---

## タスク概要

PostServiceにコマンド実行基盤を統合し、Phase 2のコマンドシステムをエンドツーエンドで動作させる。具体的には:

1. **PostService.createPost統合**: 書き込み時にcommand-parser→CommandService→inlineSystemInfo設定の流れを組み込む
2. **書き込み報酬のinlineSystemInfo表示**: 既存のインセンティブ結果をinlineSystemInfoに含める
3. **管理者削除コメント**: adminDeletePost APIにcommentパラメータ追加 + 「★システム」名義の独立システムレス挿入
4. **DAT出力対応**: DatFormatterでinlineSystemInfoをbody末尾に結合して出力
5. **BDDステップ定義**: command_system.featureの主要シナリオに対するステップ定義実装

## 対象BDDシナリオ
- `features/phase2/command_system.feature` — 全シナリオ（ただし!tell固有のシナリオは次スプリント）

## 必読ドキュメント（優先度順）
1. [必須] `features/phase2/command_system.feature` — BDDシナリオ
2. [必須] `docs/architecture/components/posting.md` — §5 システムメッセージの表示方式（方式A/B）
3. [必須] `src/lib/services/post-service.ts` — 現行のPostService
4. [必須] `src/lib/services/command-service.ts` — TASK-068で実装済み
5. [必須] `src/lib/domain/rules/command-parser.ts` — TASK-067で実装済み
6. [必須] `src/lib/infrastructure/adapters/dat-formatter.ts` — 現行のDATフォーマッタ
7. [必須] `src/lib/services/admin-service.ts` — 現行の管理者サービス
8. [必須] `src/app/api/admin/posts/[postId]/route.ts` — 現行の管理者削除API
9. [必須] `docs/specs/openapi.yaml` — adminDeletePostのcommentパラメータ（GAP-2で追加済み）
10. [参考] `src/lib/services/incentive-service.ts` — インセンティブ連携

## 出力（変更すべきファイル）
- `src/lib/services/post-service.ts` — コマンド実行統合 + inlineSystemInfo設定
- `src/lib/services/__tests__/post-service.test.ts` — 単体テスト更新
- `src/lib/infrastructure/adapters/dat-formatter.ts` — inlineSystemInfo連結出力
- `src/lib/infrastructure/adapters/__tests__/dat-formatter.test.ts` — テスト更新
- `src/lib/services/admin-service.ts` — コメント付き削除 + 独立システムレス挿入
- `src/lib/services/__tests__/admin-service.test.ts` — テスト更新
- `src/app/api/admin/posts/[postId]/route.ts` — commentクエリパラメータ受け取り
- `features/step_definitions/command_system.steps.ts` — BDDステップ定義

## 完了条件
- [ ] PostService.createPost内でコマンド検出→CommandService.executeCommand→inlineSystemInfo設定が動作
- [ ] 書き込み報酬（インセンティブ結果）がinlineSystemInfoに含まれる
- [ ] コマンド実行結果 + 書き込み報酬が両方ある場合、両方がinlineSystemInfoに含まれる
- [ ] システムメッセージ（isSystemMessage=true）に対してはコマンド解析・インセンティブ付与をスキップ
- [ ] DatFormatterがinlineSystemInfoをbody末尾に区切り線付きで連結出力
- [ ] adminDeletePost APIがcommentクエリパラメータを受け取り、「★システム」名義の独立システムレスを挿入
  - コメントあり → コメント内容をシステムレス本文に表示
  - コメントなし → フォールバックメッセージ「管理者によりレスが削除されました」
  - システムレスの属性: displayName="★システム", dailyId="SYSTEM", isSystemMessage=true, inlineSystemInfo=null
- [ ] `npx vitest run` 全テストPASS
- [ ] `npx tsc --noEmit` エラー0件

## スコープ外
- !tell ハンドラの本実装（AccusationService連携）— 次スプリント
- DBマイグレーション（inline_system_info カラム追加）— 現時点ではコード上nullで統一、DB反映は別途
- Web UIでのinlineSystemInfo表示コンポーネント — 別タスク
- コマンドヘルプページ — 別タスク

## 補足・制約

### PostService統合の流れ（方式A）
```
1. createPost受信
2. command-parser で本文解析 → ParsedCommand | null
3. ParsedCommand があれば CommandService.executeCommand 呼び出し
4. IncentiveService で書き込み報酬計算（既存）
5. inlineSystemInfo を構築:
   - コマンド結果あり → コマンド結果メッセージ
   - 報酬あり → 報酬メッセージ（例: "📝 書き込み報酬 +10"）
   - 両方あり → 改行で結合
6. Post INSERT（body + inlineSystemInfo）
```

### 管理者削除の流れ（方式B）
```
1. DELETE /api/admin/posts/{postId}?comment=xxx
2. 対象レスを論理削除（isDeleted=true）
3. 「★システム」名義の独立システムレスをINSERT
```

### DATフォーマッタの区切り線
inlineSystemInfoが存在する場合、DAT出力では以下の形式でbodyに連結:
```
{本文}<br>──────────<br>{inlineSystemInfo}
```
区切り線は「──────────」（全角ダッシュ10個）。HTMLの<br>で改行。

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全完了条件を達成
- 未解決の問題: なし

### 進捗ログ

#### セッション1（前回）
- PostService.createPost にコマンド解析・実行・inlineSystemInfo構築を統合
- CommandService DI パターン（setCommandService）を実装
- isSystemMessage=true のレスに対するコマンド解析・インセンティブスキップを実装
- DatFormatter に inlineSystemInfo 区切り線連結出力を実装
- AdminService.deletePost にコメント付き削除 + 独立システムレス挿入を実装
- admin DELETE API route に comment クエリパラメータ受け取りを追加
- 全672件の単体テストがPASS、TypeScriptコンパイルエラー0件を確認
- BDDステップ定義（command_system.steps.ts）を全15シナリオ分実装
- 問題: 「書き込み報酬がレス末尾に表示される」シナリオの inlineSystemInfo が null

#### セッション2（今回）
- 根本原因を特定: Background ステップで作成されたユーザーが、先行シナリオの createPost 呼び出しにより IncentiveService 経由で lastPostDate を更新済みとなり、daily_login ボーナスが「同日2回目」として skipped される問題
- 修正: 「ユーザーがスレッドに通常の書き込みを投稿する」ステップで、Background のユーザーを再利用せず新規ユーザーを作成し、スレッドの createdBy もダミーユーザーにすることで daily_login + new_thread_join の両ボーナスが確実に付与されるようにした
- PostService からデバッグ用ログ（DEBUG_INCENTIVE 環境変数チェック）を削除
- 全15シナリオがPASS確認

### テスト結果サマリー

#### 単体テスト（Vitest）
- 20ファイル / 672テスト: 全PASS

#### TypeScriptコンパイル
- `npx tsc --noEmit`: エラー0件

#### BDDシナリオテスト（Cucumber.js）
- command_system.feature: 15シナリオ / 15 PASS
- 全体: 123シナリオ / 110 PASS, 8 failed (pre-existing), 2 undefined, 3 pending
- 8件の失敗は全て incentive.feature (7件) と mypage.feature (1件) の既存失敗であり、本タスクの変更に起因しない

#### 注意事項
- `cucumber.js` 設定ファイルの paths に `features/phase2/command_system.feature` が含まれていないため、`npx cucumber-js` 単独実行では command_system シナリオは実行されない。明示的にパスを指定する必要がある: `npx cucumber-js features/phase2/command_system.feature`
- `cucumber.js` は locked_files に含まれていないため、本タスクでは変更していない
