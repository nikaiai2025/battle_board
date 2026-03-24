# インシデント: 専ブラ認証フロー — findByTokenId の重複レコード障害

- **発見日:** 2026-03-25
- **影響:** 専ブラから2回以上書き込みを試みた後に認証すると、認証が必ず失敗する
- **修正コミット:** （本インシデント分析時点で未コミット）

## 症状

専ブラ → 通常ブラウザの認証フローで、Turnstile は成功するが「認証する」ボタンを押すと認証に失敗する。

## 再現手順

1. 専ブラで書き込み（Cookie なし）→ 認証案内HTML + Set-Cookie
2. 専ブラで再度書き込み（Cookie あり、未認証状態）→ 再び認証案内HTML
3. 通常ブラウザで認証URLを開く → Turnstile 通過 → 「認証する」→ **失敗**

## 直接原因

`AuthCodeRepository.findByTokenId()` が `.single()` を使用していたが、同一 `token_id` の `auth_codes` レコードが複数存在していた。`.single()` は結果が2行以上の場合にエラーを返し、エラーハンドラが `null` を返却 → `verifyAuth` が `{ success: false }` を返す。

問題のコード:

```typescript
// auth-code-repository.ts L158-163（修正前）
.from("auth_codes")
.select("*")
.eq("token_id", tokenId)
.single();  // ← 2行以上でエラー
```

## 根本原因

Sprint-110 で6桁認証コードを廃止した際、**認証レコードの検索キーがユニークなフィールド (`code`) から非ユニークなフィールド (`token_id`) に変更された**が、以下2点が見落とされた:

1. `findByTokenId` のクエリが `.single()` のまま（`.limit(1)` なし）
2. `issueAuthCode` が古い未検証レコードを削除せず新規 INSERT するため、同一 `token_id` で重複レコードが蓄積する

重複を生む具体的なパス（`post-service.ts` の `resolveAuth`）:

```typescript
// not_verified パス: 同じ edgeToken で新しい auth_codes レコードを作成
if (verifyResult.reason === "not_verified") {
    await AuthService.issueAuthCode(ipHash, edgeToken); // ← 2回目以降は重複
    return { authenticated: false, authRequired: { edgeToken } };
}
```

### Sprint-110 以前との比較

| 項目 | Sprint-110 以前 | Sprint-110 以後 |
|---|---|---|
| 検索キー | `code`（6桁コード、レコードごとにユニーク） | `token_id`（edge-token、複数レコードが共有しうる） |
| 検索関数 | `findByCode(code)` | `findByTokenId(tokenId)` |
| クエリ | `.eq("code", code).single()` | `.eq("token_id", tokenId).single()` |
| ユニーク保証 | 6桁コードはレコードごとに異なる値 → 常に0 or 1行 | token_id は再発行で重複 → 2行以上になりうる |

## 修正内容

| 修正 | ファイル | 内容 |
|---|---|---|
| A: 防御的修正 | `auth-code-repository.ts` | `findByTokenId` に `.order('created_at', desc).limit(1)` を追加 |
| B: 根本対処 | `auth-code-repository.ts` | `deleteUnverifiedByTokenId` 関数を新設 |
| B: 根本対処 | `auth-service.ts` | `issueAuthCode` の先頭で `deleteUnverifiedByTokenId` を呼び出し |
| C: BDD同期 | `in-memory/auth-code-repository.ts` | 上記A・Bに対応するインメモリ実装を追加 |
| D: テスト同期 | `auth-service.test.ts` | モック宣言に `deleteUnverifiedByTokenId` を追加 |

## テスト結果

| 指標 | 修正前 | 修正後 |
|---|---|---|
| vitest passed | 1782 | 1790 (+8) |
| BDD passed | 322 | 324 (+2) |
| BDD failed | 6 | 4 (-2) |

## なぜ検出できなかったか

1. **BDDサービス層テスト**: リポジトリをモック化しているため、`.single()` の実DB挙動（複数行エラー）は再現不可能
2. **単体テスト**: `findByTokenId` のモックは常に単一レコードを返す設定であり、「2回 `issueAuthCode` した後に `findByTokenId` する」シナリオは不在
3. **E2Eテスト**: 専ブラ認証フローは「1回書き込み → 認証」の正常パスのみカバー。「2回書き込み → 認証」のリトライパスはテストケース不在
4. **本番スモーク**: Web UI のみ検証。専ブラ固有のクロスブラウザ認証フローは対象外

**発見のトリガー**: 人間による専ブラ実機テスト（手動テスト）。偶然の発見ではないが、自動テストの仕組みによる検出でもない。

## 横展開: `.single()` の安全性分析

リポジトリ層の `.single()` 使用箇所（30件）を全件分類した:

| パターン | 件数 | 安全性 | 例 |
|---|---|---|---|
| `.insert().select().single()` | 11 | 安全（INSERT は常に1行） | `create()` 系全般 |
| `.eq("id", pk).single()` | 10 | 安全（PK は一意） | `findById()` 系全般 |
| `.eq(unique_col).single()` | 4 | 安全（UNIQUE制約あり） | `findByToken`, `findByThreadKey` |
| `.eq(compound_key).single()` | 3 | 安全（複合キーで一意） | `findByAttackerAndBot` 等 |
| `.limit(1).single()` | 2 | 安全（明示的に1行制限） | `findByWriteToken`, `findOldest` |
| **`.eq(non_unique).single()`** | **0** | — | **今回修正で解消済み** |

今回の修正により、非ユニーク列に対する `.single()` 呼び出しは 0 件となった。
