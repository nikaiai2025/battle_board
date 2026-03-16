---
escalation_id: ESC-TASK-085-1
task_id: TASK-085
sprint_id: Sprint-30
status: open
created_at: 2026-03-16T18:35:00+09:00
---

## 問題の内容

TASK-085 の実装（`verifyEdgeToken` / `issueEdgeToken` / `verifyWriteToken` / `verifyAuthCode` を `EdgeTokenRepository` 経由に変更）において、単体テスト（768テスト）は全PASS した。

しかし BDDテスト（`npx cucumber-js`）が `locked_files` 外のファイルに変更が必要なため失敗している。

### エラー内容

```
TypeError: Cannot read properties of null (reading 'id')
    at rowToEdgeToken (src/lib/infrastructure/repositories/edge-token-repository.ts:61:11)
    at Object.create (src/lib/infrastructure/repositories/edge-token-repository.ts:103:9)
    at async Object.issueEdgeToken (src/lib/services/auth-service.ts:233:2)
```

### 原因

`issueEdgeToken` から `EdgeTokenRepository.create` を呼び出すようになったが、BDDテストの `register-mocks.js` に `edge-token-repository.ts` のインメモリ実装が登録されていない。そのため、本番の `EdgeTokenRepository.create` が呼ばれ、`dummyClient` の `insert().select().single()` が `{ data: null, error: null }` を返す結果、`rowToEdgeToken(null)` でクラッシュする。

## 変更が必要なファイル（locked_files 外）

1. **`features/support/register-mocks.js`** — `REPO_MOCKS` 配列に以下を追加:
   ```javascript
   [
     "src/lib/infrastructure/repositories/edge-token-repository.ts",
     "./in-memory/edge-token-repository.ts",
   ],
   ```
   また、`resetAllStores()` に `InMemoryEdgeTokenRepo.reset()` の呼び出しを追加。

2. **`features/support/in-memory/edge-token-repository.ts`** — 新規作成（インメモリ実装）:
   - `EdgeToken` 型と同一シグネチャで `create`, `findByToken`, `findByUserId`, `deleteByToken`, `updateLastUsedAt` を実装
   - `reset()` 関数でストアをクリア

3. **`features/support/mock-installer.ts`** — `InMemoryEdgeTokenRepo` のインポートと `resetAllStores()` への追加

## 選択肢と影響

### 選択肢A: locked_files に上記3ファイルを追加してワーカーに作業を継続させる（推奨）

- 影響: BDDテスト 128 passed / 3 pending の状態が回復する
- 既存シナリオに機能的な変更はなく、モック層の追加のみ
- 実装内容は既存の他リポジトリのインメモリ実装（例: `user-repository.ts`）と同じパターンで完結可能

### 選択肢B: TASK-085 の BDD 完了条件を緩和する

- `npx cucumber-js` の回帰チェックを Sprint-31 に先送りする
- 単体テストは全PASSしているため、機能ロジックに問題はない
- BDDテストの回帰が検知できない期間が生まれるリスクがある

## 関連 feature ファイル・シナリオタグ

- `features/authentication.feature` — 全シナリオ影響（edge-token 発行が関わるため）
- `features/constraints/specialist_browser_compat.feature` — write_token 関連シナリオ
