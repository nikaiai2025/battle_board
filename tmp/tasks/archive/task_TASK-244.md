---
task_id: TASK-244
sprint_id: Sprint-85
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-21T19:50:00+09:00
updated_at: 2026-03-21T19:50:00+09:00
locked_files:
  - src/app/(web)/mypage/page.tsx
---

## タスク概要

マイページの書き込み履歴セクションにページネーションと検索機能のUIを追加する。
バックエンドAPI（page/keyword/start_date/end_dateパラメータ）はSprint-84 TASK-241で実装済み。
本タスクではフロントエンドのみを修正する。

## 対象BDDシナリオ
- `features/mypage.feature` @pagination @search（UI表示の振る舞い）

## 必読ドキュメント（優先度順）
1. [必須] `features/mypage.feature` — ページネーション・検索のBDDシナリオ
2. [必須] `src/app/(web)/mypage/page.tsx` — 既存マイページコンポーネント
3. [必須] `tmp/workers/bdd-architect_TASK-237/design.md` — ページネーション・検索のAPI設計
4. [参考] `src/app/api/mypage/history/route.ts` — API仕様（page/keyword/start_date/end_date）
5. [参考] `docs/specs/openapi.yaml` — /api/mypage/history の定義

## 実装内容

### 1. PostHistoryItem 型の拡張

既存の `PostHistoryItem` に `threadTitle` を追加:

```typescript
interface PostHistoryItem {
  id: string;
  threadId: string;
  threadTitle: string;  // NEW: スレッドタイトル
  postNumber: number;
  body: string;
  createdAt: string;
}
```

### 2. API レスポンス型の更新

```typescript
interface PostHistoryResponse {
  posts: PostHistoryItem[];
  total: number;
  totalPages: number;
  page: number;
}
```

### 3. 書き込み履歴セクションの拡張

以下のUI要素を追加:
- 各履歴項目にスレッドタイトルを表示
- ページネーションコントロール（ページ番号ボタン、前/次ボタン）
  - `totalPages === 1` の場合は非表示
- 検索フォーム:
  - キーワード入力欄
  - 開始日・終了日の日付入力欄
  - 検索ボタン
  - クリアボタン（検索条件リセット）
- 検索結果が0件の場合: 「該当する書き込みはありません」を表示
- 書き込みが0件の場合: 「まだ書き込みがありません」を表示（既存）

### 4. fetch ロジックの更新

既存の `fetchHistory` 関数を更新し、page/keyword/start_date/end_date パラメータを送信する。

### 5. スタイリング

既存のマイページのスタイリングに合わせ、Tailwind CSSで統一感のあるデザインにする。
具体的なスタイルは既存コンポーネントを参考に合わせる。

## 完了条件
- [ ] ページネーションUIが実装され、50件以下のときは非表示
- [ ] キーワード・日付範囲の検索UIが実装されている
- [ ] スレッドタイトルが各履歴項目に表示されている
- [ ] 検索結果0件のとき「該当する書き込みはありません」が表示される
- [ ] TypeScriptコンパイルが通る（`npx tsc --noEmit`）
- [ ] 既存テスト全PASS（`npx vitest run`）

## スコープ外
- バックエンドAPI修正（TASK-241で完了済み）
- BDD step definitions（TASK-245で実施）
- E2Eテスト追加

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全実装タスク完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `features/mypage.feature`、`page.tsx`、`tmp/workers/bdd-architect_TASK-237/design.md` を精読してBDDシナリオと設計方針を把握
2. `src/app/(web)/mypage/_components/PostHistorySection.tsx` を新規作成
   - 検索フォーム（キーワード・開始日・終了日）
   - 検索・クリアボタン
   - ページネーションコントロール（前へ・ページ番号・次へ・全Nページ表示）
   - totalPages <= 1 の場合はページネーション非表示
   - 検索条件あり + 0件: `no-search-results-message`「該当する書き込みはありません」
   - 検索条件なし + 0件: `no-posts-message`「まだ書き込みがありません」
   - 各履歴項目にスレッドタイトル（`threadTitle`）を表示し、スレッドへのリンクにした
3. `src/app/(web)/mypage/page.tsx` を更新
   - `PostHistorySection` の import を追加
   - `PostHistoryItem` 型定義を削除（PostHistorySection.tsx 内に移管）
   - `fetchPostHistory` 関数を削除（PostHistorySection 内に移管）
   - `posts` state を削除
   - `useEffect` の依存から `fetchPostHistory` を削除
   - 書き込み履歴セクションの JSX を `<PostHistorySection />` に置き換え

### テスト結果サマリー

- TypeScript コンパイル: マイページ関連エラー 0件（既存の bot-service テスト関連エラーは本タスクスコープ外）
- 単体テスト (npx vitest run): 78ファイル / 1628テスト すべて PASS
