# Sprint-64: Phase 5 検証サイクル（Sprint-59〜63 UI構造改善対象）

> 開始: 2026-03-19
> ステータス: completed

## 背景

Sprint-59〜63でUI構造改善の設計(T1)〜仕上げ(T8/T9)まで全9タスクが完了。
変更量が大きい（22ファイル、新規コンポーネント6個、既存変更多数）ため、リグレッションテストを重点的に実施する。

### 変更ファイル一覧（Sprint-59開始コミット 87f52ae からHEADまで）

**新規ファイル:**
- `src/app/(web)/[boardId]/page.tsx` — 板トップページ
- `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` — スレッドページ（ページネーション対応）
- `src/app/(web)/_components/AnchorLink.tsx` — アンカーリンク
- `src/app/(web)/_components/AnchorPopup.tsx` — ポップアップカード
- `src/app/(web)/_components/AnchorPopupContext.tsx` — ポップアップスタック管理
- `src/app/(web)/_components/PaginationNav.tsx` — ページナビゲーション
- `src/__tests__/app/(web)/_components/AnchorLink.test.tsx` — テスト
- `src/__tests__/app/(web)/_components/AnchorPopup.test.tsx` — テスト
- `src/__tests__/app/(web)/_components/AnchorPopupContext.test.tsx` — テスト
- `src/__tests__/app/(web)/_components/PaginationNav.test.ts` — テスト

**変更ファイル:**
- `src/app/(web)/_components/PostItem.tsx` — AnchorLink置換、Client Component化
- `src/app/(web)/_components/PostListLiveWrapper.tsx` — pollingEnabled props追加
- `src/app/(web)/_components/ThreadCard.tsx` — boardId/threadKey props追加
- `src/app/(web)/_components/ThreadList.tsx` — Thread interface拡張
- `src/app/(web)/dev/page.tsx` — threadKey/boardId追加
- `src/app/(web)/page.tsx` — redirect('/battleboard/')化
- `src/app/(web)/threads/[threadId]/page.tsx` — redirect化
- `src/app/(senbra)/test/read.cgi/[boardId]/[key]/route.ts` — リダイレクト先変更
- `docs/architecture/components/web-ui.md` — T8更新
- `features/step_definitions/thread.steps.ts` — T9ステップ追加(+910行)
- `features/step_definitions/specialist_browser_compat.steps.ts` — T9修正
- `features/support/in-memory/post-repository.ts` — InMemoryリポ拡張

**削除ファイル:**
- `src/app/(senbra)/[boardId]/route.ts` — ルート衝突解消のため削除

## タスク一覧

| TASK_ID | 内容 | 担当 | ステータス |
|---|---|---|---|
| TASK-173 | BDDゲート: cucumber-js全シナリオ実行 | bdd-gate | completed (APPROVE) |
| TASK-174 | コードレビュー: Sprint-59〜63変更22ファイル | bdd-code-reviewer | completed (WARNING) |
| TASK-175 | ドキュメントレビュー: web-ui.md + 仕様整合性 | bdd-doc-reviewer | completed (WARNING) |
| TASK-176 | テスト監査: pending管理・テストピラミッド・トレーサビリティ | bdd-test-auditor | completed (WARNING) |

> 4タスクは独立。**並行起動可能**

## 結果

### BDDゲート (TASK-173): APPROVE
- Vitest: 64ファイル / 1375テスト全PASS
- Cucumber.js: 252シナリオ (236 passed, 16 pending, 0 failed)
- pending増分9件: 全てD-10 §7.3.1に照らして妥当
- リグレッションなし

### コードレビュー (TASK-174): WARNING
- HIGH-001: AnchorPopupProvider/AnchorPopup がスレッドページ(page.tsx)に未配置 → ポップアップ機能未接続
- HIGH-002: PostListLiveWrapper が registerPosts を呼んでいない → 新着レスのポップアップ不可
- MEDIUM-001: PaginationNav の id重複（上下で同一id）
- MEDIUM-002: ThreadCard の id重複（リスト内）
- MEDIUM-003: Thread型定義が5ファイルに分散

### ドキュメントレビュー (TASK-175): WARNING
- HIGH-001: AnchorPopupProvider/AnchorPopup がpage.tsxに未実装（コードレビューと同一指摘）
- HIGH-002: ポーリングURL記述が実装と乖離（web-ui.md: `/api/threads/{threadId}/posts?since=` → 実装: `/api/threads/${threadId}`）
- MEDIUM-001: §3.1にThreadCreateForm欠落
- MEDIUM-002: リダイレクトステータスコード不一致（記載302 vs 実装307）
- MEDIUM-003: PostItemのAnchorPopupContext依存の記載が不正確

### テスト監査 (TASK-176): WARNING
- HIGH-01: 新ページ（板トップ/スレッド）のE2Eスモークテスト未作成
- HIGH-02: 既存E2Eスモークテストが旧URL参照のまま
- MEDIUM: mypage-display-rules.ts単体テスト未作成、撃破済みボット表示テスト未作成

### 総合判定
FAIL検出なし。HIGH 6件（重複除くと4件）の差し戻し修正が必要。
権限移譲ルール: BDDシナリオ変更不要・API契約変更不要・TDR変更不要 → 自律的に差し戻しスプリント起動。
