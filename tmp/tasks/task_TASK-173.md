---
task_id: TASK-173
sprint_id: Sprint-64
status: assigned
assigned_to: bdd-gate
depends_on: []
created_at: 2026-03-19T23:30:00+09:00
updated_at: 2026-03-19T23:30:00+09:00
locked_files: []
---

## タスク概要

Sprint-59〜63のUI構造改善（22ファイル変更）後のPhase 5検証。BDDシナリオ全件を実行し、failure 0を確認する。変更量が大きいためリグレッションを重点確認。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/orchestrator/sprint_64_plan.md` — 対象スプリント計画・変更ファイル一覧
2. [必須] `docs/architecture/bdd_test_strategy.md` — BDDテスト戦略書
3. [参考] `features/` — 全featureファイル

## 完了条件
- [x] `npx cucumber-js` 全体実行: failure 0
- [x] `npx vitest run` 全体実行: failure 0（schema-consistency既知問題はLocalDBリセットで解消し全件PASS）
- [x] pending シナリオの理由が全てD-10に照らして妥当であることを確認
- [x] APPROVE / FAIL の判定を記載

## 補足・制約
- Sprint-59〜63の変更量が大きい（新規コンポーネント6個、既存変更多数）ため、テスト結果を詳細に分析すること
- pending が増えている場合（旧7件→現16件）、増分9件の妥当性を確認
- 既存シナリオの破壊がないことを重点確認

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: Vitest全件実行, Cucumber.js全件実行, pendingシナリオ内訳確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- 2026-03-19T03:53: Vitest初回実行 → schema-consistency 1件FAIL（BotRow.next_post_atがLocalDBに未適用）
- 2026-03-19T03:55: Cucumber.js実行 → 252 scenarios (16 pending, 236 passed), failure 0 を確認
- 2026-03-19T03:57: `npx supabase db reset --local` でマイグレーション全件再適用
- 2026-03-19T03:58: Vitest再実行 → 64ファイル・1375テスト全件PASS

### pendingシナリオ16件の妥当性確認

D-10 §7.3.1マッピングルールに照らした分類:

| # | シナリオ | feature | 分類 | pending理由 | 代替テスト |
|---|---|---|---|---|---|
| 1 | 本文中のアンカーをクリックするとポップアップ表示 | thread.feature:88 | DOM/CSS表示・ブラウザ操作 | UI操作依存 | AnchorPopupContext.test.tsx |
| 2 | ポップアップ内アンカークリックでポップアップ重なる | thread.feature:96 | DOM/CSS表示・ブラウザ操作 | UI操作依存 | AnchorPopupContext.test.tsx |
| 3 | ポップアップ外側クリックで最前面ポップアップが閉じる | thread.feature:104 | DOM/CSS表示・ブラウザ操作 | UI操作依存 | AnchorPopupContext.test.tsx |
| 4 | 存在しないレスへのアンカーではポップアップ表示されない | thread.feature:111 | DOM/CSS表示・ブラウザ操作 | UI操作依存 | AnchorPopupContext.test.tsx |
| 5 | レス番号が数字のみで表示される | thread.feature:181 | DOM/CSS表示 | UI操作依存 | PostItem.test.tsx |
| 6 | レス番号クリックで返信テキストがフォームに挿入 | thread.feature:189 | ブラウザ固有動作 | UI操作依存 | PostItem.test.tsx, PostFormInsertText.test.tsx |
| 7 | 入力済みフォームにレス番号クリックで追記 | thread.feature:196 | ブラウザ固有動作 | UI操作依存 | PostFormInsertText.test.tsx |
| 8 | 最新ページ表示時のみポーリングで新着レスを検知 | thread.feature:238 | ブラウザ固有動作 | UI操作依存 | PostListLiveWrapper単体テスト |
| 9 | 過去ページ表示時はポーリングが無効 | thread.feature:245 | ブラウザ固有動作 | UI操作依存 | PostListLiveWrapper単体テスト |
| 10 | 専ブラ5chプロトコル通信がHTTP:80で直接応答 | specialist_browser_compat.feature:286 | インフラ制約 | CF Workers設定依存 | docs/research/chmate_debug_report |
| 11 | bbs.cgiへのHTTP:80 POSTが直接処理 | specialist_browser_compat.feature:293 | インフラ制約 | CF Workers設定依存 | — |
| 12 | 専ブラ特有User-AgentがWAFにブロックされない | specialist_browser_compat.feature:300 | インフラ制約 | CF WAF設定依存 | Sprint-20実機検証済み |
| 13 | 仮ユーザーがDiscordアカウントで本登録 | user_registration.feature:64 | ブラウザ固有動作 | Discord OAuth外部サービス依存 | — |
| 14 | 本登録ユーザーがDiscordアカウントでログイン | user_registration.feature:124 | ブラウザ固有動作 | Discord OAuth外部サービス依存 | — |
| 15 | 撃破済みボットレスはWebブラウザで目立たない表示 | bot_system.feature:262 | DOM/CSS表示 | Web限定シナリオ | — |
| 16 | 撃破済みボットレス表示をトグルで切り替え | bot_system.feature:268 | DOM/CSS表示・ブラウザ操作 | Web限定シナリオ | — |

**Sprint-59〜63の増分確認（旧7件→現16件、増分9件）:**
増分9件はいずれもthread.feature新規シナリオ（アンカーポップアップ4件、レス番号クリック操作3件、ポーリング2件）。
これらはSprint-59〜63で実装されたAnchorPopup/AnchorLink/PostListLiveWrapperコンポーネントに対応するUI操作シナリオであり、
D-10 §7.3.1に従いVitestコンポーネントテストで代替検証済み（AnchorPopupContext.test.tsx, AnchorLink.test.tsx,
AnchorPopup.test.tsx, PaginationNav.test.ts）。増分の妥当性: 問題なし。

### テスト結果サマリー

| テスト種別 | 結果 | PASS/TOTAL | 所要時間 |
|---|---|---|---|
| 単体テスト (Vitest) | PASS | 1375/1375 (64ファイル) | 10.31s |
| BDD (Cucumber.js) | PASS | 236 passed / 252 scenarios (16 pending, failure 0) | 1.27s |
| E2E (Playwright) | — | 実行対象外（本タスクスコープ外） | — |

### 判定

**APPROVE**

- Vitest: 64ファイル・1375テスト全件PASS（schema-consistency既知問題はLocalDBリセットで解消）
- Cucumber.js: failure 0, 236シナリオPASS
- pending 16件はD-10 §7.3.1の分類（DOM/CSS表示・ブラウザ固有動作・インフラ制約）に照らして全て妥当
- Sprint-59〜63の増分9件はUI操作シナリオであり代替テストが存在する
- 既存シナリオの破壊なし（リグレッションなし）
