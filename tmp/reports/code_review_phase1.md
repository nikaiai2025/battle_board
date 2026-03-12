# Phase 1 コードレビューレポート

> レビュー日: 2026-03-13
> 対象: Sprint-9/10 で追加・変更されたソースコード
> レビュアー: AI Architect

---

## サマリー

| Severity | 件数 |
|---|---|
| Critical | 2 |
| Warning | 5 |
| Info | 5 |

---

## Critical

### CR-001: Cookie名の不一致 — `edge_token` vs `edge-token`

**ファイル:**
- `src/lib/infrastructure/adapters/bbs-cgi-parser.ts` (L50): `EDGE_TOKEN_COOKIE = "edge_token"`（アンダースコア）
- `src/app/(senbra)/test/bbs.cgi/route.ts` (L248): `edge-token=${edgeToken}`（ハイフン）
- `src/app/api/mypage/route.ts` (L34): `req.cookies.get('edge-token')`（ハイフン）
- `src/app/api/auth/auth-code/route.ts` (L111): `cookieStore.get('edge_token')`（アンダースコア）

**問題:** BbsCgiParserはCookieから `edge_token`（アンダースコア）を探すが、bbs.cgi route.tsの`setEdgeTokenCookie`は `edge-token`（ハイフン）でSet-Cookieを発行する。これにより専ブラ経由で認証後に書き込みを行った際、edge-tokenが正しく読み取れず認証フローが無限ループする。mypage routeもハイフン版を参照しており、auth-code routeはアンダースコア版を参照しており、プロジェクト全体でCookie名が統一されていない。

**修正方針:** Cookie名をプロジェクト全体で1つに統一する。どちらを採用するか決定し、全箇所を同期更新すること。

---

### CR-002: MypageInfo に authToken を含めてAPIレスポンスとして返却している

**ファイル:**
- `src/lib/services/mypage-service.ts` (L39, L116): `MypageInfo.authToken` フィールド
- `src/app/api/mypage/route.ts` (L62): `NextResponse.json(mypageInfo)` でそのまま返却

**問題:** `MypageInfo` に `authToken`（edge-tokenの生値）が含まれており、`GET /api/mypage` のレスポンスJSONにそのまま出力される。edge-tokenはセッション認証の秘密情報であり、APIレスポンスのボディに含めることはセキュリティリスクとなる。XSSがあった場合にトークンが窃取される。HTTPOnly Cookieで保護しているトークンをJSONレスポンスで漏洩させるのは矛盾している。

**CLAUDE.md制約との関係:** 「環境変数（APIキー等）をクライアントサイドコードに含めることを禁止する」の趣旨に照らし、認証トークンのクライアント返却も避けるべき。

**修正方針:** `MypageInfo` から `authToken` フィールドを削除する。クライアントが認証トークンを知る必要はない（Cookieで自動送信されるため）。

---

## Warning

### CR-003: DATルートがRepositoryを直接参照している（レイヤ依存方向の部分的逸脱）

**ファイル:**
- `src/app/(senbra)/[boardId]/dat/[threadKey].dat/route.ts` (L22-23): `ThreadRepository`, `PostRepository` を直接import
- `src/app/(senbra)/test/bbs.cgi/route.ts` (L31): `ThreadRepository` を直接import

**問題:** Source_Layout.mdの依存方向ルールでは `app/ → services/ → infrastructure/` であり、`app/`が`infrastructure/repositories/`を直接呼ぶことは原則禁止されている。ただし、D-07 §3.3やsenbra-adapter.md §5.1で専ブラAdapterがThreadRepository/PostRepositoryに直接依存することは設計上認められている（「Route Handler経由で間接的に依存」と記載）。

**判定:** 設計書(D-08)では許容されているが、Source_Layout.mdのルールとは矛盾がある。設計書の明示的な許容として受容可能だが、将来的にService層を経由する形にリファクタリングすることが望ましい。bbs.cgi route.tsの `ThreadRepository.findByThreadKey` は PostService に委ねる方が一貫性がある。

---

### CR-004: admin-service.ts の deleteThread で全レス個別ソフトデリートの非効率

**ファイル:** `src/lib/services/admin-service.ts` (L121-122)

```typescript
const posts = await PostRepository.findByThreadId(threadId)
await Promise.all(posts.map((post) => PostRepository.softDelete(post.id)))
```

**問題:** スレッド内の全レスを個別に取得し、1件ずつsoftDeleteを発行している。レス数が増えると N+1 の UPDATE クエリが発生する。`PostRepository.softDeleteByThreadId(threadId)` のようなバッチ操作が望ましい。

**リスク:** 大量レスのスレッド削除時にパフォーマンス劣化、トランザクション肥大化。MVP初期の規模では直ちに問題にはならないが、早期に改善すべき。

---

### CR-005: Range差分応答で全DATを構築してからスライスしている

**ファイル:** `src/app/(senbra)/[boardId]/dat/[threadKey].dat/route.ts` (L152-192)

**問題:** `handleRangeRequest` は「差分レスのみを構築（コスト削減）」とsenbra-adapter.md §4で規定されているが、実装では全レスを取得し全DATを構築してからバイトスライスしている（L157-163）。コメント（L145-147）で「全構築してスライスする方が正確で単純」と判断理由が記載されており、意図的な乖離ではあるが、設計書との不一致は記録しておく。

**リスク:** レス数が増加すると差分リクエストのたびに全レスをDBから取得・全DAT構築することになり、本来の差分応答のメリットが得られない。

---

### CR-006: bbs.cgi route.ts の createPost 結果の型が不安定

**ファイル:** `src/app/(senbra)/test/bbs.cgi/route.ts` (L220-224)

```typescript
if ("authRequired" in result && result.authRequired) {
    const authHtml = responseBuilder.buildAuthRequired(result.code, result.edgeToken);
```

**問題:** `result` の型を `"authRequired" in result` で動的にチェックしており、`result.code` や `result.edgeToken` へのアクセスが型安全でない。PostServiceの戻り値型が判別共用体（Discriminated Union）として適切に設計されていれば、`in` チェックではなくDiscriminatorによる絞り込みが可能なはず。現状では型推論が効かず、プロパティアクセスがanyに近い状態になっている可能性がある。

---

### CR-007: bbs.cgi route.ts の IP 取得フォールバックが `127.0.0.1`

**ファイル:** `src/app/(senbra)/test/bbs.cgi/route.ts` (L49-56)

**問題:** `x-forwarded-for` も `x-real-ip` もない場合に `127.0.0.1` をフォールバック値としている。Vercel環境ではこれらのヘッダは常に設定されるため実害は低いが、ローカル開発時や予期しないプロキシ構成の場合、全ユーザーが同一IPハッシュを持つことになり、日次リセットIDの衝突やセキュリティ上の問題が発生する。

---

## Info

### CR-008: DatFormatter が ShiftJisEncoder を内部で保持している

**ファイル:** `src/lib/infrastructure/adapters/dat-formatter.ts` (L39)

**観察:** DatFormatterはUTF-8文字列を返す責務だが、`calcShiftJisLineBytes` のためにShiftJisEncoderのインスタンスを内部で保持している。senbra-adapter.md §3では「ShiftJisEncoderへの変換は呼び出し元（Route Handler）が行う」とされている。`calcShiftJisLineBytes` はバイト数計算のための補助メソッドなので許容範囲だが、エンコーダへの依存がアダプター内に閉じていることを明示するコメントがあるとよい。

---

### CR-009: admin-service.ts の監査ログが console.info のみ

**ファイル:** `src/lib/services/admin-service.ts` (L82-84, L125-127)

**観察:** admin.md §3.1で `AuditLogRepository (将来)` と記載されており、現時点では `console.info` による簡易ログで問題ない。ただし、本番運用前にはVercelのログ保持期間の制約を考慮し、構造化ログまたはDB記録への移行が必要。コメントで将来の移行を示唆しており、設計意図は明確。

---

### CR-010: BbsCgiResponseBuilder.buildAuthRequired の認証URL構成

**ファイル:** `src/lib/infrastructure/adapters/bbs-cgi-response.ts` (L81-95)

**観察:** 認証URLに `code` と `token` をクエリパラメータとして埋め込んでいる。認証コードは一時的な値であり、有効期限もあるため現時点では許容範囲。ただし `edgeToken` をURLに含めることはブラウザの履歴やサーバーログにトークンが残るリスクがある。専ブラ向けの特殊な導線であるため優先度は低い。

---

### CR-011: エラーハンドリングの一貫性は概ね良好

**観察:** レビュー対象全ファイルにおいて、以下の点でエラーハンドリングは一貫している:
- サービス層: Result型（`{ success: true } | { success: false; reason: ... }`）で業務エラーを表現
- Route Handler層: HTTP ステータスコードへの適切なマッピング（400/401/403/404）
- 例外: try-catch は I/O 操作のみに限定し、業務エラーは例外を使わない方針が守られている

---

### CR-012: TypeScript型安全性は概ね良好

**観察:** `any` の使用は確認されなかった。型アサーション（`as`）は admin/login route.ts の JSON パース（L48）で使用されているが、直後に `typeof` チェックで入力バリデーションを行っており妥当。BbsCgiParsedRequest、MypageInfo、DeletePostResult 等の型定義は明確で、判別共用体パターンが適切に活用されている（CR-006で指摘したbbs.cgi route.tsの一部を除く）。

---

## 総評

Sprint-9/10のコードは全体的に品質が高く、設計書との整合性も概ね保たれている。ドキュメントコメントが充実しており、設計意図のトレーサビリティが優れている。

**早急に対処すべき事項:**
1. **CR-001（Critical）**: Cookie名の不一致は認証フローの破綻に直結するバグであり、最優先で修正が必要
2. **CR-002（Critical）**: authTokenのAPI公開はセキュリティ上の問題であり、MypageInfoから除去すべき

**計画的に対処すべき事項:**
3. CR-003: 専ブラRoute HandlerからのRepository直接参照のリファクタリング検討
4. CR-004: deleteThread のバッチ削除化
5. CR-005: Range差分応答の最適化（レス数増加に備えて）
