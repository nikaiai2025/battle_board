# Supabase Security Advisor 指摘事項と対応方針

> 調査日: 2026-03-29
> 結論: 全項目とも現行アーキテクチャでは実害なし。対応不要。

## 前提

本システムでは全DB操作をサーバーサイド（CF Workers / Next.js Server Component）から `service_role` キー経由で行っている。クライアントサイドから `anon` キーでSupabaseに直接アクセスするパスは存在しない。

---

## Errors: RLS Disabled in Public（3件）

| テーブル | マイグレーション | 用途 | 判定 |
|---|---|---|---|
| `dev_posts` | 00022 | 開発連絡板（認証不要の公開掲示板） | 問題なし |
| `daily_events` | 00024 | BOT日次イベント管理（内部専用） | 問題なし |
| `copipe_entries` | 00032 | AA/コピペマスタ（!copipeコマンド用） | 問題なし |

**なぜ問題ないか:** 3テーブルとも `supabaseAdmin`（service_role）経由でのみアクセスされる。クライアントからの直接クエリは不可。`dev_posts` はマイグレーション内で「認証不要・RLS不要」と設計意図を明記済み。

**RLSを有効化しない理由:** service_role はRLSをバイパスするため、有効化しても実質的な保護は追加されない。ポリシー定義の保守コストのみ増える。

---

## Warnings: Function Search Path Mutable（7件）

RPC関数に `SET search_path` が未設定。

| 関数 | SECURITY DEFINER | 呼び出し元 |
|---|---|---|
| `increment_thread_post_count` | No (INVOKER) | PostRepository |
| `credit_currency` | No | CurrencyRepository |
| `deduct_currency` | No | CurrencyRepository |
| `increment_bot_column` | No | BotRepository |
| `insert_post_with_next_number` | No | PostRepository |
| `bulk_update_daily_ids` | **Yes** | BotRepository（日次リセット） |
| `bulk_increment_survival_days` | **Yes** | BotRepository（日次リセット） |

**なぜ問題ないか:** 全関数とも service_role 経由の内部呼び出しのみ。外部ユーザーが search_path を操作して関数を呼び出す経路がない。

**注意点:** `SECURITY DEFINER` の2関数（bulk_update_daily_ids, bulk_increment_survival_days）は理論上 search_path 操作による権限昇格リスクがある。将来 `anon` キーでのRPC呼び出しを導入する場合は `SET search_path = 'public'` の追加が必須。

---

## Warnings: Leaked Password Protection Disabled（1件）

HaveIBeenPwned等と照合するパスワード漏洩チェック機能が無効。

**なぜ問題ないか:** Discord OAuth併用で純パスワードユーザーは限定的。有効化はSupabaseダッシュボードのトグル1つで可能（コード変更不要）。ユーザー増加時に有効化を検討。

---

## 将来の注意事項

以下のいずれかに該当する変更を行う場合、本ドキュメントの判定を見直すこと:

- クライアントサイドから `anon` キーで直接Supabaseにクエリする機能の追加
- PostgREST の Row Level Security ポリシーに依存するアクセス制御の導入
- `anon` ロールからRPC関数を呼び出すAPIの追加
