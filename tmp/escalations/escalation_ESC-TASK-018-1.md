---
escalation_id: ESC-TASK-018-1
task_id: TASK-018
status: resolved
created_at: 2026-03-12T19:00:00+09:00
severity: blocker
---

## 概要

TASK-018（incentive.steps.ts の実装）において、BDDテスト実行時にリポジトリのモック差し替えが機能せず、全シナリオが `TypeError: Cannot read properties of null (reading 'id')` で失敗している。

## 問題の詳細

### エラー内容

```
TypeError: Cannot read properties of null (reading 'id')
    at rowToUser (src/lib/infrastructure/repositories/user-repository.ts:44:13)
    at Object.create (src/lib/infrastructure/repositories/user-repository.ts:129:10)
    at Object.issueEdgeToken (src/lib/services/auth-service.ts:201:16)
```

### 根本原因

`features/support/mock-installer.ts` の `installMocks()` は `BeforeAll` フックで呼ばれ、`require.cache` にインメモリ実装を差し込む設計になっている。

しかし TypeScript の `import * as UserRepository from '../infrastructure/repositories/user-repository'` は**モジュール評価時（ロード時）に解決される**。
Cucumber.js の `require` リストに `features/support/mock-installer.ts` が含まれているため、ステップ定義ファイル（`common.steps.ts` 等）の `import * as AuthService from '../../src/lib/services/auth-service'` が評価された時点で、`auth-service.ts` 内の `import * as UserRepository` も解決済みになる。

その後 `BeforeAll` で `require.cache[userRepoPath] = mock` を設定しても、`auth-service.ts` が内部で保持している `UserRepository` の参照はすでに実際のリポジトリオブジェクトを指しており、モック差し替えが効かない。

現在の `register-mocks.js` は Supabase クライアントのみキャッシュに差し込んでいるが、Supabase クライアントの差し替えのみではリポジトリの `create` 関数が実際の DB（null を返すダミー）を呼んでしまう。

### 観察された挙動

```
56 scenarios (55 failed, 1 undefined)
303 steps (55 failed, 12 undefined, 228 skipped, 8 passed)
```

incentive.feature を含む全 feature の Background (`ユーザーがログイン済みである`) で失敗。

### 追加の問題

TASK-017 の `authentication.steps.ts` に以下のバグがある:

```typescript
When('ユーザーが \/auth-code で認証コードを送信する', ...)
```

`/` が Cucumber Expression の Alternative 構文と解釈され `CucumberExpressionError: Alternative may not be empty` が発生する。
ただしこれは実際のテスト実行には影響しておらず（エラーにはなるが処理は続行される）、根本原因は上記のモック差し替え問題である。

## 解決のための選択肢

### 案A: `register-mocks.js` を修正する（推奨）

`features/support/register-mocks.js` で Supabase クライアントに加えて全リポジトリも事前にキャッシュに差し込む。
TypeScript ファイルがロードされる前にキャッシュを埋めることで、import * as が解決時にモック実装を参照するようになる。

**制約**: `features/support/` 配下のインフラファイルは変更禁止（CLAUDE.md）。エスカレーション承認が必要。

### 案B: `register-mocks.js` を CommonJS インメモリ実装版に置き換える

インメモリリポジトリを CommonJS 形式で直接 `register-mocks.js` に埋め込む。
ただし TypeScript インターフェースとの型整合性が失われる。

### 案C: サービス層のインポートを動的化する（スコープ逸脱）

`auth-service.ts` 等を修正して `require()` による動的インポートに変更する。
サービス層コードの変更は広範囲に影響するため推奨しない。

## 推奨方針

**案Aを承認してください。** `register-mocks.js` に以下の変更を加えることでモック差し替えを機能させられます。

### 技術的検証結果

cucumber.js の処理順序は以下の通り:
1. `requireModule`: `ts-node/register`, `tsconfig-paths/register` が最初に処理される
2. `require`: ファイルリスト（`register-mocks.js` を含む）が処理される

`register-mocks.js` 実行時には ts-node が既に登録されており、TypeScript ファイルを `require()` できることを確認済み:

```javascript
// この時点で ts-node は登録済み
const inMemUser = require('./features/support/in-memory/user-repository.ts');
// → OK: keys: reset, _insert, findById, ...
```

### 具体的な修正内容（承認後に実施する）

`features/support/register-mocks.js` の末尾に以下を追加する:

```javascript
// 全リポジトリをキャッシュに事前差し込みする
// （TypeScript ファイルがロード時に import で解決する前にキャッシュを埋めることで
//   BeforeAll フックのタイミング問題を回避する）
const REPO_MOCKS = [
  ['src/lib/infrastructure/repositories/user-repository.ts', './in-memory/user-repository.ts'],
  ['src/lib/infrastructure/repositories/auth-code-repository.ts', './in-memory/auth-code-repository.ts'],
  ['src/lib/infrastructure/repositories/post-repository.ts', './in-memory/post-repository.ts'],
  ['src/lib/infrastructure/repositories/thread-repository.ts', './in-memory/thread-repository.ts'],
  ['src/lib/infrastructure/repositories/currency-repository.ts', './in-memory/currency-repository.ts'],
  ['src/lib/infrastructure/repositories/incentive-log-repository.ts', './in-memory/incentive-log-repository.ts'],
  ['src/lib/infrastructure/external/turnstile-client.ts', './in-memory/turnstile-client.ts'],
]

for (const [srcRelPath, mockRelPath] of REPO_MOCKS) {
  const srcPath = resolveFromRoot(srcRelPath)
  const mock = require(path.resolve(__dirname, mockRelPath))
  require.cache[srcPath] = {
    id: srcPath,
    filename: srcPath,
    loaded: true,
    exports: mock,
    parent: null,
    children: [],
    paths: [],
  }
}
console.log('[register-mocks] 全リポジトリのモック差し替えが完了しました')
```

## 影響範囲

- `features/support/register-mocks.js` のみの変更で解決可能
- 既存の vitest テストへの影響なし（vitest は独自のモック機構を使用）
- TASK-017 の成果物にも同様の問題があるため、同時に解決が必要

## 作業状況

- incentive.steps.ts の実装は完了（全 30 シナリオのステップ定義を記述済み）
- モック差し替えが機能すれば、シナリオの合格を確認・修正する準備ができている
- 現在の実装: `features/step_definitions/incentive.steps.ts`
