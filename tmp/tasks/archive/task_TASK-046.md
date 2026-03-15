---
task_id: TASK-046
sprint_id: Sprint-18
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-15T00:00:00+09:00
updated_at: 2026-03-15T00:00:00+09:00
locked_files:
  - src/lib/infrastructure/adapters/bbs-cgi-response.ts
  - src/lib/infrastructure/adapters/__tests__/bbs-cgi-response.test.ts
  - src/app/(senbra)/test/bbs.cgi/route.ts
---

## タスク概要

`buildAuthRequired()` が生成する認証URLを相対パス（`/auth/verify?...`）から絶対URL（`https://domain/auth/verify?...`）に変更する。専ブラ（Siki等）のWebViewでは相対パスがリンクとして認識されないため、ユーザーが認証ページにアクセスできない。

## 対象BDDシナリオ
- `features/constraints/specialist_browser_compat.feature` @専ブラからの初回書き込みで認証案内が返される

## 必読ドキュメント（優先度順）
1. [必須] `src/lib/infrastructure/adapters/bbs-cgi-response.ts` — 修正対象
2. [必須] `src/app/(senbra)/test/bbs.cgi/route.ts` — buildAuthRequired呼び出し元
3. [参考] `src/app/(senbra)/bbsmenu.html/route.ts` — `NEXT_PUBLIC_BASE_URL` 利用パターンの参考

## 入力（前工程の成果物）
- なし（Sprint-17完了状態のコードが起点）

## 出力（生成すべきファイル）
- `src/lib/infrastructure/adapters/bbs-cgi-response.ts` — buildAuthRequired に baseUrl パラメータ追加
- `src/lib/infrastructure/adapters/__tests__/bbs-cgi-response.test.ts` — 絶対URL検証テスト追加
- `src/app/(senbra)/test/bbs.cgi/route.ts` — baseUrl を取得して buildAuthRequired に渡す

## 完了条件
- [ ] `buildAuthRequired(code, edgeToken, baseUrl)` が `https://domain/auth/verify?code=...&token=...` 形式の絶対URLを生成する
- [ ] baseUrlの取得: `NEXT_PUBLIC_BASE_URL` 環境変数を優先し、未設定時はフォールバック値を使用する（bbsmenu.html/route.tsの `getBaseUrl()` パターンに倣う）
- [ ] 単体テスト（bbs-cgi-response.test.ts）で絶対URL形式が検証される
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 全PASS

## スコープ外
- Shift-JIS文字化け修正（TASK-047で対応）
- BDDシナリオの変更

## 補足・制約
- 既存のbbsmenu系ルートが `NEXT_PUBLIC_BASE_URL ?? "https://battleboard.vercel.app"` のパターンを使用している。同じフォールバック値を使用するが、本番は現在Cloudflare Workers (`battle-board.nikai-ai.workers.dev`) のため、Cloudflareダッシュボード側で正しい値が設定されていることを前提とする
- `buildAuthRequired` の第3引数にbaseUrlを追加する方式を推奨。呼び出し元（bbs.cgi route）で `getBaseUrl()` ヘルパーを定義して渡す
- BDDステップ定義でbuildAuthRequiredを直接呼んでいる箇所がある場合は、テストでもbaseUrlを渡すよう修正すること

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全実装・テスト完了
- 次にすべきこと: なし
- 未解決の問題: shift-jis.test.ts が12件失敗しているが、TASK-046開始前から存在する既存の問題であり本タスクのスコープ外（TASK-047対象）

### 進捗ログ
1. タスク指示書・必読ドキュメント読み込み完了
2. [Inner Loop RED] bbs-cgi-response.test.ts に baseUrl 引数を使う絶対URL検証テストを追加（3件失敗を確認）
3. [Inner Loop GREEN] bbs-cgi-response.ts の buildAuthRequired に baseUrl 第3引数を追加、末尾スラッシュ正規化実装
4. [GREEN確認] bbs-cgi-response.test.ts 22件PASS
5. bbs.cgi/route.ts に getBaseUrl() ヘルパーを追加（bbsmenu.html/route.ts パターンに倣う）
6. bbs.cgi/route.ts の buildAuthRequired 呼び出し2箇所に getBaseUrl() を渡すよう修正
7. specialist_browser_compat.steps.ts の buildAuthRequired 呼び出し3箇所に TEST_BASE_URL を渡すよう修正
8. 全BDDテスト 95件PASS確認

### テスト結果サマリー
- 単体テスト（TASK-046対象ファイル）: 22件PASS / 0件FAIL
  - src/lib/infrastructure/adapters/__tests__/bbs-cgi-response.test.ts: 22件PASS（新規2件追加）
- 全単体テスト: shift-jis.test.ts の12件はTASK-047スコープの既存問題のため除外
- BDDテスト: 95件PASS / 0件FAIL (`npx cucumber-js`)
