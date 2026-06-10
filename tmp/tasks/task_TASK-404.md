---
task_id: TASK-404
sprint_id: Sprint-160
status: completed
assigned_to: bdd-coding
created_at: 2026-06-10T00:00:00Z
updated_at: 2026-06-10T00:00:00Z
locked_files:
  - src/app/(web)/copipe/_components/CopipeViewerClient.tsx
  - "[NEW] src/components/ui/toggle-group.tsx"
  - "[NEW] src/components/ui/toggle.tsx"
---

## タスク概要

AAビューワーのフィルター/ソートUIを刷新。現在の「ソースフィルター（2択）＋ソート順（2択）」という2段構成を、3択択一の `ToggleGroup` 1つに統合する。

## 対象BDDシナリオ

- `features/copipe_viewer.feature` — 既存シナリオに影響しないことを確認（変更不要）

## 必読ドキュメント

1. [必須] `src/app/(web)/copipe/_components/CopipeViewerClient.tsx` — 現在の実装

## 変更仕様

### 状態の統合

現在の `sourceFilter` + `sortOrder` の2変数を1変数に統合する。

```typescript
type ViewMode = "user-newest" | "user-name" | "admin";
const [viewMode, setViewMode] = useState<ViewMode>("user-newest");
```

各 ViewMode の意味:
- `"user-newest"` — ユーザー投稿、createdAt 降順（新着）
- `"user-name"` — ユーザー投稿、name 昇順（名前順）
- `"admin"` — 運営登録、name 昇順（暗黙的に名前順）

### フィルタリング・ソートロジック

```typescript
const filtered = initialEntries
  .filter((e) => viewMode === "admin" ? e.source === "admin" : e.source === "user")
  .filter((e) => query.trim() === "" ? true : e.name.toLowerCase().includes(query.toLowerCase()))
  .sort((a, b) => {
    if (viewMode === "user-newest") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return a.name.localeCompare(b.name, "ja");
  });
```

### UIコンポーネント

shadcn/ui の `ToggleGroup` を追加・使用する。

**インストール:**
```
npx shadcn@latest add toggle-group
```

**ToggleGroup の配置:**
検索バーの上（現在の2段トグルを置き換える）。

```tsx
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

<ToggleGroup
  type="single"
  value={viewMode}
  onValueChange={(v) => { if (v) setViewMode(v as ViewMode); }}
  className="w-full"
>
  <ToggleGroupItem value="user-newest" className="flex-1 text-xs">
    ユーザー投稿（新着）
  </ToggleGroupItem>
  <ToggleGroupItem value="user-name" className="flex-1 text-xs">
    ユーザー投稿（名前順）
  </ToggleGroupItem>
  <ToggleGroupItem value="admin" className="flex-1 text-xs">
    運営登録
  </ToggleGroupItem>
</ToggleGroup>
```

- `type="single"` により1択のみ選択可能
- `onValueChange` のコールバックで `v` が空文字（選択解除）の場合は無視して現在の値を維持する
- `className="w-full"` で親要素いっぱいに広げ、各 `ToggleGroupItem` に `flex-1` を付けて均等分割する

## 完了条件

- [ ] `ToggleGroup` が `src/components/ui/` に追加されている
- [ ] フィルター/ソートUIが3択の `ToggleGroup` 1つになっている
- [ ] 初期状態が「ユーザー投稿（新着）」（`viewMode === "user-newest"`）
- [ ] 3パターンすべてで正しくフィルタリング・ソートが動作する
- [ ] 選択解除（クリック中の項目を再クリック）しても現在の選択が維持される
- [ ] `npx vitest run` PASS
- [ ] `npx cucumber-js` PASS（新規失敗なし）

## スコープ外

- `CopipeViewerClient.tsx` 以外のロジックの変更
- `features/copipe_viewer.feature` の変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全項目
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `npx shadcn@latest add toggle-group` を実行し `toggle.tsx` / `toggle-group.tsx` を `src/components/ui/` に追加
2. 生成された `toggle-group.tsx` が `@base-ui/react` ベースであることを確認し、APIを調査（`value` は `string[]`、`onValueChange` は `(values: Value[]) => void`）
3. `CopipeViewerClient.tsx` を仕様通りに書き換え:
   - `sourceFilter` + `sortOrder` の2変数を `ViewMode` 1変数に統合
   - フィルタリング・ソートロジックを `ViewMode` ベースに変更
   - 旧来の2段Button群を3択 `ToggleGroup` 1つに置き換え
   - 選択解除（空配列）は無視して現在値を維持するハンドラを実装

### テスト結果サマリー

- **vitest**: 133ファイル / 2383テスト — 全PASS
- **cucumber-js**: 464シナリオ（457 passed / 7 pending） — 新規失敗なし（7 pending は既存）
