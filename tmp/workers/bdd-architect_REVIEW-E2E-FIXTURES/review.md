# E2Eフィクスチャ方式移行 レビュー結果

> レビュー実施日: 2026-03-20
> レビュアー: bdd-architect (REVIEW-E2E-FIXTURES)

## 総合評価

移行は D-10 の設計方針に沿って実施されており、アーキテクチャ上の大きな問題はない。環境抽象化フィクスチャの設計、テストの環境分類（共通 / ローカル限定）、cleanup の遅延取得パターンはいずれも妥当である。以下に指摘事項を重要度順に列挙する。

---

## 指摘事項

### 1. [HIGH] bdd-smoke.md がテストファイルのパスを `e2e/prod/` と記載 -- 陳腐化

**箇所:** `.claude/agents/bdd-smoke.md` 63行目

```
テストファイルは `e2e/prod/` 配下に配置されている。
```

`e2e/prod/` は今回の移行で削除された。本番スモークテストは `playwright.prod.config.ts` で `e2e/smoke/` と `e2e/flows/` を `isProduction=true` で実行する構成に変わっている。bdd-smoke エージェントがこの古い記述に基づいて動作すると、テスト対象ディレクトリの認識を誤る可能性がある。

**対応案:** bdd-smoke.md のテスト対象セクションを現行構成に合わせて更新する。

---

### 2. [MEDIUM] `supabaseHeaders()` / `supabaseUrl()` が auth.fixture.ts と data.fixture.ts で重複定義

**箇所:**
- `e2e/fixtures/auth.fixture.ts` 22-34行目
- `e2e/fixtures/data.fixture.ts` 17-31行目

同一の関数が2ファイルに独立して定義されている。`supabaseHeaders()` は data.fixture.ts 側が `prefer` パラメータを受け取る拡張版であり、auth.fixture.ts 側は固定値。機能的に同じものが2箇所にある。

**対応案:** `e2e/fixtures/` 内に共有ヘルパー（例: `e2e/fixtures/supabase-helpers.ts`）を作成し、1箇所に統合する。修正の緊急性は低い（フィクスチャファイル内で閉じた重複であり、外部に影響しない）。

---

### 3. [MEDIUM] helpers/auth.ts と helpers/turnstile.ts のコメントが陳腐化

**箇所:**
- `e2e/helpers/auth.ts` 5行目: `basic-flow.spec.ts および navigation.spec.ts で共有する。`
- `e2e/helpers/turnstile.ts` 5行目: `basic-flow.spec.ts および navigation.spec.ts で共有する。`

実際の参照元は `auth-flow.spec.ts` のみ（navigation.spec.ts はフィクスチャ経由に移行済み、basic-flow.spec.ts は削除済み）。

**対応案:** コメントを `auth-flow.spec.ts で使用する。` に修正する。

---

### 4. [MEDIUM] auth-flow.spec.ts が `cleanupLocal` を fixtures の内部モジュールから直接 import

**箇所:** `e2e/flows/auth-flow.spec.ts` 14行目

```typescript
import { cleanupLocal } from "../fixtures/data.fixture";
```

`index.ts` のコメント（7行目）に `@playwright/test を直接 import しないこと（ローカル限定の auth-flow.spec.ts を除く）` と記載があり、auth-flow.spec.ts は fixtures の `test` / `expect` を import している。しかし `cleanupLocal` を fixtures 内部の個別モジュールから直接 import しており、フィクスチャの抽象化レイヤーをバイパスしている。

これはローカル限定テスト（`test.skip(isProduction)` で本番スキップ）であるため実害はない。ただし、cleanup フィクスチャが提供する `cleanup()` 関数（引数なし呼び出し）で同等のことが可能であり、フィクスチャ経由にすれば内部実装への依存が消える。

**対応案:** `beforeEach` 内で `cleanupLocal(request)` を `cleanup()` に置き換え、cleanup をフィクスチャ引数として受け取る。変更は小さいが必須ではない（ローカル限定のため）。

---

### 5. [LOW] basic-flow.spec.ts の `createdThreadIds` がテスト間で共有状態

**箇所:** `e2e/flows/basic-flow.spec.ts` 33行目

```typescript
const createdThreadIds: string[] = [];
```

この配列はモジュールスコープで宣言されており、各テストが `push` する。`afterAll` で使用する安全ネット用だが、`workers: 1` かつ `test.describe` 内のテストは直列実行されるため実害はない。ただし、Playwright は `afterAll` でフィクスチャにアクセスする際の制約があり（`request` は受け取れるが `isProduction` はカスタムフィクスチャのため受け取れない可能性がある）、afterAll の `isProduction` 参照が正しく動作するかは実行時検証が必要。

**対応案:** 現状のまま維持してよいが、afterAll でのフィクスチャ取得が想定通り動作するかテスト実行で確認すること。

---

### 6. [LOW] playwright.config.ts の testDir と projects の整合性

**箇所:** `playwright.config.ts` 42行目と104-125行目

```typescript
testDir: "./e2e",           // ルートレベル
projects: [
  { name: "e2e", testDir: "./e2e/flows" },
  { name: "smoke", testDir: "./e2e/smoke" },
  { name: "api", testDir: "./e2e/api" },
]
```

ルートレベルの `testDir` が `./e2e` であり、各プロジェクトが `testDir` でサブディレクトリを指定している。`npx playwright test` でプロジェクトを指定せずに実行した場合、3プロジェクト全てが実行される。`cf-smoke` はプロジェクト定義外のため実行されない。この動作は意図通りであり、LL-008 の教訓に照らしても問題ない。

テストファイル-プロジェクトのマッピング検証結果:

| テストファイル | ローカルプロジェクト | 本番プロジェクト |
|---|---|---|
| `e2e/flows/basic-flow.spec.ts` | e2e | prod-flows |
| `e2e/flows/auth-flow.spec.ts` | e2e | prod-flows (test.skip で自動スキップ) |
| `e2e/smoke/navigation.spec.ts` | smoke | prod-smoke |
| `e2e/api/auth-cookie.spec.ts` | api | (実行対象外) |
| `e2e/api/senbra-compat.spec.ts` | api | (実行対象外) |
| `e2e/cf-smoke/workers-compat.spec.ts` | (実行対象外) | (実行対象外) |

全テストファイルが意図通りの実行パスに割り当てられている。漏れ・重複なし。

---

### 7. [LOW] 本番 prod config の型アサーション

**箇所:** `playwright.prod.config.ts` 57行目、66行目

```typescript
} as (typeof devices)["Desktop Chrome"] & { isProduction: boolean },
```

`isProduction` はカスタムフィクスチャオプションであり、Playwright の標準型には含まれない。そのため型アサーションが必要になっている。コメントで理由が記載されており、この対処は妥当。Playwright がカスタムオプションの型推論を改善するまでの暫定措置として許容する。

**対応案:** 対応不要。

---

## レビュー観点ごとの判定

### 1. D-10 との整合性

**判定: 適合**

- SS10.1.1 のフィクスチャ表と実装が一致している
- SS10.3.1 のローカル限定テスト規約（`test.skip(isProduction, ...)`）を遵守している
- SS10.3.3 のファイル構成に準拠している
- SS10.3.4 の安全性制約（afterAll クリーンアップ、workers: 1）を遵守している
- `authenticate` ローカル実装の「DB直接シーディング」方針変更は D-10 に反映済み

### 2. コード品質

**判定: 良好（軽微な改善余地あり）**

- フィクスチャの型定義が明確で、JSDoc コメントが充実している
- `See:` コメントでドキュメントへのトレーサビリティが確保されている
- 環境分岐はフィクスチャ内に閉じ込められており、spec ファイルに `if (isProduction)` が漏れ出していない
- 軽微な重複（supabaseHeaders / supabaseUrl）とコメント陳腐化がある（指摘 #2, #3）

### 3. Playwright 設定

**判定: 正しい**

- ローカル config: projects が e2e/smoke/api に分離され、testDir 指定で正確にマッピングされている
- 本番 config: prod-smoke / prod-flows の2プロジェクト構成で、isProduction=true が注入されている
- webServer 設定は本番 config では省略（直接 URL アクセス）。正しい
- Turnstile キーの除去処理はローカル config のみに存在。正しい

### 4. 削除ファイルの安全性

**判定: 安全**

- `e2e/basic-flow.spec.ts`: `e2e/flows/basic-flow.spec.ts` + `e2e/flows/auth-flow.spec.ts` に分離移動済み。旧ファイルへの参照は `tmp/` 配下の過去レポート・タスクのみであり、実行に影響しない
- `e2e/prod/smoke.spec.ts`: フィクスチャの isProduction 切替で吸収済み。旧ファイルへの参照は `tmp/` 配下と `lessons_learned.md`（歴史的記録）のみ
- `e2e/helpers/database.ts`: 全 spec の import がフィクスチャ経由に切り替わり、参照ゼロを確認済み。削除済み
- `e2e/prod/` ディレクトリ: 存在しないことを glob で確認済み

### 5. セキュリティ

**判定: 問題なし**

- `.env.prod.smoke` は `.gitignore` に含まれている（`!.env.prod.smoke.example` で example ファイルのみ追跡）
- 本番認証情報（`PROD_SMOKE_EDGE_TOKEN`, `PROD_ADMIN_EMAIL`, `PROD_ADMIN_PASSWORD`）は環境変数経由でのみ参照されている
- クライアントサイドへの漏洩経路はない（フィクスチャはサーバーサイドの Playwright プロセスで実行される）
- CLAUDE.md の横断的制約（環境変数をクライアントサイドコードに含めない）に違反していない

### 6. テストカバレッジ

**判定: カバレッジ維持（一部拡充）**

移行前後の比較:

| カテゴリ | 移行前 | 移行後 |
|---|---|---|
| ナビゲーション (Phase A) | navigation.spec.ts (11テスト相当) | navigation.spec.ts (11テスト) -- 変更なし |
| フロー検証 (Phase B) | basic-flow.spec.ts (2テスト) | basic-flow.spec.ts (4テスト) + auth-flow.spec.ts (1テスト) |
| API テスト | 2ファイル | 2ファイル -- 変更なし |

Phase B のテストケースが2本から5本に増加（管理者削除、専ブラAPI整合、認証フロー独立化）。カバレッジは維持以上。

### 7. bdd-smoke への影響

**判定: 要修正（指摘 #1）**

bdd-smoke.md に `e2e/prod/` パスの参照が残存している。エージェントの動作手順（ステップ2: テスト実行コマンド `npx playwright test --config=playwright.prod.config.ts`）自体は正しいため、テスト実行には影響しないが、テスト対象セクションの記述が実態と乖離している。

### 8. 不整合・デッドコード

**判定: 軽微な残存あり（指摘 #2, #3, #4）**

- `supabaseHeaders` / `supabaseUrl` の重複定義（2ファイル間）
- helpers のコメント陳腐化（参照元が変更されたがコメント未更新）
- auth-flow.spec.ts の `cleanupLocal` 直接 import（フィクスチャバイパス）

いずれも動作に影響しないが、次回のメンテナンス時に混乱を招く可能性がある。

---

## 対応推奨の優先順位

| # | 重要度 | 内容 | 即時対応 |
|---|---|---|---|
| 1 | HIGH | bdd-smoke.md のパス更新 | 推奨 |
| 2 | MEDIUM | supabaseHeaders/Url の重複解消 | 次回メンテナンス時 |
| 3 | MEDIUM | helpers コメント陳腐化の修正 | 次回メンテナンス時 |
| 4 | MEDIUM | auth-flow.spec.ts の cleanupLocal 直接 import | 次回メンテナンス時 |
| 5 | LOW | createdThreadIds 共有状態の確認 | テスト実行時に確認 |
| 6 | LOW | testDir 整合性 | 対応不要（問題なし） |
| 7 | LOW | 型アサーション | 対応不要 |
