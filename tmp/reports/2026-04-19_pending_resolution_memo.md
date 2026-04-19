# pending 解消メモ

## 今回解消した内容

- `thread.feature`
  - `@anchor_popup`
  - `@post_number_display`
  - `@pagination` の polling 関連
  - `@fab`
- 既存 UI ロジックを Cucumber step から再利用しやすくするため、`thread-ui-logic.ts` を追加
- `AnchorPopupContext` / `PostForm` / `PostListLiveWrapper` で helper を再利用する形に整理

## 検証結果

- `npx vitest run 'src/__tests__/app/(web)/_components/AnchorPopupContext.test.tsx' 'src/__tests__/app/(web)/_components/PostFormInsertText.test.tsx' 'src/__tests__/app/(web)/_components/PostListLiveWrapper.test.tsx'`
  - PASS
- `npx cucumber-js --format summary`
  - `446 scenarios (7 pending, 439 passed)`

## 残り pending

- `features/specialist_browser_compat.feature`
  - HTTP:80 直接応答 2件
  - WAF 非ブロック 1件
- `features/user_registration.feature`
  - Discord OAuth 本登録 / ログイン 2件
- `features/bot_system.feature`
  - 撃破済み BOT の Web 表示 / トグル 2件

## 判断

- `thread.feature` で残っていた pending は、既存実装があるのに step が未実装だった技術負債として返済済み
- `HTTP:80 / WAF` と `Discord OAuth` は外部・インフラ境界のため、ローカル BDD で無理に green 化すると検証を偽装しやすい
- `bot_system` の残件は実装自体はあるが、BDD 文言と実装表現のズレがあるため今回は未着手
