---
task_id: TASK-190
sprint_id: Sprint-69
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-19T00:00:00+09:00
updated_at: 2026-03-19T00:00:00+09:00
locked_files:
  - src/lib/domain/rules/__tests__/mypage-display-rules.test.ts
---

## タスク概要

Sprint-68 TASK-189で作成された `src/lib/domain/rules/__tests__/mypage-display-rules.test.ts` はtest-auditorの誤検出（HIGH-03: テスト欠落）に基づく重複テストファイル。同等のテストが `src/__tests__/app/(web)/mypage/mypage-registration.test.ts` に既存のため、重複ファイルを削除する。

## 必読ドキュメント（優先度順）
1. [必須] `src/lib/domain/rules/__tests__/mypage-display-rules.test.ts` — 削除対象（内容確認のみ）
2. [参考] `src/__tests__/app/(web)/mypage/mypage-registration.test.ts` — 既存テスト（残す側）

## 出力（生成すべきファイル）
- なし（削除のみ）

## 完了条件
- [x] `src/lib/domain/rules/__tests__/mypage-display-rules.test.ts` を削除
- [x] `npx vitest run` 全件PASS（テスト数が26件減少することを確認）
- [x] `npx cucumber-js` 全シナリオPASS

## スコープ外
- thread.steps.ts のコメント変更（維持する）
- 既存テストファイル `src/__tests__/app/(web)/mypage/mypage-registration.test.ts` の変更
- BDDシナリオの変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- 削除対象 `src/lib/domain/rules/__tests__/mypage-display-rules.test.ts` の内容を確認（260行・26テスト）
- 既存テスト `src/__tests__/app/(web)/mypage/mypage-registration.test.ts` と同等のテストを含む重複を確認
- ファイル削除実行
- vitest・cucumber-js の全テストPASSを確認

### テスト結果サマリー
#### 削除前
- vitest: 65ファイル / 1407テスト PASS
- cucumber-js: 254シナリオ（238 passed, 16 pending）

#### 削除後
- vitest: 64ファイル / 1381テスト PASS（1ファイル・26テスト減少）
- cucumber-js: 254シナリオ（238 passed, 16 pending）変化なし
