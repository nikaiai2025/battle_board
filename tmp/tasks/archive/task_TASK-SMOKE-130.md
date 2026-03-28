---
task_id: TASK-SMOKE-130
sprint_id: Sprint-130
status: failed
assigned_to: bdd-smoke
created_at: 2026-03-27T15:30:00+09:00
updated_at: 2026-03-27T16:30:00+09:00
locked_files: []
---

## タスク概要

Sprint-130（!hiroyuki コマンド実装）のデプロイ後スモークテスト。

## 対象スプリント

- Sprint-130: `tmp/orchestrator/sprint_130_plan.md`
- コミット: 4dc843e（初回）/ 3606a38（DI修正、再実行）

## 変更概要

- !hiroyuki コマンド新規実装（AI BOT召喚）
- Adapter: generate() メソッド追加
- API: /api/internal/hiroyuki/pending + /complete
- GH Actions: hiroyuki-scheduler.yml
- BDDステップ汎化: aori/newspaper

## 確認ポイント

1. サイトの基本アクセス（トップページ、スレッド一覧、スレッド詳細）
2. 既存機能の回帰なし
3. 新規APIエンドポイントの応答（/api/internal/hiroyuki/pending — 401確認で十分）

## 完了条件

- [ ] 標準スモークテストスイート全PASS

## 作業ログ

### チェックポイント
- 状態: 完了（FAIL）
- 完了済み: スモークテスト再実行（commit 3606a38 デプロイ後）
- 次にすべきこと: オーケストレーターによる auto-debugger 起動判断
- 未解決の問題: !hiroyuki コマンドテスト失敗（引き続き同一症状）

### テスト結果サマリー（2回目 — commit 3606a38 後）

| 項目 | 内容 |
|---|---|
| 結果 | FAIL |
| PASS/TOTAL | 27/28（実行分。スキップ5、未実行2を除く） |
| 所要時間 | 約1分12秒 |
| 失敗テスト | 下記参照 |

#### 失敗テスト詳細

**テスト名:** `基本フロー検証（環境共通） › !hiroyuki コマンドが非ステルスで投稿されコマンド文字列が本文に残る`

**ファイル:** `e2e/flows/basic-flow.spec.ts:282:7`

**エラーメッセージ:**
```
Error: expect(locator).toContainText(expected) failed

Locator: locator('#post-7')
Expected substring: "-10"
Received string:    "7名無しさんID:4993e5632026/03/27(金) 16:26:15!hiroyuki"
Timeout: 15000ms
```

**失敗理由:** commit 3606a38 適用後も同一症状。`!hiroyuki` コマンド投稿後に inlineSystemInfo（通貨消費表示 `-10`）がレス本文に付与されない。コマンドは投稿されているが処理されていない状態が継続している。

**スクリーンショット:**
`ゴミ箱/test-results-prod/basic-flow-基本フロー検証（環境共通）-h-72d5c-マンドが非ステルスで投稿されコマンド文字列が本文に残る-prod-flows/test-failed-1.png`

---

### テスト結果サマリー（1回目 — commit 4dc843e 後）

| 項目 | 内容 |
|---|---|
| 結果 | FAIL |
| PASS/TOTAL | 27/28（実行分。スキップ5、未実行2を除く） |
| 所要時間 | 約1分6秒 |
| 失敗テスト | !hiroyuki テスト（同上と同一症状） |
