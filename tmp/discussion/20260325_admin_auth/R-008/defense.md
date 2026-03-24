# R-008 防御レポート

レビュアー: Blue Team
日付: 2026-03-25

---

## ATK-008-1

**問題ID**: ATK-008-1
**判定**: ACCEPT（部分同意）

**根拠**:

`route.ts:68-75`（PUT）および `route.ts:140-147`（DELETE）のコード構造は以下の通り:

```typescript
if (!result.success) {
    if (result.reason === "not_found") {
        return NextResponse.json(..., { status: 404 });
    }
    // ← ここに return がない
}

return NextResponse.json({ success: true });
```

現時点では `SetPremiumStatusResult` の `reason` は `"not_found"` のみ（`admin-service.ts:533-535`）であり、型上 `!result.success` かつ `result.reason !== "not_found"` となる組み合わせは存在しない。**現在のコードに実害はない。**

ただし Red Team の指摘は将来の拡張リスクとして正当である。`reason` に `"already_premium"` 等が追加された場合、内側の `if` が false となり外側ブロックを素通りして `200 { success: true }` が返る。TypeScript はこのパターンをコンパイルエラーとしない（narrowing が機能しない構造）。

**同意する点**: 防御的な `else` 節（または exhaustive check）を追加すべきである。例えば以下のように修正することで将来の reason 追加時のフォールスルーを防止できる:

```typescript
if (!result.success) {
    if (result.reason === "not_found") {
        return NextResponse.json(
            { error: "指定されたユーザーが見つかりません" },
            { status: 404 },
        );
    }
    // 網羅されていない reason への安全なフォールバック
    return NextResponse.json(
        { error: "INTERNAL_ERROR" },
        { status: 500 },
    );
}
```

現在は実害なし・再現条件も「将来の型拡張時」という限定的なものであるため、重大度は HIGH に相当（CRITICALとまでは言えない）。修正コストが低いため対処を推奨する。

---

## ATK-008-2

**問題ID**: ATK-008-2
**判定**: REJECT

**根拠**:

BDDテストがAPIルートを経由せずサービス層を直接呼び出すのは、プロジェクトの設計上の決定であり、`docs/architecture/bdd_test_strategy.md §1` に明示されている:

> **結論:** サービス層の公開関数を直接呼び出す。APIルート（Next.js Route Handler）は経由しない。
> **理由:** APIルートは「リクエスト受付 → Service呼び出し → レスポンス整形」の薄いアダプターであり、ビジネスロジックを持たない

認証（`verifyAdminSession`）は APIルートの責務であり、サービス層はadminIdを信頼済みの前提で受け取る設計である（`admin-service.ts:17`）。このアーキテクチャ上、BDDテストが `verifyAdminSession` を通らないのは欠陥ではなく意図した分離である。

「APIルートの `verifyAdminSession` 呼び出しを削除してもBDDがグリーン」という再現条件は、BDDテストに対して設計外の検証（HTTP層の認証確認）を求めるものであり、BDDシナリオのスコープ外である。BDDシナリオが記述するのは「管理者が操作を行うと結果が変わる」というビジネス振る舞いであり、Cookie検証の詳細は含まない。

なお、APIルートの認証バイパスは `route.ts:46-59` の単体テスト（`src/__tests__/api/admin/`）で別途カバーする責務である。そのテストが存在しないとすれば、それは「単体テストの不備」という別の課題であり、BDDの欠陥ではない。

---

## ATK-008-3

**問題ID**: ATK-008-3
**判定**: REJECT

**根拠**:

指摘の前提は「(1)findById と (2)updateIsPremium の間にユーザーが削除される」という競合状態である。

**現在のスコープでは発生しない**: プロジェクトは「削除はソフトデリートのみ（物理削除禁止）」を横断的制約として定めている（`admin-service.ts:18`）。現時点でユーザーの物理削除・論理削除機能は実装されておらず、BDDシナリオにも存在しない。「findById後にユーザーが削除される」というレースコンディションは、現在の実装では到達不能なコードパスである。

**将来の論理削除実装時について**: Red Team が言及する通り、将来ユーザー削除機能が追加された場合はこの問題が顕在化する可能性がある。しかし現時点でのスコープ外の仮定に基づく指摘は「BDDシナリオのスコープ外」に該当する。

**インメモリ実装との整合性**: `features/support/in-memory/user-repository.ts:195-198` の `updateIsPremium` は `if (user) { ... }` 構造でサイレントに何もしないが、これはサービス層が `findById` で存在確認済みの前提で呼び出すため、正常フローでは問題にならない。

**単体テストへの指摘について**: `admin-premium.test.ts:137,171` の `updateIsPremium` は `mockResolvedValue()` でモック済みであり、戻り値の型は `void`（`user-repository.ts` の型定義通り）である。影響行数を `updateIsPremium` から返す設計でない以上、テストが戻り値を検証しないのは正しい。影響行数の検証が必要になるのはユーザー削除機能の実装後であり、その時点でリポジトリインターフェース自体を変更すべき問題である。
