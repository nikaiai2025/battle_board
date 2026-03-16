---
task_id: TASK-085
sprint_id: Sprint-30
status: completed
assigned_to: bdd-coding
depends_on: [TASK-084]
created_at: 2026-03-16T12:00:00+09:00
updated_at: 2026-03-16T12:00:00+09:00
locked_files:
  - "src/lib/services/auth-service.ts"
  - "src/lib/services/__tests__/auth-service.test.ts"
  - "[NEW] features/support/in-memory/edge-token-repository.ts"
  - "features/support/register-mocks.js"
  - "features/support/mock-installer.ts"
---

## タスク概要

AuthServiceの `verifyEdgeToken` と `issueEdgeToken` を、従来の `users.auth_token` 直接参照から `edge_tokens` テーブル参照に移行する。`verifyWriteToken` と `verifyAuthCode` 内の `findByAuthToken` 呼び出しもEdgeTokenRepository経由に変更する。既存の単体テストを新しいRepository構造に合わせて修正し、全テストをPASSさせる。

## 対象BDDシナリオ
- `features/authentication.feature` — 既存の認証シナリオが回帰しないこと
- `features/constraints/specialist_browser_compat.feature` — write_token関連が回帰しないこと

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/components/user-registration.md` — §5.5 edge-token検証（改修）、§6 認証判定フロー
2. [必須] `src/lib/services/auth-service.ts` — 現在の実装
3. [必須] `src/lib/infrastructure/repositories/edge-token-repository.ts` — TASK-084で作成されたRepository
4. [参考] `src/lib/services/__tests__/auth-service.test.ts` — 既存テスト

## 入力（前工程の成果物）
- TASK-084の成果物: EdgeTokenRepository、拡張済みUserRepository、拡張済みUserモデル

## 出力（生成すべきファイル）
- `src/lib/services/auth-service.ts` — 改修版
- `src/lib/services/__tests__/auth-service.test.ts` — 修正版

## 完了条件
- [ ] `verifyEdgeToken`: `UserRepository.findByAuthToken` → `EdgeTokenRepository.findByToken` + `UserRepository.findById` に変更
- [ ] `issueEdgeToken`: `UserRepository.create` 後に `EdgeTokenRepository.create` で edge-token を別テーブルに保存。UserRepository.create の authToken 引数は後方互換のため同じ値を渡しつつ、edge_tokensにもINSERT（二重書き込み）
- [ ] `verifyWriteToken`: 内部の `findByAuthToken` 呼び出しを EdgeTokenRepository 経由に変更
- [ ] `verifyAuthCode`: 内部の `findByAuthToken` 呼び出しを EdgeTokenRepository 経由に変更
- [ ] 新しいimport追加: `EdgeTokenRepository`
- [ ] 既存の単体テスト全PASS: `npx vitest run src/lib/services/__tests__/auth-service.test.ts`
- [ ] 全体テスト: `npx vitest run` で全PASS
- [ ] BDDテスト: `npx cucumber-js` で回帰なし（128 passed, 3 pending を維持）

## スコープ外
- 本登録・ログイン・ログアウト・PAT関連の新メソッド追加（Sprint-31）
- bbs.cgiルートのPATパース追加（Sprint-31）
- APIルート変更（Sprint-31）
- `UserRepository.findByAuthToken` の削除（段階的廃止。他ファイルからの参照がなくなるまで残す）

## 補足・制約
- `issueEdgeToken` の変更で `UserRepository.create` の `authToken` 引数の扱いに注意。users.auth_token カラムは残存するため、後方互換のために同じ値をusers.auth_tokenにも書き込みつつ、edge_tokensにもINSERTする二重書き込み方式とする（移行期間中の安全策）
- `verifyEdgeToken` は設計書 §5.5 のJOINクエリを参考にするが、Repository層を使う実装とすること（直接SQLは書かない）
- テストのモック差し替えが必要になる場合、既存のモックパターンに従うこと

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: completed
- 全作業完了

### 進捗ログ

- [完了] auth-service.ts: EdgeTokenRepository import 追加
- [完了] verifyEdgeToken: findByAuthToken → findByToken + findById に変更
- [完了] issueEdgeToken: EdgeTokenRepository.create を追加（二重書き込み）
- [完了] verifyAuthCode Step6: findByAuthToken → findByToken + findById に変更
- [完了] verifyWriteToken Step4: findByAuthToken → findByToken + findById に変更
- [完了] auth-service.test.ts: EdgeTokenRepository モック追加、全テスト対応
- [完了] BDDテスト: features/support 配下の変更が locked_files 外のためエスカレーション
- [完了] ESC-TASK-085-1 解決後: edge-token-repository.ts インメモリ実装作成
- [完了] register-mocks.js に edge-token-repository モック登録追加
- [完了] mock-installer.ts に import / reset() / export 追加
- [完了] BDDテスト 128 passed / 3 pending 確認
- [完了] 単体テスト 768 passed 確認

### escalation_resolution (ESC-TASK-085-1)
- **判断**: オーケストレーターAIが自律判断で解決（BDDシナリオ変更なし・テストインフラのみ）
- **対応**: locked_filesに以下3ファイルを追加
  - `[NEW] features/support/in-memory/edge-token-repository.ts`
  - `features/support/register-mocks.js`
  - `features/support/mock-installer.ts`
- **指示**: 既存の他リポジトリ（例: user-repository.ts）のインメモリ実装パターンに従い、EdgeTokenRepositoryのインメモリ実装を作成。register-mocks.jsとmock-installer.tsに登録。`npx cucumber-js` で 128 passed / 3 pending を確認すること。

### テスト結果サマリー

- 単体テスト（`npx vitest run`）: 768 passed / 0 failed（23ファイル）
  - auth-service.test.ts: 61 passed（新規テスト含む）
- BDDテスト（`npx cucumber-js`）: 128 passed / 3 pending（131 scenarios, 625 steps）
  - 回帰なし確認済み
