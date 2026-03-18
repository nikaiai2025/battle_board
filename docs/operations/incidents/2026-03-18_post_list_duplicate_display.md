# インシデント報告: PostListLiveWrapper 二重表示バグ

- **発生日:** 2026-03-18
- **発見方法:** 人間が本番環境で書き込み後に目視で発見
- **影響:** スレッド閲覧ページで書き込み後にレスが二重に表示される
- **修正:** Sprint-53 (TASK-149)

---

## 事象

スレッドに書き込みを行った後、自分のレス（および直前に他者が書き込んだレス）が二重に表示される。

## 再現手順

1. スレッドを開く（SSRで10件のレスを表示）
2. ポーリング（30秒以内）で他者のレス11を検出 → PostListLiveWrapper が newPosts に追加
3. ユーザーがレス12を書き込む → PostForm が `router.refresh()` を呼ぶ
4. SSR再実行で PostList が [レス1-12] を描画（レス11,12を含む）
5. PostListLiveWrapper の state は保持され、newPosts=[レス11] のまま
6. 画面上: PostList の [1-12] + PostListLiveWrapper の [11] = **レス11が二重表示**

## 根本原因

`PostListLiveWrapper.tsx` の `useState(initialLastPostNumber)` は初回マウント時にしか初期値を使わない（React仕様）。`router.refresh()` は Server Component を再SSRするが、Client Component の state は保持する（Next.js App Router仕様）。この2つの仕様の組み合わせにより、SSR側のデータ更新が Client Component の state に反映されなかった。

### 問題コード（修正前）

```typescript
// PostListLiveWrapper.tsx L60
const [lastPostNumber, setLastPostNumber] = useState(initialLastPostNumber);
// ↑ initialLastPostNumber が 10→12 に変わっても state は 10 のまま
```

## 修正内容

`initialLastPostNumber` prop の変化を検知する useEffect を追加し、SSR がカバー済みのレスを newPosts から除去する。

```typescript
useEffect(() => {
  setNewPosts(prev => prev.filter(p => p.postNumber > initialLastPostNumber));
  setLastPostNumber(prev => Math.max(prev, initialLastPostNumber));
}, [initialLastPostNumber]);
```

## テストで検出できなかった理由

| テスト層 | 検出可否 | 理由 |
|---|---|---|
| BDDサービス層 | 不可 | UI state 同期はサービス層の責務外（D-10 §1 の原理的限界） |
| Vitest単体 | **可能だった** | PostListLiveWrapper の単体テストが0件だった |
| Playwright E2E | 可能だった | 「書き込み後の重複チェック」ケースがなかった |

## 再発防止策

- PostListLiveWrapper 単体テスト10件追加（Sprint-53で実施済み）
- 教訓 LL-005 として `useState(prop)` パターンの注意事項を記録

## 横展開調査

`useState(prop)` パターンをコードベース全体で検索した結果、同パターンの未修正箇所は存在しない。

See: `docs/architecture/lessons_learned.md` LL-005
