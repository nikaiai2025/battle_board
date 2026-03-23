# 管理者ダッシュボード統計情報500エラー

- **発生日**: 2026-03-23（発見日。発生開始時期は不明）
- **影響**: 管理画面 `/admin` の統計カード4枚が表示されない（日次推移テーブルは正常）
- **影響環境**: Vercel / CF Workers 両方
- **修正コミット**: b95308b（Sprint-106）

## 症状

管理者ログイン後、ダッシュボードで「統計情報の取得に失敗しました。」が表示される。
`GET /api/admin/dashboard` が 500 を返す。`GET /api/admin/dashboard/history` は 200 で正常。

## 直接原因

`CurrencyRepository.sumAllBalances()` が PostgREST の集計構文 `balance.sum()` を使用していたが、Supabase環境で `Use of aggregate functions is not allowed` エラーとなった。

```typescript
// 修正前（エラー）
const { data, error } = await supabaseAdmin
  .from("currencies")
  .select("balance.sum()");

// 修正後
const { data, error } = await supabaseAdmin
  .from("currencies")
  .select("balance");
return (data as { balance: number }[]).reduce(
  (sum, row) => sum + row.balance, 0
);
```

## 根本原因

PostgREST v12+ の集計構文の利用可否はSupabaseプロジェクトの設定・バージョンに依存するが、コード実装時に実環境での動作確認が行われなかった。インフラ固有の機能を使う場合に、実環境での動作確認が開発プロセスに組み込まれていないことが構造的な原因。

## テストで検知できなかった理由

| テスト層 | 検出可否 | 理由 |
|---|---|---|
| 単体テスト | 不可能 | `vi.mock()` でリポジトリをモック化。PostgREST実クエリは実行されない |
| BDDサービス層テスト | 不可能 | InMemory実装は `Array.reduce()` で合算。PostgREST構文と無関係 |
| **統合テスト** | **検出可能だが未運用** | D-10 Section 8 で設計済み（`npx cucumber-js --profile integration` でInMemoryをSupabase Localに差し替え）。運用されていれば実DBで `balance.sum()` が実行され、エラーを検出できた |
| E2Eスモークテスト | 未実装 | 管理画面ダッシュボードAPIはスモークテスト対象外 |

**本質的な問題**: 検出手段（統合テスト）は設計済みだったが運用されていなかった。PostgREST固有構文・RPC定義不整合・RLSポリシー不備など、InMemory置換で原理的に検出不可能な問題は統合テストでのみカバーできる。

## 再発防止

1. **検出（最優先）**: D-10 Section 8 の統合テストを定常運用化する。今回のケースだけでなく、InMemory置換で原理的に検出不可能なインフラ層の問題全般をカバーできる
2. **防止**: PostgREST固有の高度な構文（集計関数 `.sum()` 等）の使用を避け、標準SELECT + JS処理に統一する
3. **検出（補助）**: 本番スモークテストに管理画面ダッシュボードAPIの到達性テストを追加

## 横展開

コードベース全体を検索した結果、`.sum()`, `.avg()`, `.count()`, `.min()`, `.max()` 等のPostgREST集計構文は他に使用箇所なし。

InMemory置換で検出不可能な他のリスクパターン（参考）:
- RPC関数の定義不整合（`credit_currency`, `deduct_currency` 等 — 本番稼働実績あり、現時点で顕在化なし）
- PostgREST `.or()` フィルター構文のタイポ
- RLSポリシーの不備
- いずれも統合テストの定常運用化でカバー可能
