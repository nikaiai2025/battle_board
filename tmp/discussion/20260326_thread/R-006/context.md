# R-006 コンテキスト情報

## 調査対象シナリオ

| タグ | シナリオ数 | ステップ定義の状態 |
|---|---|---|
| @anchor_popup | 4 | 全ステップが `() => "pending"` |
| @post_number_display | 3 | 全ステップが `() => "pending"` |
| @image_preview | 4 | サービス層代替検証（実装済み・パス） |
| @fab | 5 | 2シナリオが Undefined（未定義）、3シナリオが @wip |

## 調査したファイル

### featureファイル
- `features/thread.feature` — 全シナリオ原文確認済み

### ステップ定義
- `features/step_definitions/thread.steps.ts` — 2334行全体

### UIコンポーネント実装
- `src/app/(web)/_components/AnchorPopup.tsx`
- `src/app/(web)/_components/AnchorPopupContext.tsx`
- `src/app/(web)/_components/AnchorLink.tsx`
- `src/app/(web)/_components/FloatingActionMenu.tsx`
- `src/app/(web)/_components/PostItem.tsx`
- `src/app/(web)/_components/ImageThumbnail.tsx`
- `src/app/(web)/_components/PostForm.tsx`
- `src/app/(web)/_components/PostFormContext.tsx`
- `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx`

### ドメインルール
- `src/lib/domain/rules/url-detector.ts`

### テスト
- `src/__tests__/app/(web)/_components/AnchorPopup.test.tsx`
- `src/__tests__/app/(web)/_components/PostFormInsertText.test.tsx`

## 主要な発見事項

### AnchorPopup の外側クリック実装

`AnchorPopup.tsx:60-75` の `useEffect`:

```tsx
useEffect(() => {
    if (popupStack.length === 0) return;

    const handleDocumentClick = () => {
        closeTopPopup();
    };

    document.addEventListener("click", handleDocumentClick);

    return () => {
        document.removeEventListener("click", handleDocumentClick);
    };
}, [popupStack.length, closeTopPopup]);
```

依存配列が `[popupStack.length, closeTopPopup]` であるため、スタックの「個数」が変わったときのみリスナーが再登録される。

### FloatingActionMenu の書き込みパネル

書き込みパネルは CSS `translate-y` で開閉するが、Sheetコンポーネントを使わず `<div>` で実装。
`ボトムシートの外側をタップするとフォームが閉じる` シナリオでは「外側タップで閉じる」ためのオーバーレイや backdrop click ハンドラが存在しない。

### image_preview テスト検証の範囲

BDDシナリオの `Then 画像URLがクリック可能なサムネイル画像として表示される` は `detectUrls()` の `isImage=true` を確認するだけ。
実際の `<img>` タグ描画や `<a>` タグのレンダリングはテストしていない。

### @fab シナリオのステップ定義欠如

`features/step_definitions/` に @fab シナリオのステップ定義が一切存在しない（dry-run で `? undefined` と表示される）。
