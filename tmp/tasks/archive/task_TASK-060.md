---
task_id: TASK-060
sprint_id: Sprint-21
status: completed
assigned_to: bdd-coding
depends_on: [TASK-059]
created_at: 2026-03-15T14:00:00+09:00
updated_at: 2026-03-15T14:00:00+09:00
locked_files:
  - features/step_definitions/specialist_browser_compat.steps.ts
---

## タスク概要

Cookie互換関連の新規BDDシナリオ2件のステップ定義を整備する。また、HTTP:80/WAFのインフラ制約シナリオ3件をPending（テスト不可）として処理する。

## 対象BDDシナリオ

- `features/constraints/specialist_browser_compat.feature`
  - @専ブラがbbs.cgi応答のedge-token Cookieを保存し次回リクエストで送信する（実装済・ステップ定義確認）
  - @edge-token CookieのSet-Cookieヘッダに専ブラ非互換属性を含まない（実装済・ステップ定義追加）
  - @専ブラの5chプロトコル通信がHTTP:80で直接応答される（インフラ制約・Pending）
  - @bbs.cgiへのHTTP:80 POSTが直接処理される（インフラ制約・Pending）
  - @専ブラ特有のUser-AgentがWAFにブロックされない（インフラ制約・Pending）

## 必読ドキュメント（優先度順）

1. [必須] `features/constraints/specialist_browser_compat.feature` — 対象シナリオ
2. [必須] `features/step_definitions/specialist_browser_compat.steps.ts` — 既存ステップ定義
3. [参考] `src/app/(senbra)/test/bbs.cgi/route.ts` — setEdgeTokenCookie関数

## 入力（前工程の成果物）

なし

## 出力（生成すべきファイル）

- `features/step_definitions/specialist_browser_compat.steps.ts` — ステップ定義追加

## 完了条件

- [x] Cookie保存・再送信シナリオの既存ステップ定義が新Gherkin記述にマッチすることを確認
- [x] Set-Cookie非互換属性シナリオのステップ定義追加（Secure/SameSite非含有、HttpOnly/Path含有を検証）
- [x] HTTP:80/WAFシナリオ3件はPendingステップ（`return 'pending'`）として定義
- [x] テストコマンド: `npx cucumber-js`

## 補足・制約

- HTTP:80/WAFのシナリオはインフラレベルの制約であり、BDD単体テストでは検証不可能。Sprint-20で実機検証済みだが、自動テストとしてはPendingとする
- Set-Cookie検証は bbs.cgi（専ブラ向け）のみが対象。Web API（`/api/`）のSet-CookieはSecure/SameSite=Lax を維持しており、変更対象外
- 既存のG4認証フローステップ定義（specialist_browser_compat.steps.ts内）と重複しないよう注意

## スコープ外

- ソースコードの変更（ステップ定義のみ）
- Web API側のCookie設定変更
- e2e/api/auth-cookie.spec.ts の変更（Web API側テストは正しい状態）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全ステップ定義実装完了、cucumber-js PASS確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- featureファイルと既存ステップ定義を読み込み完了
- cucumber-js実行で未定義ステップを特定:
  - シナリオ1「専ブラがbbs.cgi応答のedge-token Cookieを保存し次回リクエストで送信する」:
    - Given ユーザーがwrite_tokenで書き込みに成功しedge-token Cookieが発行されている（未定義）
    - When 専ブラがwrite_tokenなしでbbs.cgiに再度POSTする（未定義）
    - Then リクエストのCookieヘッダにedge-tokenが含まれる（未定義）
    - And 再認証は要求されない（未定義）
  - シナリオ2「edge-token CookieのSet-Cookieヘッダに専ブラ非互換属性を含まない」:
    - When bbs.cgiがedge-token Cookieを設定するレスポンスを返す（未定義）
    - Then Set-CookieヘッダにSecure属性が含まれない（未定義）
    - And Set-CookieヘッダにSameSite属性が含まれない（未定義）
    - And Set-CookieヘッダにHttpOnly属性が含まれる（未定義）
    - And Set-CookieヘッダにPath=/が含まれる（未定義）
  - インフラ制約シナリオ3件: Pending処理が必要（nameフィルタ除外から削除 + Pendingステップ追加）
- route.ts の setEdgeTokenCookie関数を確認: HttpOnly/Path=/あり、Secure/SameSiteなし

### テスト結果サマリー
- 実行コマンド: `npx cucumber-js`
- 結果: 106 scenarios (3 pending, 103 passed) / 492 steps (3 pending, 5 skipped, 484 passed)
- pending: インフラ制約3件（HTTP:80直接応答2件・WAF非ブロック1件）— 意図的Pending
- failed: 0件
- undefined: 0件
