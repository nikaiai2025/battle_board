# Sprint-11 計画書

> フェーズ: Phase 2 準備（前提課題）
> 開始日: 2026-03-14
> 目的: E2Eテスト基盤の構築 + 基本機能確認シナリオの実装

---

## スコープ

Phase 1完了に伴う「基本機能の確認」E2Eテストを1本作成する。
Playwright環境のセットアップから、スレッド作成→書き込み→閲覧の一連フローを自動検証するテストまでを実装する。

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-030 | Playwright環境セットアップ + 基本機能E2Eテスト実装 | bdd-coding | なし | assigned |

## 結果

### TASK-030: completed

**成果物:**
- `playwright.config.ts` — Playwright設定（webServer自動起動、Turnstileバイパス）
- `e2e/basic-flow.spec.ts` — 基本機能E2Eテスト（スレ立て→認証→閲覧→レス書き込み）
- `package.json` — `@playwright/test`, `dotenv` 追加、`test:e2e`/`test:e2e:ui` スクリプト追加
- `.gitignore` — Playwright出力ディレクトリ除外追加

**発見・修正したバグ（2件）:**
1. `src/app/api/threads/route.ts` + `src/app/api/threads/[threadId]/posts/route.ts` — 401レスポンスに`authCode`が含まれていなかった
2. `src/app/(web)/_components/ThreadCreateForm.tsx` — スレッド作成後に`router.refresh()`が呼ばれずUI一覧が更新されなかった

**テスト結果:**
- E2E (Playwright): 1/1 PASS
- Vitest: 468/468 PASS
- Cucumber.js: 87/87 PASS（全シナリオPASS確認済み）

**備考:** E2Eテストが既存UIバグ2件を検出・修正。E2E導入の価値を早速実証した。
