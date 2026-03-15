# Sprint-17 計画書: 認証フロー是正（G1〜G4対応）

> 作成: 2026-03-14
> ステータス: **completed**

## 背景

本番環境で認証バイパス（G1）が発見され、認証フロー全体にギャップが判明。
人間がBDDシナリオ（v4）と設計を承認済み（ESC-AUTH-REVIEW-1）。
本スプリントで実装を完了する。

## 変更元ドキュメント

- `tmp/auth_spec_review_report.md` — 設計レビュー報告書
- `features/phase1/authentication.feature` — v4（更新済み）
- `features/constraints/specialist_browser_compat.feature` — v3（更新済み）
- `tmp/escalations/escalation_ESC-AUTH-REVIEW-1.md` — 承認済み

## タスク一覧

依存関係を考慮し、4段階のWave構成。

### Wave 1: DB + ドメイン + リポジトリ層

| TASK_ID | 概要 | 担当 | locked_files |
|---|---|---|---|
| TASK-040 | DBマイグレーション + Userドメインモデル + UserRepository + AuthCodeRepository更新 | bdd-coding | `supabase/migrations/00005_auth_verification.sql` [NEW], `src/lib/domain/models/user.ts`, `src/lib/infrastructure/repositories/user-repository.ts`, `src/lib/infrastructure/repositories/auth-code-repository.ts` |

### Wave 2: サービス層

| TASK_ID | 概要 | 担当 | locked_files |
|---|---|---|---|
| TASK-041 | AuthService修正（is_verified チェック + write_token生成 + verifyWriteToken新規）+ PostService修正（not_verified処理） | bdd-coding | `src/lib/services/auth-service.ts`, `src/lib/services/post-service.ts` |

### Wave 3: ルートハンドラ層（並行可）

| TASK_ID | 概要 | 担当 | locked_files |
|---|---|---|---|
| TASK-042 | 認証ページ `/auth/verify` 新規 + auth-code route修正（write_token返却） | bdd-coding | `src/app/(web)/auth/verify/page.tsx` [NEW], `src/app/api/auth/auth-code/route.ts` |
| TASK-043 | bbs.cgi route修正（mail欄write_token検出・検証・除去）+ buildAuthRequired HTML更新 | bdd-coding | `src/app/(senbra)/test/bbs.cgi/route.ts`, `src/lib/infrastructure/adapters/bbs-cgi-response.ts` |

### Wave 4: BDDステップ定義 + 設計書更新

| TASK_ID | 概要 | 担当 | locked_files |
|---|---|---|---|
| TASK-044 | BDDステップ定義更新（authentication.steps.ts + specialist_browser_compat.steps.ts）+ 単体テスト追加 | bdd-coding | `features/step_definitions/authentication.steps.ts`, `features/step_definitions/specialist_browser_compat.steps.ts` [NEW], `src/__tests__/lib/services/auth-service.test.ts` |
| TASK-045 | 設計書更新（authentication.md, architecture.md §5） | bdd-coding | `docs/architecture/components/authentication.md`, `docs/architecture/architecture.md` |

## 依存関係

```
TASK-040 → TASK-041 → TASK-042 (並行) + TASK-043 (並行) → TASK-044 → TASK-045
```

## 完了基準

- [x] `npx vitest run` 全PASS — 18ファイル / 552テスト
- [x] `npx cucumber-js` 全PASS — 95シナリオ / 454ステップ
- [x] G1〜G4 の BDD シナリオが全てPASS

## 結果

### テスト結果
- vitest: 18ファイル / 552テスト 全PASS（Sprint-16: 476 → +76テスト）
- cucumber-js: 95シナリオ / 454ステップ 全PASS（Sprint-16: 88シナリオ → +7シナリオ）

### タスク完了状況
| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-040 | completed | DB+ドメイン+リポジトリ層 |
| TASK-041 | completed | サービス層（ESC-TASK-041-1 発生→TASK-044で解決） |
| TASK-042 | completed | /auth/verify ページ + auth-code route |
| TASK-043 | completed | bbs.cgi write_token対応 + buildAuthRequired更新 |
| TASK-044 | completed | BDDステップ定義 + インメモリモック同期 + ESC-TASK-041-1解決 |
| TASK-045 | completed | 設計書更新（authentication.md, architecture.md, TDR-007） |

### エスカレーション
- ESC-TASK-041-1: auth-code-repositoryにfindByWriteToken/clearWriteToken不足 → TASK-044で解決（リポジトリ経由にリファクタ）。アーカイブ済み
- ESC-AUTH-REVIEW-1: BDDシナリオ変更（人間承認済み）。アーカイブ済み

### 変更ファイル一覧
**新規作成:**
- `supabase/migrations/00005_auth_verification.sql`
- `src/app/(web)/auth/verify/page.tsx`
- `src/app/(web)/auth/verify/__tests__/verify-page-logic.test.ts`
- `src/app/api/auth/auth-code/__tests__/route.test.ts`
- `src/lib/infrastructure/adapters/__tests__/bbs-cgi-response.test.ts`
- `features/step_definitions/specialist_browser_compat.steps.ts`

**変更:**
- `src/lib/domain/models/user.ts`
- `src/lib/infrastructure/repositories/user-repository.ts`
- `src/lib/infrastructure/repositories/auth-code-repository.ts`
- `src/lib/services/auth-service.ts`
- `src/lib/services/post-service.ts`
- `src/app/(senbra)/test/bbs.cgi/route.ts`
- `src/lib/infrastructure/adapters/bbs-cgi-response.ts`
- `src/app/api/auth/auth-code/route.ts`
- `features/step_definitions/authentication.steps.ts`
- `features/support/in-memory/user-repository.ts`
- `features/support/in-memory/auth-code-repository.ts`
- `features/support/mock-installer.ts`
- `features/support/world.ts`
- `features/step_definitions/posting.steps.ts`
- `features/step_definitions/thread.steps.ts`
- `features/step_definitions/mypage.steps.ts`
- `features/step_definitions/incentive.steps.ts`
- `src/lib/services/__tests__/auth-service.test.ts`
- `src/lib/services/__tests__/post-service.test.ts`
- `src/app/(senbra)/__tests__/route-handlers.test.ts`
- `docs/architecture/components/authentication.md`
- `docs/architecture/architecture.md`
