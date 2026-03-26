# ATK-006 — Red Team 指摘

---

## ATK-006-1

**問題ID**: ATK-006-1
**重大度**: CRITICAL
**問題の要約**: アンカーリンクをクリックするとポップアップが開いた直後に自動で閉じる

**詳細**:

`AnchorPopup.tsx:60-75` の `useEffect` は `popupStack.length > 0` のとき、`document` にクリックリスナーを追加する。このリスナーは `closeTopPopup()` を無条件で呼ぶ。

一方、`AnchorLink.tsx:51-60` の `handleClick` は `e.stopPropagation()` を**呼んでいない**。

AnchorLink は通常の PostItem 内（ポップアップ外）にあるため、AnchorLink の span は `AnchorPopup.tsx:96-100` の `onClick` による `e.stopPropagation()` の保護外となる。

すでに1件以上のポップアップが存在する状態でユーザーが通常 PostItem のアンカー（`>>N`）をクリックすると、以下の順序でイベントが発火する：

1. React の合成 onClick (`AnchorLink.handleClick`) → `openPopup()` 呼び出し
2. 同じクリックイベントがバブリングし `document` のネイティブリスナー（`handleDocumentClick`）が発火 → `closeTopPopup()` 呼び出し

React の合成イベントはネイティブイベントより先に実行されるため、`openPopup()` で state 更新がスケジュールされた直後に `closeTopPopup()` がスケジュールされる。両方の state 更新がバッチ処理されると、最終的なスタックから1件が取り除かれる（新たに開こうとしたポップアップが即座に閉じられるか、既存のポップアップが閉じられる）。

関連コード:
- `src/app/(web)/_components/AnchorLink.tsx:51-60` — `e.stopPropagation()` の欠如
- `src/app/(web)/_components/AnchorPopup.tsx:60-75` — `document` クリックリスナー登録
- `src/app/(web)/_components/AnchorPopup.tsx:96-100` — ポップアップ div の stopPropagation（保護範囲外の AnchorLink には無効）

**再現条件**:
- スレッドに2件以上のアンカーが含まれるレスが存在する
- 1件目のポップアップが表示されている状態で、通常 PostItem（ポップアップ外）の `>>N` アンカーをクリックする

---

## ATK-006-2

**問題ID**: ATK-006-2
**重大度**: CRITICAL
**問題の要約**: @fab の2シナリオがステップ定義未実装のまま CI 上で「未定義」としてスキップされ、機能が実質的に無検証

**詳細**:

`features/thread.feature:286-297` に @fab タグが付いた2シナリオ（@wip なし）が存在する：

- `Scenario: フローティングメニューからボトムシートで書き込みフォームを開く`
- `Scenario: ボトムシートの外側をタップするとフォームが閉じる`

`features/step_definitions/` ディレクトリには @fab シナリオ用のステップ定義が一切存在しない（`npx cucumber-js --dry-run --tags "@fab and not @wip"` 実行結果で全ステップが `? undefined`）。

`FloatingActionMenu.tsx` の書き込みパネルは `<Sheet>` コンポーネントを使わず CSS の `translate-y` で実装されており、ボトムシートの「外側タップで閉じる」動作はオーバーレイ/backdrop がない（`FloatingActionMenu.tsx:125-146`）。ユーザーが外側をタップしてもパネルは閉じない可能性があるが、検証手段が存在しない。

シナリオが `@wip` でないにもかかわらず `undefined` として扱われる場合、cucumber-js の `failOnUndefinedSteps` 設定次第ではパスと同等に扱われる（デフォルト動作）。つまり受け入れ基準が形骸化している。

関連コード:
- `features/thread.feature:286-297` — @wip なしの2シナリオ
- `src/app/(web)/_components/FloatingActionMenu.tsx:125-146` — ボトムシート外タップ処理なし
- `features/step_definitions/` — @fab ステップ定義が存在しない

**再現条件**:
- `npx cucumber-js --tags "@fab and not @wip"` を実行すると 0 failures でパスする（全ステップが skipped）
- ボトムシートを表示した状態でパネル外側をタップしてもパネルが閉じない（X ボタン以外の閉じる手段がない）

---

## ATK-006-3

**問題ID**: ATK-006-3
**重大度**: HIGH
**問題の要約**: @image_preview シナリオ3の「URLはリンクとして表示される」検証が `<a>` レンダリングを一切確認せず常にパスする欺瞞テスト

**詳細**:

`features/thread.feature:269-273` のシナリオ:

```
Scenario: 画像以外のURLはサムネイル展開されない
  Given スレッドにレス "https://example.com/page" が存在する
  When スレッドを表示する
  Then URLはリンクとして表示される
  And サムネイル画像は表示されない
```

`thread.steps.ts:2262-2279` の `Then "URLはリンクとして表示される"` ステップは、`detectUrls()` の戻り値に `url.startsWith("http")` の URL が存在することだけを確認する。`detectUrls()` は純粋関数であり URL テキストを含んでいれば必ず URL を返す。このステップは Given で投入した URL 文字列がデータベースに保存されているかどうかを確認しているに過ぎず、UIコンポーネントが `<a>` タグをレンダリングすることを一切検証していない。

`PostItem.tsx:115-165` の `parsePostBody()` が非画像URLを `<a>` タグとして出力するかどうか、`ImageThumbnail` をレンダリングしないかどうかは、このテストからは判断できない。

実際に `parsePostBody()` の非画像URLパスを壊しても（例: 非画像URLにも `<ImageThumbnail>` をレンダリングするよう変更）、このBDDテストはパスし続ける。同様に `parsePostBody()` を削除しても「URLはリンクとして表示される」はパスする。

関連コード:
- `features/step_definitions/thread.steps.ts:2262-2279` — 検証が URL 文字列の存在確認のみ
- `src/app/(web)/_components/PostItem.tsx:115-165` — 実際の parsePostBody 実装（未検証）
- `features/thread.feature:269-273` — 受け入れ基準の正本
