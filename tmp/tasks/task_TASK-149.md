---
task_id: TASK-149
sprint_id: Sprint-53
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-18T00:00:00+09:00
updated_at: 2026-03-18T00:00:00+09:00
locked_files:
  - "src/app/(web)/_components/PostListLiveWrapper.tsx"
  - "[NEW] src/__tests__/app/(web)/_components/PostListLiveWrapper.test.tsx"
---

## タスク概要

PostListLiveWrapperで`router.refresh()`後にレスが二重表示されるバグを修正する。
`initialLastPostNumber` propの変化をstateに反映するuseEffectを追加し、SSRが既にカバーしているレスをnewPostsから除去する。

## バグの原因（確定済み）

`useState(initialLastPostNumber)` は初回マウント時にしか初期値を使わない。
`router.refresh()` でSSRが再実行されpropsが更新されても、Client Componentのstateは保持される（Next.js App Router仕様）。
結果、PostList（SSR）が新レスを含んで描画される一方、PostListLiveWrapperは古いnewPostsを表示し続けて二重になる。

## 修正内容

PostListLiveWrapper.tsxに以下のuseEffectを追加:

```typescript
useEffect(() => {
  if (initialLastPostNumber > lastPostNumber) {
    setLastPostNumber(initialLastPostNumber);
    // SSRが既にカバーしているレスを newPosts から除去
    setNewPosts(prev => prev.filter(p => p.postNumber > initialLastPostNumber));
  }
}, [initialLastPostNumber, lastPostNumber]);
```

## 必読ドキュメント（優先度順）
1. [必須] `src/app/(web)/_components/PostListLiveWrapper.tsx` — 修正対象
2. [参考] `src/app/(web)/_components/PostList.tsx` — SSR側コンポーネント
3. [参考] `docs/architecture/components/web-ui.md` — UI設計

## 出力（生成すべきファイル）
- `src/app/(web)/_components/PostListLiveWrapper.tsx` — useEffect追加
- `src/__tests__/app/(web)/_components/PostListLiveWrapper.test.tsx` — 単体テスト（prop変化時のstate同期を検証）

## 完了条件
- [ ] useEffectによるprop→state同期が実装されている
- [ ] initialLastPostNumber > lastPostNumber の場合にnewPostsがフィルタリングされる
- [ ] 単体テストで以下を検証:
  - prop変化時にlastPostNumberが更新される
  - SSRカバー済みレスがnewPostsから除去される
  - initialLastPostNumber <= lastPostNumber の場合は何もしない
- [ ] `npx vitest run` 全テストPASS
- [ ] JSDocコメントにバグ修正の経緯を記載

## スコープ外
- PostList.tsx（SSR側）の変更
- ポーリング間隔の変更
- WebSocket導入

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `PostListLiveWrapper.tsx` を読み込み、バグの原因を確認
2. vitest.config.ts を更新（`.test.tsx`対応・`@vitejs/plugin-react`追加・`environmentMatchGlobs`設定）
3. `PostListLiveWrapper.tsx` にuseEffectを追加
   - タスク指示書の実装案を分析した結果、依存配列に`lastPostNumber`を含めると
     「ポーリングで先にlastPostNumberが更新された後にinitialLastPostNumberが同値でrerenderされる」
     ケースでuseEffectが発火しないことを発見
   - 修正: 依存配列を`[initialLastPostNumber]`のみにし、`setLastPostNumber(prev => Math.max(prev, ...))`
     の関数型更新でstale closureを回避する実装を採用
4. テストファイル作成（10テストケース）
5. 全テスト実行: 1201件PASS（既存テストへの影響なし）

### 修正ポイント: タスク指示書との差異

タスク指示書のuseEffectコードは依存配列に`[initialLastPostNumber, lastPostNumber]`を含んでいたが、
この実装では以下の問題が生じる:
- ポーリングでpost6が取得され`lastPostNumber=6`になった後、SSRが`initialLastPostNumber=6`でrerenderする
- `6 > 6`の条件が偽となり、useEffectの本体が実行されない（二重表示が残る）

対処として依存配列を`[initialLastPostNumber]`のみとし、stale closureを関数型更新で回避。
この変更により「ポーリング後のrouter.refresh()」の二重表示も正しく解消できる。

### テスト結果サマリー

- 単体テスト（PostListLiveWrapper.test.tsx）: 10件PASS / 0件FAIL
- 全体テスト（npx vitest run）: 1201件PASS / 0件FAIL / 48テストファイル
