---
task_id: TASK-025
sprint_id: Sprint-10
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-13T13:00:00+09:00
updated_at: 2026-03-13T13:00:00+09:00
locked_files:
  - "[NEW] src/lib/services/mypage-service.ts"
  - "[NEW] src/app/api/mypage/route.ts"
  - "[NEW] src/app/api/mypage/username/route.ts"
  - "[NEW] src/app/api/mypage/upgrade/route.ts"
  - "[NEW] src/app/api/mypage/history/route.ts"
  - "[NEW] src/app/(web)/mypage/page.tsx"
  - "src/lib/infrastructure/repositories/user-repository.ts"
  - "[NEW] src/lib/services/__tests__/mypage-service.test.ts"
---

## タスク概要

マイページ機能のサービス層・APIルート・UIを実装する。マイページでは通貨残高、アカウント情報（有料/無料ステータス）、ユーザーネーム設定（有料ユーザーのみ）、課金モック（無料→有料切替）、書き込み履歴、通知欄（Phase 2用の枠）を提供する。

## 対象BDDシナリオ

- `features/phase1/mypage.feature` — 全8シナリオ（BDDステップ定義は次タスクTASK-026で実装）
- `features/phase1/currency.feature` — 「マイページで通貨残高を確認する」1件（同上）

## 必読ドキュメント（優先度順）

1. [必須] `features/phase1/mypage.feature` — マイページシナリオ
2. [必須] `features/phase1/currency.feature` — 通貨残高確認シナリオ（「マイページで通貨残高を確認する」）
3. [参考] `docs/architecture/architecture.md` — アーキテクチャ全体
4. [参考] `src/lib/services/currency-service.ts` — 既存通貨サービス
5. [参考] `src/lib/infrastructure/repositories/user-repository.ts` — 既存ユーザーリポジトリ
6. [参考] `src/lib/infrastructure/repositories/post-repository.ts` — 書き込み履歴取得用

## 入力（前工程の成果物）

- `src/lib/services/currency-service.ts` — CurrencyService（残高取得）
- `src/lib/infrastructure/repositories/user-repository.ts` — UserRepository
- `src/lib/infrastructure/repositories/post-repository.ts` — PostRepository（書き込み履歴取得）

## 出力（生成すべきファイル）

- `src/lib/services/mypage-service.ts` — MypageService
- `src/lib/services/__tests__/mypage-service.test.ts` — vitest単体テスト
- `src/app/api/mypage/route.ts` — マイページ基本情報API
- `src/app/api/mypage/username/route.ts` — ユーザーネーム設定API
- `src/app/api/mypage/upgrade/route.ts` — 課金（モック）API
- `src/app/api/mypage/history/route.ts` — 書き込み履歴API
- `src/app/(web)/mypage/page.tsx` — マイページUI

## 完了条件

- [x] MypageService が以下の機能を提供している:
  - getMypage(userId): 基本情報（残高、ステータス、ユーザーネーム）
  - setUsername(userId, username): ユーザーネーム設定（有料ユーザーのみ）
  - upgradeToPremium(userId): 課金モック（無料→有料切替）
  - getPostHistory(userId): 書き込み履歴
- [x] UserRepository に updateIsPremium 関数が追加されている（isPremium/username フィールドは既存から対応済み）
- [x] 単体テスト全件PASS: `npx vitest run` — 468件 PASS
- [x] 既存BDDテスト: 今回の変更（user-repository.ts追加・新規ファイル）が既存BDDテストに影響しないことを確認済み（incentive.steps.tsの未コミット変更による失敗はTASK-025着手前から存在）

## スコープ外

- BDDステップ定義の実装（TASK-026で実施）
- cucumber.js の更新（TASK-026で実施）
- 通知欄の実装詳細（Phase 2。枠のみ配置）
- 実決済（MVPスコープ外）

## 補足・制約

- 課金はモック実装（ボタン押下でフラグ切替のみ。決済処理なし）
- ユーザーネーム設定は有料ユーザーのみ許可。無料ユーザーが試みた場合はエラー
- 通知欄はPhase 2用のプレースホルダーとして空の枠を配置するだけでよい
- locked_files外のファイルを変更する必要が生じた場合はエスカレーションすること

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし（TASK-026でBDDステップ定義を実装予定）
- 未解決の問題: なし

### 進捗ログ

1. タスク指示書・必読ドキュメント（mypage.feature, currency.feature）・既存コード確認
2. `src/lib/services/mypage-service.ts` 実装（getMypage, setUsername, upgradeToPremium, getPostHistory）
3. `src/lib/infrastructure/repositories/user-repository.ts` に `updateIsPremium` 関数追加
4. APIルート4本実装:
   - `src/app/api/mypage/route.ts` — GET（基本情報）
   - `src/app/api/mypage/username/route.ts` — PUT（ユーザーネーム設定）
   - `src/app/api/mypage/upgrade/route.ts` — POST（課金モック）
   - `src/app/api/mypage/history/route.ts` — GET（書き込み履歴）
5. `src/app/(web)/mypage/page.tsx` — マイページUI実装
6. `src/lib/services/__tests__/mypage-service.test.ts` — vitest単体テスト32件実装・全PASS

### テスト結果サマリー

#### vitest 単体テスト
- 新規: mypage-service.test.ts — 32件 / 32件 PASS
- 全体: 468件 / 468件 PASS（15ファイル）

#### BDD テスト（cucumber-js）
- 今回追加のマイページ機能のBDDステップ定義はTASK-026のスコープ外のため未実装
- 既存78シナリオのうち、`features/step_definitions/incentive.steps.ts` の未コミット変更（TASK-025着手前から存在）に起因する一部失敗が確認されたが、今回のマイページ実装は無関係
- user-repository.ts の変更（updateIsPremium追加）が既存BDDテストに影響しないことを確認
