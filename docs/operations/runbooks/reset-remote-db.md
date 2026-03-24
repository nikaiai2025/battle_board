# 本番DBコンテンツリセット

> **本手順は必ず人間の監督下で実施すること。** AIが単独で実行してはならない。

## 概要

リモート Supabase DB のコンテンツデータ（スレッド・投稿・ゲーム活動）を全削除する。ユーザーとシードデータは保全される。テーブル構造・RLS・関数・マイグレーション履歴は保持される。

用途: リリース前の開発テストデータ全削除

## 方針

- **ユーザー保全**: users / edge_tokens / currencies / admin_users は TRUNCATE しない
- **シード保全**: 荒らし役ボット・固定スレッドは退避→状態リセット→復元（チュートリアル・煽りBOTは動的生成のため破棄）
- **テーブルリスト明示**: SQLスクリプトに対象テーブルを明記し、実行前に網羅性を確認する

### テーブル分類

| 分類 | 処理 | テーブル |
|---|---|---|
| TRUNCATE対象 | 全行削除 | threads, posts, bots, bot_posts, accusations, attacks, grass_reactions, incentive_logs, daily_events, daily_stats, pending_tutorials, pending_async_commands, auth_codes, ip_bans |
| 保全（ユーザー） | 変更なし（キャッシュカラムのみリセット） | users, edge_tokens, currencies, admin_users |
| 保全（シード） | 退避→TRUNCATE→復元 | bots の一部（荒らし役のみ）, threads の一部（固定スレッド）, posts の一部（固定スレッド1レス目） |
| 対象外 | リセットしない | dev_posts（開発連絡板。本番システムと独立） |

### 既知の副作用: ウェルカムシーケンス再発動

ユーザーを保全しつつ posts を削除すると、初回書き込み検出（`PostRepository.countByAuthorId === 0`）が全ユーザーで再び真になる。既存ユーザーがリセット後に書き込むと以下が発生する:

- +50 初回書き込みボーナス再付与
- 「Welcome to Underground...」システムメッセージ再表示
- チュートリアルBOTスポーンのキューイング

**リリース前のテスターのみの環境では許容可能。** 一般ユーザーが存在する環境でこの副作用が許容できない場合は、コンテンツリセット後にユーザーも全削除する:

```sql
TRUNCATE TABLE users, edge_tokens, currencies, admin_users RESTART IDENTITY CASCADE;
```

この場合、全ユーザーの再登録と管理者アカウントの再作成（`create-admin-account.md`）が必要になる。

## 事前確認（AIが実施）

### Step 1: 全テーブル一覧を取得

```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```

### Step 2: スクリプトとの突合

`supabase/snippets/reset_all_data.sql` 内の以下3リストと Step 1 の結果を突合する:

- Phase 2: TRUNCATE 対象
- ヘッダコメント: 保全対象 / 対象外

全テーブルがいずれかに分類されていることを確認する。どこにも載っていないテーブルがある場合:

| 判断項目 | YES の場合の対応 |
|---|---|
| ユーザー操作で行が生成されるか？ | TRUNCATE リストに追加 |
| マイグレーションでシードされるデータがあるか？ | Phase 1 の退避対象に追加 |
| 他テーブルへの FK を持つか？ | 退避テーブルから INSERT する際の順序を確認 |

### Step 3: ボット保全対象の確認

リセットSQLは荒らし役ボット (`bot_profile_key = '荒らし役'`) のみを保全する。これはスクリプト作成時に荒らし役しか常駐BOTが存在しなかったため。新たに常駐型BOTが追加実装されていないか、以下で確認すること:

```sql
SELECT DISTINCT bot_profile_key FROM bots;
```

マイグレーションでシードされる常駐BOT（荒らし役と同様に定期投稿する種別）が増えている場合は、`reset_all_data.sql` の Phase 1 の `WHERE bot_profile_key = '荒らし役'` 条件にその種別を追加する。

動的生成BOT（チュートリアル・煽り等、ユーザー操作をトリガーに生成されるもの）は復元不要。復元するとコンテキスト消失で cron が全件エラーになる。

### Step 4: スクリプト更新

差分があった場合、SQLスクリプトを更新してコミットする。

### Step 5: 人間に確認結果を報告し、実行の承認を得る

## 実行（人間が実施または承認の上でAIが実施）

### 方法A: Supabase SQL Editor

`supabase/snippets/reset_all_data.sql` の内容を Supabase Dashboard > SQL Editor にペーストして実行する。

### 方法B: CLI

```bash
npx supabase db query -f supabase/snippets/reset_all_data.sql --linked
```

## リセット後の作業（人間が実施）

リセット直後は固定スレッド（案内板）のみが存在する状態になる。

### 1. 固定スレッドの案内テキストを最新化

リセットで復元される固定スレッドは DB に保存されていた内容そのままであり、board_id やコマンド一覧が古い可能性がある。以下を実行して最新状態に上書きする:

```bash
# GitHub Actions から実行する場合
# Actions > Seed Pinned Thread > Run workflow

# CLI から実行する場合（要: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY）
npx tsx scripts/upsert-pinned-thread.ts
```

### 2. 動作確認

ボットは既存の非固定スレッドに書き込む設計のため、スレッドがないと自動投稿が開始されない。

1. **テストスレッドを作成する** — ブラウザまたは専ブラから新規スレッドを1つ立てる
2. **ユーザー書き込みの動作確認** — 作成したスレッドにレスを投稿できることを確認する
3. **ボット自動投稿の動作確認** — 次回の cron 実行後、ボットがスレッドに書き込んでいることを確認する

## 関連ファイル

| ファイル | 説明 |
|---|---|
| `supabase/snippets/reset_all_data.sql` | リセット用SQL（正本） |
| `scripts/upsert-pinned-thread.ts` | 固定スレッドの案内テキスト最新化（リセット後に実行） |
| `docs/operations/runbooks/create-admin-account.md` | 管理者アカウント作成（ユーザー全削除時に必要） |

> **廃止**: `scripts/reset-remote-db.mjs`（旧CLIスクリプト）はテーブル不足・シード保全なしのため使用禁止。
