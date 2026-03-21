---
task_id: TASK-222
sprint_id: Sprint-79
status: done
assigned_to: bdd-code-reviewer
artifacts_dir: tmp/workers/bdd-code-reviewer_TASK-222
depends_on: []
created_at: 2026-03-21T23:40:00+09:00
updated_at: 2026-03-22T00:30:00+09:00
locked_files: []
---

## タスク概要
Sprint 75-79の変更に対するコード品質レビュー。コーディング規約・セキュリティ・保守性の観点でレビューを行う。

## 対象スプリント
- Sprint-75: TSC型エラー解消 + スレッド休眠実装 + 本番障害修正
- Sprint-76: 調査コマンド(!hissi, !kinou)実装 + Discord認証修正
- Sprint-77: 画像URLサムネイル表示(@image_preview) + kinou-handler TZ修正
- Sprint-78: pending 11件E2Eテスト実装 + 既存E2E修正
- Sprint-79: 撃破済みBOT表示機能（botMark enrichment + opacity + トグルUI）
- 計画書: `tmp/orchestrator/sprint_75_plan.md` 〜 `sprint_79_plan.md`

## 重点レビュー対象ファイル

### セキュリティ重点
- `src/lib/services/post-service.ts` — getPostListWithBotMark（活動中BOT情報漏洩防止）
- `src/lib/infrastructure/repositories/bot-post-repository.ts` — findByPostIds（RLS保護テーブルアクセス）
- `src/lib/services/handlers/attack-handler.ts` — post_id nullable化対応

### 新規機能
- `src/lib/domain/rules/url-detector.ts` — URL検出（ReDoS耐性）
- `src/app/(web)/_components/ImageThumbnail.tsx` — 外部画像表示（XSS/SSRF対策）
- `src/app/(web)/_components/EliminatedBotToggleContext.tsx` — トグル状態管理
- `src/app/(web)/_components/EliminatedBotToggle.tsx` — トグルUI
- `src/types/post-with-bot-mark.ts` — 合成型定義

### 変更ファイル（全量）
src/lib/services/post-service.ts, src/lib/services/command-service.ts, src/lib/services/bot-service.ts, src/lib/services/handlers/attack-handler.ts, src/lib/services/handlers/kinou-handler.ts, src/lib/services/handlers/hissi-handler.ts, src/lib/services/handlers/tell-handler.ts, src/lib/services/registration-service.ts, src/lib/infrastructure/repositories/post-repository.ts, src/lib/infrastructure/repositories/bot-post-repository.ts, src/lib/infrastructure/repositories/bot-repository.ts, src/lib/infrastructure/repositories/attack-repository.ts, src/lib/domain/rules/url-detector.ts, src/types/post-with-bot-mark.ts, src/app/(web)/_components/PostItem.tsx, src/app/(web)/_components/ImageThumbnail.tsx, src/app/(web)/_components/EliminatedBotToggle.tsx, src/app/(web)/_components/EliminatedBotToggleContext.tsx, src/app/(web)/_components/Header.tsx, src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx, src/app/(web)/register/discord/page.tsx, src/app/api/threads/[threadId]/route.ts

## 完了条件
- [x] 全変更ファイルのレビュー完了
- [x] 指摘事項をCRITICAL/HIGH/MEDIUM/LOWで分類して報告
- [x] レビューレポートを `tmp/workers/bdd-code-reviewer_TASK-222/review.md` に出力

## 作業ログ

### 2026-03-22 セッション1

1. CLAUDE.md、タスク指示書、ユビキタス言語辞書を読み込みコンテキスト把握
2. セキュリティ重点ファイル4件を精査:
   - PostService.getPostListWithBotMark: 活動中BOT漏洩防止 -- PASS
   - bot-post-repository.findByPostIds: RLSバイパスは意図的設計 -- PASS
   - ImageThumbnail: detectUrlsのhttps限定で現状安全、コンポーネント単体防御を推奨 -- MEDIUM
   - url-detector: ReDoS安全（否定文字クラスのみ） -- PASS
3. 新規機能ファイル精査（EliminatedBotToggle系、PostWithBotMark型、PostItem botMark対応）
4. 既存変更ファイル精査（command-service, bot-service, hissi/kinou/grass/tell/attack-handler, attack-repository等）
5. テストファイル確認（url-detector.test.ts, post-service.test.ts内のbotMarkテスト, attack-handler.test.ts, grass-handler.test.ts）
6. 指摘事項: CRITICAL 0 / HIGH 2 / MEDIUM 4 / LOW 4
7. レポート出力: `tmp/reports/code_review.md` および `tmp/workers/bdd-code-reviewer_TASK-222/review.md`

### チェックポイント
- 状態: 完了
- 判定: WARNING（HIGH 2件あり、マージはブロックせず次スプリントでの改善推奨）
