# 開発連絡板リニューアル — タスクメモ

> 作成: 2026-03-22 アーキテクト作業の成果物
> 宛先: オーケストレーター

## 概要

開発連絡板（/dev/）を本番ロジックから完全に切り離し、認証不要・スレッドなし・JS不要のフラット型掲示板に作り替える。
UIは90年代CGI掲示板風のレトロデザイン（HTMLべた書き、`<style>` 直書き、Tailwind/コンポーネント不使用）。

## 関連ドキュメント（必読）

- `features/dev_board.feature` — BDDシナリオ（今回新設）
- `docs/architecture/architecture.md` §13 TDR-014 — 設計判断記録（今回追記済み）

## 実装スコープ

### 新設

| ファイル | 内容 |
|---|---|
| `supabase/migrations/00022_create_dev_posts.sql` | dev_posts テーブル（id, name, body, created_at の4カラム。RLS/インデックス不要） |
| `src/lib/infrastructure/repositories/dev-post-repository.ts` | dev_posts への SELECT / INSERT |
| `src/lib/services/dev-post-service.ts` | getPosts / createPost の2関数。本番 PostService に一切依存しない |
| `src/app/api/dev/posts/route.ts` | `<form method="POST">` を受けて INSERT → 302リダイレクトで /dev/ に戻す |

### 書き換え

| ファイル | 内容 |
|---|---|
| `src/app/(web)/dev/page.tsx` | 全面書き換え。PostService/ThreadCreateForm/ThreadList の import を全て除去し、dev-post-service から直接取得。HTMLべた書き+インラインCSS のレトロUI |

### 削除（既存コードからの除去）

| ファイル | 変更内容 |
|---|---|
| `src/app/(senbra)/bbsmenu.html/route.ts` | dev板リンク行の削除（L73: `<A HREF=".../dev/">開発連絡板</A><br>`） |
| `src/app/(senbra)/[boardId]/SETTING.TXT/route.ts` | dev項目の削除（L28-31: `dev: { title: "開発連絡板", ... }`） |

### 変更不要（確認済み）

| ファイル | 理由 |
|---|---|
| `scripts/upsert-pinned-thread` | 案内板本文の `/dev/` リンク。URLは変わらないためそのまま |
| `src/__tests__/lib/services/pinned-thread.test.ts` | 上記リンクの存在テスト。そのまま |
| `features/step_definitions/thread.steps.ts` | 同上 |
| 既存 threads/posts テーブルの boardId="dev" データ | 放置（量僅少、新テーブルへの移行不要） |

## 設計上の要点

- **本番との共有依存は `supabaseAdmin`（DB接続）のみ**。Service/Repository/API/UIは全て専用
- **認証なし**。誰でも書き込み可能
- **JS不要**。Server Component + HTML form POST + 302 リダイレクト。Client Component ゼロ
- **レトロUI**。ベージュ背景、テーブルレイアウト、システムフォント、CGI掲示板風の見た目
