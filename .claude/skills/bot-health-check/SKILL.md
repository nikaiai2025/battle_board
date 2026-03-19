---
name: bot-health-check
description: BOTシステムの動作状況を一括確認し、正常/異常を判定するヘルスチェック。BOTが投稿しているか、日次リセットが正常か、DB状態に不整合がないかを診断しレポートを出力する。
allowed-tools: Read, Bash, Grep, Glob, Write
context: fork
---

# BOTヘルスチェック

BOTシステム全体の動作状況を確認し、ゴミ箱/ にレポートを出力する。

## 前提条件の確認

最初に以下を確認する。失敗した場合はレポートにエラーとして記録し、可能な範囲で続行する。

```bash
npx supabase db query "SELECT 1 AS connected;" --linked
```

## データ収集

### 1. BOTプロファイル定義

`config/bot_profiles.yaml` を読み、定義済みプロファイルの一覧を取得する。

記録する項目: プロファイル名、HP/最大HP、報酬パラメータ（base_reward, daily_bonus, attack_bonus）、固定メッセージ数

### 2. DB上のBOT状態

```sql
SELECT id, bot_profile_key, hp, max_hp, is_active, is_revealed,
       survival_days, total_posts, accused_count, times_attacked,
       next_post_at, eliminated_at, eliminated_by, daily_id_date,
       created_at
FROM bots
ORDER BY created_at;
```

### 3. 直近のBOT投稿活動

```sql
SELECT b.id, b.bot_profile_key, b.is_active,
       COUNT(bp.post_id) AS post_count_24h,
       MAX(p.created_at) AS last_post_at
FROM bots b
LEFT JOIN bot_posts bp ON b.id = bp.bot_id
LEFT JOIN posts p ON bp.post_id = p.id AND p.created_at > NOW() - INTERVAL '24 hours'
GROUP BY b.id, b.bot_profile_key, b.is_active
ORDER BY last_post_at DESC NULLS LAST;
```

### 4. 日次リセット状態

```sql
-- daily_id_dateが今日（JST）か確認
SELECT id, bot_profile_key, daily_id_date,
       (daily_id_date = (NOW() AT TIME ZONE 'Asia/Tokyo')::date) AS is_today
FROM bots;

-- 前日以前の攻撃レコードが残っていないか確認
SELECT COUNT(*) AS stale_attacks
FROM attacks
WHERE attack_date < (NOW() AT TIME ZONE 'Asia/Tokyo')::date;
```

### 5. BOT投稿の全期間サマリー

```sql
SELECT b.id, b.bot_profile_key, b.total_posts,
       COUNT(bp.post_id) AS actual_post_count,
       MIN(p.created_at) AS first_post_at,
       MAX(p.created_at) AS last_post_at
FROM bots b
LEFT JOIN bot_posts bp ON b.id = bp.bot_id
LEFT JOIN posts p ON bp.post_id = p.id
GROUP BY b.id, b.bot_profile_key, b.total_posts;
```

## 判定基準

収集データに対して以下の基準で正常/異常を判定する。

### 正常条件

| # | 項目 | 正常条件 |
|---|---|---|
| C1 | プロファイル整合性 | bot_profiles.yaml の全プロファイルに対応するDBレコードが存在する |
| C2 | next_post_at | is_active=true のBOTの next_post_at が NOW() から3時間以内 |
| C3 | HP整合性 | is_active=true のBOTの hp > 0 |
| C4 | 撃破整合性 | eliminated_at NOT NULL ↔ is_active=false が一致 |
| C5 | 直近投稿 | is_active=true のBOTが過去24時間以内に1件以上投稿している |
| C6 | 日次リセット | daily_id_date が今日（JST） |
| C7 | 攻撃レコード掃除 | 前日以前の攻撃レコードが0件 |
| C8 | total_posts整合性 | bots.total_posts と bot_posts の実件数が一致 |

### 総合判定

- **正常**: 全項目パス
- **要確認**: C5（直近投稿なし）のみ不合格（BOT作成直後やcron未実行の可能性）
- **異常**: C1〜C4, C6〜C8 のいずれかが不合格

## レポート出力

ファイルパス: `ゴミ箱/bot_health_check_{YYYY-MM-DD_HHmm}.md`

以下のフォーマットで出力する:

```markdown
# BOTヘルスチェックレポート

実行日時: {YYYY-MM-DD HH:mm JST}

## 総合判定: {正常 / 要確認 / 異常}

## 1. BOTプロファイル定義

（bot_profiles.yaml の内容テーブル）

## 2. DB上のBOT状態

（クエリ結果テーブル）

## 3. 直近24時間の投稿活動

（クエリ結果テーブル）

## 4. 日次リセット状態

（クエリ結果 + stale_attacks件数）

## 5. チェック結果

| # | 項目 | 結果 | 詳細 |
|---|---|---|---|
| C1 | プロファイル整合性 | OK/NG | ... |
| ... | ... | ... | ... |

## 6. 検出された問題（異常時のみ）

（異常項目の詳細と考えられる原因）
```
