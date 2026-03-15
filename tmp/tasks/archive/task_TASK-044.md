---
task_id: TASK-044
sprint_id: Sprint-17
status: completed
assigned_to: bdd-coding
depends_on: [TASK-042, TASK-043]
created_at: 2026-03-14T14:00:00+09:00
updated_at: 2026-03-14T23:15:00+09:00
locked_files:
  - "src/lib/infrastructure/repositories/auth-code-repository.ts"
  - "src/lib/services/auth-service.ts"
  - "features/support/in-memory/user-repository.ts"
  - "features/support/in-memory/auth-code-repository.ts"
  - "features/step_definitions/authentication.steps.ts"
  - "[NEW] features/step_definitions/specialist_browser_compat.steps.ts"
  - "features/support/mock-installer.ts"
---

## タスク概要

BDDテストを全PASSさせるため、以下の3つの作業を統合実施する:
1. ESC-TASK-041-1 の解決: auth-code-repositoryに `findByWriteToken` / `clearWriteToken` を追加し、auth-service.ts の `verifyWriteToken` をリポジトリ経由に書き換える
2. インメモリリポジトリの同期: `updateIsVerified`（user）、`updateWriteToken` / `findByWriteToken` / `clearWriteToken`（auth-code）を追加
3. BDDステップ定義: authentication.feature v4 と specialist_browser_compat.feature v3 の新規・変更シナリオに対応するステップ定義を実装

## 対象BDDシナリオ

- `features/phase1/authentication.feature`
  - [変更対応] 「正しい認証コードとTurnstileで認証に成功する」— `/auth/verify` 経由 + write_token 発行
  - [新規] 「edge-token発行後、認証コード未入力で再書き込みすると認証が再要求される」（G1）
  - [新規] 「認証済みユーザーのIPアドレスが変わっても書き込みが継続できる」（G2）
  - [新規] 「edge-token Cookieの有効期限が切れると再認証が必要になる」（G3）
- `features/constraints/specialist_browser_compat.feature`
  - [新規] 「専ブラからの初回書き込みで認証案内が返される」
  - [新規] 「認証完了後にwrite_tokenをメール欄に貼り付けて書き込みが成功する」
  - [新規] 「Cookie共有の専ブラでは認証後そのまま書き込みできる」
  - [新規] 「無効なwrite_tokenでは書き込みが拒否される」

## 必読ドキュメント（優先度順）

1. [必須] `features/phase1/authentication.feature` — v4シナリオ全文
2. [必須] `features/constraints/specialist_browser_compat.feature` — v3シナリオ全文
3. [必須] `features/step_definitions/authentication.steps.ts` — 現行ステップ定義
4. [必須] `features/support/in-memory/user-repository.ts` — 現行インメモリUser
5. [必須] `features/support/in-memory/auth-code-repository.ts` — 現行インメモリAuthCode
6. [必須] `src/lib/services/auth-service.ts` — TASK-041で更新済み（verifyWriteTokenのsupabaseAdmin直接使用を確認）
7. [必須] `src/lib/infrastructure/repositories/auth-code-repository.ts` — TASK-040で更新済み
8. [必須] `features/support/mock-installer.ts` — モック差し替え機構
9. [参考] `docs/architecture/bdd_test_strategy.md` — BDDテスト戦略
10. [参考] `tmp/auth_spec_review_report.md` — 設計レビュー報告書

## 入力（前工程の成果物）

- TASK-040〜043の全実装完了
- `tmp/escalations/escalation_ESC-TASK-041-1.md` — 未解決エスカレーション

## 出力（生成すべきファイル）

### 1. リポジトリ層修正（ESC-TASK-041-1解決）
- `src/lib/infrastructure/repositories/auth-code-repository.ts`:
  - `findByWriteToken(writeToken: string): Promise<AuthCode | null>` 追加
  - `clearWriteToken(id: string): Promise<void>` 追加（write_token, write_token_expires_at を null に更新）
- `src/lib/services/auth-service.ts`:
  - `verifyWriteToken` を `supabaseAdmin` 直接使用から `AuthCodeRepository.findByWriteToken` + `AuthCodeRepository.clearWriteToken` 使用にリファクタ

### 2. インメモリリポジトリ同期
- `features/support/in-memory/user-repository.ts`:
  - `updateIsVerified(userId: string, isVerified: boolean): Promise<void>` 追加
- `features/support/in-memory/auth-code-repository.ts`:
  - `updateWriteToken(id: string, writeToken: string, writeTokenExpiresAt: Date): Promise<void>` 追加
  - `findByWriteToken(writeToken: string): Promise<AuthCode | null>` 追加
  - `clearWriteToken(id: string): Promise<void>` 追加

### 3. BDDステップ定義
- `features/step_definitions/authentication.steps.ts`:
  - 既存 `When /auth-code で認証コードを送信する` → `When /auth/verify で認証コードを送信する` に変更（verifyAuthCodeの新戻り値に対応）
  - `Then write_tokenが発行される` 追加
  - G1: 「edge-token発行後、認証コード未入力で再書き込み」のGiven/When/Then追加
  - G2: 「認証済みユーザーのIPアドレスが変わっても書き込み継続」のGiven/When/Then追加
  - G3: 「edge-token有効期限切れ」のGiven/When/Then追加
- `features/step_definitions/specialist_browser_compat.steps.ts` [新規]:
  - 「専ブラからの初回書き込みで認証案内が返される」
  - 「認証完了後にwrite_tokenをメール欄に貼り付けて書き込みが成功する」
  - 「Cookie共有の専ブラでは認証後そのまま書き込みできる」
  - 「無効なwrite_tokenでは書き込みが拒否される」

## 完了条件

- [ ] `npx cucumber-js` 全シナリオPASS（新規追加シナリオ含む）
- [ ] `npx vitest run` 全PASS（リポジトリリファクタで既存テスト不変）
- [ ] auth-service.ts の verifyWriteToken が supabaseAdmin 直接使用でなくリポジトリ経由になっている
- [ ] テストコマンド: `npx cucumber-js` および `npx vitest run`

## スコープ外

- 設計書更新（TASK-045）
- 新規vitest単体テスト追加（既存テストの回帰確認のみ）

## 補足・制約

- BDDテストはサービス層テスト（インメモリモック環境）で実施。Route Handler層のテストはvitest側で実施済み
- `verifyAuthCode` の戻り値が `boolean` → `{ success: boolean, writeToken?: string }` に変わったため、authentication.steps.ts の該当ステップを更新すること
- 専ブラ互換のBDDシナリオはサービス層レベルでテスト。write_tokenの検出・除去は bbs.cgi route（TASK-043で実装済み）の責務であり、BDDステップではAuthService.verifyWriteToken とPostService.createPost の連携をテストする
- `features/step_definitions/specialist_browser_compat.steps.ts` に既存ファイルがある場合は追記する形で対応すること
- 「ユーザーが書き込み可能状態である」は既存ステップ定義（posting.steps.ts）に存在する可能性があるため、重複定義しないよう既存を確認すること

### ESC-TASK-041-1 解決方針
auth-service.ts の `verifyWriteToken` 関数内の `supabaseAdmin.from('auth_codes')...` を `AuthCodeRepository.findByWriteToken()` + `AuthCodeRepository.clearWriteToken()` + `UserRepository.updateIsVerified()` に置き換える。これによりBDDテスト環境でインメモリモックが正しく動作する。

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: completed
- 完了済み: 全BDDシナリオPASS、全単体テストPASS
- 未解決の問題: なし

### 進捗ログ
- [完了] auth-code-repository.ts に findByWriteToken/clearWriteToken 追加
- [完了] features/support/in-memory/auth-code-repository.ts に同期
- [完了] features/support/in-memory/user-repository.ts に updateIsVerified 追加
- [完了] auth-service.ts の verifyWriteToken をリポジトリ経由に書き換え
- [完了] authentication.steps.ts: verifyAuthCode 戻り値対応、updateIsVerified 追加
- [完了] specialist_browser_compat.steps.ts: G4シナリオステップ追加、isVerified修正、Date.now freeze修正
- [完了] posting.steps.ts, thread.steps.ts, mypage.steps.ts, incentive.steps.ts: updateIsVerified 追加
- [完了] features/support/world.ts: _trueOriginalDateNow でDate.nowスタブ汚染問題を根本解決
- [完了] auth-service.test.ts: verifyWriteToken テストをリポジトリモック使用に更新
- [完了] デバッグログ除去

### テスト結果サマリー
- BDDテスト: 95 scenarios (95 passed), 454 steps (454 passed)
- 単体テスト: 18 Test Files (18 passed), 552 Tests (552 passed)
