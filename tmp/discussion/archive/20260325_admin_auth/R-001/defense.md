# R-001 防御レポート

レビュアー: Blue Team
対象: レス削除（コメント付き/なし/権限エラー）

---

## ATK-001-1

**判定**: ACCEPT

**根拠**:

攻撃者の指摘は正確である。

問題の構造を整理する。

**BDDテスト戦略の前提**（`docs/architecture/bdd_test_strategy.md §1`）は「サービス層を直接呼び出し、APIルートは経由しない」であり、これ自体は意図的な設計判断である。しかしこの方針の副作用として、「APIルートの認証チェックが壊れても BDD テストでは検出できない」という死角が生まれている。

具体的に `admin.steps.ts:299-307` を確認すると:

```ts
When("レス >>5 の削除を試みる", async function (this: BattleBoardWorld) {
    if (!this.isAdmin) {
        this.lastResult = { type: "error", message: "権限がありません", code: "UNAUTHORIZED" };
        return;
    }
    // ...
```

`isAdmin` フラグはステップ定義内のモジュールスコープ変数であり、`AdminService.deletePost` も `verifyAdminSession` も呼び出されない。「管理者でないユーザーがレス削除を試みると権限エラーになる」シナリオは、`route.ts:65` の `verifyAdminSession` が常に `null` を返すバグを埋め込んでも引き続きグリーンになる。

**影響の評価**:
- `verifyAdminSession` は現在正しく実装されており、本番環境で即座に悪用できるバグは存在しない
- しかし「認証バイパスを検出できるテストが存在しない」という状態は、将来の変更（認証ライブラリのアップデート、Cookie名変更、`verifyAdminSession` の実装変更等）によって認証バイパスが混入しても CI で検出できないことを意味する
- レス削除は管理者専用操作であり、認証バイパスが発生した場合の影響は深刻（任意ユーザーがレスを削除可能になる）
- `docs/architecture/bdd_test_strategy.md §9` には認証 Cookie のテストを APIテストレベルで行う方針が存在するが、当該シナリオに対応するAPIテストは現時点で存在しない

BDDテスト戦略書がAPIルートを意図的にスコープ外にしている以上、当該シナリオの「権限エラー」検証をサービス層テストで完結させることには構造的な限界がある。APIテストを追加するか、または当該シナリオがサービス層では検証不能であることを明示する必要がある。

---

## ATK-001-2

**判定**: ACCEPT

**根拠**:

攻撃者の指摘する「実装とシナリオ期待値の乖離」および「テストがその乖離を隠蔽している」という両点について、コードを確認した。

**シナリオの期待値**（`context.md:13-16`）:
```
★システム
個人情報を含むため削除しました
```
DocString の2行目は `"個人情報を含むため削除しました"`（プレフィックスなし）。

**サービスの実装**（`admin-service.ts:123-124`）:
```ts
const systemMessageBody = comment
    ? `${ADMIN_DELETE_COMMENT_PREFIX}${comment}`
```
`ADMIN_DELETE_COMMENT_PREFIX` は `"🗑️ "`（`admin-service.ts:62`）であるため、実際に生成される `body` は `"🗑️ 個人情報を含むため削除しました"` になる。

**Thenステップの検証**（`admin.steps.ts:767-769`）:
```ts
systemPost.body.includes(expectedBodyContent) ||
    expectedBodyContent.includes(systemPost.body)
```
- 前者: `"🗑️ 個人情報を含むため削除しました".includes("個人情報を含むため削除しました")` → **true** → テスト通過
- 後者: 短い文字列が長い文字列に含まれるかの逆向き検証

前者の条件で通過してしまうため、プレフィックス `🗑️ ` が余分に付いていることはテストで検出されない。

この `includes` ベースの双方向検証は、より長い文字列が短い文字列を含むあらゆるケースでテストが通過してしまう緩すぎる検証であり、exact match を意図したシナリオには不適切である。

**影響の評価**:
- BDD シナリオの期待値（`body = "個人情報を含むため削除しました"`）と実際の挙動（`body = "🗑️ 個人情報を含むため削除しました"`）が乖離しており、ユーザーに見えるシステムレスに不要な絵文字が表示される
- 5ch専ブラ環境では絵文字がレンダリングできない可能性がある（専ブラ互換への影響）
- シナリオとサービス定数のどちらが正しいかは仕様確認が必要だが、いずれにせよ「テストが乖離を隠蔽している」問題は修正が必要

なお、コメントなし削除（フォールバックテンプレート）の場合は `ADMIN_DELETE_FALLBACK_TEMPLATE` 自体が `"🗑️ レス >>{postNumber} は管理者により削除されました"` であり、`context.md:24-27` の期待値も `"★システム\nレス >>3 は管理者により削除されました"` であることから、こちらも同様の `🗑️ ` 乖離が存在するが、同じ `includes` 検証により隠蔽されている。

---

## ATK-001-3

**判定**: REJECT（条件付き）

**根拠**:

攻撃者は「`postNumberToId` がシナリオ間でリセットされない」と指摘しているが、これは誤りである。

`hooks.ts:41-85` の `Before` フックを確認すると:
```ts
Before(async function (this: BattleBoardWorld) {
    resetAllStores();
    // ...
    this.reset();
});
```

各シナリオ開始前に `resetAllStores()` が呼ばれる。ただし `postNumberToId` は `admin.steps.ts:68` でモジュールスコープの `const postNumberToId = new Map()` として宣言されており、`resetAllStores()` はインメモリリポジトリ（PostRepo, ThreadRepo 等）をリセットするが、`postNumberToId` 自体はリセット対象に含まれていない。

よってマップ上のエントリは残存する。しかし問題が実際に顕在化するかを具体的に検討する。

**通常の逐次実行時**:
- 各シナリオの Given ステップ「スレッド "..." にレス >>N が存在する」で `postNumberToId.set(N, newPostId)` が実行される
- Before フックで InMemoryPostRepo は全クリアされる（`InMemoryPostRepo.reset()`）
- 直後の Given で新しい Post が作成され、新しい postId が `postNumberToId` に上書き登録される
- When ステップが参照する時点では既に上書き済みであるため、前シナリオの postId は参照されない

**攻撃者が主張する「Given ステップが走る前に When ステップが参照」**は、Cucumber の逐次実行モデルでは発生しない。Cucumber は Given → When → Then の順序を保証しており、並列実行は Cucumber.js のデフォルト設定では無効（`--parallel` を明示指定した場合のみ）。

**攻撃者が主張する「前シナリオの post が偶然 isDeleted = true」**については、Before フックで `InMemoryPostRepo.reset()` が走るため、前シナリオで作成・削除されたレコードは全て消去される。前シナリオの post が残存して誤検証を引き起こす経路は存在しない。

**残存するリスク**: `--parallel` オプションを使用した並列実行時には指摘の通り競合が発生しうる。ただし現在のプロジェクトで `--parallel` を使用しているエビデンスはなく、逐次実行が前提である。また、`postNumberToId` がリセットされない設計は技術的負債であり、明示的なリセット（Before フックへの追加）が望ましいが、現実の再現条件が並列実行限定である点で REJECT と判定する。

