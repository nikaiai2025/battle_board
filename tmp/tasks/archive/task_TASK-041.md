---
task_id: TASK-041
sprint_id: Sprint-17
status: completed
assigned_to: bdd-coding
depends_on: [TASK-040]
created_at: 2026-03-14T12:30:00+09:00
updated_at: 2026-03-14T12:30:00+09:00
locked_files:
  - "src/lib/services/auth-service.ts"
  - "src/lib/services/post-service.ts"
---

## タスク概要

認証フロー是正の中核となるサービス層の修正を行う。
AuthServiceに`is_verified`チェック・`write_token`生成・`verifyWriteToken`を追加し、
PostServiceの`resolveAuth`で未検証edge-tokenを拒否するように修正する。

## 対象BDDシナリオ

- `features/phase1/authentication.feature` — 全シナリオ
  - 特に「edge-token発行後、認証コード未入力で再書き込みすると認証が再要求される」（G1）
  - 「認証済みユーザーのIPアドレスが変わっても書き込みが継続できる」（G2）
  - 「edge-token Cookieの有効期限が切れると再認証が必要になる」（G3）
- `features/constraints/specialist_browser_compat.feature` — 専ブラ認証フロー（G4）

## 必読ドキュメント（優先度順）

1. [必須] `tmp/auth_spec_review_report.md` — 設計レビュー報告書（§3 設計方針全体）
2. [必須] `src/lib/services/auth-service.ts` — 現行AuthService
3. [必須] `src/lib/services/post-service.ts` — 現行PostService
4. [必須] `src/lib/infrastructure/repositories/user-repository.ts` — TASK-040で更新済み（updateIsVerified確認）
5. [必須] `src/lib/infrastructure/repositories/auth-code-repository.ts` — TASK-040で更新済み（updateWriteToken確認）
6. [参考] `features/phase1/authentication.feature` — BDDシナリオ（振る舞い確認）

## 入力（前工程の成果物）

- TASK-040: DBマイグレーション・ドメインモデル・リポジトリ層の更新完了

## 出力（生成すべきファイル）

- `src/lib/services/auth-service.ts` — 以下の変更:
  1. `VerifyResult`型に `not_verified` reason を追加
  2. `verifyEdgeToken` — `user.isVerified === false` の場合 `{ valid: false, reason: 'not_verified' }` を返す
  3. `verifyAuthCode` — 認証成功時に `UserRepository.updateIsVerified(userId, true)` を呼び出し + `write_token` を生成して `AuthCodeRepository.updateWriteToken` で保存 + 戻り値を `{ success: true, writeToken: string }` に変更
  4. `verifyWriteToken(writeToken: string)` — 新規関数。auth_codesテーブルからwrite_tokenを検索・有効期限チェック・ワンタイム消費（削除またはnull化）・対応するedge-tokenのユーザーを検証済みに更新
- `src/lib/services/post-service.ts` — 以下の変更:
  1. `resolveAuth` — `verifyResult.reason === 'not_verified'` の場合、認証案内を再表示（新規edge-token発行は不要、既存のedge-tokenに紐づく認証コードを再発行）

## 完了条件

- [ ] `verifyEdgeToken` が未検証ユーザーに `not_verified` を返す
- [ ] `verifyAuthCode` が認証成功時に `is_verified=true` に更新し `write_token` を生成・返却する
- [ ] `verifyWriteToken` が新規追加され、トークン検証・ワンタイム消費・ユーザー検証済み更新を行う
- [ ] `resolveAuth` が `not_verified` を適切に処理する（既存edge-tokenを維持して認証コード再発行）
- [ ] `npx vitest run` で既存テスト全PASS
- [ ] テストコマンド: `npx vitest run`

## スコープ外

- ルートハンドラの変更（TASK-042, TASK-043）
- BDDステップ定義の変更（TASK-044）
- 設計書更新（TASK-045）

## 補足・制約

- `verifyAuthCode` の戻り値変更は破壊的変更。呼び出し元（auth-code route.ts）はTASK-042で対応するが、現時点ではboolean互換のまま `{ success: boolean, writeToken?: string }` 形式にするか、既存呼び出し元が壊れない方法を選択すること
- `write_token` は `crypto.randomBytes(16).toString('hex')` で32文字hex生成
- `write_token` の有効期限は10分（認証コードと同じ）
- `verifyWriteToken` はワンタイム: 検証成功時に `write_token` を null にして再利用を防ぐ
- IP不一致（ip_mismatch）時の処理は現行維持（ソフトチェック）。ただし `is_verified` チェックは IP チェックより前に実施する
- `verifyEdgeToken` で `is_verified` チェックを行う位置: ユーザー存在確認後・IPチェック前

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク完了
- 次にすべきこと: なし
- 未解決の問題: ESC-TASK-041-1（auth-code-repository.ts に findByWriteToken/clearWriteToken が不足。現在は supabaseAdmin 直接使用で回避済み）

### 進捗ログ

1. `auth-service.ts` 修正
   - `import { createHash, randomBytes } from 'crypto'` に変更（randomBytes 追加）
   - `VerifyResult` 型に `not_verified` reason を追加
   - `verifyEdgeToken`: ユーザー存在確認後・IPチェック前に `user.isVerified === false` チェック追加
   - `issueAuthCode`: `AuthCodeRepository.create` 呼び出しに `writeToken: null, writeTokenExpiresAt: null` を追加（型整合）
   - `verifyAuthCode`: 戻り値を `Promise<{ success: boolean; writeToken?: string }>` に変更。認証成功時に `UserRepository.updateIsVerified(userId, true)` + `write_token` 生成 + `AuthCodeRepository.updateWriteToken` を呼び出し
   - `verifyWriteToken`: 新規追加。`supabaseAdmin` 直接使用（ESC-TASK-041-1 参照）。ワンタイム消費・is_verified 更新を実装

2. `post-service.ts` 修正
   - `resolveAuth`: `not_verified` ケースを追加。既存 edge-token を維持したまま `issueAuthCode` で認証コードを再発行

3. テスト更新
   - `auth-service.test.ts`: モックに `updateIsVerified`, `updateWriteToken` 追加。`makeUser` に `isVerified` 追加。`verifyAuthCode` のテストを新戻り値形式に更新。`verifyEdgeToken` の `not_verified` テスト追加。`verifyWriteToken` の新規テストスイート追加
   - `post-service.test.ts`: `mockUser`/`mockPremiumUser` に `isVerified: true` 追加。モックに `updateIsVerified`, `verifyWriteToken` 追加。`not_verified` ケースのテスト追加

### テスト結果サマリー

- テスト実行コマンド: `npx vitest run`
- 実行後（変更後）: 15 ファイル / 490 テスト PASS
- 失敗: 0
- 変更前ベースライン（TASK-040完了後）: 476 テスト PASS
- 追加テスト数: 14 テスト（auth-service.test.ts +10、post-service.test.ts +4）
