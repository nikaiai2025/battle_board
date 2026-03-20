---
task_id: TASK-171
sprint_id: Sprint-63
status: completed
assigned_to: bdd-coding
depends_on: [TASK-163, TASK-164, TASK-165, TASK-166, TASK-167, TASK-168, TASK-169]
created_at: 2026-03-19T22:45:00+09:00
updated_at: 2026-03-19T22:45:00+09:00
locked_files:
  - docs/architecture/components/web-ui.md
---

## タスク概要

D-08 コンポーネント境界設計書 (web-ui.md) をSprint-59〜62の実装変更に合わせて更新する。URL構造変更、新コンポーネント追加、コンポーネント構成図の更新が必要。

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/components/web-ui.md` — 更新対象
2. [必須] `tmp/workers/bdd-architect_TASK-162/design.md` §6 — 変更後コンポーネント境界図
3. [参考] 実装済みコード:
   - `src/app/(web)/[boardId]/page.tsx` — 新スレッド一覧ページ
   - `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` — 新スレッドページ
   - `src/app/(web)/page.tsx` — リダイレクト化済み
   - `src/app/(web)/threads/[threadId]/page.tsx` — リダイレクト化済み

## 修正内容

### §3.1 スレッド一覧ページ

変更前:
```
app/(web)/page.tsx  [Server Component]
  └── ThreadList → ThreadCard
```

変更後:
```
app/(web)/[boardId]/page.tsx  [Server Component]
  └── ThreadList [Server Component]
        └── ThreadCard [Server Component]  // リンク先: /{boardId}/{threadKey}/

app/(web)/page.tsx  →  redirect('/battleboard/')
```

- パス変更: `page.tsx` → `[boardId]/page.tsx`
- 旧 `page.tsx` はリダイレクト専用に変更済みの旨を記載
- ThreadCard のリンク先が `/{boardId}/{threadKey}/` 形式に変更された旨を記載

### §3.2 スレッドページ

変更前:
```
app/(web)/threads/[threadId]/page.tsx  [Server Component]
  └── PostList [Server Component]
  └── PostListLiveWrapper [Client Component]
        └── PostItem [共用]
  └── PostForm [Client Component]
        └── AuthModal
```

変更後:
```
app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx  [Server Component]
  └── PaginationNav [Server Component]  // 100件レンジリンク（上部）
  └── PostFormContextProvider [Client Component]  // レス番号→PostForm連携
        └── PostForm [Client Component]
              └── AuthModal [Client Component]
        └── PostList [Client Component]
              └── PostItem [Client Component]  // レス番号クリック→insertText
                    └── AnchorLink [Client Component]  // >>Nクリック→ポップアップ
        └── PostListLiveWrapper [Client Component]
              └── PostItem
  └── PaginationNav [Server Component]  // （下部）
  └── AnchorPopupProvider [Client Component]  // ポップアップスタック管理
        └── AnchorPopup [Client Component]  // ポップアップカード表示

app/(web)/threads/[threadId]/page.tsx  →  redirect('/{boardId}/{threadKey}/')
```

更新ポイント:
- パス変更: `threads/[threadId]/page.tsx` → `[boardId]/[threadKey]/[[...range]]/page.tsx`
- Optional Catch-All `[[...range]]` によるページネーション対応を記載
- PostList/PostItem が Client Component に変更された旨を記載（Context消費のため）
- PaginationNav (Server Component) 追加
- PostFormContextProvider 追加（レス番号クリック → PostForm テキスト挿入）
- AnchorPopupProvider + AnchorPopup + AnchorLink 追加（アンカーポップアップ）
- PostListLiveWrapper の `pollingEnabled` props 追加（過去ページではポーリング無効）
- ポーリング方式の説明に pollingEnabled の判定ロジックを追記

### §2 SSR/CSR使い分け

- スレッド閲覧の説明に「ページネーション対応（Optional Catch-All セグメント）」を追記

## 完了条件
- [ ] §3.1 のパスとコンポーネント構成が実コードと一致する
- [ ] §3.2 のパスとコンポーネント構成が実コードと一致する
- [ ] 新コンポーネント（PaginationNav, PostFormContext, AnchorPopup系）が記載されている
- [ ] PostList/PostItem の Client Component 化が反映されている
- [ ] テストコマンド: `npx vitest run`（ドキュメント変更のみだがリグレッション確認）

## スコープ外
- D-07 (architecture.md) の変更（TDR追加等が必要な場合はエスカレーション）
- OpenAPI仕様書 (D-04) の変更（HUMAN-004で別途対応）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: web-ui.md の §2・§3.1・§3.2 更新完了、テスト実行完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- [開始] タスク指示書・設計書 (design.md §6)・実装済みコード4ファイルを読み込み完了
- [完了] docs/architecture/components/web-ui.md の更新作業
  - §2: スレッド閲覧にページネーション対応の説明を追記
  - §3.1: パス・リダイレクト・ThreadCard リンク先変更を反映
  - §3.2: 新パス・新コンポーネント群・Client Component化・ポーリング無効化を反映

### テスト結果サマリー

npx vitest run 実行結果:
- PASS: 63 ファイル / 1374 テスト
- FAIL: 1 テスト（`schema-consistency.test.ts` — `BotRow.next_post_at` がDBスキーマに未登録）
  - 本テスト失敗は今回のドキュメント変更とは無関係の既存問題（TASK-171のスコープ外）
  - ドキュメント変更によるリグレッションなし
