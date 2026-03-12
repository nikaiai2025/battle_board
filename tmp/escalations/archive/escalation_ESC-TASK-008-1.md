---
escalation_id: ESC-TASK-008-1
task_id: TASK-008
status: resolved
created_at: 2026-03-09T04:02:00+09:00
---

## 問題の内容

TASK-008 で `auth-service.ts` の `issueEdgeToken` 関数に `CurrencyService.initializeBalance` の呼び出しを追加した結果、既存の `auth-service.test.ts` の `issueEdgeToken` 関連テスト4件が失敗するようになった。

### 失敗の原因

`auth-service.test.ts` は `CurrencyRepository` をモックしていないため、`issueEdgeToken` 内で `initializeBalance` → `CurrencyRepository.create` が呼ばれると `supabaseAdmin.from(...).insert(...)` が未定義エラーになる。

```
TypeError: Cannot read properties of undefined (reading 'insert')
  at Module.create src/lib/infrastructure/repositories/currency-repository.ts:81:23
  at initializeBalance src/lib/services/currency-service.ts:107:28
  at Module.issueEdgeToken src/lib/services/auth-service.ts:210:9
```

### 失敗しているテスト（4件）

- `issueEdgeToken > 正常系 > 新しい edge-token とユーザーIDを返す`
- `issueEdgeToken > 正常系 > 異なる呼び出しで異なるトークンを生成する（CSPRNG）`
- `issueEdgeToken > 正常系 > UUID 形式のトークンを生成する`
- `issueEdgeToken > 正常系 > UserRepository.create を正しい引数で呼び出す`

## 選択肢と各選択肢の影響

### 選択肢A: `src/lib/services/__tests__/auth-service.test.ts` に `currency-service` のモックを追加する

`locked_files` 外のファイル変更が必要。
追加内容は以下の1ブロック:

```typescript
vi.mock('@/lib/services/currency-service', () => ({
  initializeBalance: vi.fn(),
}))
```

また、`issueEdgeToken` のテスト内で `initializeBalance` が正しく呼ばれることを検証するアサーションを追加することが望ましい。

**影響**: テストファイルのみ変更。外部から見える振る舞いへの影響なし。BDDシナリオへの影響なし。

### 選択肢B: `auth-service.ts` の `issueEdgeToken` から `CurrencyService` の依存を取り除き、`CurrencyRepository.create` を直接呼ぶ

`auth-service.ts`（locked_files内）のみ変更で済む。
しかし、auth-service が currency-repository を直接依存するのはアーキテクチャ違反に近い（service が他 service を経由すべき設計）。

**影響**: アーキテクチャ設計（D-08）で定義されたサービス層の分離原則に反する。

### 選択肢C: `auth-service.test.ts` を `locked_files` に追加し、変更を許可する

タスク指示書の更新（オーケストレーター担当）が必要。

**影響**: タスクスコープの拡張。選択肢Aと同一の変更内容となる。

## 推奨

**選択肢A** が最も適切。
テストファイルへの変更はユーザーから見た振る舞いを変えず、システム内部で完結する。
変更内容は `vi.mock` の追加と `initializeBalance` 呼び出しの検証アサーション追加のみで、リスクが低い。

## 関連するfeatureファイル・シナリオタグ

- `features/phase1/currency.feature` — `@新規ユーザー登録時に初期通貨 50 が付与される`
- `features/phase1/authentication.feature` — `@正しい認証コードとTurnstileで認証に成功する`
