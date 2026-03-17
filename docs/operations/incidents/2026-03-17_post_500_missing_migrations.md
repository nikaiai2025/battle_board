# 障害記録: 本番環境で全書き込み操作が500エラー

> 発生日: 2026-03-17
> 検知方法: auto-debugger Phase B（書き込みテスト）
> 影響範囲: Web UI・専ブラ経由の全書き込み操作（スレッド作成・レス書き込み）
> 復旧完了: 2026-03-17

## 症状

- Web UI でスレッド作成ボタンを押すと「サーバー内部エラーが発生しました」と表示される
- `POST /api/threads` が HTTP 500 を返す
- GET（スレッド一覧・詳細表示）は正常に動作

## 原因

2つの問題が重なっていた。

### 原因1: マイグレーション未適用（00006〜00012）

本番 Supabase DB に対して、マイグレーション `00006_user_registration.sql` 〜 `00012_fix_ip_bans_unique.sql`（7本）が未適用だった。

コードは `ip_bans` テーブル（`00010_ban_system.sql` で定義）を参照する `IpBanRepository.isBanned()` を書き込み時に呼び出すが、テーブルが存在しないため例外が発生していた。

```
Error: IpBanRepository.isBanned failed: Could not find the table 'public.ip_bans' in the schema cache
```

**なぜ未適用だったか:**
- マイグレーションファイルはリポジトリに存在していたが、`supabase db push` が実行されていなかった
- デプロイパイプライン（GitHub Actions → Cloudflare Workers）はアプリケーションコードのみをデプロイし、DBマイグレーションは手動適用が必要な運用だった
- コード側のデプロイとDBマイグレーションの適用にタイムラグが生じ、コードが存在しないテーブルを参照する状態になっていた

### 原因2: inline_system_info カラムのマイグレーション未作成

`posts` テーブルの `inline_system_info` カラムが、コード（`post-repository.ts`）では使用されているが、マイグレーションSQLがそもそも作成されていなかった。

```
Error: PostRepository.create failed: Could not find the 'inline_system_info' column of 'posts' in the schema cache
```

原因1を解消した後、認証済みユーザーのスレッド作成時にこの2つ目のエラーが発現した。

## 対応

### 対応1: 未適用マイグレーションの一括適用

```bash
npx supabase migration list --linked  # 未適用を確認
npx supabase db push --linked          # 00006〜00012 を適用
```

### 対応2: 不足マイグレーションの作成・適用

`supabase/migrations/00013_add_inline_system_info.sql` を新規作成:

```sql
ALTER TABLE posts ADD COLUMN IF NOT EXISTS inline_system_info TEXT;
```

ローカル・本番の両方に適用:

```bash
npx supabase db push --linked   # 本番
npx supabase db reset            # ローカル
```

## 検証

修正後、以下の書き込みテスト（Phase B）を全項目パスで確認:

| # | テスト | 結果 |
|---|---|---|
| B-1 | スレッド作成 → AuthModal表示 | PASS |
| B-2 | Turnstile + 認証コード入力 | PASS |
| B-3 | 認証後スレッド作成リトライ | PASS |
| B-4 | スレッド内レス書き込み | PASS |
| B-5 | マイページ表示（残高・履歴） | PASS |

## 再発防止

1. **DBマイグレーションの適用漏れ検知:** デプロイ後に `supabase migration list --linked` で未適用マイグレーションがないことを確認するステップを検討する
2. **コードとマイグレーションの整合性:** 新しいカラムやテーブルを使用するコードを書く際は、対応するマイグレーションSQLが存在することを確認する

## 調査手法

- `wrangler tail battle-board --format pretty` で Cloudflare Workers のリアルタイムログを取得し、`console.error` の出力からエラーメッセージを特定した
- Playwright MCP 経由のブラウザ操作で本番UIから書き込みを再現し、500エラーの発生を確認した
