---
paths:
  - "src/app/(web)/**/*"
  - "src/components/**/*"
  - "src/app/globals.css"
---

## UIコンポーネント規約

`src/app/(web)/` 配下の TSX ファイルを作成・変更する際は以下に従うこと。

### shadcn/ui コンポーネントを使う

- ボタン、入力欄、カード等のUI部品は `src/components/ui/` の shadcn/ui コンポーネントを使用する
- 未導入のコンポーネントが必要な場合は `npx shadcn@latest add <name>` で追加してから使用する
- 素の HTML 要素（`<button>`, `<input>` 等）を直接スタイリングしない

### デザイントークンを参照する

- 色は Tailwind のセマンティッククラスを使う（`globals.css` の CSS 変数に連動する）
- クラスのマージには `cn()` 関数（`@/lib/utils`）を使う

```
OK:  text-foreground, text-muted-foreground, bg-primary, border-border
NG:  text-gray-800, text-gray-500, bg-blue-500, border-gray-400
```

### 既存コードの扱い

- 既存ページにハードコードされた色（`text-gray-800` 等）が残っている場合がある
- 既存コードの修正がタスクのスコープ外であれば、そのままにしてよい（UI開発者エージェントが別途対応する）
- 新規コードでは必ずデザイントークンを使うこと
