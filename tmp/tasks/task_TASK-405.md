---
task_id: TASK-405
sprint_id: Sprint-161
status: completed
assigned_to: bdd-coding
created_at: 2026-06-10T00:00:00Z
updated_at: 2026-06-10T00:00:00Z
locked_files:
  - src/app/(web)/copipe/_components/CopipeViewerClient.tsx
---

## タスク概要

AAビューワーの ToggleGroup が横幅不足でラベルが重なって表示される不具合を修正する。
各 ToggleGroupItem のラベルを2行構成にして収まるようにする。

## 必読ドキュメント

1. [必須] `src/app/(web)/copipe/_components/CopipeViewerClient.tsx` — ToggleGroup 実装箇所

## 変更仕様

### ToggleGroupItem のラベルを2行に分割

現在の1行テキストを、`<span>` を2つ重ねた縦並び構成に変更する。

```tsx
<ToggleGroupItem
  value="user-newest"
  className="flex-1 flex-col h-auto py-1.5 text-xs leading-tight"
>
  <span>ユーザー投稿</span>
  <span className="text-muted-foreground">（新着）</span>
</ToggleGroupItem>

<ToggleGroupItem
  value="user-name"
  className="flex-1 flex-col h-auto py-1.5 text-xs leading-tight"
>
  <span>ユーザー投稿</span>
  <span className="text-muted-foreground">（名前順）</span>
</ToggleGroupItem>

<ToggleGroupItem
  value="admin"
  className="flex-1 h-auto py-1.5 text-xs leading-tight"
>
  運営登録
</ToggleGroupItem>
```

- `flex-col` で子要素を縦並びにする
- `h-auto` で高さを内容に合わせる
- `py-1.5` で上下パディングを確保する
- `leading-tight` で行間を詰める
- サブラベル `（新着）`・`（名前順）` は `text-muted-foreground` でやや薄くする

## 完了条件

- [ ] 3つのToggleGroupItemのテキストが重ならず読める
- [ ] 選択中の項目が視覚的にハイライトされている
- [ ] `npx vitest run` PASS（変更はUIのみなのでテストに影響なし）

## スコープ外

- ロジック・状態管理の変更
- `locked_files` 以外のファイルの変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: ToggleGroupItem 3つのラベルを2行構成に変更
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `CopipeViewerClient.tsx` の ToggleGroupItem を以下のように変更:
  - `user-newest`: `flex-col h-auto py-1.5 leading-tight` + `<span>ユーザー投稿</span><span>（新着）</span>`
  - `user-name`: `flex-col h-auto py-1.5 leading-tight` + `<span>ユーザー投稿</span><span>（名前順）</span>`
  - `admin`: `h-auto py-1.5 leading-tight` + テキスト「運営登録」（1行のまま）

### テスト結果サマリー

- 単体テスト: 133 ファイル PASS / 2383 テスト PASS（FAIL: 0）
- BDDテスト: 対象外（UIのみの変更）
