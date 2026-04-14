# Daily Maintenance 500 障害 調査レポート

- **調査日:** 2026-04-14
- **調査者:** auto-debugger
- **対象:** `.github/workflows/daily-maintenance.yml` → `POST {DEPLOY_URL}/api/internal/daily-reset`（Vercel）
- **症状:** HTTP 500 が17日連続発生
- **最後の成功:** 2026-03-26 16:04 UTC
- **最初の失敗:** 2026-03-27 15:02 UTC
- **直近失敗 run:** 24409525112（2026-04-14 16:02 UTC）

---

## 1. 結論（原因）

`bots.daily_id_date` 列は PostgreSQL `date` 型で定義されているが、RPC 関数 `bulk_update_daily_ids` はパラメータを `text` で受け取り、キャストなしで直接代入している。
PostgreSQL は `text -> date` の暗黙キャストを禁止しているため、毎回以下のエラーで 500 を返す:

```
Error: BotRepository.bulkUpdateDailyIds failed:
column "daily_id_date" is of type date but expression is of type text
```

---

## 2. 証拠

### 2.1 Vercel Runtime Log（手動再発火でキャプチャに成功）

手動 `gh workflow run daily-maintenance.yml`（run 24416678676）と同時に `vercel logs` をストリーム取得し、以下のログをキャプチャ:

```json
{
  "level": "error",
  "message": "[POST /api/internal/daily-reset] Unhandled error: Error: BotRepository.bulkUpdateDailyIds failed: column \"daily_id_date\" is of type date but expression is of type text\n    at Module.f (.next/server/chunks/src_lib_0ddbbb21._.js:1:9161)\n    at async w.performDailyReset (.next/server/chunks/_c2636f4e._.js:31:4701)\n    at async w (.next/server/chunks/_2e3db09b._.js:1:854)\n    at async d (.next/server/chunks/_2e3db09b._.js:1:4200)\n    at async l (.next/server/chunks/_2e3db09b._.js:1:5241)\n    at async Module.b (.next/server/chunks/_2e3db09b._.js:1:6319)",
  "timestampInMs": 1776192134746,
  "requestMethod": "POST",
  "requestPath": "/api/internal/daily-reset",
  "domain": "battle-board-uma.vercel.app",
  "responseStatusCode": -1
}
```

> `responseStatusCode: -1` は Vercel の内部表現（unhandled exception による関数クラッシュ）で、クライアントへは 500 が返る。

### 2.2 GitHub Actions Log（run 24416678676）

```
=== Daily Reset triggered at 2026-04-14T18:42:13Z ===
curl: (22) The requested URL returned error: 500
##[error]Process completed with exit code 22.
```

curl は `-fsS` 指定のため 500 時にレスポンス本文を表示せず、exit code 22 で終了。

### 2.3 該当コード

#### テーブル定義（正: `date` 型）

`supabase/migrations/00001_create_tables.sql` L105:

```sql
daily_id_date  DATE         NOT NULL,
```

#### RPC 関数定義（誤: `text` のまま代入）

`supabase/migrations/00037_fix_function_search_path.sql` L120-137（`00035_bulk_daily_reset_functions.sql` からの再定義、search_path 追加のみ）:

```sql
CREATE OR REPLACE FUNCTION bulk_update_daily_ids(
  p_bot_ids uuid[],
  p_daily_ids text[],
  p_daily_id_date text        -- ← text 型で受け取る
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE bots AS b
  SET daily_id = v.daily_id,
      daily_id_date = p_daily_id_date   -- ← text をそのまま date 列に代入 → 型エラー
  FROM unnest(p_bot_ids, p_daily_ids) AS v(id, daily_id)
  WHERE b.id = v.id;
END;
$$;
```

#### 呼び出し元

`src/lib/infrastructure/repositories/bot-repository.ts` L366-389:

```ts
export async function bulkUpdateDailyIds(
    entries: Array<{ botId: string; dailyId: string }>,
    dailyIdDate: string,   // YYYY-MM-DD の文字列
): Promise<void> {
    if (entries.length === 0) return;
    const botIds = entries.map((e) => e.botId);
    const dailyIds = entries.map((e) => e.dailyId);

    const { error } = await supabaseAdmin.rpc("bulk_update_daily_ids", {
        p_bot_ids: botIds,
        p_daily_ids: dailyIds,
        p_daily_id_date: dailyIdDate,
    });
    if (error) {
        throw new Error(`BotRepository.bulkUpdateDailyIds failed: ${error.message}`);
    }
}
```

### 2.4 呼び出しフロー

```
GitHub Actions daily-maintenance
  → POST /api/internal/daily-reset (Vercel)
    → BotService.performDailyReset()  (src/lib/services/bot-service.ts L957)
      → Step 1: botRepository.bulkUpdateDailyIds(entries, today="2026-04-14")
        → Supabase RPC bulk_update_daily_ids
          → UPDATE bots SET daily_id_date = p_daily_id_date  ← ここで型エラー
```

---

## 3. 回帰の経緯（コミット時系列）

| 日付 (JST) | コミット | 内容 | 関連 |
|---|---|---|---|
| 2026-03-26 | （最後の成功） | 旧実装: for ループで N回の個別 RPC 呼び出し。`updateDailyId(botId, dailyId, dailyIdDate)` が `dailyIdDate::date` 明示キャストを含んでいた可能性大 | 最後の成功日 |
| 2026-03-28 | `a80c90f` | インカーネーションモデル導入 | 最初の失敗の前日。これ自体は型エラーの主因ではない |
| 2026-03-29 | `bfae891` | **performDailyReset バッチ化**（TASK-355）。`bulk_update_daily_ids` RPC を追加したが、パラメータ型を `text` のまま date 列に代入 | **本障害の根本原因コミット** |
| 2026-04-13 | `e479099` | hiroyuki除外 | 本障害と無関係 |

3-27 の初回失敗は `bfae891` マージ前だが、3-29 以降に連続失敗している主原因はこのRPC型エラーで確定。
（3-27・3-28 の失敗原因はログ保持期間超過で直接確認できないが、`a80c90f` インカーネーション切替時の別バグの可能性があり、`bfae891` でその副作用修正と同時に新たな型バグが混入した形）

---

## 4. 修正方針

### 4.1 推奨: 新規マイグレーションで明示キャスト追加

```sql
-- supabase/migrations/00043_fix_bulk_update_daily_ids_cast.sql
CREATE OR REPLACE FUNCTION bulk_update_daily_ids(
  p_bot_ids uuid[],
  p_daily_ids text[],
  p_daily_id_date text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE bots AS b
  SET daily_id = v.daily_id,
      daily_id_date = p_daily_id_date::date   -- 明示キャスト
  FROM unnest(p_bot_ids, p_daily_ids) AS v(id, daily_id)
  WHERE b.id = v.id;
END;
$$;
```

### 4.2 代替: パラメータ型を date に変更

```sql
CREATE OR REPLACE FUNCTION bulk_update_daily_ids(
  p_bot_ids uuid[],
  p_daily_ids text[],
  p_daily_id_date date   -- date 型で受け取る
) RETURNS void
...
```

Supabase JS は ISO 形式文字列 (`"2026-04-14"`) を date 型に自動変換するため、呼び出し元変更は不要。

### 4.3 単体テストでの検知漏れ

- `src/__tests__/lib/services/bot-service.test.ts` は `InMemoryBotRepository` を使ったため、型ミスマッチを検知できていない
- 本修正に加えて、**実DBを叩く integration test**（または migration verification）を追加するのが望ましい（本依頼外）

---

## 5. 影響範囲（17日間の未実行影響）

`performDailyReset()` は Step 1 で例外 throw するため、Step 2-6 は**一度も実行されていない**。
さらに、daily-maintenance.yml の `daily-stats` ジョブは `needs: daily-reset` により同様に未実行。

| # | 処理 | 影響 |
|---|---|---|
| 1 | 全BOT偽装ID再生成 | BOT偽装IDが3/27固定化。同じ偽装IDで17日間書き込み → ゲーム上の推理破綻 |
| 2 | revealed → lurking | BOTマークが付いたまま。再潜伏不可 |
| 3 | survival_days +1 | 生存日数カウント停止（ランキング・統計に影響） |
| 4 | eliminated → 新世代 INSERT（インカーネーション） | 撃破済みBOTが is_active=false のまま復活せず。生存BOT数減少 → ラストボットボーナス誤発火の可能性 |
| 4.5 | 復活BOTの next_post_at 設定 | Step 4 未実行のため波及なし |
| 5 | attacks テーブル前日分クリーンアップ | 17日分のattacks行が肥大化 |
| 6 | 撃破済みチュートリアルBOTの削除 | 撃破済みチュートリアルBOT永続残存 |
| -- | daily-stats ジョブ | **日次統計データが17日分欠損** |

### 5.1 修正後の復旧作業

ワークフローを修正・デプロイした後も、**過去17日分の daily-stats データは自動回復しない**（当日分の集計のみ）。必要なら:

- 欠損日分の統計を手動で再集計する SQL スクリプトを作成して実行
- または daily-stats API の実装を確認し、日付指定で過去集計できるオプションを追加

---

## 6. 調査手順の記録（ログ取得の制約）

### 6.1 試行 1: `vercel logs <deployment>` （静的取得）
- `vercel logs` は **ストリーミング（follow）モード専用**で、過去ログのバッチ取得不可。
- `--since` フラグは存在しない。

### 6.2 試行 2: `vercel inspect <url> --logs`
- これは **ビルドログ**（`Deployment completed`, `Build cache uploaded` 等）のみ返し、Runtime ログは含まれない。

### 6.3 成功: `vercel logs` + `gh workflow run` の同時実行
- 別プロセスで `vercel logs` をバックグラウンド実行 → ストリーム待機
- その状態で `gh workflow run daily-maintenance.yml` を手動 trigger
- 約2秒後、500 発生とともに 1 件のエラーログがストリームに乗り、キャプチャ成功
- このログからスタックトレースとエラーメッセージを取得 → 原因特定

### 6.4 Vercel Hobby プランのログ保持制約
- Hobby プランでは Runtime Logs 保持期間が短く（約 1時間程度）、過去17日分のログはすでに失われている
- 今回の手法（再発火 + 同時ストリーム）で新規ログを取得することでこの制約を回避した

---

## 7. bdd-coding への引き継ぎ事項

| 項目 | 内容 |
|---|---|
| 症状 | Daily Maintenance ワークフロー `daily-reset` ジョブが連続17日 HTTP 500 |
| 根本原因 | PostgreSQL RPC `bulk_update_daily_ids` が `text` を `date` 列に暗黙キャスト不可で代入 |
| 修正対象 | `supabase/migrations/00043_*.sql`（新規）で `p_daily_id_date::date` 明示キャスト |
| 参考先 | 現在の定義は `00035_bulk_daily_reset_functions.sql` と `00037_fix_function_search_path.sql` |
| 検証 | 修正デプロイ後、`gh workflow run daily-maintenance.yml` で手動再発火し curl が 200 を返すことを確認 |
| 追加検討 | 過去17日分の daily-stats 欠損を補填するか（人間判断） |
