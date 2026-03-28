# タスク指示書: TASK-SMOKE-123

## メタ情報

| 項目 | 値 |
|---|---|
| タスクID | TASK-SMOKE-123 |
| タイプ | smoke-test |
| スプリント | Sprint-122/123 |
| 担当エージェント | bdd-smoke |
| ステータス | passed（TASK-SMOKE-123b 再実行で解消） |

## 目的

Sprint-122/123 デプロイ後の本番スモークテスト実施。

変更内容:
- Sprint-122: TOCTOU競合修正（DB RPC原子採番）
- Sprint-123: soft deleteフィルタ修正（削除済みスレッド/レスのURL直接アクセス遮断）

## 作業ログ

### デプロイ確認

| 項目 | 内容 |
|---|---|
| 確認日時 | 2026-03-26 |
| 確認コマンド | `wrangler deployments list --name battle-board` |
| 最新デプロイ日時 | 2026-03-26T00:45:51Z |
| 最新バージョンID | 4ae91682-18ae-41f6-92f1-417d64d7f5d0 |
| 確認結果 | 指示書記載の最終デプロイ日時(2026-03-26T00:45:51Z)と一致。デプロイ完了確認OK |

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | FAIL |
| PASS/TOTAL | 24/25（実行されたテスト中） |
| スキップ | 5（設計上のスキップ: ローカル限定テスト） |
| 未実行 | 4（前段テスト失敗による連鎖スキップ） |
| 所要時間 | 約1m 42s |
| 前回比（Sprint-121） | 29/34 PASS → 24/30 PASS |

### 失敗テスト

| # | テスト名 | 失敗理由 |
|---|---|---|
| 19 | `[prod-flows] › e2e/flows/basic-flow.spec.ts:136:7 › 基本フロー検証（環境共通） › コマンド書き込み時に inlineSystemInfo がレス末尾に表示される` | タイムアウト（60,000ms超過） |

**エラー詳細:**

```
Test timeout of 60000ms exceeded.
Error: locator.click: Test timeout of 60000ms exceeded.
  - waiting for locator('#post-submit-btn')
  - element is visible, enabled and stable
  - element is outside of the viewport
```

**状況:**
- `#post-submit-btn`（書き込むボタン）は DOM 上に存在し visible/enabled/stable であるが、ビューポート外に位置しているためクリック操作が60秒間リトライし続けてタイムアウトした
- スクリーンショット時点ではページはログイン未認証状態（ヘッダーに「ログイン」リンクが表示）
- フォームパネルは画面下部に固定表示されているが、「書き込む」ボタンが画面外（パネル下部）にはみ出している

**スクリーンショット:** `ゴミ箱/test-results-prod/basic-flow-基本フロー検証（環境共通）-コ-4f350-nlineSystemInfo-がレス末尾に表示される-prod-flows/test-failed-1.png`

**エラーコンテキスト:** `ゴミ箱/test-results-prod/basic-flow-基本フロー検証（環境共通）-コ-4f350-nlineSystemInfo-がレス末尾に表示される-prod-flows/error-context.md`

---

## 再実行結果（TASK-SMOKE-123b）

### デプロイ確認

| 項目 | 内容 |
|---|---|
| 確認日時 | 2026-03-26 |
| 確認コマンド | `wrangler deployments list --name battle-board` |
| 最新デプロイ日時 | 2026-03-26T01:15:58Z |
| 最新バージョンID | 30f3a47c-c60f-4a45-957e-c7a7258df9a7 |
| 確認結果 | 前回スモーク時デプロイ(2026-03-26T00:45:51Z)より新しい。TASK-325修正込みデプロイを確認OK |

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | PASS |
| PASS/TOTAL | 29/29（実行されたテスト中） |
| スキップ | 5（設計上のスキップ: ローカル限定テスト） |
| 所要時間 | 45.6s |
| 失敗テスト | なし |
