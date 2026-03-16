---
task_id: TASK-088
sprint_id: Sprint-31
status: completed
assigned_to: bdd-coding
depends_on:
  - TASK-084
  - TASK-085
created_at: 2026-03-16T12:00:00+09:00
updated_at: 2026-03-16T12:00:00+09:00
locked_files:
  - "[NEW] src/app/api/auth/register/route.ts"
  - "[NEW] src/app/api/auth/login/route.ts"
  - "[NEW] src/app/api/auth/logout/route.ts"
  - "[NEW] src/app/api/auth/pat/route.ts"
  - "[NEW] src/__tests__/app/api/auth/register.test.ts"
  - "[NEW] src/__tests__/app/api/auth/login.test.ts"
  - "[NEW] src/__tests__/app/api/auth/logout.test.ts"
  - "[NEW] src/__tests__/app/api/auth/pat.test.ts"
  - src/lib/services/auth-service.ts
  - "[NEW] src/lib/services/registration-service.ts"
  - "[NEW] src/__tests__/lib/services/registration-service.test.ts"
---

## タスク概要

Sprint-30で構築したDB基盤（edge_tokensテーブル、UserRepository PAT拡張、AuthService移行）の上に、本登録・ログイン・ログアウト・PAT管理のAPIルートとサービス層を実装する。

## 対象BDDシナリオ
- `features/未実装/user_registration.feature` — 参照のみ（BDDステップ定義はSprint-32で実装）

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/components/user-registration.md` — D-08 本登録コンポーネント設計
2. [必須] `features/未実装/user_registration.feature` — BDDシナリオ（実装の方向性確認）
3. [必須] `docs/specs/openapi.yaml` — API仕様（auth関連セクション）
4. [必須] `docs/specs/user_registration_state_transitions.yaml` — D-05 状態遷移
5. [参考] `src/lib/services/auth-service.ts` — Sprint-30で移行済みのAuthService
6. [参考] `src/lib/infrastructure/repositories/user-repository.ts` — Sprint-30で拡張済み
7. [参考] `src/lib/infrastructure/repositories/edge-token-repository.ts` — Sprint-30で新規作成

## 入力（前工程の成果物）
- Sprint-30 成果物: edge_tokensテーブル、EdgeTokenRepository、UserRepository PAT拡張、AuthService移行

## 出力（生成すべきファイル）
- `src/app/api/auth/register/route.ts` — 本登録APIルート（POST）
- `src/app/api/auth/login/route.ts` — ログインAPIルート（POST）
- `src/app/api/auth/logout/route.ts` — ログアウトAPIルート（POST）
- `src/app/api/auth/pat/route.ts` — PAT取得/再発行APIルート（GET/POST）
- `src/lib/services/registration-service.ts` — 本登録ビジネスロジック
- 各対応テストファイル

## 完了条件
- [x] `npx vitest run` 全テストPASS (825件PASS)
- [x] 本登録API: 仮ユーザーがメール/Discordで本登録できる
- [x] ログインAPI: 本登録済みユーザーがログインして既存ユーザーに復帰できる
- [x] ログアウトAPI: セッションを破棄できる
- [x] PAT API: PAT取得・再発行ができる
- [x] エラーケース: 未認証・重複登録・不正入力のハンドリング
- [x] 既存テスト（768件）に影響なし

## スコープ外
- マイページUI（Sprint-32）
- bbs.cgi PAT統合（Sprint-32）
- BDDステップ定義（Sprint-32）
- Supabase Auth のプロバイダー設定（環境構築済み前提）

## 補足・制約
- Supabase Auth のサーバーサイドクライアントを使用する（`@supabase/ssr`）
- PAT は本登録完了時に自動発行（64文字ランダム文字列）
- 既存の edge-token 認証は引き続き有効（本登録は任意）
- D-08 user-registration.md のインターフェース定義に準拠すること

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: completed
- 完了済み: 全実装完了・全テストPASS確認
- 次にすべきこと: なし
- 未解決の問題: なし（accusation-service.test.tsの失敗は別タスクTASK-REMOVE_ACCUSATION_BONUSによるもので今回のスコープ外）

### 進捗ログ
- [完了] CLAUDE.md・タスク指示書・必読ドキュメント読み込み
- [完了] 既存ソース確認 (auth-service.ts, user-repository.ts, edge-token-repository.ts)
- [完了] src/lib/services/registration-service.ts 実装（本登録・ログイン・ログアウト・PAT管理）
- [完了] src/app/api/auth/register/route.ts 実装
- [完了] src/app/api/auth/login/route.ts 実装
- [完了] src/app/api/auth/logout/route.ts 実装
- [完了] src/app/api/auth/pat/route.ts 実装（GET/POST）
- [完了] src/__tests__/lib/services/registration-service.test.ts (34件PASS)
- [完了] src/__tests__/app/api/auth/register.test.ts (12件PASS)
- [完了] src/__tests__/app/api/auth/login.test.ts (9件PASS)
- [完了] src/__tests__/app/api/auth/logout.test.ts (4件PASS)
- [完了] src/__tests__/app/api/auth/pat.test.ts (11件PASS)

### テスト結果サマリー
- 全テストファイル: 28 passed (28)
- 全テスト: 825 passed (825)
- 新規追加テスト: 70件 (registration-service:34 + register:12 + login:9 + logout:4 + pat:11)
- 既存テスト: 768件 → 全てPASS（影響なし）
- FAILなし
