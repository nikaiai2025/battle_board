---
task_id: TASK-101
sprint_id: Sprint-34
status: completed
assigned_to: bdd-coding
depends_on: [TASK-099]
created_at: 2026-03-17T12:00:00+09:00
updated_at: 2026-03-17T12:00:00+09:00
locked_files:
  - "src/lib/services/mypage-service.ts"
  - "src/app/(web)/mypage/"
  - "features/step_definitions/mypage.steps.ts"
---

## タスク概要

マイページに草カウント表示を追加する。TASK-099で追加されたUser.grassCountを使い、MypageServiceとUIに草カウント+アイコンの表示を実装する。mypage.featureの草カウント2シナリオ（現在undefined）をPASSさせる。

## 対象BDDシナリオ
- `features/mypage.feature` — 草カウント表示2シナリオ（「マイページで草カウントとアイコン確認」「草カウント0のデフォルト表示」）

## 必読ドキュメント（優先度順）
1. [必須] `features/mypage.feature` — 草カウント表示シナリオ（末尾2件）
2. [必須] `src/lib/services/mypage-service.ts` — 現在のMypageService
3. [必須] `src/app/(web)/mypage/page.tsx` — 現在のマイページUI
4. [必須] `features/step_definitions/mypage.steps.ts` — 既存ステップ定義
5. [参考] `src/lib/domain/rules/grass-icon.ts` — getGrassIcon関数（TASK-099で実装済み）
6. [参考] `tmp/workers/bdd-architect_TASK-098/grass_system_design.md` — 設計書§5 mypage連携

## 入力（前工程の成果物）
- TASK-099: User.grassCount, getGrassIcon() が実装済み

## 出力（生成すべきファイル）
- `src/lib/services/mypage-service.ts` — MypageInfoにgrassCount/grassIcon追加（修正）
- `src/app/(web)/mypage/page.tsx` または関連コンポーネント — 草カウント表示UI（修正）
- `features/step_definitions/mypage.steps.ts` — 草カウントステップ定義追加（修正）

## 完了条件
- [ ] mypage.featureの草カウント2シナリオがPASS（undefinedからPASSへ）
- [ ] マイページUIに草カウント「🌳 25本」形式で表示される
- [ ] 草カウント0の場合は「🌱 0本」がデフォルト表示
- [ ] 既存のmypageテスト・BDDに回帰なし
- [ ] テストコマンド: `npx vitest run` + `npx cucumber-js`

## スコープ外
- GrassHandler/GrassRepositoryの変更（TASK-099で完了済み）
- reactions.featureのステップ定義（TASK-100で実施）
- featureファイルの変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `features/support/in-memory/user-repository.ts`
   - create 関数の Omit に grassCount を追加し、デフォルト値 0 を設定
   - updateGrassCount ヘルパー関数を新規追加（BDDテスト用前提条件設定）

2. `src/lib/services/mypage-service.ts`
   - MypageInfo インターフェースに grassCount: number と grassIcon: string を追加
   - getMypage 関数で getGrassIcon(grassCount) を使って grassIcon を算出し返却
   - getGrassIcon のインポートを追加

3. `features/step_definitions/mypage.steps.ts`
   - Given: ユーザーの草カウントが {int} である — ユーザー作成+草カウント設定
   - Then: 草カウント "{string}" が表示される — 表示フォーマット検証

4. `src/app/(web)/mypage/page.tsx`
   - 草カウントセクション（id="grass-section"）を書き込み履歴セクションの直前に追加
   - "{grassIcon} {grassCount}本" フォーマットで表示

### テスト結果サマリー

- `npx cucumber-js`: 190 scenarios (9 pending, 181 passed) — 草カウント2シナリオ含む
  - PASS前: 2 undefined
  - PASS後: 0 undefined, 181 passed
- `npx vitest run`: 36 test files passed, 1005 tests passed
