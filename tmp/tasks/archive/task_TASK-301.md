---
task_id: TASK-301
sprint_id: Sprint-112
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-24T12:00:00+09:00
updated_at: 2026-03-24T12:00:00+09:00
locked_files:
  - "[NEW] src/app/api/admin/users/[userId]/premium/route.ts"
  - "src/lib/services/admin-service.ts"
  - "features/step_definitions/admin.steps.ts"
  - "[NEW] src/__tests__/lib/services/admin-premium.test.ts"
---

## タスク概要

管理者がユーザーの有料/無料ステータスを切り替えるAPIエンドポイントと、対応するBDDステップ定義・単体テストを実装する。
課金トラブル対応用の管理機能。Repository層の `updatePremiumStatus` は既存なので、Service層・API層・テスト層の追加が中心。

## 対象BDDシナリオ

- `features/admin.feature` — 「管理者がユーザーを有料ステータスに変更する」「管理者がユーザーを無料ステータスに変更する」

## 必読ドキュメント（優先度順）

1. [必須] `features/admin.feature` — 対象シナリオ（末尾の2シナリオ）
2. [必須] `src/app/api/admin/users/[userId]/ban/route.ts` — 既存BAN APIの実装パターン（これに倣う）
3. [必須] `src/lib/services/admin-service.ts` — 管理サービス（ここにメソッド追加）
4. [必須] `src/lib/infrastructure/repositories/user-repository.ts` — `updatePremiumStatus` が既存（L297-312付近）
5. [参考] `features/step_definitions/admin.steps.ts` — 既存のBDDステップ（ここに追加）
6. [参考] `src/lib/services/mypage-service.ts` — ユーザー側の `upgradeToPremium`（参考実装）

## 出力（生成すべきファイル）

- `src/app/api/admin/users/[userId]/premium/route.ts` — PUT: 有料化, DELETE: 無料化（BAN APIと同パターン）
- `src/lib/services/admin-service.ts` への追加 — `setPremiumStatus(userId, isPremium)` メソッド
- `features/step_definitions/admin.steps.ts` への追加 — 新シナリオ2件のステップ定義
- `src/__tests__/lib/services/admin-premium.test.ts` — 単体テスト

## 完了条件

- [ ] `npx cucumber-js --tags @admin` で新シナリオ2件を含む全adminシナリオがPASS
- [ ] `npx vitest run src/__tests__/lib/services/admin-premium` がPASS
- [ ] `npx vitest run` 全体でリグレッションなし
- [ ] テストコマンド: `npx cucumber-js` && `npx vitest run`

## 実装ヒント

- API設計: PUT `/api/admin/users/[userId]/premium` で有料化、DELETE で無料化（BAN APIの POST/DELETE パターンに倣う）
- Service層: `admin-service.ts` に `setPremiumStatus` を追加。内部で `UserRepository.updatePremiumStatus` を呼ぶ
- 無料化時のテーマ・フォントリセット: `mypage-service.ts` の `upgradeToPremium` 内では**やっていない**。theme.feature の「有料設定中のユーザーが無料に戻るとデフォルトに戻る」は、テーマ取得時の `resolveTheme`/`resolveFont` で動的に解決される設計（DBのテーマ値は変えず、表示時に無料ユーザーなら無料テーマにフォールバック）。したがって、premium APIではis_premiumフラグの切り替えのみでOK
- BDDステップ: 既存の admin.steps.ts のパターン（Given管理者ログイン / Whenアクション / Thenアサーション）に倣う

## スコープ外

- UI（TASK-302で実装）
- `user-repository.ts` の変更（既存の `updatePremiumStatus` をそのまま使用）
- テーマ・フォントのリセットロジック（既存の resolveTheme/resolveFont で動的解決済み）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント

- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. features/admin.feature の新シナリオ2件（有料化/無料化）を確認
2. 既存BAN APIパターンを参照し実装方針を確定
3. BDDステップ定義を admin.steps.ts に追加（Given×2/When×2/Then×2 = 6ステップ）
4. admin-service.ts に setPremiumStatus メソッドを追加
5. src/app/api/admin/users/[userId]/premium/route.ts を新規作成（PUT/DELETE）
6. src/__tests__/lib/services/admin-premium.test.ts を新規作成（10件のテスト）

### テスト結果サマリー

- BDDテスト: 341 scenarios (16 pending, 325 passed) — 新シナリオ2件含めてPASS
- 単体テスト: 91 test files, 1769 tests — 全PASS（admin-premium.test.ts: 10件）
- リグレッション: なし
