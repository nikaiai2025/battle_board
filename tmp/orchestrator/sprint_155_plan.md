---
sprint_id: Sprint-155
status: completed
created_at: 2026-04-18
completed_at: 2026-04-19
---

# Sprint-155 計画書 — !yomiage コマンド実装

## スプリントゴール

`features/command_yomiage.feature`（承認済み v3）の全9シナリオを通過させる。
同期フェーズ（PostService → CommandService → YomiageHandler）と
非同期フェーズ（GH Actions yomiage-worker → Litterbox → 完了通知 API）を完全実装する。

## 前提コミット

本スプリントの成果物コミット時に、TASK-389（preValidate フック）の未コミット変更を同梱する。
対象ファイル（TASK-389 分）:
- `src/lib/services/command-service.ts`
- `src/lib/services/handlers/hiroyuki-handler.ts`
- `src/__tests__/lib/services/handlers/hiroyuki-handler.test.ts`
- `src/lib/services/__tests__/command-service.test.ts`
- `docs/architecture/components/command.md`
- `docs/architecture/architecture.md`（TDR-018、§2.2 Litterbox、§12.2 yomiage 行）
- `docs/architecture/components/yomiage.md`（新規）
- `features/command_yomiage.feature`（新規）
- `CLAUDE.md`（Litterbox 追加）
- `tmp/` 各ファイル（タスク・エスカレーション・スプリント管理）

## 設計書参照

| ドキュメント | 役割 |
|---|---|
| `docs/architecture/components/yomiage.md` | 主設計書（§1〜§13、実装の正本） |
| `docs/architecture/components/command.md §5` | preValidate フック / 非同期副作用キューイングパターン |
| `features/command_yomiage.feature` | BDD シナリオ（受け入れ基準、9シナリオ） |
| `tmp/workers/bdd-architect_LITTERBOX_ADOPTION/litterbox_api_handoff.md` | Litterbox API 仕様・PoC 結果・注意事項 |

## タスク分解

| TASK_ID | 担当 | 内容 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-390 | bdd-coding | **基盤層**: `config/yomiage.ts`（定数） + `wav-encoder.ts`（PCM→WAV純粋関数） + `yomiage-voice-picker.ts`（voice選択純粋関数） + 単体テスト | — | 未起票 |
| TASK-391 | bdd-coding | **インフラアダプタ層**: `GeminiTtsAdapter`（IGeminiTtsAdapter 実装） + `LitterboxAdapter`（IAudioStorageAdapter 実装） + `AudioCompressor`（ffmpeg ラッパ） + 単体テスト | TASK-390 | 未起票 |
| TASK-392 | bdd-coding | **同期フェーズ**: `YomiageHandler`（preValidate + execute） + CommandService DI 登録 + `config/commands.yaml` yomiage エントリ追加 + 単体テスト | TASK-390 | 未起票 |
| TASK-393 | bdd-coding | **完了反映フェーズ**: `YomiageService.completeYomiageCommand` + Internal API 3ルート（pending / complete / target） + 単体テスト | TASK-392 | 未起票 |
| TASK-394 | bdd-coding | **非同期ワーカー + ワークフロー**: `scripts/yomiage-worker.ts` + `yomiage-scheduler.yml` + `ci-failure-notifier.yml` 更新 + 運用ランブック `docs/operations/runbooks/yomiage.md` | TASK-390, TASK-391, TASK-393 | 未起票 |
| TASK-395 | bdd-coding | **BDD ステップ定義**: `features/step_definitions/command_yomiage.steps.ts`（全9シナリオ） | TASK-392, TASK-393 | 未起票 |

## 並行実行計画

```
Round 1: TASK-390（基盤層 — 独立）
         ↓
Round 2: TASK-391（アダプタ）‖ TASK-392（同期フェーズ）  ← 並行
         ↓
Round 3: TASK-393（完了反映 — 392後に起動）
         ↓
Round 4: TASK-394（ワーカー）‖ TASK-395（BDD — 392+393後に並行起動）
```

## locked_files 管理

| TASK_ID | locked_files |
|---|---|
| TASK-390 | `config/yomiage.ts` [NEW], `src/lib/domain/rules/wav-encoder.ts` [NEW], `src/lib/domain/rules/yomiage-voice-picker.ts` [NEW], `src/__tests__/lib/domain/rules/wav-encoder.test.ts` [NEW], `src/__tests__/lib/domain/rules/yomiage-voice-picker.test.ts` [NEW] |
| TASK-391 | `src/lib/infrastructure/adapters/gemini-tts-adapter.ts` [NEW], `src/lib/infrastructure/adapters/audio-storage-adapter.ts` [NEW], `src/lib/infrastructure/adapters/audio-compressor.ts` [NEW], `src/__tests__/lib/infrastructure/adapters/gemini-tts-adapter.test.ts` [NEW], `src/__tests__/lib/infrastructure/adapters/audio-storage-adapter.test.ts` [NEW], `src/__tests__/lib/infrastructure/adapters/audio-compressor.test.ts` [NEW] |
| TASK-392 | `src/lib/services/handlers/yomiage-handler.ts` [NEW], `src/__tests__/lib/services/handlers/yomiage-handler.test.ts` [NEW], `src/lib/services/command-service.ts`, `config/commands.yaml` |
| TASK-393 | `src/lib/services/yomiage-service.ts` [NEW], `src/__tests__/lib/services/yomiage-service.test.ts` [NEW], `src/app/api/internal/yomiage/pending/route.ts` [NEW], `src/app/api/internal/yomiage/complete/route.ts` [NEW], `src/app/api/internal/yomiage/target/route.ts` [NEW], `src/app/api/internal/yomiage/pending/route.test.ts` [NEW], `src/app/api/internal/yomiage/complete/route.test.ts` [NEW] |
| TASK-394 | `scripts/yomiage-worker.ts` [NEW], `.github/workflows/yomiage-scheduler.yml` [NEW], `.github/workflows/ci-failure-notifier.yml`, `docs/operations/runbooks/yomiage.md` [NEW] |
| TASK-395 | `features/step_definitions/command_yomiage.steps.ts` [NEW] |

**ファイル競合なし**（TASK-392 が `command-service.ts` / `config/commands.yaml` を占有）

## 完了条件

- [ ] `npx cucumber-js features/command_yomiage.feature` 全9シナリオ PASS
- [ ] `npx vitest run` 全体 PASS（回帰なし）
- [ ] `npx cucumber-js` 全体 PASS（回帰なし）
- [ ] GH Actions `yomiage-scheduler.yml` の workflow_dispatch が正常起動すること

## スコープ外

- Playwright E2E テスト（yomiage.md §11 で「basic-flow.spec.ts に1本」とあるが GH Actions 実API 非依存 e2e は別スプリント判断）
- Litterbox 実API を使った本番動作確認（手動 PoC は実装者に委ねる）
- Cloudflare R2 への移行（TDR-018 条件未成立）

## 人間承認の保留ポイント

なし（feature 承認済み・TDR-018 承認済み・横断的制約更新済み）

## 結果（実行後に記入）

| TASK_ID | 状態 | 備考 |
|---|---|---|
| TASK-390 | ✅ 完了 | config/yomiage.ts + wav-encoder + voice-picker。vitest PASS |
| TASK-391 | ✅ 完了 | GeminiTtsAdapter + LitterboxAdapter + AudioCompressor。vitest PASS |
| TASK-392 | ✅ 完了 | YomiageHandler + CommandService DI + commands.yaml。BDD含む vitest PASS |
| TASK-393 | ✅ 完了 | YomiageService + Internal API 3ルート。vitest PASS |
| TASK-394 | ✅ 完了 | yomiage-worker.ts + yomiage-scheduler.yml + runbook。ESC-TASK-394-1 resolved |
| TASK-395 | ✅ 完了 | BDD ステップ定義（9シナリオ全PASS）。commands.ts 欠落ワークアラウンド含む |
| TASK-396 | ✅ 完了 | config/commands.ts に yomiage エントリ追加。tsc + vitest PASS |
| TASK-397 | ✅ 完了 | cucumber.js の paths/require に command_yomiage 登録漏れ修正 |

### Sprint-155 最終テスト状況（bdd-gate PASS）
- tsc --noEmit: PASS
- vitest: 2344 PASS（129ファイル）
- cucumber-js: 442シナリオ / 420 passed / 0 failed（yomiage 9シナリオ新規追加）
