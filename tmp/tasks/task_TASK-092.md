---
task_id: TASK-092
sprint_id: Sprint-32
status: completed
assigned_to: bdd-coding
depends_on:
  - TASK-088
created_at: 2026-03-16T22:00:00+09:00
updated_at: 2026-03-16T22:00:00+09:00
locked_files:
  - "src/app/(senbra)/test/bbs.cgi/route.ts"
  - "[NEW] src/__tests__/app/(senbra)/test/bbs.cgi/pat-integration.test.ts"
---

## タスク概要

bbs.cgi ルートにPAT（パーソナルアクセストークン）のパースと認証統合を追加する。
専ブラのmail欄に `#pat_<32文字hex>` が含まれている場合、PATで認証しedge-tokenを自動発行する。

## 対象BDDシナリオ
- `features/未実装/user_registration.feature` — PAT関連シナリオ（参照のみ）
- `features/constraints/specialist_browser_compat.feature` — 既存専ブラ互換（影響確認）

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/components/user-registration.md` — D-08 § 6（認証判定フロー改訂版）、§ 8.3（専ブラでの使われ方）
2. [必須] `src/app/(senbra)/test/bbs.cgi/route.ts` — 現行bbs.cgiルート
3. [必須] `src/lib/services/registration-service.ts` — Sprint-31で実装済み（verifyPat, loginWithPat）
4. [参考] `src/lib/services/auth-service.ts` — verifyWriteToken（既存パターン参照）

## 出力（生成・変更すべきファイル）
- `src/app/(senbra)/test/bbs.cgi/route.ts` — 以下の変更:
  1. PAT_PATTERN 正規表現の追加: `/#pat_([0-9a-f]{32})/i`
  2. 認証判定フローの修正（D-08 § 6準拠）:
     - ① edge-token Cookie検証（既存）
     - ② mail欄にPATパターン検出 → verifyPat → 新edge-token発行 + Cookie設定
     - ③ mail欄にwrite_tokenパターン検出（既存）
     - ④ 未認証（既存）
  3. PATパターンのmail欄からの除去（DAT漏洩防止）
  4. edge-token認証成功時もmail欄のPATを除去する処理
- テストファイル

## 完了条件
- [ ] `npx vitest run` 全テストPASS
- [ ] PAT認証: `sage#pat_<32hex>` のmail欄でPAT認証成功 → edge-token Cookie発行 → 書き込み成功
- [ ] PAT除去: DAT出力にPAT文字列が含まれないこと
- [ ] Cookie有効時PAT: Cookie認証で通過しつつPATはmail欄から除去
- [ ] 無効PAT: エラーレスポンスが返ること
- [ ] 既存write_token認証に影響なし
- [ ] 既存edge-token認証に影響なし

## スコープ外
- RegistrationService/AuthService の変更（Sprint-31で実装済み）
- Web UI（マイページはTASK-091が担当）
- BDDステップ定義

## 補足・制約
- PAT判定はwrite_token判定より前に実行すること（`#pat_` は `_` を含むためwrite_token正規表現にマッチしないが、判定順序は明示的に保証）
- D-08 § 6の認証判定フロー図に厳密に従うこと
- mail欄パースでPATとwrite_tokenの両方が含まれる場合は先に検出された方を使用（PATが優先）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. 必読ドキュメント読み込み完了（D-08 §6、route.ts、registration-service.ts、auth-service.ts）
2. テストファイル作成: `src/__tests__/app/(senbra)/test/bbs.cgi/pat-integration.test.ts`（19件）
3. テスト RED 確認（PAT認証ロジックが未実装のため失敗）
4. route.ts に以下を実装:
   - `import { loginWithPat }` 追加
   - `PAT_PATTERN = /#pat_([0-9a-f]{32})/i` 定数追加
   - `extractPat()` / `removePat()` ヘルパー関数追加
   - POST ハンドラーの認証フローを D-08 §6 準拠の ①②③④ 順序に改訂
5. テスト GREEN 確認（19件全PASS）
6. 既存テスト `route-handlers.test.ts` に `registration-service` のモック追加（TASK-092 の import 追加による副作用対応）
7. 全テスト GREEN 確認（874件全PASS）

### 変更ファイル（locked_files）
- `src/app/(senbra)/test/bbs.cgi/route.ts`: PAT認証統合実装
- `src/__tests__/app/(senbra)/test/bbs.cgi/pat-integration.test.ts`: [NEW] PAT統合テスト（19件）

### 変更ファイル（locked_files外、副作用対応）
- `src/app/(senbra)/__tests__/route-handlers.test.ts`: registration-service モック追加（route.ts の import 追加による Supabase初期化エラー回避）

### テスト結果サマリー
- 単体テスト: 874件 / 874件 PASS（30ファイル）
  - 新規テスト（pat-integration.test.ts）: 19件 PASS
  - 既存テスト（route-handlers.test.ts等）: 影響なし、全PASS
- BDDシナリオテスト: 未実施（タスクスコープ外）
