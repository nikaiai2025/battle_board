---
task_id: TASK-164
sprint_id: Sprint-60
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-19T20:00:00+09:00
updated_at: 2026-03-19T20:00:00+09:00
locked_files:
  - "[NEW] src/app/(web)/_components/PostFormContext.tsx"
  - src/app/(web)/_components/PostForm.tsx
  - src/app/(web)/_components/PostItem.tsx
  - src/app/(web)/_components/PostList.tsx
---

## タスク概要

レス番号の表示変更（`>>` 除去）、レス番号クリックによるPostFormへの返信テキスト挿入、PostItemのClient Component化を実装する。後続のアンカーポップアップ（T7）の前提となるClient化もここで行う。

## 対象BDDシナリオ
- `features/thread.feature` @post_number_display（3シナリオ）

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-162/design.md` §4 — レス番号表示設計
2. [必須] `src/app/(web)/_components/PostItem.tsx` — 現行レス表示コンポーネント
3. [必須] `src/app/(web)/_components/PostForm.tsx` — 現行書き込みフォーム
4. [必須] `src/app/(web)/_components/PostList.tsx` — 現行レス一覧
5. [参考] `tmp/workers/bdd-architect_TASK-162/design.md` §6.2 — 変更後コンポーネント境界図

## 修正内容

### A. PostFormContext 新設

`[NEW] src/app/(web)/_components/PostFormContext.tsx`

設計書 §4.3 に従い:
```typescript
"use client";
interface PostFormContextType {
  insertText: (text: string) => void;
}
// PostFormContextProvider + usePostFormContext を export
```

### B. PostForm 改修

`src/app/(web)/_components/PostForm.tsx`

1. PostFormContextProvider で値を提供
2. `insertText` コールバック実装:
   - フォームが空 → テキストを挿入
   - フォームが非空 → 改行 + テキストを追記
3. PostForm を PostFormContextProvider でラップ（または親コンポーネントでラップ）

### C. PostItem 改修

`src/app/(web)/_components/PostItem.tsx`

1. `"use client"` ディレクティブを追加
2. レス番号表示から `>>` を除去（`>>5` → `5`）
3. レス番号をクリック可能なボタンに変更
4. クリック時に PostFormContext の `insertText(">>N")` を呼び出す

### D. PostList 改修

`src/app/(web)/_components/PostList.tsx`

1. `"use client"` ディレクティブを追加（PostItemがContextを消費するため、PostListもClient Componentに変更）
2. SSRの初期レスデータはServer Component（page.tsx）からpropsで受け取るため、SSRメリットは維持される

## 完了条件
- [ ] PostItem のレス番号が数字のみで表示される（`>>` なし）
- [ ] レス番号がクリック可能である
- [ ] レス番号クリックでPostFormに `>>N` が挿入される
- [ ] フォームが非空のときは改行 + `>>N` が追記される
- [ ] PostItem が `"use client"` の Client Component になっている
- [ ] PostList が `"use client"` の Client Component になっている
- [ ] 既存テスト全件PASS（`npx vitest run`）
- [ ] テストコマンド: `npx vitest run`

## スコープ外
- アンカーポップアップ（後続タスク T7）
- ルーティング変更（後続タスク T2）
- BDDステップ定義（後続タスク T9）
- PostItem 内のアンカーリンク（`>>N`）のポップアップ化（T7のスコープ）

## 補足・制約
- PostItem の既存のアンカーリンク処理（parseAnchorLinks → `<Link href="#post-N">`）はこのタスクでは変更しない。T7（アンカーポップアップ）で変更する
- shadcn/ui コンポーネントを使用する場合は `.claude/rules/UI_Components.md` に従う

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク（A〜D）完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- [完了] PostFormContext.tsx 新設: PostFormContextProvider / usePostFormContext / usePostFormRegister を実装
- [完了] PostForm.tsx 改修: insertText 実装 + usePostFormRegister で Context に登録
- [完了] PostItem.tsx 改修: "use client" 追加、レス番号 `>>N`→`N` 表示変更、クリックボタン化
- [完了] PostList.tsx 改修: "use client" 追加
- [完了] 単体テスト作成: PostItem.test.tsx（10件）、PostFormInsertText.test.tsx（4件）

### テスト結果サマリー

- 単体テスト（vitest run）: 1317件PASS / 1件FAIL（既存の schema-consistency テスト、TASK-164 無関係）
- 新規追加テスト: 14件（PostItem.test.tsx 10件 + PostFormInsertText.test.tsx 4件）
- PostListLiveWrapper.test.tsx（既存）: 10件 全件PASS（PostItem Client Component化の影響なし）
