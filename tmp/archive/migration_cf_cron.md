# Cloudflare Cron Triggers 移行計画書

> 作成日: 2026-03-21
> 根拠: D-07 TDR-013（BOT cron実行基盤の CF Cron Triggers 併用）

---

## 1. 概要

GitHub Actions cron（30分間隔）で駆動していた荒らし役BOTを Cloudflare Cron Triggers（5分間隔）に移行する。同時に、CF Cron を前提としたチュートリアルBOT（welcome.feature）を新規実装する。

### スコープ

| 対象 | 内容 |
|---|---|
| 荒らし役BOT | GitHub Actions → CF Cron に移行 |
| チュートリアルBOT | CF Cron 上に新規実装 |
| GitHub Actions bot-scheduler | AI API使用BOT専用に縮小（Phase 2では対象BOTなし） |

---

## 2. 完了済み

| 成果物 | 内容 |
|---|---|
| `features/welcome.feature` | ウェルカムシーケンス（①ボーナス ②システムメッセージ ③チュートリアルBOT） |
| `features/mypage.feature` v4 | 書き込み履歴のページネーション・検索 |
| `features/currency.feature` v5 | 初期通貨を「登録時50」→「登録時0」に変更 |
| `docs/requirements/ubiquitous_language.yaml` | 通貨定義の付与タイミング更新 |
| D-07 TDR-013 | CF Cron 採用の意思決定記録 |
| D-07 §2.2, §12.2 | 構成要素テーブル・定期ジョブ一覧の更新 |

---

## 3. 残作業

### 3.1 インフラ・設定

- [ ] **INF-1** `wrangler.toml` に cron triggers 設定を追加
- [ ] **INF-2** CF Workers secrets に `BOT_API_KEY` を設定（既存の GitHub Secrets と同値）

### 3.2 サーバーサイド

- [ ] **SRV-1** Workers `scheduled` イベントハンドラの実装
- [ ] **SRV-2** PostService: 初回書き込み検出 → ウェルカムシーケンス（①②）トリガー
- [ ] **SRV-3** `pending_tutorials` の仕組み（初回書き込み時に予約 → CF Cron で処理）
- [ ] **SRV-4** チュートリアルBOTのスポーンと書き込み（!w コマンド実行を含む）
- [ ] **SRV-5** チュートリアルBOT撃破時の固定報酬 +20
- [ ] **SRV-6** コマンドパイプラインの `isBotWrite=true` 対応（!w がBOT投稿でも処理されること）
- [ ] **SRV-7** daily-maintenance: 撃破済みチュートリアルBOTのクリーンアップ追加

### 3.3 データベース

- [ ] **DB-1** `bots` テーブル: チュートリアルBOT用の `bot_profile_key`（例: `tutorial`）
- [ ] **DB-2** チュートリアルBOT予約の仕組み（`pending_tutorials` テーブル or `users` フラグ）
- [ ] **DB-3** マイグレーションファイル作成

### 3.4 GitHub Actions

- [ ] **GHA-1** `bot-scheduler.yml`: BOT種別フィルタ追加（AI API使用BOTのみ対象）

### 3.5 ドキュメント

- [ ] **DOC-1** D-08 `bot.md`: チュートリアルBOT・CF Cron 実行の記述追加
- [ ] **DOC-2** D-06 screens: マイページ画面要素（ページネーション・検索）

### 3.6 テスト

- [ ] **TST-1** BDD step definitions: `welcome.feature`
- [ ] **TST-2** BDD step definitions: `mypage.feature`（ページネーション・検索）
- [ ] **TST-3** 単体テスト: チュートリアルBOTスポーンロジック
- [ ] **TST-4** 単体テスト: 初回書き込み検出
- [ ] **TST-5** 既存テスト: 荒らし役BOTのテストが CF Cron 移行後も PASS すること

---

## 4. 実施順序

依存関係に基づくフェーズ分割。各フェーズは独立してデプロイ可能。

### Phase A: CF Cron インフラ構築 + 荒らし役移行

```
INF-1 → INF-2 → SRV-1 → GHA-1 → TST-5
```

**ゴール:** 荒らし役BOTが CF Cron（5分間隔）から正常に動作する。

| # | 作業 | 詳細 |
|---|---|---|
| INF-1 | wrangler.toml | `[triggers]` セクションに `crons = ["*/5 * * * *"]` を追加 |
| INF-2 | CF secrets | `wrangler secret put BOT_API_KEY` で設定 |
| SRV-1 | scheduled ハンドラ | Workers の `scheduled` イベントで `/api/internal/bot/execute` を自己呼び出し。既存 API endpoint をそのまま利用。`WORKER_SELF_REFERENCE` バインディング（設定済み）で内部通信 |
| GHA-1 | bot-scheduler.yml | 即座に無効化 or AI API使用BOTフィルタ追加。Phase 2 では AI API BOTが存在しないため、実質的にジョブは空振りする |
| TST-5 | 既存テスト確認 | 荒らし役の BDD / 単体テストが全 PASS であること |

**Phase A の検証方法:**
1. `wrangler dev` でローカル起動し、`scheduled` イベントを手動トリガー（`wrangler dev --test-scheduled`）
2. 本番デプロイ後、CF ダッシュボードで cron 実行ログを確認
3. BOTの書き込みがスレッドに反映されることを目視確認

### Phase B: ウェルカムシーケンス（同期部分: ①②）

```
SRV-2 → TST-4
```

**ゴール:** 初回書き込み時にボーナス+50 とシステムメッセージが表示される。

| # | 作業 | 詳細 |
|---|---|---|
| SRV-2 | 初回書き込み検出 | PostService 内で「ユーザーの書き込み件数 == 0」を判定し、①通貨+50（CurrencyService経由）②独立システムレス（PostService.createPost でシステム投稿）を実行 |
| TST-4 | 単体テスト | 初回検出ロジック、2回目以降は非発動、仮→本登録昇格時は非発動 |

### Phase C: チュートリアルBOT（非同期部分: ③）

```
DB-1 → DB-2 → DB-3 → SRV-3 → SRV-4 → SRV-6 → SRV-5 → SRV-7 → TST-1 → TST-3
```

**ゴール:** 初回書き込みの5分以内にチュートリアルBOTが `!w` で反応し、ユーザーが撃破できる。

| # | 作業 | 詳細 |
|---|---|---|
| DB-1 | bots テーブル拡張 | `bot_profile_key = 'tutorial'` をプロファイルに追加。日次リセット対象外を示すフラグ（`is_tutorial` or プロファイルで判別） |
| DB-2 | pending 仕組み | `users.pending_tutorial_post_id` (NULL可) を追加、または `pending_tutorials` テーブルを新設。初回書き込み時に POST の ID を記録 |
| DB-3 | マイグレーション | DB-1, DB-2 をマイグレーションファイルに集約 |
| SRV-3 | pending 処理 | CF Cron 実行時に pending を検出 → チュートリアルBOTスポーン処理を呼び出し |
| SRV-4 | スポーン+書き込み | `bots` に tutorial プロファイルで INSERT → `executeBotPost()` で `>>N !w  新参おるやん🤣` を投稿 |
| SRV-6 | BOTコマンド実行 | コマンドパイプラインが `isBotWrite=true` でも `!w` を処理するよう確認・修正。コスト0 + 通貨残高なしでもパスすること |
| SRV-5 | 撃破報酬固定 | `elimination-reward.ts` で tutorial BOT の報酬を固定 +20 に。`bot_profiles.yaml` に `tutorial` プロファイル追加 |
| SRV-7 | クリーンアップ | `daily-maintenance.yml` の対象に「撃破済みチュートリアルBOTの削除（N日経過）」を追加 |
| TST-1 | BDD step defs | welcome.feature 全シナリオの step definitions |
| TST-3 | 単体テスト | スポーン、!w 実行、固定報酬計算 |

### Phase D: マイページ拡張

```
TST-2 → DOC-2
```

**ゴール:** 書き込み履歴のページネーション・検索が動作する。

| # | 作業 | 詳細 |
|---|---|---|
| TST-2 | BDD step defs | mypage.feature のページネーション・検索シナリオ |
| DOC-2 | D-06 screens | マイページ画面要素定義にページネーション・検索フォームを追加 |

※ Phase D は Phase A-C と独立。並行作業可能。

### Phase E: ドキュメント整備

| # | 作業 | 詳細 |
|---|---|---|
| DOC-1 | D-08 bot.md | チュートリアルBOTのライフサイクル、CF Cron 実行パス、Strategy 設計への位置づけ |

---

## 5. SRV-1 設計メモ: scheduled ハンドラの実装方式

`@opennextjs/cloudflare` が生成する `.open-next/worker.js` に `scheduled` ハンドラを追加する方法：

**案1: self-fetch 方式（推奨）**

```
scheduled イベント
  → WORKER_SELF_REFERENCE.fetch("/api/internal/bot/execute", { headers: { Authorization: "Bearer ..." } })
  → 既存の route.ts が処理
```

- 既存の API endpoint をそのまま利用。新規コードが最小
- `WORKER_SELF_REFERENCE` バインディング（wrangler.toml に設定済み）で自己参照
- BOT_API_KEY は CF Workers secrets から取得

**案2: BotService 直接呼び出し**

- scheduled ハンドラから BotService を直接インスタンス化して呼び出す
- HTTP オーバーヘッドなし。ただし DI の配線を scheduled ハンドラ側でも行う必要あり
- OpenNext のビルド出力に干渉する可能性がある

→ 案1を推奨。実装がシンプルで、既存の認証・エラーハンドリング・ログ出力をそのまま活用できる。

---

## 6. ロールバック

| フェーズ | ロールバック手順 |
|---|---|
| Phase A | wrangler.toml から cron triggers を削除して再デプロイ。bot-scheduler.yml を元に戻す |
| Phase B | PostService の初回書き込み検出ロジックを削除。currency.feature を v4 に戻す |
| Phase C | pending_tutorials / tutorial BOTレコードを DB から削除。マイグレーション DOWN |
| Phase D | 独立した変更のため、個別にリバート可能 |
