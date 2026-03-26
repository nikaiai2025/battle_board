# R-004 Defense Report

レビュアー: Blue Team
対象スプリント: Sprint-119 / Phase 3 本登録機能

---

## ATK-R004-1

**問題ID**: ATK-R004-1
**判定**: ACCEPT

**根拠**:

攻撃者の指摘は正しい。`GET /api/mypage` は `MypageInfo.patToken` を平文 JSON として返却しており、JavaScript から直接読み取り可能な状態になっている。

具体的な問題箇所:

- `mypage-service.ts:264` — `patToken: user.patToken` を MypageInfo に含める
- `src/app/api/mypage/route.ts:81` — `NextResponse.json(mypageInfo, { status: 200 })` でそのままレスポンス化

設計意図との矛盾も明確である。`mypage-service.ts:39-41` のコメントには「`authToken`（edge-token）はセキュリティ上の理由からレスポンスに含めない。Cookie で自動送信されるため JSON レスポンスでの返却は不要」と記載されており、CR-002 の除去理由として「認証資格情報を JSON に含めない」という設計判断が存在する。PAT も同じく「専ブラのメール欄に `#pat_<token>` 形式で設定するだけで edge-token Cookie を再発行できる認証資格情報」（`user_registration.feature:189-192`）であり、edge-token と同等の保護が必要である。

影響の評価:

- XSS が発生すると、攻撃スクリプトが `fetch('/api/mypage')` を実行して PAT を奪取できる
- 奪取した PAT を `bbs.cgi` のメール欄に設定するだけで、被害者として新しい edge-token Cookie を再発行できる
- PAT には有効期限がなく（再発行しない限り有効）、永続的な成りすまし書き込みが可能になる
- Cookie の HttpOnly フラグが保護する edge-token と異なり、PAT はこの経路では無防備

BDD シナリオ「マイページで PAT を確認できる」（`user_registration.feature:181-184`）は PAT をマイページ UI に表示することを要求しているが、これは UI での表示を意味する。API レスポンスが PAT 平文を返すことは別問題であり、UI 表示のみを目的とするなら API レスポンスを経由する必要はない（PAT はすでに初期レンダリング時に SSR で取得できる、またはマイページの初期データとしてサーバーコンポーネントで処理できる）。

---

## ATK-R004-2

**問題ID**: ATK-R004-2
**判定**: REJECT

**根拠**:

攻撃者が前提とする「フロントエンドが HTTP ステータスコードで制御フローを分岐しており、`404` を『ブロック対象外』として扱う実装」は実際のコードに存在しない。

`page.tsx:199-201` の `handleUpgrade` 実装を確認する:

```typescript
if (!res.ok) {
    setUpgradeError(data.message ?? "課金処理に失敗しました。");
    return;
}
```

フロントエンドは `res.ok`（HTTP ステータスが 200-299 かどうか）で分岐しており、`404` は `!res.ok` に該当するためエラー表示となる。`status === 409` のみをブロック条件にしているコードは存在しない。

また、`page.tsx:816` で課金ボタン自体が `disabled={!upgradeEnabled || isUpgrading}` となっており、`canUpgrade(mypageInfo)` が `false` を返す仮ユーザー（`registrationType === null`）に対してはボタンが無効化された状態で初期表示される（`mypage-display-rules.ts:148-154`）。つまり仮ユーザーが通常操作で `POST /api/mypage/upgrade` を呼ぶ経路はUI上存在しない。

攻撃者が指摘する「フロントエンドが課金失敗を『ユーザー不存在』と誤判定して課金ブロックを解除できる」シナリオは、現在の実装では成立しない。

なお、route.ts が `NOT_REGISTERED` を `404` にマッピングしている点はエラーコードの語義的な曖昧さ（「見つからない」vs「登録されていない」）として設計改善の余地があるが、現在のフロントエンドの処理では課金ブロックが解除される実害は発生しない。

---

## ATK-R004-3

**問題ID**: ATK-R004-3
**判定**: ACCEPT

**根拠**:

`mypage-service.test.ts` の `upgradeToPremium` テストスイート（426行目以降）を全件確認した結果、以下のケースのみが存在する:

- 正常系: 無料ユーザーが課金する（`FREE_USER` — `registrationType: "email"` の本登録済みユーザー）
- 異常系: 既に有料ユーザー（`ALREADY_PREMIUM`）
- エッジケース: ユーザーが存在しない（`USER_NOT_FOUND`）
- 異常系: DB 障害

`NOT_REGISTERED` コードを返す分岐（`mypage-service.ts:370-376`）のテストケースは存在しない。`FREE_USER` フィクスチャは `registrationType: "email"` を持つ本登録済みユーザーとして定義されており（`mypage-service.test.ts:74-75`）、`registrationType: null` のフィクスチャは定義されていない。

BDD レベルでは `mypage.steps.ts:517-537` に「課金ボタンは無効化されている」ステップがあり、`NOT_REGISTERED` コードも許容対象として検証されている。しかし BDD はインメモリリポジトリを使う統合テストであり、サービス単体の回帰保護としては不十分である。

攻撃者が指摘する通り、将来の `upgradeToPremium` リファクタリングで `registrationType` の判定ロジックが変更・削除された場合、単体テストはグリーンのまま `NOT_REGISTERED` 分岐の破壊を検出できない。`npx vitest run` のみを CI で実行した場合、BDD テストをスキップすると仮ユーザーの課金制約の破壊が全く検出されないリスクは現実的である。

単体テストに `registrationType: null` の仮ユーザーフィクスチャと `NOT_REGISTERED` を検証するケースを追加する必要がある。
