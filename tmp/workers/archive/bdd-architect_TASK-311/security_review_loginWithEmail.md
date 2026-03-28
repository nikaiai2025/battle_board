# セキュリティレビュー: loginWithEmail の使い捨てクライアント

> レビュー日: 2026-03-25
> レビュー対象: `src/lib/services/registration-service.ts` L212-247
> 関連: `src/lib/infrastructure/supabase/client.ts`

---

## 1. セキュリティ評価

### 1.1 判定: セキュリティ上の問題なし（設計意図は妥当）

使い捨てクライアントで `signInWithPassword` を呼ぶ設計は、セッション汚染を回避する正しいパターンである。

### 1.2 根拠

**セッション汚染の仕組み:**

Supabase JS クライアントは `signInWithPassword` 成功時に内部のセッションストアを更新し、以後のリクエストの `Authorization` ヘッダーをユーザーの JWT に差し替える。シングルトン `supabaseAdmin`（service_role key）でこれを呼ぶと、以降の DB 操作が service_role ではなくユーザー JWT で実行され、RLS 違反でクエリが失敗する。

これは Supabase 公式ドキュメントでも注意喚起されている既知の問題である:

> "If you are getting an RLS error then you have a user session getting into the client. RLS is enforced based on the Authorization header and not the apikey header."

**Cloudflare Workers でも発生しうるか:**

Cloudflare Workers はモジュールスコープの変数がリクエスト間で共有される可能性がある（Isolate の再利用）。公式ドキュメントは「同一インスタンスに2つのリクエストがルーティングされる保証はないが、グローバルステートが保持される場合がある」と述べている。したがって、シングルトン `supabaseAdmin` のセッション汚染は Cloudflare Workers 環境でも現実的なリスクである。

**anon key vs service_role key:**

現在の `loginWithEmail` は anon key を使用している。`admin-user-repository.ts` の `createAuthClient` は service_role key を使用している。

| 方式 | anon key（現 loginWithEmail） | service_role key（現 admin） |
|---|---|---|
| RLS | 適用される | バイパスする |
| 認証の目的 | ユーザーの email/password を検証する | 同左 |
| 取得する情報 | user.id のみ（後続の DB 操作は supabaseAdmin で行う） | user.id + session token |
| セキュリティ | anon key はクライアント公開前提の鍵。漏洩リスクなし | service_role key がサーバーに閉じているなら問題なし |

loginWithEmail が anon key を使うのは、Supabase の推奨パターンである「認証クライアントと DB 操作クライアントの分離」に合致している。認証の検証のみが目的であり、RLS バイパスは不要なため、anon key で十分かつ適切。

### 1.3 先行事例との整合性

`admin-user-repository.ts` の `createAuthClient()` が同一の設計判断（使い捨てクライアント）を採用済みであり、過去のエスカレーション（ESC-TASK-198-1）で分析・決定されている。loginWithEmail は同じパターンの適用であり、設計方針は一貫している。

---

## 2. 問題: テスタビリティとアーキテクチャ違反

### 2.1 依存方向の違反（MUST FIX）

`registration-service.ts`（Service 層）が `@supabase/supabase-js` の `createClient` を直接 import している。これはプロジェクトのレイヤー規約に違反する:

```
src/app/ --> src/lib/services/ --> src/lib/domain/
                               --> src/lib/infrastructure/
```

Service 層は `infrastructure/` を経由して外部ライブラリにアクセスすべきであり、`@supabase/supabase-js` を直接 import してはならない。

### 2.2 テスト失敗の原因

`loginWithEmail` 内で `createClient` を直接呼び出しているため:

- **vitest**: `vi.mock("../../../lib/infrastructure/supabase/client")` のモックが `createClient` 呼び出しをカバーしない。テスト環境では `process.env.SUPABASE_URL` が未設定で空文字列になり、supabase-js の内部バリデーションが `"supabaseUrl is required"` エラーを投げる。
- **BDD (Cucumber)**: `register-mocks.js` は `supabase/client.ts` の require.cache を差し替えるが、`registration-service.ts` が直接 import する `@supabase/supabase-js` の `createClient` はモック対象外。同じ理由で同じエラーが発生する。

**失敗テスト（計8件）:**

| テストフレームワーク | 失敗数 | 失敗箇所 |
|---|---|---|
| vitest | 4件 | loginWithEmail の全4テスト |
| BDD (Cucumber) | 4件 | ログイン関連の4シナリオ |

---

## 3. 推奨修正方針

### 3.1 `client.ts` にファクトリ関数を追加する

```typescript
// src/lib/infrastructure/supabase/client.ts に追加

/**
 * 認証専用の使い捨てクライアントを生成する。
 *
 * signInWithPassword はクライアントのセッション状態を変更するため、
 * シングルトン supabaseAdmin で呼ぶとセッション汚染が発生する。
 * この関数は anon key + persistSession: false で使い捨てクライアントを返す。
 *
 * See: admin-user-repository.ts createAuthClient()（同一パターン）
 */
export function createAuthOnlyClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```

### 3.2 `registration-service.ts` の修正

```diff
- import { createClient } from "@supabase/supabase-js";
+ // createClient の直接 import を削除（レイヤー規約準拠）

- import { supabaseAdmin } from "../infrastructure/supabase/client";
+ import { supabaseAdmin, createAuthOnlyClient } from "../infrastructure/supabase/client";

  // loginWithEmail 内
- const authClient = createClient(
-   process.env.SUPABASE_URL ?? "",
-   process.env.SUPABASE_ANON_KEY ?? "",
-   { auth: { persistSession: false, autoRefreshToken: false } },
- );
+ const authClient = createAuthOnlyClient();
```

### 3.3 テストへの影響

この修正により:

- **vitest**: 既存の `vi.mock("../../../lib/infrastructure/supabase/client")` が `createAuthOnlyClient` もカバーする。モック定義に `createAuthOnlyClient` の戻り値（`{ auth: mockSupabaseAuth }` 相当）を追加すれば、4件のテスト失敗が解消される。
- **BDD**: `register-mocks.js` の `supabaseClientMock.exports` に `createAuthOnlyClient` を追加すれば、4件のシナリオ失敗が解消される。

### 3.4 admin-user-repository.ts との統合

`admin-user-repository.ts` の `createAuthClient()` は service_role key を使用しており、`loginWithEmail` の anon key とは用途が異なる。現状のまま別々に保持するのが適切。

ただし、`admin-user-repository.ts` も `@supabase/supabase-js` を直接 import しているため、同様のレイヤー違反がある。こちらも `client.ts` にファクトリ関数（service_role 版）を追加して統合することを推奨するが、本タスクのスコープ外とする。

---

## 4. 横展開確認

### 4.1 `@supabase/supabase-js` の直接 import 箇所

| ファイル | import 元 | 用途 | レイヤー違反 |
|---|---|---|---|
| `src/lib/infrastructure/supabase/client.ts` | `@supabase/supabase-js` | クライアント初期化（正当な Infrastructure 層） | なし |
| `src/lib/services/registration-service.ts` | `@supabase/supabase-js` | loginWithEmail 用使い捨てクライアント | **あり** |
| `src/lib/infrastructure/repositories/admin-user-repository.ts` | `@supabase/supabase-js` | 管理者ログイン用使い捨てクライアント | なし（Infrastructure 層内） |

### 4.2 評価

- `registration-service.ts` のみが Service 層からの直接 import であり、修正が必要
- `admin-user-repository.ts` は Infrastructure 層内のため規約上は問題ないが、`client.ts` に集約する方がクライアント生成ロジックの一元管理として望ましい（優先度: 低）

---

## 5. 結論

| 観点 | 判定 | 詳細 |
|---|---|---|
| セキュリティ | 問題なし | セッション汚染回避の設計意図は妥当。anon key + persistSession: false は Supabase 推奨パターンに合致 |
| アーキテクチャ | 要修正 | Service 層から `@supabase/supabase-js` の直接 import はレイヤー規約違反。`client.ts` にファクトリ関数を追加して解消 |
| テスタビリティ | 要修正 | 上記レイヤー違反が原因で vitest 4件 + BDD 4件 = 計8件のテスト失敗が発生。ファクトリ関数化で解消可能 |
| 横展開 | 軽微 | `admin-user-repository.ts` に類似パターンあるが、Infrastructure 層内のため緊急性は低い |

---

## 参考資料

- [Supabase Discussion #30739: Service Role with Next.js Backend](https://github.com/orgs/supabase/discussions/30739) -- 認証クライアントと DB 操作クライアントの分離パターン
- [Cloudflare Workers: How Workers works](https://developers.cloudflare.com/workers/reference/how-workers-works/) -- モジュールスコープの変数がリクエスト間で共有されうる仕様
- [Cloudflare Workers: Best Practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) -- グローバルステートを避ける推奨
