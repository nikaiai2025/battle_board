---
name: cf-workers-logs
description: Cloudflare Workers の蓄積ログ（最大72時間）を Observability Telemetry API で取得・表示する。console.log本文、リクエストURL、ステータスコード等を確認可能。
allowed-tools: Read, Bash, Grep, Glob
context: fork
---

# Cloudflare Workers ログ確認

Cloudflare Workers Observability Telemetry API を使い、蓄積済みログを取得する。

## 前提

`.env.prod` から以下を読み取る:

| 変数 | 用途 |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウントID |
| `CLOUDFLARE_OBSERVABILITY_TOKEN` | Observability API 専用トークン（Bearer認証） |

```bash
source .env.prod
```

トークンが未設定の場合はその旨を報告して終了する。

## API仕様

### エンドポイント

```
POST https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/workers/observability/telemetry/query
```

### 認証ヘッダ

```
Authorization: Bearer {CLOUDFLARE_OBSERVABILITY_TOKEN}
```

### リクエストボディ

```json
{
  "queryId": "events-query",
  "timeframe": {
    "from": "<開始 Unix ミリ秒>",
    "to": "<終了 Unix ミリ秒>"
  },
  "view": "events",
  "limit": <取得件数>,
  "parameters": {}
}
```

| パラメータ | 説明 |
|---|---|
| `queryId` | **`events-query` 固定**（他の値だと "Query not found" エラー） |
| `view` | `events`（個別ログ）/ `invocations`（リクエスト単位）/ `traces`（トレース） |
| `timeframe` | Unix ミリ秒。蓄積期間は最大72時間 |
| `limit` | 取得件数（デフォルト20程度で開始し、必要に応じて増やす） |
| `parameters` | 空オブジェクト `{}` を指定 |

## 実行手順

### 1. ログ取得

ユーザーの指示に応じて時間範囲と件数を調整する。デフォルトは直近1時間・20件。

```bash
source .env.prod
NOW_MS=$(($(date +%s)*1000))
FROM_MS=$(($NOW_MS - 3600000))  # 1時間前

curl -s "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/observability/telemetry/query" \
  -H "Authorization: Bearer $CLOUDFLARE_OBSERVABILITY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "queryId": "events-query",
    "timeframe": {"from": '$FROM_MS', "to": '$NOW_MS'},
    "view": "events",
    "limit": 20
  }'
```

### 2. 整形表示

レスポンスJSON を以下の形式で整形する:

```
[YYYY-MM-DD HH:MM:SS UTC] <level> | <HTTP method> <path> -> <status> | <outcome>
  message: <console.log 本文（先頭200文字）>
```

レスポンスの構造:
- `result.events.events[]` — イベント配列
- 各イベントのフィールド:
  - `timestamp` — Unix ミリ秒
  - `$metadata.message` — console.log 本文
  - `$metadata.level` — ログレベル (info/warn/error)
  - `$workers.event.request.url` — リクエストURL
  - `$workers.event.request.method` — HTTPメソッド
  - `$workers.event.response.status` — レスポンスステータス
  - `$workers.outcome` — ok / exception
  - `$workers.eventType` — fetch / cron
  - `source.url.path` — URLパス（otelデータセットの場合）

### 3. フィルタリング

ユーザーが条件を指定した場合、取得後にフィルタする:
- **エラーのみ**: `$metadata.level == "error"` または `$workers.outcome != "ok"`
- **特定パス**: `$workers.event.request.url` や `source.url.path` で部分一致
- **cronのみ**: `$workers.eventType == "cron"`

## 補足: 利用可能なキー一覧の取得

フィールド名が不明な場合は keys エンドポイントで確認できる:

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/observability/telemetry/keys" \
  -H "Authorization: Bearer $CLOUDFLARE_OBSERVABILITY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "timeframe": {"from": '$FROM_MS', "to": '$NOW_MS'},
    "view": "events"
  }'
```

## 制約

- `wrangler tail` はリアルタイム専用であり、蓄積ログの取得には使えない
- 蓄積期間は最大72時間（Free プラン）
- OAuth トークン（`wrangler login`）ではこのAPIの認証が通らない。専用 API Token が必要
