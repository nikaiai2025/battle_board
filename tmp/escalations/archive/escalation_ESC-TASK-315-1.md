---
escalation_id: ESC-TASK-315-1
task_id: TASK-315
status: open
created_at: 2026-03-25T07:50:00+09:00
---

## 問題の内容

`features/support/in-memory/currency-repository.ts`（InMemory実装）への変更が必要だが、
このファイルは `locked_files` に含まれていない。

### 背景

TASK-315 では `CurrencyRepository.getBalancesByUserIds` を新規追加した（N+1 修正）。
BDD テスト戦略書 §2 によると、InMemory 実装は「各リポジトリのエクスポート関数と同一シグネチャの関数を持つ」ことが規約として定められている。

本番実装の `currency-repository.ts` に追加した `getBalancesByUserIds` は、
BDD テスト実行時にもインメモリ実装に差し替えられるため、
InMemory 実装にも同名関数が必要になる。

### 現在の状態

- `npx vitest run` : 全 1867 テスト PASS（問題なし）
- `npx cucumber-js` : 1 件 FAILED（既存シナリオ）

FAILEDシナリオ:
```
Scenario: 管理者がユーザー一覧を閲覧できる (admin.feature)
TypeError: CurrencyRepository.getBalancesByUserIds is not a function
```

### 選択肢

#### 選択肢A: `locked_files` に追加して InMemory 実装を修正する（推奨）

`features/support/in-memory/currency-repository.ts` に以下を追加するだけ:

```typescript
export async function getBalancesByUserIds(
  userIds: string[],
): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const map = new Map<string, number>();
  for (const userId of userIds) {
    const balance = store.get(userId)?.balance ?? 0;
    map.set(userId, balance);
  }
  return map;
}
```

影響: BDD テスト 1 件が PASS に変わる。本番動作への影響なし。

#### 選択肢B: エスカレーションのまま停止する

`npx cucumber-js` の完了条件未達成でタスクを escalated 状態にする。

### 関連

- See: features/admin.feature @管理者がユーザー一覧を閲覧できる
- See: docs/architecture/bdd_test_strategy.md §2 インメモリ実装の設計方針
