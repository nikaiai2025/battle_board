# AAフォント表示の技術的知見

> 2026-03-27 BattleBoard開発で得られた知見の記録

## 前提: AAは等幅フォントでは成立しない

2ch/5chのアスキーアート（AA）は**MS Pゴシック 16px**を前提にデザインされている。
MS Pゴシックはプロポーショナルフォントだが、「全角1文字 = 半角2文字」の幅比率が保証されている。

一般的なプログラミング用等幅フォント（Consolas、Courier New等）ではこの比率が崩れ、AAが盛大にズレる。
半角スペース・全角スペース・全角文字・半角カナが混在するAAの位置合わせは、フォントの文字幅特性に完全に依存している。

## 専ブラ・Web間の統一

専ブラ（ChMate等）のデフォルトフォントはMS Pゴシック系。
BattleBoardではWeb版でも同じフォント特性を持つフォントを指定し、同一データが同一に表示されることを保証した。

```
フォントスタック: MS PGothic → Monapo → monospace（フォールバック）
```

**重要な制約:** Web版と専ブラのフォントが異なると、一方で正しく見えるデータはもう一方では必ずズレる。
データ側の修正（スペース調整等）では解決できない。フォントの統一が必要条件。

## 実装: AA含有時のみフォント切替

すべてのシステム情報にAAフォントを適用すると、おみくじ等の通常テキストが不自然に大きくなる。
`PostItem.tsx` では、投稿内容がAA（`!copipe` 結果）を含むかどうかを判定し、条件付きでフォントを切り替えている。

- AA判定: `【タイトル】\n（AA本文）`形式 → AAフォント（MS PGothic 16px）
- それ以外のシステム情報 → 通常フォント

## 開発環境の落とし穴: VSCode

`copipe-seed.txt`（AAデータの正本ファイル）をVSCodeで編集する際、デフォルトの等幅フォントでは
AAが崩れて表示されるため、正しく入力・確認できない。

`.vscode/settings.json` で plaintext ファイルにMS PGothicを適用することで解決した:

```json
{
  "[plaintext]": {
    "editor.fontFamily": "'MS PGothic', 'IPAmjMincho', monospace",
    "editor.fontSize": 16,
    "editor.lineHeight": 18
  }
}
```

VSCodeは特定ファイルだけにフォントを適用する機能を持たないため、plaintext全体への適用となった。
（カスタム言語IDの登録には拡張機能の開発が必要であり、過剰。）

## スマホブラウザの問題: MS Pゴシックが存在しない

PC（Windows）にはMS Pゴシックが標準搭載されているが、**iOSおよびAndroidにはMS Pゴシックが存在しない**。
スマホブラウザでフォントスタックが`MS PGothic → monospace`のみだった場合、フォールバックがOSのモノスペースフォントになり、AAが盛大にズレる。

### 解決策: Monapo Webフォントの配信

**Monapo**（パブリックドメイン）をWebフォントとして `public/fonts/monapo.woff2` に配置し、`globals.css` の `@font-face` で登録した。

```css
@font-face {
  font-family: "Monapo";
  src: url("/fonts/monapo.woff2") format("woff2");
  font-display: swap;
}
```

フォントスタックの順序:

```
MS PGothic（PC/Windows優先） → Monapo（スマホ・非Windows向けWebフォント） → monospace（最終フォールバック）
```

- **PC（Windows）:** OS搭載のMS Pゴシックが適用される → 専ブラと一致
- **スマホ（iOS/Android）:** MS PGothicなし → Monapo Webフォントが適用される → ズレ解消
- **その他環境:** monospacefフォールバック（最低限の可読性）

Monapoはモナーフォントの派生で、MS PGothicと同等の「全角1文字 = 半角2文字」比率を持つ。パブリックドメインのため利用制限なし。

## まとめ

| 層 | フォント | 設定箇所 |
|---|---|---|
| 専ブラ（ChMate等） | MS Pゴシック（デフォルト） | ユーザー端末依存 |
| Web版・PC（AA表示時） | MS PGothic（OS搭載） | `PostItem.tsx` + CSS変数 `--font-aa` |
| Web版・スマホ（AA表示時） | Monapo（Webフォント配信） | `public/fonts/monapo.woff2` + `globals.css @font-face` |
| 開発環境（VSCode） | MS PGothic | `.vscode/settings.json` |
| データ正本 | MS Pゴシック 16pxで正しく表示される状態 | `config/copipe-seed.txt` |
