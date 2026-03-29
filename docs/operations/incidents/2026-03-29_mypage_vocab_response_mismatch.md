# インシデント報告: マイページ語録APIレスポンス形状ミスマッチによるクラッシュ

> 日付: 2026-03-29
> 重大度: 高（マイページ全体がクラッシュし、全機能が利用不能）
> 発見手段: 本番スモークテスト（bdd-smoke）-- デプロイ後の自動検証
> 修正コミット: 71352b9

---

## 症状

Sprint-142 デプロイ後、`/mypage` で "Application error: a client-side exception has occurred" が表示される。Vercel / CF Workers 両環境で発生。

## Phase 1: 原因理解

### Q1. なぜ起きたか

**直接原因:**
`GET /api/mypage/vocabularies` は `{ entries: [...] }` オブジェクトを返すが、クライアント (`mypage/page.tsx`) が `(await res.json()) as Array<{...}>` で bare array としてキャスト。戻り値は `{ entries: [...] }` オブジェクトだが、`vocabList.map()` が呼ばれた時点で TypeError 発生（Object には map メソッドがない）。

```
APIレスポンス（実際）:
  { entries: [ { id: "...", word: "...", ... }, ... ] }

クライアントの期待:
  [ { id: "...", word: "...", ... }, ... ]

結果:
  ({ entries: [...] }).map() → TypeError: .map is not a function
```

**根本原因:**
TypeScript の `as` 型アサーションはランタイム検証を行わない。APIレスポンスの型とクライアント側の型定義が独立して管理されており、DRY違反の構造。新規API追加時にレスポンス形状の確認が漏れた。

### Q2. なぜ今まで気付かなかったか

| テスト層 | 検出可能か | 理由 |
|---|---|---|
| BDD サービス層テスト | 不可能 | InMemory実装はHTTP層を通過しないため、APIレスポンスの形状は検証対象外 |
| Vitest 単体テスト | 不可能 | サービス層以下を検証するものでHTTPレスポンス形状は検証範囲外 |
| 本番での利用実績 | N/A | 語録機能はSprint-142で新規追加されたため「今まで」動いていた歴史がない。初回デプロイで即座にクラッシュ |

Sprint-142のBDDテスト(16シナリオ)とvitest(56テスト)は全PASSだったが、いずれもHTTPレスポンス形状の検証は範囲外。

### Q3. なぜ今になって気付いたか

デプロイ後の自動スモークテスト（bdd-smoke）が `/mypage` のUI要素可視性テストで検出。仕組みによる検出であり、偶然ではない。

## ゲート: 真因検証

### Q4. 特定した原因は本当に真因か

**証拠:**
- APIルートのコード: `return NextResponse.json({ entries }, { status: 200 })` -- ラッパーオブジェクトで返却
- クライアントコード（修正前）: `const data = (await res.json()) as Array<{...}>` -- bare array を期待
- 修正後: `const json = (await res.json()) as { entries: Array<{...}> }; setVocabList(json.entries ?? [])` -- 正しくラッパーを展開
- 修正後にスモークテスト全PASS。真因で確定。

### Q4b. 他に隠れている要因はないか

- 語録登録API (POST) のレスポンスは flat object で返しており、クライアントもそのように受けている。問題なし
- fetchVocabList 成功後の setVocabList -> map() のパスは正常に動作。二次障害なし

## Phase 2: 対策

### Q5. 対策

クライアントの型アサーションを `{ entries: Array<{...}> }` に変更し、`json.entries ?? []` でフォールバック追加。

| 修正 | ファイル | 変更内容 |
|---|---|---|
| 型アサーション修正 | `src/app/mypage/page.tsx` | `as Array<{...}>` を `as { entries: Array<{...}> }` に変更、`.entries ?? []` で展開 |

コミット: 71352b9

### Q6. 対策による悪影響

- 変更箇所は `mypage/page.tsx` の1関数のみ。影響範囲は語録取得のfetch処理に限定
- 既存テスト（vitest 2211件、cucumber 414シナリオ）に影響なし

## Phase 3: 再発防止

### Q7. どうすれば防げていたか

**設計レベル:** APIレスポンス型を `src/types/` に共有定義し、route.ts と page.tsx の両方から import する構造であれば、型のズレは構造的に不可能だった。

**テストレベル:** BDDサービス層テストではHTTP層を通過しないため検出不能（LL-009で既知の限界）。API統合テストがあれば検出可能だったが、語録APIの統合テストは未作成だった。

### Q8. 今後の再発防止策

**防止（設計規約）:**
- 新規API追加時のレビューチェックリストに「クライアントの型アサーションがAPIの実レスポンス形状と一致しているか」を追加（コスト低、即時適用可）
- 新規API開発時は共有レスポンス型を `src/types/` に定義する規約を導入。既存APIへの適用は段階的に

**検出（スモークテスト）:**
本番スモークテスト（bdd-smoke）は今回正しく機能した。維持すること。

### Q9. 他にも同じ構造の問題がないか

コードベース全体で `(await res.json()) as Type` パターンを検索: 本番コードで35箇所。既存の35箇所には現時点で型ミスマッチは確認されなかった。

copipe API (`GET /api/mypage/copipe`) も `{ entries }` ラッパーで返す同一パターン。現時点でUIから直接fetchする箇所はないが、将来のUI実装時に同じ罠にかかるリスクあり。

## 教訓

See: `docs/architecture/lessons_learned.md` LL-016
