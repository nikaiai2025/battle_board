---
task_id: TASK-257
sprint_id: Sprint-88
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-22T00:00:00+09:00
updated_at: 2026-03-22T00:00:00+09:00
locked_files:
  - "[NEW] src/lib/utils/date.ts"
  - src/lib/infrastructure/adapters/dat-formatter.ts
  - src/app/(web)/mypage/_components/PostHistorySection.tsx
  - src/lib/domain/rules/mypage-display-rules.ts
  - src/app/(web)/admin/users/page.tsx
  - src/app/(web)/admin/users/[userId]/page.tsx
  - src/app/(web)/admin/ip-bans/page.tsx
  - src/app/(web)/admin/page.tsx
  - src/app/(web)/_components/PostItem.tsx
---

## タスク概要

書き込み時間の表示がJST（日本時間）ではなく、サーバーやブラウザのローカルタイムゾーンに依存しているバグを修正する。`PostItem.tsx` に既に正しいJST固定の `formatDateTime()` 実装があるので、これを共有ユーティリティに切り出して全箇所で統一する。

## 必読ドキュメント（優先度順）

1. [必須] `src/app/(web)/_components/PostItem.tsx` — 正しいJST実装のリファレンス（formatDateTime関数）
2. [必須] `src/lib/infrastructure/adapters/dat-formatter.ts` — DATフォーマッタ（formatDateId修正対象）
3. [参考] `src/__tests__/app/(web)/_components/PostItem.test.tsx` — 既存テスト（formatDateTimeのテスト）

## 修正内容

### Step 1: 共有ユーティリティ作成

`src/lib/utils/date.ts` を新規作成し、`PostItem.tsx` から `formatDateTime()` と `DAY_NAMES` を移動する。

- `formatDateTime(dateStr: string): string` — "YYYY/MM/DD(曜) HH:mm:ss" 形式でJST固定
- `toJSTDate(date: Date): Date` — JST変換済みDateを返すヘルパー（DatFormatterの.SS対応用）
- PostItem.tsx からは共有ユーティリティをインポートするように変更

### Step 2: DatFormatter修正

`dat-formatter.ts` の `formatDateId()` を修正:
- `date.getHours()` 等 → JST変換後に `getUTCHours()` 等を使用
- ミリ秒表示(.SS)があるため、`toJSTDate()` を使って変換してからUTCメソッドで取得

### Step 3: マイページ修正

`PostHistorySection.tsx` の `new Date(post.createdAt).toLocaleString("ja-JP")` → `formatDateTime(post.createdAt)` に変更

### Step 4: mypage-display-rules修正

`formatPatLastUsedAt()` をJST固定に修正

### Step 5: 管理画面修正

以下の管理画面ファイルの `toLocaleString()` を `formatDateTime()` に置換:
- `src/app/(web)/admin/users/page.tsx`
- `src/app/(web)/admin/users/[userId]/page.tsx`
- `src/app/(web)/admin/ip-bans/page.tsx`
- `src/app/(web)/admin/page.tsx`

### Step 6: テスト

- 既存の `PostItem.test.tsx` の `formatDateTime` テストが引き続きPASSすることを確認（インポート先変更）
- `dat-formatter.ts` の既存テストがPASSすることを確認
- `npx vitest run` で全テストPASS

## 完了条件

- [ ] `formatDateTime()` が `src/lib/utils/date.ts` に共有化されている
- [ ] PostItem.tsx が共有ユーティリティからインポートしている
- [ ] DatFormatter.formatDateId() がJST固定で動作する
- [ ] PostHistorySection の日時表示がJST固定
- [ ] formatPatLastUsedAt() がJST固定
- [ ] 管理画面の全日時表示がJST固定
- [ ] `npx vitest run` 全テストPASS

## スコープ外

- BDDシナリオの変更（不要）
- 新規テストファイルの追加（既存テストのインポート先変更のみ）
- DBのタイムゾーン設定変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: Step 1〜6 全て完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- Step 1: `src/lib/utils/date.ts` 新規作成（`formatDateTime`, `toJSTDate`, `DAY_NAMES` を定義）
- Step 2: `PostItem.tsx` から `formatDateTime`/`DAY_NAMES` を削除し、`src/lib/utils/date` からインポートに変更
- Step 3: `PostItem.test.tsx` のインポート先を `PostItem` → `src/lib/utils/date` に変更
- Step 4: `dat-formatter.ts` の `formatDateId()` を `toJSTDate()` + UTCメソッド使用に変更（JST固定）
- Step 5: `PostHistorySection.tsx` の `toLocaleString("ja-JP")` → `formatDateTime()` に置換
- Step 6: `mypage-display-rules.ts` の `formatPatLastUsedAt()` を `formatDateTime()` 使用に変更（linterによるパス変換問題を手動修正）
- Step 7: 管理画面4ファイルの `toLocaleString("ja-JP")` を `formatDateTime()` に置換（`admin/page.tsx` は数値フォーマットのみで日時なし、修正不要を確認）

### テスト結果サマリー
- 実行: `npx vitest run`
- 結果: **78 passed (78)** / テスト数 **1635 passed**
- FAIL: 0件
- 初回実行で `mypage-display-rules.ts` のインポートパスをlinterが `../../utils/date` → `../utils/date` に誤変換。手動で再修正後、全テストPASS確認
