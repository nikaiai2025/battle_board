# R-005 Attack Report — 通貨付与（正常/権限エラー）

レビュアー: Red Team
日付: 2026-03-25

---

## ATK-005-1

**重大度**: CRITICAL

**問題の要約**: `credit` 後に `getBalance` を独立クエリで取得するため、競合操作が挟まると `newBalance` がレスポンスに返る値と実際の残高が乖離する。

**詳細**:
`admin-service.ts:401–404` において、`credit` と `getBalance` は別々のDB操作として逐次実行される。

```
await credit(userId, amount, "admin_grant");        // 行401
const newBalance = await getBalance(userId);         // 行404
```

`credit` 完了後、`getBalance` 実行前に別の操作（例: 別管理者の重複付与、deduct操作）が割り込んだ場合、`newBalance` の値は「この付与後の残高」ではなく「後続操作後の残高」になる。シナリオが期待する `50 + 100 = 150` という因果関係のある残高確認が保証されない。

**再現条件**: 同一ユーザーに対して2件以上の通貨付与または消費が同時並行で実行されたとき。負荷が高い本番環境で顕在化する。

---

## ATK-005-2

**重大度**: CRITICAL

**問題の要約**: 権限エラーシナリオの BDD テストは `AdminService.grantCurrency` を一切呼び出さず、ステップ定義内のフラグ分岐だけで権限エラーを自己生成しており、APIルートの認証ロジックを全く検証していない。

**詳細**:
`admin.steps.ts:1492–1508` の `When("通貨付与APIを呼び出す")` は次の構造になっている。

```typescript
When("通貨付与APIを呼び出す", function (this: BattleBoardWorld) {
    if (!this.isAdmin) {
        this.lastResult = { type: "error", message: "権限がありません", code: "UNAUTHORIZED" };
        return;
    }
    // 管理者の場合も同じエラーを返す（到達しないはずという想定）
    this.lastResult = { type: "error", message: "権限がありません", code: "UNAUTHORIZED" };
});
```

`route.ts:47–61` で実装されている `ADMIN_SESSION_COOKIE` の検証（`verifyAdminSession`）は一切呼び出されない。コメントにも「BDD テストはサービス層テストのため、APIルートは経由しない」と明記されており（行1486）、認証バイパスの検証が構造的に欠落している。

`verifyAdminSession` が常に `null` を返す実装バグや、Cookieヘッダーの偽装があっても、このテストはパスし続ける。

**再現条件**: `verifyAdminSession` の実装が壊れている、またはCookie検証をバイパスする入力を送った場合。テストは常にグリーンだが本番で権限エラーが発生しない。

---

## ATK-005-3

**重大度**: HIGH

**問題の要約**: APIルートの `amount` バリデーション（`typeof amount !== "number"` チェック）は整数判定を行わないため、浮動小数点数が `AdminService.grantCurrency` に到達し得る。

**詳細**:
`route.ts:76–81` では `typeof amount !== "number"` の型チェックのみを行い、整数チェックは行わない。

```typescript
if (typeof amount !== "number") {  // 行76: 整数かどうかは確認しない
    return NextResponse.json(..., { status: 400 });
}
```

`{ "amount": 99.9 }` のようなリクエストはこのバリデーションを通過し、`grantCurrency(userId, 99.9, adminId)` が呼ばれる。`admin-service.ts:389` の `!Number.isInteger(amount)` で最終的にはじかれるが、`route.ts` が返すエラーメッセージは「amount は数値で指定してください（400）」ではなく `grantCurrency` から返った `invalid_amount` 経由の「amount は正の整数で指定してください（400）」になる。

これ自体はバグだが、より深刻な問題は `body.amount` に `{"amount": 1e308}` のような極端な浮動小数点を渡した場合、`Number.isInteger(1e308)` は `true` を返すため `admin-service.ts:389` のガードも通過し、DBに `1e308` 相当の残高加算が試みられる（DBの数値型オーバーフロー挙動に依存した動作となる）。

**再現条件**: リクエストボディに `{"amount": 1e308}` などの極大整数相当の浮動小数点を送信した場合。`Number.isInteger(1e308) === true` であるため両バリデーションを通過する。
