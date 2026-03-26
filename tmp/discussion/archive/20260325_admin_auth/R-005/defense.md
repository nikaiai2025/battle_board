# R-005 Defense Report — 通貨付与（正常/権限エラー）

レビュアー: Blue Team
日付: 2026-03-25

---

## ATK-005-1

**問題ID**: ATK-005-1
**判定**: REJECT

**根拠**:

本指摘は「`credit` 後の `getBalance` が別クエリのため、間に別操作が割り込むと `newBalance` が乖離する」という競合問題を指摘しているが、これが問題となる条件がBDDシナリオのスコープ外である。

`credit` 操作は `supabase/migrations/00004_create_rpc_functions.sql` で定義された PostgreSQL RPC 関数 `credit_currency(p_user_id UUID, p_amount INTEGER)` を経由しており、`balance = balance + p_amount` の atomic UPDATE として実行される。付与操作そのものの原子性は保証されている。

問題の本質は「`grantCurrency` が返す `newBalance` が "この付与によって確定した残高" でなく "取得時点の残高" であること」だが、BDD シナリオが検証しているのは `50 + 100 = 150` という最終残高の一致であり（`features/admin.feature @管理者が指定ユーザーに通貨を付与する`）、並行操作がない単一トランザクションのテスト環境ではこの検証は成立する。

並行操作による `newBalance` の乖離は、本番負荷環境で複数管理者が同一ユーザーへ同時付与する場合に限り顕在化する。しかし：

1. BDDシナリオ（D-03）は並行競合シナリオを定義していない。スコープ外の振る舞いである
2. レスポンスに含まれる `newBalance` は管理者への「操作完了後残高の参考値」に過ぎず、クライアントがこの値を正本として次の操作に使用する設計にはなっていない
3. 通貨の「正しい付与」は `credit_currency` RPC の atomic UPDATE によって保証されており、`newBalance` の取得精度はそれとは独立した関心事である

`newBalance` の応答値精度（レースコンディション時の参考値ズレ）は改善の余地があるが、現BDDシナリオの受け入れ基準違反ではなく、データ損失・セキュリティ侵害・サービス停止のいずれも引き起こさない。

---

## ATK-005-2

**問題ID**: ATK-005-2
**判定**: REJECT

**根拠**:

「`verifyAdminSession` が一切呼び出されない」という指摘は事実だが、これはプロジェクトのBDDテスト方針に基づく意図的な設計であり、欠陥ではない。

D-10（`docs/architecture/bdd_test_strategy.md`）§1「テストレベルの決定: サービス層テスト」に以下の通り明記されている：

> **結論:** サービス層の公開関数を直接呼び出す。APIルートは経由しない。
> **理由:** APIルートは「リクエスト受付 → Service呼び出し → レスポンス整形」の薄いアダプターであり、ビジネスロジックを持たない

BDDシナリオが検証する対象は「権限のないユーザーが通貨付与を試みると権限エラーになる」という振る舞いであり、その振る舞いは World の `isAdmin` フラグを通じて正しくシミュレートされている（`admin.steps.ts:1492–1508`）。

APIルート（`route.ts`）の `verifyAdminSession` 検証は別の保証層として機能している：

- `route.ts:47–53`: `ADMIN_SESSION_COOKIE` が存在しない場合は 403 を返す
- `route.ts:55–61`: `verifyAdminSession` が `null` を返した場合は 403 を返す

この APIルートの認証ロジックは Vitest 単体テストでカバーすべき対象であり、BDDテストが対象とする層とは分離されている（D-10 §1の方針に従う）。

仮に `verifyAdminSession` が常に `null` を返すバグがあった場合でも、それはAPIルートのユニットテストで検出すべき問題であり、BDDサービス層テストがAPIルートをバイパスしていることとは独立した問題である。BDDテストの構造的欠陥ではなく、テストレイヤの責務分担の問題である。

---

## ATK-005-3

**問題ID**: ATK-005-3
**判定**: ACCEPT（部分的）

**根拠**:

指摘は2つの問題を含んでいる。それぞれ評価する。

**[問題A] `route.ts` の amount 型チェックが整数判定を含まないことによるエラーメッセージの不整合**

REJECT。`route.ts:76–81` の `typeof amount !== "number"` チェックが整数を除外しないため、`99.9` のようなリクエストが `grantCurrency` に渡り、`admin-service.ts:389` の `!Number.isInteger(amount)` ではじかれる。その結果、エラーメッセージが `route.ts` からではなく `grantCurrency` 経由の `invalid_amount` ルートで返される。

エラーメッセージの出どころが変わるが、最終的なHTTPレスポンス（400 + エラー内容）は仕様上同等であり、クライアントが誤動作する具体的シナリオは存在しない。BDDシナリオも整数バリデーションのエラーパスを個別検証していない。

**[問題B] `Number.isInteger(1e308) === true` によるDB INTEGER型オーバーフロー**

ACCEPT。

`Number.isInteger(1e308)` は JavaScript において `true` を返すため（`1e308` は有限の浮動小数点数であり小数部がない）、`admin-service.ts:389` のガード `!Number.isInteger(amount) || amount <= 0` を通過する。

DB側の最終防御として `credit_currency` RPC の引数は `p_amount INTEGER`（PostgreSQL INTEGER: 最大 2,147,483,647 ≒ 2.1e9）と定義されており（`supabase/migrations/00004_create_rpc_functions.sql`）、`1e308` 相当の値はPostgreSQL によって `integer out of range` エラーとなり、`CurrencyRepository.credit` が例外をスローする。その例外は `route.ts:108–118` の catch ブロックで捕捉され 500 エラーとして返される。

データ破壊は発生しないが：

- 500 エラーが返ることで管理者にサーバーエラーと誤認させる（本来は 400 であるべき）
- エラーログに DB エラーが記録される（無用なノイズ）
- BDDテストでこのパスはカバーされていない

再現条件が現実的（単純なリクエストボディ操作）であり、適切なレスポンスコードが返されないという問題があるため ACCEPT とする。ただしデータ損失は発生しない。

**推奨修正**: `route.ts` の amount バリデーションに `Number.isInteger(amount) && amount > 0 && amount <= Number.MAX_SAFE_INTEGER` チェックを追加し、400 を適切に返すよう修正すること。
