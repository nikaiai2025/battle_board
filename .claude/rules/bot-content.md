---
paths:
  - "src/lib/services/bot-strategies/content/**"
---

## BOTコンテンツ生成時のコマンド行ルール

コマンド（`!w`, `!attack` 等）を含む投稿本文を生成する場合、以下を守ること。

### コマンド行にフレーバーテキストを含めない

コマンドパーサーのルール6（後方引数優先）により、コマンドと同一行のテキストはすべて後方引数として解釈される。
フレーバーテキストは改行（`\n`）で分離すること。

```typescript
// OK
return `>>${postNumber} !w\nフレーバーテキスト`;

// NG — 「フレーバーテキスト」が !w の引数になり、前方引数 >>N が無視される
return `>>${postNumber} !w  フレーバーテキスト`;
```

See: D-08 command.md §2.3 ルール10
See: docs/operations/incidents/2026-03-24_welcome_bot_w_command_silent_failure.md
