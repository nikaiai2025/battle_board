# Sprint-65: Phase 5 差し戻し修正（Sprint-64 HIGH指摘対応）

> 開始: 2026-03-19
> ステータス: completed

## 背景

Sprint-64（Phase 5検証サイクル）でHIGH 4件（実質重複除き）+ MEDIUM 6件が検出。差し戻し修正を実施する。

対象指摘:
- Code HIGH-001 + Doc HIGH-001: AnchorPopupProvider/AnchorPopup がpage.tsxに未配置
- Code HIGH-002: PostListLiveWrapper が registerPosts を呼んでいない
- Doc HIGH-002: ポーリングURL記述が実装と乖離
- Test HIGH-01/02: E2Eスモークテストが新ページに未追従・旧URL参照
- Code MEDIUM-001: PaginationNav id重複
- Code MEDIUM-002: ThreadCard id重複
- Doc MEDIUM-001: ThreadCreateForm欠落
- Doc MEDIUM-002: リダイレクトステータスコード不一致
- Doc MEDIUM-003: PostItem依存記述不正確

延期（技術的負債）:
- Code MEDIUM-003: Thread型定義分散 → 後続スプリント
- Test MEDIUM-01: mypage-display-rules.ts テスト欠落 → 後続スプリント
- LOW全件 → 後続スプリント

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-177 | コード修正: AnchorPopup配置 + registerPosts + id重複 | bdd-coding | なし | completed |
| TASK-178 | ドキュメント修正: web-ui.md 5件修正 | bdd-coding | なし | completed |
| TASK-179 | E2Eスモークテスト更新: 新ページ追加 + 旧URL修正 | bdd-coding | なし | completed |

## locked_files

| TASK_ID | locked_files |
|---|---|
| TASK-177 | src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx, src/app/(web)/_components/PostListLiveWrapper.tsx, src/app/(web)/_components/PaginationNav.tsx, src/app/(web)/_components/ThreadCard.tsx |
| TASK-178 | docs/architecture/components/web-ui.md |
| TASK-179 | e2e/smoke/navigation.spec.ts |

> 重複なし。**並行起動可能**

## 結果

全タスク completed。

| TASK_ID | 結果 |
|---|---|
| TASK-177 | AnchorPopupProvider/AnchorPopup配置、registerPosts追加、PaginationNav/ThreadCard id→data-testid変更。vitest 1375 PASS, cucumber-js 252シナリオ 0 failure |
| TASK-178 | web-ui.md: ポーリングURL修正、ThreadCreateForm追加、302→307修正、PostItem依存記述修正。vitest 1375 PASS |
| TASK-179 | navigation.spec.ts: 板トップ2件+スレッドページ2件追加、旧URL→新URL更新。TypeScript型チェックPASS |

### 対応した指摘

| 指摘ID | 対応 |
|---|---|
| Code HIGH-001 + Doc HIGH-001 | TASK-177: AnchorPopupProvider/AnchorPopup配置 |
| Code HIGH-002 | TASK-177: registerPosts呼び出し追加 |
| Doc HIGH-002 | TASK-178: ポーリングURL記述修正 |
| Test HIGH-01 | TASK-179: 新ページスモークテスト4件追加 |
| Test HIGH-02 | TASK-179: 旧URL参照を新URLに更新 |
| Code MEDIUM-001/002 | TASK-177: id→data-testid変更 |
| Doc MEDIUM-001/002/003 | TASK-178: ThreadCreateForm追加、307修正、依存記述修正 |
