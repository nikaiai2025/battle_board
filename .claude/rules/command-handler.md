---
paths:
  - "src/lib/services/handlers/*-handler.ts"
---

## コマンドハンドラ編集時のチェックリスト

コマンドハンドラを追加・変更した場合、以下を確認すること。

### ベーシックフローテストの存在確認

D-10 §10.3.2 により、各コマンドにつきベーシックフローテスト（`e2e/flows/basic-flow.spec.ts`）が1本必要。
新規コマンドハンドラを追加した場合は、`e2e/flows/basic-flow.spec.ts` に対応するテストケースを追加実装すること。
