# Sprint-29 計画書

> 作成日: 2026-03-16

## 目的

E2Eテストの再構成。ナビゲーションスモークテスト（§10.5）を新規作成し、既存 basic-flow.spec.ts をスモークテスト体系にインテグレートする。

## 対象ページ（src/app/ 配下の全 page.tsx）

| ルート | ページ | 認証要否 | 動的ルート |
|---|---|---|---|
| `/` | トップ（スレッド一覧） | 不要 | — |
| `/threads/[threadId]` | スレッド詳細 | 不要 | threadId |
| `/mypage` | マイページ | 必要 | — |
| `/auth/verify` | 認証コード検証 | 不要 | — |

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-082 | bdd-coding | E2Eスモークテスト作成 + basic-flow.spec.ts統合 | なし | completed |

## 結果

### TASK-082: E2Eスモークテスト作成 + basic-flow.spec.ts統合

**ステータス: completed**

#### 新規作成ファイル
- `e2e/helpers/turnstile.ts` — mockTurnstile() 共有ヘルパー
- `e2e/helpers/database.ts` — cleanupDatabase() + seedThreadWithPost() 共有ヘルパー
- `e2e/helpers/auth.ts` — completeAuth() + waitForTurnstileAndEnableButton() 共有ヘルパー
- `e2e/smoke/navigation.spec.ts` — ナビゲーションスモークテスト（8テスト）

#### 変更ファイル
- `e2e/basic-flow.spec.ts` — 共有ヘルパーをimportするようリファクタリング（振る舞い変更なし）
- `playwright.config.ts` — smokeプロジェクト追加、e2eのtestIgnoreにsmoke追加

#### テスト結果
- `npx playwright test --project=smoke` → 8/8 PASS
- `npx playwright test --project=e2e` → 1/1 PASS（回帰なし）
- `npx tsc --noEmit` → エラーなし
