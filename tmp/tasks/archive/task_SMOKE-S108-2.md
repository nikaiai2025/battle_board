---
task_id: SMOKE-S108-2
sprint_id: Sprint-108
status: failed
assigned_to: bdd-smoke
depends_on: [SMOKE-S108]
created_at: 2026-03-24T12:00:00+09:00
updated_at: 2026-03-24T12:00:00+09:00
locked_files: []
---

## タスク概要

Sprint-108 本番DBクリア + 固定案内板再生成後の再スモークテスト。

背景:
- SMOKE-S108 で失敗した2件のうち1件はテストコードのサイトリネーム追従漏れ（E2Eテスト TASK-290 で修正済み）
- もう1件は本番DB未移行（board_id = "battleboard"）が原因。DBクリア + 固定案内板再生成後に再検証

## 対象環境

- CF Workers: https://battle-board.shika.workers.dev
- 最新デプロイ: 2026-03-23T18:47:57Z（Sprint-108 コミット `4d789a2` 2026-03-24T03:44:27+09:00 = 2026-03-23T18:44:27Z 以降を確認）

## 完了条件

- [x] CFデプロイ確認（Sprint-108コミット以降）
- [x] Playwrightスモークテスト実行
- [x] 結果レポート記録

## 作業ログ

### デプロイ確認

- 最新コミット: `4d789a2` (2026-03-24T03:44:27+09:00 = 2026-03-23T18:44:27Z)
- 最新CFデプロイ: 2026-03-23T18:47:57Z（コミット後のタイムスタンプ。Sprint-108 反映済みと判断）

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | FAIL |
| PASS/TOTAL | 29/35（5スキップ、1失敗） |
| 所要時間 | 49.8s |
| 失敗テスト | 下記参照 |

スキップ5件は `isProduction=true` 時に `test.skip` される設計のローカル限定テスト（認証UI連結フロー、撃破済みBOT表示×2、ポーリング×2）。

前回（SMOKE-S108）の失敗2件のうち、**1件（navigation.spec.ts のサイトタイトル確認）は解消**。

### 失敗テスト詳細

**[FAIL-1] `[prod-flows] basic-flow.spec.ts:150:6 > 基本フロー検証（環境共通） > 書き込んだスレッドが subject.txt と DAT に反映される`**

```
Error: expect(received).toContain(expected)
Expected substring: "1774295087.dat"
Received string: ""
```

エラー箇所: `e2e/flows/basic-flow.spec.ts:171`

```ts
expect(subjectText).toContain(`${threadKey}.dat`);
```

原因: テストコード（`basic-flow.spec.ts:162`）が専ブラAPIのパスとして `/battleboard/subject.txt` と `/battleboard/dat/` をハードコードしているが、サイトリネームにより実際のパスは `/livebot/subject.txt` と `/livebot/dat/` に変更された。リネーム追従漏れ。

スクリーンショット: `ゴミ箱/test-results-prod/basic-flow-基本フロー検証（環境共通）-書き込んだスレッドが-subject-txt-と-DAT-に反映される-prod-flows/test-failed-1.png`
