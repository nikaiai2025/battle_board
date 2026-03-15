---
task_id: TASK-043
sprint_id: Sprint-17
status: completed
assigned_to: bdd-coding
depends_on: [TASK-041]
created_at: 2026-03-14T13:00:00+09:00
updated_at: 2026-03-14T13:00:00+09:00
locked_files:
  - "src/app/(senbra)/test/bbs.cgi/route.ts"
  - "src/lib/infrastructure/adapters/bbs-cgi-response.ts"
---

## タスク概要

bbs.cgi routeを修正し、専ブラからのmail欄 `#<write_token>` トークンを検出・検証・除去する処理を追加する。
また、buildAuthRequired HTMLを更新し、認証コードと認証ページURLを明確に案内する。

## 対象BDDシナリオ

- `features/constraints/specialist_browser_compat.feature`
  - 「専ブラからの初回書き込みで認証案内が返される」
  - 「認証完了後にwrite_tokenをメール欄に貼り付けて書き込みが成功する」
  - 「Cookie共有の専ブラでは認証後そのまま書き込みできる」
  - 「無効なwrite_tokenでは書き込みが拒否される」

## 必読ドキュメント（優先度順）

1. [必須] `tmp/auth_spec_review_report.md` — §3.2 write_token方式、§6 タスク#8,#9
2. [必須] `src/app/(senbra)/test/bbs.cgi/route.ts` — 現行bbs.cgi route
3. [必須] `src/lib/infrastructure/adapters/bbs-cgi-response.ts` — 現行buildAuthRequired
4. [必須] `src/lib/services/auth-service.ts` — TASK-041で追加された `verifyWriteToken`
5. [参考] `features/constraints/specialist_browser_compat.feature` — 専ブラ認証BDDシナリオ

## 入力（前工程の成果物）

- TASK-041: `AuthService.verifyWriteToken(writeToken)` が使用可能

## 出力（生成すべきファイル）

- `src/app/(senbra)/test/bbs.cgi/route.ts` — 以下の変更:
  1. mail欄から `#<write_token>` パターンを検出する関数追加
  2. write_token検出時: `AuthService.verifyWriteToken()` で検証
  3. 検証成功: edge-token Cookieを有効化済みユーザーのものに設定し、write_tokenを除去したmail欄で書き込み処理を続行
  4. 検証失敗: エラーレスポンス（ＥＲＲＯＲ）を返す
  5. mail欄からwrite_tokenを除去した上で PostService に渡す（DATに漏洩させない）
- `src/lib/infrastructure/adapters/bbs-cgi-response.ts` — 以下の変更:
  1. `buildAuthRequired` を更新: 認証コード・認証ページURL・手順説明を明確化
  2. 認証ページURL: `/auth/verify?code={code}&token={edgeToken}` 形式
  3. 手順: 「1. 以下のURLにアクセス 2. 認証コード入力 3. write_tokenをメール欄に貼り付けて書き込み」

## 完了条件

- [ ] mail欄の `#xxx` パターンが検出・除去される
- [ ] 有効なwrite_tokenで書き込みが成功する
- [ ] 無効なwrite_tokenでエラーが返る（titleタグに"ＥＲＲＯＲ"）
- [ ] write_tokenは書き込みデータ（DAT）に含まれない
- [ ] buildAuthRequired が認証コード + 認証ページURL + 手順を案内する
- [ ] `npx vitest run` 全PASS
- [ ] テストコマンド: `npx vitest run`

## スコープ外

- `/auth/verify` ページの実装（TASK-042）
- BDDステップ定義の変更（TASK-044）
- handleCreateThread側のwrite_token対応（現時点では書き込み（handleCreatePost）のみ対応。スレッド作成はWeb UI経由が主なので後日対応可）

## 補足・制約

- write_token検出パターン: mail欄文字列中の `#` で始まる32文字hex文字列。正規表現: `/#([0-9a-f]{32})/i`
- mail欄に `#<write_token>` 以外の内容が含まれる場合（例: `sage#abc123...`）も正しく検出・除去すること
- write_tokenの検出と除去は bbs.cgi route 内で行い、PostServiceには除去済みのmail欄を渡す
- verifyWriteToken成功時、対応ユーザーのedge-tokenでCookieを設定する（以降はCookieベースで認証）
- buildAuthRequired の既存のHTML構造（titleタグ等）は維持しつつ内容を充実させる

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `src/lib/infrastructure/adapters/bbs-cgi-response.ts`
   - `buildAuthRequired()` を更新: 認証コード・認証ページURL(`/auth/verify?code={code}&token={edgeToken}`)・手順説明（3ステップ）を明記
   - 手順に write_token をメール欄に貼り付ける方法を記載

2. `src/app/(senbra)/test/bbs.cgi/route.ts`
   - `verifyWriteToken` を auth-service からインポートに追加
   - `WRITE_TOKEN_PATTERN` 正規表現定数を追加 (`/#([0-9a-f]{32})/i`)
   - `extractWriteToken(mail)` ヘルパー関数を追加: mail欄からwrite_tokenを抽出
   - `removeWriteToken(mail)` ヘルパー関数を追加: mail欄からwrite_tokenを除去
   - `POST` ハンドラーにwrite_token処理フローを追加:
     - 検出: `extractWriteToken(parsed.mail)`
     - 検証: `AuthService.verifyWriteToken(detectedWriteToken)`
     - 失敗時: `ＥＲＲＯＲ` レスポンスを返す
     - 成功時: write_token除去済みmail・verifiedEdgeTokenでPostServiceへ渡す
     - レスポンスに edge-token Cookie を設定

3. 新規テストファイル作成: `src/lib/infrastructure/adapters/__tests__/bbs-cgi-response.test.ts`
   - `BbsCgiResponseBuilder` の全メソッドをカバーする単体テスト追加
   - `buildAuthRequired()` の新仕様（認証コード・URL・手順・write_token案内）を検証

4. 既存テストファイル更新: `src/app/(senbra)/__tests__/route-handlers.test.ts`
   - `AuthService.verifyWriteToken` モックを追加
   - `AuthService` インポートを追加
   - write_token 関連テストケース 6件を追加:
     - 有効なwrite_tokenで書き込み成功・Cookie設定
     - PostServiceに渡す際にwrite_tokenが除去されている（DAT漏洩防止）
     - write_tokenのみのmail欄では除去後undefinedが渡される
     - 無効なwrite_tokenでＥＲＲＯＲレスポンス
     - 無効なwrite_tokenでSet-Cookieが設定されない
     - 通常メール欄ではverifyWriteTokenが呼ばれない
     - 大文字小文字混在のwrite_tokenが小文字化される

### テスト結果サマリー

- 実行コマンド: `npx vitest run`
- テストファイル: 17ファイル全PASS
- テスト総数: 531件全PASS（実装前490件 + 新規41件）
- 失敗: 0件
