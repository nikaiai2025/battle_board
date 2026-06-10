---
task_id: TASK-403
sprint_id: Sprint-159
status: completed
assigned_to: bdd-coding
created_at: 2026-06-10T00:00:00Z
updated_at: 2026-06-10T00:00:00Z
locked_files:
  - src/app/(web)/copipe/page.tsx
  - src/app/(web)/copipe/_components/CopipeViewerClient.tsx
  - src/lib/infrastructure/repositories/copipe-repository.ts
---

## タスク概要

AAビューワー（/copipe）のUI改善。①AA選択時の下部シート（Sheet）ポップアップを削除し、②検索バーの上に「ユーザー投稿／運営登録」トグルと「新着／名前順」ソートを追加する。

## 対象BDDシナリオ

- `features/copipe_viewer.feature` — 既存シナリオに影響しないことを確認（変更不要）

## 必読ドキュメント（優先度順）

1. [必須] `src/app/(web)/copipe/_components/CopipeViewerClient.tsx` — 現在のクライアント実装
2. [必須] `src/app/(web)/copipe/page.tsx` — Server Component / CopipeEntryItem 型
3. [必須] `src/lib/infrastructure/repositories/copipe-repository.ts` — findAll() の現実装

## 変更仕様

### ① ポップアップ（Sheet）削除

- `handleSelect` から `setSheetOpen(true)` を削除する
- Sheet コンポーネント関連のインポート・JSXをすべて削除する
- モバイル（md未満）でのプレビュー表示: 右エリアをモバイルでも表示するよう変更する
  - 現在 `hidden md:flex` の右エリアを `flex` に変更する
  - レイアウトを縦並び（flex-col）にして、上にリスト・下にプレビューが来るようにする（モバイル）
  - デスクトップ（md以上）は現状通り横並び（flex-row）

### ② トグル・ソート追加

**リポジトリ変更（copipe-repository.ts）**

`findAll()` の戻り値に `source: "admin" | "user"` を追加した新しい関数 `findAllWithSource()` を追加する。

```typescript
export interface CopipeEntryWithSource extends CopipeEntry {
  source: "admin" | "user";
}

export async function findAllWithSource(): Promise<CopipeEntryWithSource[]>
```

- `copipe_entries` から取得したものは `source: "admin"`
- `user_copipe_entries` から取得したものは `source: "user"`
- 既存の `findAll()` は変更しない（後方互換性維持）

**page.tsx 変更**

- `CopipeEntryItem` 型に `source: "admin" | "user"` と `createdAt: string`（ISO8601文字列）を追加
- `findAll()` の代わりに `findAllWithSource()` を呼び出し、`createdAt` と `source` も渡す

```typescript
export interface CopipeEntryItem {
  id: number;
  name: string;
  content: string;
  source: "admin" | "user";
  createdAt: string;  // ISO8601
}
```

**CopipeViewerClient.tsx 変更**

検索バーの上（リストの一番上）に2つのトグルを追加する。

トグルUI:
```
[ユーザー投稿] [運営登録]    [新着] [名前順]
```
- 左側: ソースフィルター（初期値: "user"）
- 右側: ソート順（初期値: "newest"）

状態定義:
```typescript
type SourceFilter = "user" | "admin";
type SortOrder = "newest" | "name";
const [sourceFilter, setSourceFilter] = useState<SourceFilter>("user");
const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
```

フィルタリング・ソートロジック（クライアントサイドで処理）:
1. `sourceFilter` でエントリを絞り込む（`entry.source === sourceFilter`）
2. 名前の部分一致フィルタを適用（既存の `query` による絞り込み）
3. `sortOrder` でソートする:
   - `"newest"`: `createdAt` 降順（新しいものが上）
   - `"name"`: `name` 昇順（アルファベット・五十音順）

4パターンの組み合わせが正しく動作すること:
- ユーザー投稿 × 新着
- ユーザー投稿 × 名前順
- 運営登録 × 新着
- 運営登録 × 名前順

トグルのスタイル: shadcn/ui の Button コンポーネントを使い、選択中は `variant="default"`、非選択は `variant="outline"` とする。

## 完了条件

- [ ] AA選択時にSheetポップアップが開かない
- [ ] モバイルでも右エリアのプレビューが表示される（縦並びレイアウト）
- [ ] 検索バーの上にソースフィルタートグルとソートトグルが表示される
- [ ] 初期状態が「ユーザー投稿＋新着」である
- [ ] 4パターンすべての組み合わせでフィルタリング・ソートが正しく動作する
- [ ] `npx vitest run` PASS
- [ ] `npx cucumber-js` の既存シナリオ PASS（features/copipe_viewer.feature）

## スコープ外

- `features/copipe_viewer.feature` の変更（BDDシナリオはAPIレベルのテストのため変更不要）
- locked_files 以外のファイルの変更

## 補足・制約

- shadcn/ui の Button コンポーネントを使用すること
- デザイントークン（`text-foreground`, `bg-primary` 等）を使用すること
- Sheet コンポーネントの依存は完全に除去する（import も含め）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全3ファイルの実装 + テスト全PASS
- 未解決の問題: なし

### 進捗ログ

1. `copipe-repository.ts` — `CopipeEntryWithSource` インターフェースと `findAllWithSource()` 関数を追加（既存 `findAll()` は変更なし）
2. `page.tsx` — `CopipeEntryItem` 型に `source` と `createdAt` を追加、`findAllWithSource()` を呼び出すよう変更
3. `CopipeViewerClient.tsx` — Sheet コンポーネントを完全除去、モバイル縦並びレイアウト（`flex-col md:flex-row`）に変更、ソースフィルター + ソート順トグルを検索バー上に追加

### テスト結果サマリー

- `npx vitest run`: 133 ファイル / 2383 テスト — すべて PASS
- `npx cucumber-js`: 464 シナリオ（457 passed, 7 pending） — 既存 pending は今回の変更と無関係、新規失敗なし
- `features/copipe_viewer.feature` の3シナリオ: すべて PASS
