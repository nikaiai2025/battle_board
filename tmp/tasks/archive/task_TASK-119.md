---
task_id: TASK-119
sprint_id: Sprint-41
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-17T12:30:00+09:00
updated_at: 2026-03-17T12:30:00+09:00
locked_files:
  - features/step_definitions/bot_system.steps.ts
  - features/step_definitions/incentive.steps.ts
---

## タスク概要

Phase 5 コードレビュー（TASK-116 re-review）で検出されたLOW-003指摘を修正する。
Sprint-39で `new Date()` → `new Date(Date.now())` の全面統一が完了しているが、ステップ定義内のコメントが旧状態（未修正時の回避策説明）のまま残っている。コメントを現在の実態に合わせて更新する。

## 対象BDDシナリオ

- なし（コメント修正のみ。コードの振る舞い変更なし）

## 必読ドキュメント（優先度順）

1. [必須] `features/step_definitions/bot_system.steps.ts` L2004-2012 — 修正対象コメント
2. [必須] `features/step_definitions/incentive.steps.ts` L75-86 — 修正対象JSDocコメント
3. [参考] `tmp/workers/archive/bdd-code-reviewer_TASK-116/re_review_report.md` L101-109 — LOW-003指摘詳細

## 入力（前工程の成果物）

- なし

## 出力（生成すべきファイル）

- `features/step_definitions/bot_system.steps.ts` — L2004-2012のコメント修正
- `features/step_definitions/incentive.steps.ts` — L75-86のJSDocコメント修正

## 完了条件

- [ ] bot_system.steps.ts のコメントが実態と一致すること（「getTodayJst() はまだ未修正」→修正済みであることを反映）
- [ ] incentive.steps.ts のJSDocコメントが実態と一致すること（「post-service.ts が new Date() を使用」→ `new Date(Date.now())` 対応済みを反映）
- [ ] `npx vitest run` 全件PASS（回帰確認）
- [ ] `npx cucumber-js` 219 passed（回帰確認）
- [ ] テストコマンド: `npx vitest run && npx cucumber-js`

## スコープ外

- コメント以外のコード変更
- BDDシナリオ（.feature ファイル）の変更

## 補足・制約

### bot_system.steps.ts L2004-2012 の修正方針
現コメント: 「bot-service.ts の getTodayJst() はまだ未修正のため」「Date.now スタブは new Date() 単独には影響しない」
→ 実態: getTodayJst() は `new Date(Date.now())` に修正済み。Date.nowスタブが正しく反映される。
→ コメントを「getTodayJst() は new Date(Date.now()) に修正済みのため Date.now スタブが反映される」趣旨に更新し、回避策のロジック自体は正しいので残す。

### incentive.steps.ts L75-86 の修正方針
現コメント: 「post-service.ts が new Date() を使用しているため Date.now() スタブの恩恵を受けられない」「対応になり次第統一できる」
→ 実態: post-service.ts は `new Date(Date.now())` に対応済み（Sprint-39 TASK-114）。
→ JSDocを「post-service.ts が new Date(Date.now()) を使用しており、Date.now() スタブが反映される」趣旨に更新。「対応になり次第」の条件付き記述を削除。

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: コメント修正（bot_system.steps.ts L2004-2012、incentive.steps.ts L75-86）、テスト全件PASS確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `features/step_definitions/bot_system.steps.ts` L2004-2012: 「getTodayJst() はまだ未修正のため」「Date.now スタブは new Date() 単独には影響しない」→ 「getTodayJst() は new Date(Date.now()) に修正済み（Sprint-39）」「Date.now スタブが正しく反映される」に更新。「回避策:」の表現も「確認方法:」に修正。
2. `features/step_definitions/incentive.steps.ts` L75-86: JSDoc内「post-service.ts が new Date() を使用しているため Date.now() スタブの恩恵を受けられない」「対応になり次第統一できる」→ 「post-service.ts は new Date(Date.now()) で createdAt を設定しており（Sprint-39 TASK-114）、Date.now() スタブが反映される」に更新。条件付き記述を削除。
3. `npx vitest run` 実行 → 全件 PASS
4. `npx cucumber-js` 実行 → 219 passed 確認

### テスト結果サマリー

- Vitest: 39 test files, 1047 tests — 全件 PASS
- Cucumber.js: 228 scenarios (9 pending, 219 passed) — 完了条件の219 passed を満たす
