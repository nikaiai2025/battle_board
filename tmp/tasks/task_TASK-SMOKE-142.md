---
task_id: TASK-SMOKE-142
sprint_id: Sprint-142
status: completed
assigned_to: bdd-smoke
depends_on: []
created_at: 2026-03-29T19:30:00+09:00
updated_at: 2026-03-29T19:55:00+09:00
locked_files: []
---

## タスク概要

Sprint-142（管理画面BOT管理 + ユーザー語録登録）のデプロイ後、本番スモークテストを実行する。

## 完了条件

- [x] 本番スモークテスト実行完了
- [x] 結果レポート

## 作業ログ

### テスト結果サマリー（初回 — Sprint-142 デプロイ直後）

| 項目 | 内容 |
|---|---|
| 結果 | FAIL |
| PASS/TOTAL | 27/35（5 skipped） |
| 所要時間 | 約1分36秒 |
| 失敗テスト | 下記参照 |

#### 失敗テスト一覧

全3件とも `navigation.spec.ts` の「マイページ /mypage」グループで発生。共通エラー:

```
Error: expect(locator).toBeVisible() failed
Locator: locator('#account-info')
Expected: visible
Timeout: 15000ms
```

ページスナップショット（3件すべて同一）:

```
heading "Application error: a client-side exception has occurred while loading battle-board.shika.workers.dev (see the browser console for more information)."
```

| # | テスト名 | スクリーンショット |
|---|---|---|
| 1 | マイページ /mypage › 認証後にアクセスでき、主要UI要素が表示される | `ゴミ箱/test-results-prod/navigation-マイページ-mypage-認証後にアクセスでき、主要UI要素が表示される-prod-smoke/test-failed-1.png` |
| 2 | マイページ /mypage › 仮ユーザー状態で本登録リンクが表示され、遷移先が404/500でない | `ゴミ箱/test-results-prod/navigation-マイページ-mypage-仮ユーザー状態で本登録リンクが表示され、遷移先が404-500でない-prod-smoke/test-failed-1.png` |
| 3 | マイページ /mypage › マイページからトップへの戻りリンクが存在する | `ゴミ箱/test-results-prod/navigation-マイページ-mypage-マイページからトップへの戻りリンクが存在する-prod-smoke/test-failed-1.png` |

### テスト結果サマリー（再実行 — ホットフィックス 71352b9 デプロイ後）

| 項目 | 内容 |
|---|---|
| 結果 | PASS |
| PASS/TOTAL | 30/35（5 skipped） |
| 所要時間 | 52.0s |
| 失敗テスト | なし |

デプロイ確認: 最新デプロイ 2026-03-28T22:55:33Z（JST: 2026-03-29T07:55:33+09:00）がコミット 71352b9（2026-03-29T07:53:08+09:00）以降であることを確認。
マイページの3件すべてが PASS に転じ、ホットフィックスによる修正が確認された。

### チェックポイント
- 状態: 完了（PASS）
- 完了済み: デプロイ確認、スモークテスト実行、結果レポート
