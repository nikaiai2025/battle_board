# Sprint-150: edge-token チャネル分離

> 開始: 2026-03-29

## スコープ

`edge_tokens` テーブルに `channel` カラムを追加し、専ブラ(HTTP)経由トークンの権限を投稿のみに限定する。
課金機能のブロッカー。計画書: `tmp/edge_token_channel_separation_plan.md`

### 変更内容

1. **DB**: `edge_tokens` に `channel VARCHAR NOT NULL DEFAULT 'web'` 追加
2. **トークン発行**: `issueEdgeToken` + `EdgeTokenRepository.create` に channel 引数追加。Web API → `'web'`、専ブラ → `'senbra'`
3. **トークン検証**: `verifyEdgeToken` の戻り値に channel 追加
4. **APIガード**: mypage系 + auth/pat ルートで `channel !== 'web'` → 403

## 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `[NEW] supabase/migrations/00041_edge_tokens_add_channel.sql` | channel カラム追加 |
| `src/lib/infrastructure/repositories/edge-token-repository.ts` | EdgeToken/EdgeTokenRow型 + create() に channel 追加 |
| `src/lib/services/auth-service.ts` | issueEdgeToken に channel引数、verifyEdgeToken 戻り値に channel |
| `src/lib/services/registration-service.ts` | 5箇所の create 呼び出しに channel 追加 |
| `src/lib/services/post-service.ts` | resolveAuth/createPost/createThread に channel パラメータ追加 |
| `src/app/api/threads/route.ts` | createThread 呼び出しに channel='web' |
| `src/app/api/threads/[threadId]/posts/route.ts` | createPost 呼び出しに channel='web' |
| `src/app/(senbra)/test/bbs.cgi/route.ts` | createPost/createThread 呼び出しに channel='senbra' |
| `src/app/api/mypage/route.ts` | channel='web' ガード |
| `src/app/api/mypage/history/route.ts` | channel='web' ガード |
| `src/app/api/mypage/theme/route.ts` | channel='web' ガード |
| `src/app/api/mypage/username/route.ts` | channel='web' ガード |
| `src/app/api/mypage/upgrade/route.ts` | channel='web' ガード |
| `src/app/api/mypage/vocabularies/route.ts` | channel='web' ガード |
| `src/app/api/mypage/copipe/route.ts` | channel='web' ガード |
| `src/app/api/mypage/copipe/[id]/route.ts` | channel='web' ガード |
| `src/app/api/auth/pat/route.ts` | channel='web' ガード |

## タスク分解

| TASK_ID | 内容 | 担当 | 依存 |
|---|---|---|---|
| TASK-378 | edge-token チャネル分離 全実装 | bdd-coding (opus) | - |

### ファイルロック表

| TASK_ID | locked_files |
|---|---|
| TASK-378 | 上記全ファイル + テストファイル群 |

## 結果

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-378 | completed | vitest 2249 PASS (1 failed: スキーマ整合性テスト=マイグレーション未適用) / cucumber 412 PASS |
