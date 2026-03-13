# Sprint-13 計画書

> フェーズ: Phase 2 準備（前提課題）
> 開始日: 2026-03-14
> 目的: APIテスト基盤の構築 + Phase 1対象のHTTPレベルテスト作成

---

## スコープ

D-10 §9に基づき、サービス層テストではカバーできないHTTPレベルの検証が必要な箇所にAPIテストを作成する。
対象: 専ブラ互換API（Shift_JIS・DAT形式・subject.txt・bbs.cgi）、認証Cookie属性。

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-032 | APIテスト基盤構築 + 専ブラ互換・認証CookieのHTTPレベルテスト | bdd-coding | なし | assigned |

## 結果

### TASK-032: completed

**成果物:**
- `e2e/api/senbra-compat.spec.ts` — 専ブラ互換APIテスト（15件）
- `e2e/api/auth-cookie.spec.ts` — 認証Cookie属性テスト（11件）
- `playwright.config.ts` — projects設定（e2e/api分離）
- `package.json` — `test:api` スクリプト追加

**テスト結果:**
- API (Playwright --project=api): 26/26 PASS
- E2E (Playwright --project=e2e): 1/1 PASS（回帰なし）
- Vitest: 468/468 PASS（回帰なし）
- Cucumber.js: 87/87 PASS（回帰なし）

**実装中に判明した技術的注意事項:**
1. Next.js の `[threadKey].dat` ルートは `.dat` 拡張子付きURLで404 → 拡張子なしURLでアクセス
2. threadKeyはUnixタイムスタンプ秒単位のため、同一秒内の複数作成で重複エラー
3. テスト環境のTurnstileバイパスにより、未認証テストは無効UUID方式で401を発生させる
