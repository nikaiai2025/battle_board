---
task_id: TASK-178
sprint_id: Sprint-65
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-19T23:55:00+09:00
updated_at: 2026-03-19T23:55:00+09:00
locked_files:
  - docs/architecture/components/web-ui.md
---

## タスク概要

Phase 5ドキュメントレビュー(TASK-175)で検出されたHIGH 1件 + MEDIUM 3件のweb-ui.md修正。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/reports/doc_review.md` — レビュー指摘の詳細と修正案
2. [必須] `docs/architecture/components/web-ui.md` — 修正対象
3. [参考] `src/app/(web)/_components/PostListLiveWrapper.tsx` — ポーリング実装の実態

## 修正内容

### HIGH-002: ポーリングURL記述修正

web-ui.md §3.2のポーリング方式の記述を実装に合わせて修正:

変更前:
> 定期的な `GET /api/threads/{threadId}/posts?since={lastPostNumber}` で新着レスを取得。

変更後:
> 定期的な `GET /api/threads/{threadId}` で全レスを取得し、`lastPostNumber` より大きいレスのみを新着として表示。

### MEDIUM-001: §3.1 ThreadCreateForm追加

§3.1のコンポーネントツリーに ThreadCreateForm を追加:
```
app/(web)/[boardId]/page.tsx  [Server Component]
  └── ThreadCreateForm [Client Component]  // スレッド作成フォーム
        └── AuthModal [Client Component]   // 認証コード入力（未認証時）
  └── ThreadList [Server Component]
        └── ThreadCard [Server Component]
```

### MEDIUM-002: リダイレクトステータスコード修正

§3.2の旧URL (`threads/[threadId]`) リダイレクトの記述を修正:
- 「302リダイレクト」→「307リダイレクト」

### MEDIUM-003: PostItem Client Component化理由の記述修正

PostItemのClient Component化理由を正確に修正:
- 変更前: 「PostFormContext と AnchorPopupContext を消費するため」
- 変更後: 「PostFormContext を消費し、AnchorLink (AnchorPopupContext消費) を描画するため」

## 完了条件
- [ ] ポーリングURLの記述が実装と一致すること
- [ ] §3.1にThreadCreateFormが記載されていること
- [ ] リダイレクトステータスコードが307であること
- [ ] PostItem依存記述が正確であること
- [ ] テストコマンド: `npx vitest run`（ドキュメント変更のみだがリグレッション確認）

## スコープ外
- コード修正（TASK-177で対応）
- D-07 (architecture.md) の変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: HIGH-002, MEDIUM-001, MEDIUM-002, MEDIUM-003 の4件すべて修正済み
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `docs/architecture/components/web-ui.md` を修正
  - MEDIUM-001: §3.1 コンポーネントツリーに ThreadCreateForm / AuthModal を追加
  - HIGH-002: §3.2 ポーリングURL記述を `/api/threads/{threadId}/posts?since=...` → `/api/threads/{threadId}` に修正
  - MEDIUM-003: §3.2 PostItem Client Component化理由を正確に修正
  - MEDIUM-002: §3.2 302リダイレクト → 307リダイレクト に修正

### テスト結果サマリー

- `npx vitest run` 実行結果: 64 test files PASS, 1375 tests PASS (0 failures)
- ドキュメント変更のみのため新規テストなし
