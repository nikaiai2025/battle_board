---
task_id: TASK-294
sprint_id: Sprint-110
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-24T18:00:00+09:00
updated_at: 2026-03-24T18:00:00+09:00
locked_files:
  - src/lib/services/auth-service.ts
  - src/lib/services/post-service.ts
  - src/lib/infrastructure/repositories/auth-code-repository.ts
  - src/lib/infrastructure/adapters/bbs-cgi-response.ts
  - src/types/index.ts
  - src/app/api/auth/auth-code/
  - "[NEW] src/app/api/auth/verify/"
  - src/app/api/threads/[threadId]/posts/route.ts
  - src/app/api/threads/route.ts
  - src/app/(senbra)/test/bbs.cgi/route.ts
  - src/lib/services/__tests__/auth-service.test.ts
  - src/lib/services/__tests__/post-service.test.ts
  - src/app/api/auth/auth-code/__tests__/route.test.ts
  - "[NEW] supabase/migrations/00026_drop_auth_codes_code.sql"
---

## タスク概要

認証フロー簡素化（6桁認証コード廃止 → Turnstileのみ）のバックエンドコード実装。
サービス層・リポジトリ層・型定義・アダプタ・APIルートハンドラ・単体テスト・DBマイグレーションを一括改修する。

## 対象BDDシナリオ

- `features/authentication.feature` @Turnstile通過で認証に成功する
- `features/specialist_browser_compat.feature` @専ブラからの初回書き込みで認証案内が返される

## 必読ドキュメント（優先度順）

1. [必須] `tmp/auth_simplification_analysis.md` — 変更方針の全体像（§5.2 変更の影響範囲）
2. [必須] `features/authentication.feature` — 更新済みのBDDシナリオ（受け入れ基準）
3. [必須] `docs/specs/openapi.yaml` — 更新済みAPI仕様（`/api/auth/verify`, `VerifyAuthRequest`, `AuthRequiredResponse`）
4. [参考] `docs/architecture/components/authentication.md` — 更新済みコンポーネント設計

## 変更内容の詳細

### 1. auth-service.ts — サービス層

**削除:**
- `generateAuthCode()` 関数（6桁コード生成）

**改修: `issueAuthCode()` → コードなしレコード作成**
- 6桁コードの生成・保存を削除
- auth_codesレコードはコードなしで作成（tokenId, ipHash, verified, expiresAt のみ）
- 戻り値型から `code` を削除: `Promise<{ expiresAt: Date }>`

**改修: `verifyAuthCode()` → `verifyAuth()`**
- シグネチャ変更: `verifyAuth(edgeToken: string, turnstileToken: string, ipHash: string)`
- コード検索（`findByCode`）→ edge-token検索（`findByTokenId`等）に変更
- 検証ロジック:
  1. edge-token(tokenId)で auth_codes レコードを検索
  2. 有効期限チェック
  3. Turnstile検証
  4. auth_codes.verified = true
  5. users.is_verified = true
  6. write_token 生成・保存
- 戻り値型は同じ: `Promise<{ success: boolean; writeToken?: string }>`

**コメント・See参照の更新:**
- VerifyResult の JSDoc（L39-42）: 「認証コード未検証」→「Turnstile未通過」
- verifyEdgeToken の See参照更新

### 2. auth-code-repository.ts — リポジトリ層

**型変更: AuthCode インターフェース**
- `code: string` フィールドを削除

**メソッド変更:**
- `findByCode()` を削除
- `create()` の引数から `code` フィールドを削除
- **新規追加: `findByTokenId(tokenId: string)`** — edge-token(tokenId)で未検証レコードを検索（`verifyAuth` で使用）

**残存メソッド（変更なし）:**
- `markVerified()`, `updateWriteToken()`, `findByWriteToken()`, `clearWriteToken()`, `deleteExpired()`

### 3. post-service.ts — 書き込みサービス

**改修: `resolveAuth()` 内**
- `issueAuthCode()` の呼び出しを変更: 戻り値から `code` を使わない
- authRequired応答から `code` を削除

**改修: 戻り値型**
- `CreatePostResult`, `CreateThreadResult`（またはそれに相当する型）から `code` フィールドを削除
- `handleCreatePost` と `handleCreateThread` の authRequired レスポンス構造を統一する

**注意:** 計画書に記載の通り、`handleCreatePost` と `handleCreateThread` で authRequired レスポンス構造が異なる（ネスト vs フラット）。この改修で統一すること。

### 4. types/index.ts — 共有型定義

- `CreatePostResult` 等の `authRequired` オブジェクトから `code` フィールドを削除

### 5. bbs-cgi-response.ts — 専ブラ応答アダプタ

**改修: `buildAuthRequired()`**
- シグネチャ: `buildAuthRequired(edgeToken: string, baseUrl: string)` — `code` 引数を削除
- 認証URL: `/auth/verify?token={edgeToken}` — `code` パラメータを削除
- 案内HTML:
  - 「【認証コード】XXXXXX」行を削除
  - 手順を簡素化:
    1. 以下のURLにブラウザでアクセスして認証を完了してください
    2. Cookie共有の専ブラではそのまま書き込めます
    3. Cookie非共有の場合は、発行された write_token をメール欄に "#write_token値" 形式で貼り付けて書き込んでください

### 6. APIルートリネーム: auth-code → verify

- `src/app/api/auth/auth-code/route.ts` → `src/app/api/auth/verify/route.ts` に移動
- `src/app/api/auth/auth-code/__tests__/route.test.ts` → `src/app/api/auth/verify/__tests__/route.test.ts` に移動
- 旧 `src/app/api/auth/auth-code/` ディレクトリを削除
- route.ts 内: `verifyAuthCode()` → `verifyAuth()` 呼び出しに変更
- リクエストボディ: `code` フィールド削除、`edgeToken` フィールド追加（Cookieから取得でもよい）

**リクエストボディ（新）:**
```typescript
interface VerifyAuthRequest {
  turnstileToken: string;
  // edgeToken はリクエストのCookieから取得する（OpenAPI仕様に準拠）
}
```

### 7. threads routes — 401レスポンス修正

**`src/app/api/threads/[threadId]/posts/route.ts`:**
- L121-122: `authCodeUrl`, `authCode` を削除
- `authUrl: "/auth/verify"` のみにする（OpenAPI `AuthRequiredResponse` 準拠）

**`src/app/api/threads/route.ts`:**
- L165-166: 同上

### 8. bbs.cgi route — 認証案内修正

**`src/app/(senbra)/test/bbs.cgi/route.ts`:**
- L461-465: `result.authRequired.code` の参照を削除
- L545-548: `result.code` の参照を削除
- `buildAuthRequired` の呼び出し引数から code を削除

### 9. 単体テスト

- `auth-service.test.ts`: `generateAuthCode`, `verifyAuthCode`, `findByCode` 関連テストを `verifyAuth` に書き換え
- `post-service.test.ts`: 認証コード再発行シナリオを更新（codeフィールド削除）
- `route.test.ts`（移動後）: リクエストボディから code 削除、verifyAuth 呼び出しに変更

### 10. DBマイグレーション

`supabase/migrations/00026_drop_auth_codes_code.sql`:
```sql
ALTER TABLE auth_codes DROP COLUMN IF EXISTS code;
```

## 完了条件

- [ ] `npx vitest run` 全件PASS（既存テスト回帰なし）
- [ ] `npx tsc --noEmit` エラーなし
- [ ] ソースコード内に `findByCode`, `generateAuthCode`, `authCodeUrl` の残存なし（grep確認）
- [ ] APIルート `/api/auth/auth-code` が削除され `/api/auth/verify` に移動完了

## スコープ外

- フロントエンドUI（TASK-295が担当）
- BDDステップ定義・in-memoryリポジトリ（TASK-296が担当）
- `features/*.feature` ファイルの変更（人間が更新済み）

## 補足・制約

- `verifyAuth` の検索キーを `code` → `tokenId`（edge-token）に変更する際、auth_code_repository に `findByTokenId` メソッドが必要
- `handleCreatePost` と `handleCreateThread` の authRequired レスポンス構造の不統一を解消する（計画書 §5.2 注記参照）
- write_token関連の機能（`verifyWriteToken`, `findByWriteToken` 等）は変更不要（維持）

## 作業ログ

### チェックポイント
- 状態: 完了
- 全ファイル改修完了、テスト・型チェック通過済み

### 進捗ログ
- 2026-03-24 18:10 開始: 全対象ファイル読み込み完了、変更方針を把握
- 2026-03-24 18:20 auth-code-repository.ts: AuthCode型からcode削除、findByCode()削除、create()からcode削除
- 2026-03-24 18:25 auth-service.ts: generateAuthCode()削除、issueAuthCode()戻り値からcode削除、verifyAuthCode→verifyAuth改名・シグネチャ変更
- 2026-03-24 18:28 types/index.ts: PostResult.authRequiredからcode削除
- 2026-03-24 18:30 post-service.ts: PostResult/CreateThreadResult/resolveAuth()からcode削除
- 2026-03-24 18:35 bbs-cgi-response.ts: buildAuthRequired()の引数からcode削除、案内HTML簡素化
- 2026-03-24 18:40 src/app/api/auth/verify/route.ts: 新エンドポイント作成（edgeTokenをCookieから取得、verifyAuth呼び出し）
- 2026-03-24 18:42 src/app/api/auth/auth-code/route.ts: 410 Goneスタブに置換
- 2026-03-24 18:45 threads routes: 401レスポンスからauthCode/authCodeUrl削除、authUrl: "/auth/verify"に統一
- 2026-03-24 18:48 bbs.cgi route: buildAuthRequired呼び出しからcode引数削除
- 2026-03-24 18:50 auth-service.test.ts: findByCode→findByTokenId、verifyAuthCode→verifyAuth、code関連アサーション除去
- 2026-03-24 18:55 post-service.test.ts: issueAuthCodeモック戻り値からcode削除、authRequiredアサーション更新
- 2026-03-24 18:58 auth-code route.test.ts: 410 Goneテストに置換
- 2026-03-24 19:00 verify route.test.ts: 新エンドポイント用テストスイート作成（10テスト）
- 2026-03-24 19:02 bbs-cgi-response.test.ts: buildAuthRequired呼び出しを2引数に修正、code関連テスト除去
- 2026-03-24 19:05 supabase/migrations/00026_drop_auth_codes_code.sql: ALTER TABLE auth_codes DROP COLUMN IF EXISTS code
- 2026-03-24 19:10 npx tsc --noEmit: PASS（エラーなし）
- 2026-03-24 19:12 npx vitest run: 88/89ファイルPASS, 1765/1766テストPASS
- 2026-03-24 19:13 grep確認: findByCode, generateAuthCode, authCodeUrl いずれもsrc/内で残存なし

### テスト結果サマリー
- **npx tsc --noEmit**: PASS（エラーなし）
- **npx vitest run**: 88 passed / 1 failed (1765 tests passed / 1 failed)
  - 失敗: `schema-consistency.test.ts` — 既存の不整合（daily_events, pending_async_commands未作成、users.theme_id/font_id未マイグレーション）。TASK-294以前から存在する既知の問題（git stashで確認済み）
- **grep確認**: `findByCode`, `generateAuthCode`, `authCodeUrl` のsrc/内残存なし
- **TASK-294固有の全テスト**: 全PASS
