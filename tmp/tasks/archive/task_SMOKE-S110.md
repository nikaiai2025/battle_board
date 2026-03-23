---
task_id: SMOKE-S110
sprint_id: Sprint-110
status: failed
assigned_to: bdd-smoke
created_at: 2026-03-24T06:10:00+09:00
updated_at: 2026-03-24T06:10:00+09:00
locked_files: []
---

## タスク概要

Sprint-110（認証フロー簡素化 — 6桁認証コード廃止、Turnstileのみに変更）デプロイ後の本番スモークテスト実行。

## 対象環境

- Cloudflare Workers: https://battle-board.shika.workers.dev
- Vercel: https://battle-board-uma.vercel.app
- 最新デプロイ: 2026-03-23T21:04:12Z（Sprint-110 コミット 7a3fe43 以降）

## テスト実行

`npx playwright test --config=playwright.prod.config.ts` を実行。

## 完了条件

- [x] スモークテスト実行完了
- [x] 結果サマリーを作業ログに記載

## 作業ログ

### チェックポイント

- 状態: 進行中
- デプロイ確認: 最新デプロイ 2026-03-23T21:04:12Z（Sprint-110 コミット 7a3fe43 = 2026-03-23T21:01:51Z 以降）を確認済み

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | FAIL |
| PASS/TOTAL | 28/35（2 failed、5 skipped） |
| 所要時間 | 約84s（1.4m） |
| 失敗テスト | 下記参照 |

**失敗テスト詳細:**

| # | テスト名 | 失敗理由 |
|---|---|---|
| 1 | `navigation.spec.ts:307` — 認証コード検証ページ /auth/verify › HTTPステータス200で応答し、認証フォームが表示される | `#auth-code-input` 要素が見つからない（element not found。Sprint-110で6桁認証コード入力フォームが廃止されたためと推測） |
| 2 | `navigation.spec.ts:332` — 認証コード検証ページ /auth/verify › クエリパラメータ code を渡すと認証コードがプリフィルされる | 同上（`#auth-code-input` が存在しないため `toHaveValue("123456")` が失敗） |

**スクリーンショットパス:**
- `ゴミ箱/test-results-prod/navigation-認証コード検証ページ-auth-9eb29-TPステータス200で応答し、認証フォームが表示される-prod-smoke/test-failed-1.png`
- `ゴミ箱/test-results-prod/navigation-認証コード検証ページ-auth-0e7c4-メータ-code-を渡すと認証コードがプリフィルされる-prod-smoke/test-failed-1.png`

**スキップされたテスト（ローカル限定のため本番では test.skip）:**

- `auth-flow.spec.ts`: 未認証→AuthModal認証→作成成功フロー（1件）
- `bot-display.spec.ts`: 撃破済みBOT表示系（2件）
- `polling.spec.ts`: ポーリング検証系（2件）

---

## SMOKE-S110b — TASK-297修正後の再実行

**実行日時:** 2026-03-24

**デプロイ確認:** 最新デプロイ `2026-03-23T21:20:37Z`（TASK-297コミット `3e3db3f` 以降）

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | FAIL |
| PASS/TOTAL | 28/34（1 failed、5 skipped） |
| 所要時間 | 約72s（1.2m） |
| 失敗テスト | 下記参照 |

**前回比較:** 2 FAIL → 1 FAIL（`#auth-code-input` 関連2件は修正済み。`#cf-turnstile` 関連が新たに1件残存）

**失敗テスト詳細:**

| # | テスト名 | 失敗理由 |
|---|---|---|
| 1 | `navigation.spec.ts:309` — 認証ページ /auth/verify › HTTPステータス200で応答し、認証フォームとTurnstileウィジェットが表示される | `#cf-turnstile` 要素が見つからない（locator not found, timeout 15000ms）。スクリーンショットではTurnstileウィジェット自体は画面に表示されているが、コンテナ要素に `id="cf-turnstile"` が付与されていない可能性がある |

**スクリーンショットパス:**
- `ゴミ箱/test-results-prod/navigation-認証ページ-auth-veri-e2b9d-証フォームとTurnstileウィジェットが表示される-prod-smoke/test-failed-1.png`

**スキップされたテスト（ローカル限定のため本番では test.skip）:**

- `auth-flow.spec.ts`: 未認証→AuthModal認証→作成成功フロー（1件）
- `bot-display.spec.ts`: 撃破済みBOT表示系（2件）
- `polling.spec.ts`: ポーリング検証系（2件）
