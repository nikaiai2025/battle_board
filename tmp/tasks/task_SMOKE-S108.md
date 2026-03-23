---
task_id: SMOKE-S108
sprint_id: Sprint-108
status: failed
assigned_to: bdd-smoke
depends_on: []
created_at: 2026-03-24T10:00:00+09:00
updated_at: 2026-03-24T10:15:00+09:00
locked_files: []
---

## タスク概要

Sprint-108（サイトリネーム Phase 2）デプロイ後の本番スモークテスト。
主な変更: 板ID `battleboard` → `livebot`、サイト名 BattleBoard → ボットちゃんねる、URLパス `/battleboard/` → `/livebot/`。

## 対象環境

- メイン（CF Workers）: https://battle-board.shika.workers.dev
- `playwright.prod.config.ts` の `baseURL` に従い CF Workers をターゲットとする

## 注意点

- URLパスが `/battleboard/` から `/livebot/` に変更されている
- 本番DBの board_id は未移行（まだ `battleboard`）のため、DB依存のテストは失敗する可能性あり
- CF Workers へのデプロイ反映が未確認（最新デプロイは Sprint-108 コミット以前の可能性あり）

## 完了条件

- [x] CFデプロイ確認（Sprint-108コミット以降かどうか）
- [x] Playwrightスモークテスト実行
- [x] 結果レポート記録

## 作業ログ

### デプロイ確認

- Sprint-108コミット: `b58585e` 2026-03-24T03:10:59+09:00（feat: サイトリネーム Phase 2）
- 最新CFデプロイ: 2026-03-22T19:20:40Z（= 2026-03-23T04:20:40+09:00）
- デプロイ台帳上の確認では Sprint-108 コミット以前だったが、**テスト実行結果から CF Workers に Sprint-108 変更が反映済みであることを確認**（サイトタイトルが「ボットちゃんねる」になっていた）

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | FAIL |
| PASS/TOTAL | 28/35（5スキップ、2失敗） |
| 所要時間 | 約72s（1.2m） |
| 失敗テスト | 下記参照 |

スキップ5件は `isProduction=true` 時に `test.skip` される設計のローカル限定テスト（認証UI連結フロー、撃破済みBOT表示×2、ポーリング×2）。

### 失敗テスト詳細

**[FAIL-1] `[prod-smoke] navigation.spec.ts:56:6 > トップページ / > HTTPステータス200で応答し、主要UI要素が表示される`**

```
Error: expect(locator).toHaveText(expected) failed
Locator:  locator('#site-title')
Expected: "BattleBoard"
Received: "ボットちゃんねる"
```

- 原因: テストコード（`e2e/smoke/navigation.spec.ts:72`）が `#site-title` のテキストとして `"BattleBoard"` をハードコードしているが、Sprint-108 でサイト名が `"ボットちゃんねる"` に変更された
- スクリーンショット: `ゴミ箱/test-results-prod/navigation-トップページ-HTTPステータス200で応答し、主要UI要素が表示される-prod-smoke/test-failed-1.png`

**[FAIL-2] `[prod-flows] basic-flow.spec.ts:200:6 > 基本フロー検証（環境共通） > 管理者がテストスレッドを削除し公開APIから消える`**

```
Error: 削除前: スレッドが公開APIに存在すること
Expected: true
Received: false
```

- 原因: `seedThreadProd`（`e2e/fixtures/data.fixture.ts:127`）が `boardId: "battleboard"` を固定でスレッド作成APIに渡しているが、本番DBの board_id が未移行のため `/api/threads` のスレッド一覧に存在しない、もしくは作成自体が失敗している可能性がある
- DB未移行（`battleboard` → `livebot`）の影響
