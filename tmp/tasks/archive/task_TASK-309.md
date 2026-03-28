---
task_id: TASK-309
sprint_id: Sprint-113
status: completed
assigned_to: bdd-coding
depends_on: [TASK-307]
created_at: 2026-03-24T13:00:00+09:00
updated_at: 2026-03-24T13:00:00+09:00
locked_files:
  - src/lib/services/bot-service.ts
  - src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts
  - src/__tests__/lib/services/bot-service-scheduling.test.ts
  - src/__tests__/lib/services/bot-service.test.ts
  - src/__tests__/lib/services/bot-strategies/strategy-resolver.test.ts
  - src/__tests__/lib/services/bot-strategies/tutorial-strategies.test.ts
  - src/__tests__/lib/services/post-service.test.ts
---

## タスク概要

TASK-307で `Bot` interfaceに `grassCount: number` を追加した影響で、他のファイルでTypeScriptコンパイルエラーが発生している。Bot オブジェクトを生成する全箇所に `grassCount: 0` を追加して型エラーを解消する。

## 必読ドキュメント

1. [必須] `src/lib/domain/models/bot.ts` — 変更後のBot interface（grassCount追加済み）

## 修正対象

以下のファイルで `grassCount` が不足している箇所に `grassCount: 0` を追加する:

1. `src/lib/services/bot-service.ts` — L1028, L1121, L1417付近（Bot生成箇所3つ）
2. `src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts` — L759, L784付近
3. `src/__tests__/lib/services/bot-service-scheduling.test.ts` — L35付近
4. `src/__tests__/lib/services/bot-service.test.ts` — L33付近
5. `src/__tests__/lib/services/bot-strategies/strategy-resolver.test.ts` — L33付近
6. `src/__tests__/lib/services/bot-strategies/tutorial-strategies.test.ts` — L33, L59付近
7. `src/__tests__/lib/services/post-service.test.ts` — L152, L177付近

## 完了条件

- [ ] `npx tsc --noEmit` でエラーなし
- [ ] `npx vitest run` でリグレッションなし

## スコープ外

- Bot interface自体の変更（grassCountを optionalにするなどの変更は禁止）
- locked_files以外のファイル変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全7ファイルの grassCount: 0 追加、tsc --noEmit エラーなし、vitest PASS
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- bot-service.ts: L1028(チュートリアルBOT create)、L1121(煽りBOT create)、L1417(createBotForStrategyResolution)の3箇所に grassCount: 0 を追加
- bot-repository.test.ts: L759(正常系create)、L784(異常系create)の2箇所に grassCount: 0 を追加
- bot-service-scheduling.test.ts: L35付近(createLurkingBot)に grassCount: 0 を追加
- bot-service.test.ts: L33付近(createLurkingBot)に grassCount: 0 を追加
- strategy-resolver.test.ts: L33付近(createBot)に grassCount: 0 を追加
- tutorial-strategies.test.ts: L33付近(createTutorialBot)、L59付近(createDefaultBot)の2箇所に grassCount: 0 を追加
- post-service.test.ts: L152付近(createEliminatedBot)、L177付近(createActiveBot)の2箇所に grassCount: 0 を追加

### テスト結果サマリー
- npx tsc --noEmit: エラーなし
- npx vitest run (修正対象6ファイル): 147テスト PASS / 0 FAIL
- npx vitest run (全体): 1782テスト PASS / 4 FAIL（失敗は registration-service.test.ts の既存環境変数エラーのみ、今回の変更と無関係）
