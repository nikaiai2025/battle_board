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

#### 実エラーのみ取得（デフォルト）

OpenNext の内部サブリクエストトレースや "Network connection lost."（クライアント接続断）などのノイズを除外し、真のアプリケーションエラーのみを取得する。

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
    "limit": 20,
    "parameters": {
      "filters": [{
        "kind": "group",
        "filterCombination": "and",
        "filters": [
          {"kind": "filter", "key": "$metadata.error", "operation": "exists", "type": "string", "value": ""},
          {"kind": "filter", "key": "$metadata.error", "operation": "not_includes", "type": "string", "value": "Network connection lost"}
        ]
      }]
    }
  }'
```

#### 全イベント取得（フィルタなし）

ノイズを含む全イベントを確認したい場合に使用する。

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
    "limit": 20,
    "parameters": {}
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
- 各イベントはネストされたオブジェクト構造（ドット区切りの平坦キーではない）:

```jsonc
{
  "timestamp": 1774627108699,          // Unix ミリ秒
  "dataset": "cloudflare-workers",
  "source": {
    "level": "error",                  // ログレベル
    "message": "..."                   // console.log 本文
  },
  "$metadata": {
    "level": "error",                  // ログレベル（sourceと同値）
    "error": "...",                     // エラー詳細（実エラーのみ存在）
    "message": "...",                   // console.log 本文
    "trigger": "POST /api/...",        // トリガー概要
    "service": "battle-board"
  },
  "$workers": {
    "outcome": "ok",                   // ok / exception / exceededCpu
    "eventType": "fetch",              // fetch / cron
    "scriptName": "battle-board",
    "event": {
      "request": {
        "url": "https://...",          // リクエストURL
        "method": "POST",             // HTTPメソッド
        "path": "/api/..."            // URLパス
      }
    }
  }
}
```

**注意:** APIのフィルタ条件ではドット区切り（`$metadata.error`）で指定するが、レスポンスJSONではネスト構造（`e['$metadata'].error`）でアクセスする。

### 3. フィルタリング

デフォルトクエリは実エラーのみを取得する。追加の絞り込みが必要な場合は `filters` 配列に条件を追加する。

**フィルタ構文:**
```json
{"kind": "filter", "key": "<フィールド>", "operation": "<演算子>", "type": "string", "value": "<値>"}
```

**利用可能な演算子:** `eq`, `neq`, `includes`, `not_includes`, `starts_with`, `regex`, `exists`, `is_null`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`

**複数条件の結合:** `kind: "group"` + `filterCombination: "and" | "or"` でグループ化（最大4段階ネスト可）

**よく使う条件:**
- **特定エラー文字列**: `{"key": "$metadata.error", "operation": "includes", "value": "..."}`
- **特定パス**: `{"key": "$workers.event.request.url", "operation": "includes", "value": "/api/..."}`
- **cronのみ**: `{"key": "$workers.eventType", "operation": "eq", "value": "cron"}`
- **HTTP 500のみ**: `{"key": "$workers.event.response.status", "operation": "eq", "type": "number", "value": 500}`

**ノイズに関する注意:**
- `$metadata.level == "error"` はフィルタに使わない。OpenNext の内部サブリクエストトレース（Supabase `/rest/v1/*` への正常な fetch）が大量に含まれる
- `$metadata.error` フィールドの `exists` + 特定ノイズの `not_includes` が最も信頼性の高い実エラー抽出方法

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
- ログの出力先は `ゴミ箱/` ディレクトリにすること（プロジェクトに残す価値のない一時ファイルのため）
