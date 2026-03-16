---
task_id: TASK-100
sprint_id: Sprint-34
status: completed
assigned_to: bdd-coding
depends_on: [TASK-099]
created_at: 2026-03-17T12:00:00+09:00
updated_at: 2026-03-17T12:00:00+09:00
locked_files:
  - "[NEW] features/step_definitions/reactions.steps.ts"
  - "features/support/world.ts"
---

## タスク概要

reactions.feature（草コマンド !w）の22シナリオに対するBDDステップ定義を実装する。TASK-099で実装されたGrassHandler・GrassRepository・grass-iconドメインルールをサービス層テストとして検証する。

## 対象BDDシナリオ
- `features/reactions.feature` — 全22シナリオ

## 必読ドキュメント（優先度順）
1. [必須] `features/reactions.feature` — 全22シナリオの振る舞い定義
2. [必須] `docs/architecture/bdd_test_strategy.md` — BDDテスト戦略（D-10）
3. [必須] `features/support/world.ts` — Cucumber World定義
4. [必須] `features/step_definitions/ai_accusation.steps.ts` — 既存ステップ定義の参照実装（コマンド系）
5. [必須] `features/step_definitions/command_system.steps.ts` — コマンド基盤ステップ定義
6. [必須] `features/step_definitions/bot_system.steps.ts` — ボット関連ステップ定義
7. [参考] `src/lib/services/handlers/grass-handler.ts` — 実装済みGrassHandler
8. [参考] `src/lib/infrastructure/repositories/grass-repository.ts` — GrassRepository
9. [参考] `src/lib/domain/rules/grass-icon.ts` — アイコン決定ルール
10. [参考] `tmp/workers/bdd-architect_TASK-098/grass_system_design.md` — 設計書

## 入力（前工程の成果物）
- TASK-099で実装されたソースコード一式

## 出力（生成すべきファイル）
- `features/step_definitions/reactions.steps.ts` — 全22シナリオ対応のステップ定義

## 完了条件
- [ ] `npx cucumber-js --tags @reactions` または reactions.feature の全22シナリオが PASS（pendingなし）
- [ ] 既存BDDテストに回帰なし: `npx cucumber-js` で 0 failed
- [ ] テストコマンド: `npx cucumber-js`

## スコープ外
- ソースコード（src/）の変更（TASK-099で完了済み）
- mypage関連のステップ定義（TASK-101で実施）
- featureファイルの変更

## 補足・制約
- D-10方針に従い、サービス層テスト（モック使用）として実装する
- 既存のWorld定義・hooks.tsのパターンを踏襲する
- ボットへの草シナリオは、ボット関連のWorld設定を bot_system.steps.ts から参照する
- 重複制限テストでは日付の制御が必要（Worldに日付設定メソッドがある場合はそれを使用）
- GrassHandlerへの依存注入はWorldのセットアップで行う

## 作業ログ

### チェックポイント
- 状態: in_progress
- 完了済み: 必読ドキュメント読み込み完了
- 次にすべきこと: reactions.steps.ts作成、world.ts最小修正
- 未解決の問題: なし（GrassHandlerはコンストラクタDIのため、register-mocks.js変更不要と判断）

### 進捗ログ
- [2026-03-17] タスク開始。必読ドキュメント・既存ステップ定義・GrassHandler・world.ts を確認済み
- [2026-03-17] 設計方針確定: GrassHandler/GrassRepository インメモリ実装はreactions.steps.ts内に直接定義し、CommandServiceにDI。register-mocks.js/mock-installer.ts変更不要。

### テスト結果サマリー

#### 最終結果 (2026-03-17)
- **BDD テスト**: 211 scenarios (9 pending, 202 passed) — **0 failed**
- 9 pending は既存の BOT マーク/Pending ステップ（TASK-079 スコープ外）のため問題なし
- reactions.feature 全22シナリオ PASS

#### 主要デバッグポイントと解決策
1. **重複チェック失敗**: GrassHandler が `new Date()` で日付計算するため `Date.now` スタブが効かない。
   Given ステップの `givenDate` を同じ `new Date()` ベースに統一して解決。
2. **「昨日の草記録」**: 固定日付ではなく実際の `new Date()` から1日引いた値を使うよう修正。
3. **「日付が変更された後」シナリオ**: Date.now スタブによる時刻変更を廃止。実際の UTC 日付の差を利用。
4. **通貨ボーナス抑止**: BeforeStep フックで `new_thread_join` IncentiveLog を事前挿入して PostService 経由の草コマンド実行時のボーナス付与を防止。
5. **post-repository findById パッチ**: `">>N"` 形式の引数を `allPostsByNumber` マップ経由で解決。

### チェックポイント
- 状態: completed
- 完了済み: 全22シナリオ PASS、既存テストへの回帰なし
