# Sprint-7 計画・結果

> Sprint ID: Sprint-7
> 期間: 2026-03-09
> ステータス: **completed**

---

## 目的

Phase 1 Step 7 — Web UIを実装する。
スレッド一覧ページ、スレッド閲覧ページ、書き込みフォーム、認証UI（AuthModal）、スレッド作成フォームを構築し、ブラウザで掲示板が動く状態にする。

## 対象BDDシナリオ

- `features/phase1/thread.feature` — スレッド一覧・作成・閲覧のUI
- `features/phase1/posting.feature` — 書き込みフォーム
- `features/phase1/authentication.feature` — 認証コード入力UI
- NOTE: BDDステップ定義の実装はスコープ外。UIコンポーネント実装＋ビルド通過に集中する。

## スコープ

| TASK_ID | 内容 | 担当 | ステータス | 依存 |
|---|---|---|---|---|
| TASK-013 | Web UI共通基盤 + スレッド一覧ページ + 共通コンポーネント | bdd-coding | **completed** | なし |
| TASK-014 | スレッド閲覧ページ + 書き込みフォーム | bdd-coding | **completed** | TASK-013 |

## locked_files 競合チェック

| TASK_ID | locked_files |
|---|---|
| TASK-013 | `src/app/layout.tsx`, `src/app/page.tsx`(削除), `[NEW] src/app/(web)/layout.tsx`, `[NEW] src/app/(web)/page.tsx`, `[NEW] src/app/(web)/_components/Header.tsx`, `[NEW] src/app/(web)/_components/ThreadList.tsx`, `[NEW] src/app/(web)/_components/ThreadCard.tsx`, `[NEW] src/app/(web)/_components/ThreadCreateForm.tsx`, `[NEW] src/app/(web)/_components/AuthModal.tsx` |
| TASK-014 | `[NEW] src/app/(web)/threads/[threadId]/page.tsx`, `[NEW] src/app/(web)/_components/PostList.tsx`, `[NEW] src/app/(web)/_components/PostItem.tsx`, `[NEW] src/app/(web)/_components/PostForm.tsx`, `[NEW] src/app/(web)/_components/PostListLiveWrapper.tsx` |

重複: なし（TASK-013完了後にTASK-014を開始）

## 完了基準

- [x] TASK-013: レイアウト・スレッド一覧・スレッド作成フォーム・AuthModal実装完了、vitest 330件PASS
- [x] TASK-014: スレッド閲覧・書き込みフォーム・ポーリング実装完了、vitest 330件PASS

## 結果

### TASK-013: Web UI共通基盤 + スレッド一覧 — **completed**

| 成果物 | 内容 |
|---|---|
| `src/app/layout.tsx` | metadata更新（title="BattleBoard", lang="ja"） |
| `src/app/page.tsx` | 削除（デフォルトテンプレート） |
| `src/app/(web)/layout.tsx` | Web UI共通レイアウト |
| `src/app/(web)/page.tsx` | スレッド一覧ページ（Server Component） |
| `src/app/(web)/_components/Header.tsx` | ヘッダーナビゲーション |
| `src/app/(web)/_components/ThreadList.tsx` | スレッド一覧 |
| `src/app/(web)/_components/ThreadCard.tsx` | スレッドカード |
| `src/app/(web)/_components/ThreadCreateForm.tsx` | スレッド作成フォーム（Client Component） |
| `src/app/(web)/_components/AuthModal.tsx` | 認証モーダル（Client Component） |

- エスカレーション: なし
- テスト: 330件PASS（8ファイル）

### TASK-014: スレッド閲覧 + 書き込みフォーム — **completed**

| 成果物 | 内容 |
|---|---|
| `src/app/(web)/threads/[threadId]/page.tsx` | スレッド閲覧ページ（Server Component, SSR） |
| `src/app/(web)/_components/PostList.tsx` | 初期レス一覧 |
| `src/app/(web)/_components/PostItem.tsx` | 1レス表示（アンカーリンク変換、削除済み表示対応） |
| `src/app/(web)/_components/PostForm.tsx` | 書き込みフォーム（Client Component, 401時AuthModal表示） |
| `src/app/(web)/_components/PostListLiveWrapper.tsx` | ポーリング新着取得（30秒間隔） |

- エスカレーション: なし
- テスト: 330件PASS（8ファイル）

## Sprint-7 判定

- エスカレーション: 0件
- BDDシナリオ変更: なし
- 人間確認要否: **不要**（自律的に次スプリントへ進行可能）
- 備考: `.next`キャッシュに旧`src/app/page.tsx`への参照が残存。`rm -rf .next` で解消可能（ビルド時に自動再生成される）
