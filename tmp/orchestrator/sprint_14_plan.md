# Sprint-14 計画書

## 概要

専ブラ互換エンドポイントが本番環境（Vercel）で404になる問題の修正。
Next.js App Routerが拡張子付きURLを静的ファイルリクエストとして処理するため、専ブラからのアクセスがルートハンドラに到達しない。

## 背景

- 人間から報告: 本番環境で `GET /battleboard/kako/1773/17734/1773436607.dat` が404
- 根本原因: Next.js/Vercelが `.dat`, `.txt`, `.TXT`, `.html` 等の拡張子付きURLをApp Routerに通さない
- Sprint-13のAPIテスト時に `.dat` の問題は検知済みだったが、テスト側で回避しており本番は未修正
- `kako` 形式URLは `.dat` が404になったことで専ブラが過去ログ倉庫を探索した副次的現象

## タスク一覧

| TASK_ID | 内容 | 担当 | 状態 |
|---|---|---|---|
| TASK-033 | next.config.ts にrewrites追加 + 全専ブラエンドポイント疎通確認 | bdd-coding | completed |
| TASK-034 | DATルートフォルダリネーム（[threadKey].dat → [threadKey]） | bdd-coding | completed |
| TASK-035 | bbsmenu.json エンドポイント新規実装（ChMate対応） | bdd-coding | completed |

## 結果

### TASK-033: completed
- `next.config.ts` にrewrites追加（`.dat`拡張子 + kako形式）
- `subject.txt` / `SETTING.TXT` / `bbsmenu.html` はApp Router固定パスのため問題なし（リライト不要）
- APIテストを拡張子付きURLに修正（本来のURL形式でテスト）

### TASK-034: completed
- フォルダリネーム `[threadKey].dat` → `[threadKey]` 完了
- rewrites先と一致し、Vercel上でも正常ルーティング
- 全テストPASS（vitest 468, cucumber 87, playwright e2e 1, playwright api 26）

### TASK-035: completed
- `GET /bbsmenu.json` エンドポイント新規実装
- BDDシナリオ・ステップ定義・単体テスト7件・E2Eテスト3件追加
- 全テストPASS（vitest 476, cucumber 88）

## 本番動作確認結果

- **Siki (PC)**: スレッド一覧表示・閲覧・書き込み全て正常動作
- **ChMate (Android)**: 接続不可（継続）

### ChMate問題の根本原因（Sprint-14中に判明）

ChMateの5chプロトコルHTTPクライアントはHTTP:80で接続するが、Vercelは308 Permanent RedirectでHTTPS:443に転送。ChMateはこのリダイレクトに追従できない。Vercel側でHTTP:80の308を無効化する設定はない。

詳細: `docs/research/chmate_debug_report_2026-03-14.md`

### 副次的発見: 認証バイパス脆弱性

Sikiでの書き込みテスト中に、認証コード未入力で書き込みが成功するバグを発見。`resolveAuth()` がedge-tokenの存在のみチェックし、auth_codes.verified状態をチェックしていない。BDDシナリオの追加が必要なため人間承認待ち。

詳細: `tmp/auth_spec_review_context.md`
