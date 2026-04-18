---
task_id: TASK-398
sprint_id: Sprint-156
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-04-19T06:10:00+09:00
updated_at: 2026-04-19T06:46:00+09:00
locked_files:
  - src/__tests__/lib/infrastructure/adapters/audio-compressor.test.ts
  - features/step_definitions/command_yomiage.steps.ts
  - features/step_definitions/thread.steps.ts
  - features/step_definitions/command_system.steps.ts
---

## タスク概要

以下の3点を一括修正し、vitest 全件 PASS・cucumber-js undefined 0件を達成する。

1. **vitest FAIL（1件）**: `audio-compressor.test.ts` の ffmpeg 引数が旧 WAV 用のまま
2. **cucumber-js undefined（4件）**: ステップ定義が未実装のシナリオ
3. **cucumber-js WAV残存確認**: `command_yomiage.steps.ts` に WAV 前提の記述がないか確認・修正

## 対象BDDシナリオ

- `features/thread.feature` @fab @wip（3シナリオ）
- `features/command_system.feature`（!help シナリオ 1件）
- `features/command_yomiage.feature`（全シナリオ PASS 維持確認）

## 必読ドキュメント（優先度順）

1. [必須] `src/lib/infrastructure/adapters/audio-compressor.ts` — 現行の ffmpeg 呼び出し実装（MP4/AAC）
2. [必須] `src/__tests__/lib/infrastructure/adapters/audio-compressor.test.ts` — 修正対象テスト
3. [必須] `features/thread.feature` L285〜314 — FAB @wip シナリオ（undefined 3件）
4. [必須] `features/command_system.feature` L233〜238 — !help シナリオ（undefined 1件）
5. [必須] `src/lib/services/handlers/help-handler.ts` — !help 実装（実装済み）
6. [参考] `features/step_definitions/thread.steps.ts` — FAB 既存ステップ定義
7. [参考] `features/step_definitions/command_system.steps.ts` — command_system 既存ステップ定義
8. [参考] `features/command_yomiage.feature` — MP4 更新済み（b2ae4d0）

## 入力（前工程の成果物）

- `src/lib/infrastructure/adapters/audio-compressor.ts` — MP4（AAC）変換の実装（b2ae4d0 で修正済み）

## 出力（生成すべきファイル）

- `src/__tests__/lib/infrastructure/adapters/audio-compressor.test.ts` — ffmpeg 引数アサーションを MP4/AAC 用に更新
- `features/step_definitions/thread.steps.ts` — FAB @wip 用ステップ定義を追加（下記「補足」参照）
- `features/step_definitions/command_system.steps.ts` — !help 用ステップ定義を追加（下記「補足」参照）
- `features/step_definitions/command_yomiage.steps.ts` — WAV→MP4 不一致があれば修正（なければ変更不要）

## 完了条件

- [ ] `npx vitest run` が全件 PASS（2349 tests 全て通過）
- [ ] `npx cucumber-js` で undefined が 0件
- [ ] cucumber-js の passed が 424 以上（現行 420 + undefined 解消 4件）
- [ ] pending は現行 18件を維持（新たな pending 追加は不可）

## スコープ外

- `audio-compressor.ts` 実装の変更
- feature ファイル自体の変更
- pending シナリオ（18件）の解消
- FAB 以外の UI 実装

## 補足・制約

### vitest エラー内容（確認済み）

```
期待（旧テスト）:  "-1", "-acodec", "pcm_s16le", StringMatching /pending-1\.output\.wav$/
実際（現実装）:    "-vn", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", "...output.mp4"
```

引数配列全体を `toEqual` で検証しているため、MP4/AAC 用引数に合わせて更新する。

### cucumber undefined の内訳

**① thread.feature FAB @wip × 3（UI 未実装）**

| シナリオ | 未実装ステップ |
|---|---|
| フローティングメニューからスレッド内検索を開く | `When フローティングメニューの検索ボタンをタップする` / `Then ボトムシートで検索フォームが表示される` |
| フローティングメニューから画像アップロードを開く | `When フローティングメニューの画像ボタンをタップする` / `Then ボトムシートで画像アップロードフォームが表示される` |
| フローティングメニューから設定を開く | `When フローティングメニューの設定ボタンをタップする` / `Then ボトムシートで設定パネルが表示される` |

UI が未実装のため **`return 'pending'`** でステップ定義を追加する（通常の pending 扱い。feature ファイルは変更しない）。

**② command_system.feature !help × 1（実装済み機能）**

- undefined ステップ: `「★システム」名義の独立レスで案内板と同一の内容が表示される`
- `help-handler.ts` は実装済み（`generateAnnouncementBody` でコマンド一覧テキストを生成して `eliminationNotice` として返す）
- 既存の `「★システム」名義の独立レスで {string} と表示される` ステップ（command_system.steps.ts）を参考に、本文の完全一致ではなくコマンド一覧が含まれることを検証するステップを実装する

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### escalation_resolution
ESC-TASK-398-1 解決（オーケストレーター判断）: 完了条件の記述ミス。FAB 3件を pending 化した結果が正しい実装であり、選択肢1を採用。
- pending: 18件 → 21件（FAB @wip 3件追加）
- passed: 420件 → 421件（!help 1件追加）
- undefined: 4件 → 0件 ✅
エスカレーション archive 済み。

### チェックポイント
- 状態: 完了
- 完了済み: required docs 確認、locked_files の修正、vitest 全件 PASS、cucumber-js undefined 0件化
- 次にすべきこと: オーケストレーター/人間が TASK-398 の完了条件（pending 件数・passed 件数）を再定義する
- 未解決の問題: FAB 3件を pending 化する指示と、pending 18件維持・passed 424以上の完了条件が両立しない

### 進捗ログ
<!-- ワーカーが作業中に逐次追記 -->
- 2026-04-19 06:34 JST: task 指示書・必読資料を確認。audio-compressor は実装が MP4/AAC に更新済みで、テストだけ旧 WAV 前提のまま残っていることを確認。
- 2026-04-19 06:34 JST: thread.feature の FAB @wip 3件は UI 未実装のため pending ステップ追加で解消する方針を確定。
- 2026-04-19 06:34 JST: command_system.feature の !help シナリオは help-handler 実装済みを確認。独立レス本文にコマンド一覧の主要要素が含まれることを検証するステップを追加予定。
- 2026-04-19 06:38 JST: `audio-compressor.test.ts` の ffmpeg 引数期待値を MP4/AAC 用に更新。
- 2026-04-19 06:38 JST: `thread.steps.ts` に FAB @wip 3件分の pending ステップを追加し、undefined を解消。
- 2026-04-19 06:38 JST: `command_system.steps.ts` に !help の独立レス検証ステップを追加。案内板本文の主要行と公開コマンド一覧を含むことを検証する形にした。
- 2026-04-19 06:39 JST: `command_yomiage.steps.ts` を確認。外向き仕様は MP4 に揃っており、内部の PCM→WAV→MP4 変換補助は実装詳細のため変更不要と判断。
- 2026-04-19 06:40 JST: 対象確認として `npx vitest run src/__tests__/lib/infrastructure/adapters/audio-compressor.test.ts` は PASS。
- 2026-04-19 06:40 JST: `npx cucumber-js features/thread.feature features/command_system.feature --format progress` は undefined 0 を確認。ただし cucumber 設定とのマージで全 feature が走り、pending は 21 件となった。
- 2026-04-19 06:45 JST: `npx vitest run` は全件 PASS（exit code 0）。
- 2026-04-19 06:46 JST: `npx cucumber-js` は undefined 0 件を確認したが、442 scenarios 中 21 pending / 421 passed のため exit code 1。TASK-398 の完了条件が task 指示と両立しないため `tmp/escalations/escalation_ESC-TASK-398-1.md` を起票。

### テスト結果サマリー
<!-- テスト実行後にワーカーが追記 -->
- `npx vitest run`: PASS（exit code 0）
- `npx cucumber-js`: 442 scenarios（21 pending, 421 passed）, 2427 steps（21 pending, 48 skipped, 2358 passed）, undefined 0件
- 備考: `@fab @wip` 3件を task 指示どおり pending 化した結果、pending は 21 件となる。task の完了条件「pending 18件維持 / passed 424以上」と矛盾するためエスカレーション済み。
