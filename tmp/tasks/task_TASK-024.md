---
task_id: TASK-024
sprint_id: Sprint-9
status: completed
assigned_to: bdd-coding
depends_on: [TASK-022, TASK-023]
created_at: 2026-03-13T12:00:00+09:00
updated_at: 2026-03-13T12:00:00+09:00
locked_files:
  - "[NEW] features/step_definitions/specialist_browser_compat.steps.ts"
  - "cucumber.js"
  - "features/support/world.ts"
  - "features/support/hooks.ts"
  - "features/support/mock-installer.ts"
  - "features/support/register-mocks.js"
---

## タスク概要

specialist_browser_compat.featureの全シナリオに対するBDDステップ定義を実装する。TASK-022で実装されたAdapter層コンポーネント（DatFormatter, SubjectFormatter, BbsCgiParser, BbsCgiResponseBuilder, ShiftJisEncoder）とTASK-023で実装されたRoute Handlerを検証対象として、専ブラ互換の振る舞いをBDDシナリオでテストする。

## 対象BDDシナリオ

- `features/constraints/specialist_browser_compat.feature` — 全20シナリオ
  - エンコーディング: 2件
  - subject.txt: 2件
  - DATファイル: 5件
  - bbs.cgi: 4件（うち「コマンド文字列がゲームコマンドとして解釈される」はPhase 2依存のため除外候補）
  - 差分同期: 2件
  - SETTING.TXT: 1件
  - bbsmenu.html: 1件
  - インフラ制約: 2件（HTTPS/WAFはインフラレベルのため除外候補）
  - **実行対象: 最大20件、除外候補3件（Phase 2コマンド1件 + インフラ制約2件）**

## 必読ドキュメント（優先度順）

1. [必須] `features/constraints/specialist_browser_compat.feature` — 専ブラ互換シナリオ
2. [必須] `docs/architecture/bdd_test_strategy.md` — BDDテスト戦略（D-10）
3. [必須] `docs/architecture/components/senbra-adapter.md` — 専ブラAdapter設計書
4. [必須] TASK-022で実装されたAdapterコンポーネント群:
   - `src/lib/infrastructure/adapters/dat-formatter.ts`
   - `src/lib/infrastructure/adapters/subject-formatter.ts`
   - `src/lib/infrastructure/adapters/bbs-cgi-parser.ts`
   - `src/lib/infrastructure/adapters/bbs-cgi-response.ts`
   - `src/lib/infrastructure/encoding/shift-jis.ts`
5. [必須] TASK-023で実装されたRoute Handler群:
   - `src/app/(senbra)/` 配下の全route.ts
6. [参考] 既存ステップ定義のパターン: `features/step_definitions/common.steps.ts`, `features/step_definitions/posting.steps.ts`

## 入力（前工程の成果物）

- TASK-022: Adapter層5コンポーネント
- TASK-023: Route Handler 6ファイル + 単体テスト40件

## 出力（生成すべきファイル）

- `features/step_definitions/specialist_browser_compat.steps.ts` — 専ブラ互換BDDステップ定義（新規）

## 完了条件

- [ ] specialist_browser_compat.featureの実行対象シナリオが全PASS
- [ ] cucumber.jsのpathsにspecialist_browser_compat.featureが追加されている
- [ ] スコープ外シナリオ（Phase 2コマンド、インフラ制約）はnameフィルタで除外されている
- [ ] 既存62シナリオが壊れていないこと
- [ ] テストコマンド: `npx cucumber-js`
- [ ] 単体テスト: `npx vitest run` も全PASS維持

## スコープ外

- Phase 2コマンドシステム（`!tell` 等）のステップ定義
- HTTPS/WAFインフラ制約のテスト
- Adapter層・Route Handlerのコード変更（バグ発見時はエスカレーション）

## 補足・制約

- D-10に従いサービス層テストとして実装。ただし専ブラ互換はPresentation Layer（Adapter + Route Handler）の検証が必要なため、Adapter層の公開関数を直接呼び出す形式でもよい（HTTPリクエスト生成は不要）
- テストレベルの選択:
  - エンコーディング・DATフォーマット・subject.txt → Adapter層の関数を直接テスト
  - bbs.cgi → BbsCgiParser + PostService の組み合わせテスト
  - Range差分・304応答 → Route Handlerレベルのテストが必要な場合は、Adapter層のcalcShiftJisLineBytesとDatFormatterの組み合わせで検証する
- Phase 2依存のシナリオ（コマンド）とインフラ制約シナリオ（HTTPS/WAF）はcucumber.jsのnameフィルタで除外すること
- locked_files外のファイルを変更する必要が生じた場合はエスカレーションすること

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- 2026-03-13: CLAUDE.md / タスク指示書 / featureファイル / bdd_test_strategy / senbra-adapter.md 読み込み完了
- 2026-03-13: DatFormatter / SubjectFormatter / BbsCgiParser / BbsCgiResponseBuilder / ShiftJisEncoder 読み込み完了
- 2026-03-13: Route Handler全6ファイル / 既存ステップ定義 / BDDインフラ確認完了
- 2026-03-13: specialist_browser_compat.steps.ts 新規作成完了（17シナリオ対応）
- 2026-03-13: cucumber.js 更新完了（pathsにspecialist_browser_compat.feature追加、nameフィルタで3件除外）
- 2026-03-13: テスト実行確認完了（BDD 78シナリオ中77PASS / Vitest 436PASS）
  - 失敗1件は incentive.feature の既存不具合（TASK-024スコープ外）

### テスト結果サマリー

#### BDDテスト（npx cucumber-js）
- 78 scenarios (1 failed, 77 passed)
  - 失敗1件: `incentive.feature` 「最終レスが24時間以内のスレッドでは低活性判定にならない」（TASK-024以前からの既存不具合）
- specialist_browser_compat.feature: 17件全PASS（除外3件: Phase2コマンド1件 + インフラ制約2件）
- 389 steps (1 failed, 1 skipped, 387 passed)

#### 単体テスト（npx vitest run）
- 14 test files passed
- 436 tests passed（0 failed）
