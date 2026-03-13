---
escalation_id: ESC-TASK-030-2
task_id: TASK-030
status: open
created_at: 2026-03-14T12:00:00+09:00
---

## 問題の内容

E2Eテスト実行中、スレッド作成後にスレッド一覧が自動更新されないバグを発見した。

### 症状

テストStep 5「認証成功 → スレッド作成がリトライされ成功する → 一覧に表示される」で失敗する。
スレッドはDBに正しく作成されているが、ページのスレッド一覧に反映されない。

### 根本原因

`ThreadCreateForm.tsx`（Client Component）で、スレッド作成成功後に `onCreated?.()` を呼び出す実装になっているが、
`page.tsx`（Server Component）では `<ThreadCreateForm />` に `onCreated` プロパティを渡していない。

そのため、認証成功後のスレッド作成リトライが成功しても、ページの再レンダリングが起こらず一覧が更新されない。

さらに、`ThreadCreateForm.tsx` 内で `router.refresh()` も呼ばれていないため、Client Component 側でも再レンダリングをトリガーする手段がない。

### 確認済みの事実

- `POST /api/threads` は正常に 201 を返している
- DBにスレッドが作成されている（Supabase Localで確認済み）
- ページをリロードすると作成したスレッドが表示される
- `ThreadCreateForm.tsx` L60: `onCreated?.()` は呼ばれるが `onCreated` が `undefined`
- `page.tsx` L85: `<ThreadCreateForm />` に `onCreated` を渡していない

## 選択肢と各選択肢の影響

### 選択肢A: `ThreadCreateForm.tsx` に `useRouter` + `router.refresh()` を追加

```typescript
// ThreadCreateForm.tsx に追加
import { useRouter } from 'next/navigation';
// ...
const router = useRouter();
// submitThread() の成功時:
router.refresh(); // Server Component を再フェッチ
onCreated?.();    // 外部コールバックも残す
```

- 影響: ユーザーから見た振る舞いが改善される（スレッド作成後に一覧が自動更新される）
- BDDシナリオとの整合: `thread.feature @ログイン済みユーザーがスレッドを作成する` のシナリオで期待されている振る舞い
- locked_files 外のファイル変更が必要: `src/app/(web)/_components/ThreadCreateForm.tsx`

### 選択肢B: `page.tsx` に `onCreated` ハンドラを追加（Client Wrapper を導入）

Server Component の `page.tsx` を Client Component に変換するか、Client Wrapper を追加して `router.refresh()` を呼ぶ。

- 影響: アーキテクチャの変更が必要（Server Component → Client Component）
- 実装コストが高い
- 選択肢Aより複雑

### 選択肢C: E2Eテストで `page.reload()` を呼んで回避

E2Eテストコード内で認証成功後に `page.reload()` を追加する。

- 影響: 「スレッド作成後に一覧が自動更新される」という振る舞いの検証が不可能になる
- テストがバグを検出できなくなる（テストの価値が下がる）
- タスク指示書の仕様コメント「ThreadCreateForm.onCreated → ThreadListPage の再取得」に反する

## 推奨

選択肢Aを推奨する。`ThreadCreateForm.tsx` への `router.refresh()` 追加は最小限の変更であり、
BDDシナリオで期待されている「スレッド作成後に一覧が表示される」という振る舞いを実現する。

## 関連するfeatureファイル・シナリオタグ

- `features/phase1/thread.feature @ログイン済みユーザーがスレッドを作成する`
- `features/phase1/authentication.feature @未認証ユーザーが書き込みを行うと認証コードが案内される`
