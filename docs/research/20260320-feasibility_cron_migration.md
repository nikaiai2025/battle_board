# 定期ジョブ移行フィージビリティレポート

> 作成日: 2026-03-20
> 更新日: 2026-03-20（Cloudflare Cron Triggers を追加、結論を更新）
> ステータス: レビュー待ち
> 目的: GitHub Actions cron からの移行先の実現可能性を評価する

---

## 1. 現状整理

### 1.1 現行のGitHub Actions cronジョブ

| ジョブ | スケジュール | 実行内容 | 通信方式 |
|---|---|---|---|
| bot-scheduler | `0,30 * * * *`（30分毎） | `POST /api/internal/bot/execute` | curl + Bearer認証 |
| daily-maintenance | `0 15 * * *`（JST 0:00） | `POST /api/internal/daily-reset` → `POST /api/internal/daily-stats`（直列） | 同上 |
| cleanup（未実装） | JST 3:00（予定） | 期限切れデータ掃除 | 同上 |

### 1.2 GitHub Actions 無料枠の消費状況

- 30分間隔 × 24時間 × 30日 = **1,440分/月**（無料枠2,000分の72%）
- daily-maintenance: **30分/月**（1分 × 30日、ただし2ジョブ直列なので実質2分 × 30日 = 60分/月）
- 合計: 約 **1,500分/月**（75%消費）
- 問題: 新しいcronジョブ追加やCI/CDとの枠競合の余地が少ない

---

## 2. GCP Cloud Scheduler の機能評価

### 2.1 我々の要件との適合性

| 要件 | 対応可否 | 詳細 |
|---|---|---|
| 30分間隔の定期実行 | **○** | unix-cron形式で `0,30 * * * *` がそのまま使える |
| 1日1回の定期実行 | **○** | `0 15 * * *` で指定可能 |
| HTTPリクエスト（POST） | **○** | HTTPターゲットとしてURL・メソッド・ボディを指定可能 |
| カスタムHTTPヘッダー | **○** | `Authorization: Bearer {TOKEN}` 等のカスタムヘッダーを自由に設定可能 |
| 外部URL（Vercel）への送信 | **○** | HTTPターゲットは publicly accessible なURLであれば可 |
| 直列実行（reset → stats） | **△** | 後述（§2.3） |

### 2.2 無料枠

| 項目 | 内容 |
|---|---|
| 無料ジョブ数 | **3ジョブ/Billingアカウント** |
| 課金単位 | ジョブ定義数（実行回数は無制限・無料） |
| 超過時の課金 | $0.10/ジョブ/月 |
| 計測レベル | Billingアカウント単位（プロジェクト単位ではない） |

BattleBoardの必要ジョブ数:
- bot-scheduler: 1ジョブ
- daily-reset: 1ジョブ
- daily-stats: 1ジョブ（直列実行のため分離が必要、§2.3参照）

→ **3ジョブでちょうど無料枠に収まる。** ただし cleanup を追加すると4ジョブとなり$0.10/月が発生する。

### 2.3 直列実行の制約

GitHub Actionsの `needs` による直列実行（daily-reset → daily-stats）は、Cloud Schedulerでは直接再現できない。

**対策案:**
- **案A**: daily-resetのAPIレスポンスを待ってからdaily-statsを呼ぶロジックをサーバー側に統合する（推奨）
  - `/api/internal/daily-maintenance` エンドポイントを新設し、内部でreset→statsを順次実行
  - Cloud Schedulerのジョブ実行時間上限は30分なので、両処理の合計が30分以内なら問題なし
  - ジョブ数を2に減らせる（bot-scheduler + daily-maintenance）
- **案B**: daily-statsのスケジュールをdaily-resetの数分後にずらす
  - daily-reset: `0 15 * * *`、daily-stats: `5 15 * * *`
  - resetが5分以内に完了する前提が必要。確実性に欠ける

### 2.4 クォータ・制限

| 項目 | 制限値 |
|---|---|
| ジョブ数上限 | 1,000/リージョン（最大5,000まで引き上げ可） |
| ペイロード上限 | 1MB |
| ジョブ実行時間上限 | 30分 |
| 最小実行間隔 | 1分（unix-cron `* * * * *`） |
| Read API | 1,250回/分 |
| Write API | 500回/分 |

→ いずれもBattleBoardの利用規模では問題にならない。

---

## 3. 商用利用の可否

### 3.1 結論: **商用利用可能**

GCP（Google Cloud Platform）は商用クラウドサービスであり、ToS上で個人利用と商用利用を区別していない。

| 区分 | 内容 | 商用利用 |
|---|---|---|
| Free Trial（$300クレジット） | 90日限定の試用枠 | 制限あり（試用目的） |
| Always Free Tier | 永続無料枠（Cloud Run, Firestore等） | **制限なし** |
| Cloud Scheduler 無料枠（3ジョブ） | 永続無料枠（Pricingページ記載） | **制限なし**（通常のGCP ToSに準拠） |

- GCP ToS（https://cloud.google.com/terms）は「Customer」を法人・個人問わず定義しており、利用目的（商用/非商用）による制限条項はない
- Cloud Run等の他のAlways Freeサービスも明示的に「commercial use allowed」と記載されている
- Cloud Schedulerの3ジョブ無料枠はPricingページの恒久的な料金体系の一部であり、試用枠ではない

### 3.2 注意点

- GCPの利用にはBillingアカウントの作成が必要（クレジットカード登録）
- 無料枠を超えた場合は自動課金される（予算アラートの設定を推奨）
- Googleはサービス提供条件を変更する権利を留保している（ただしこれはどのクラウドも同様）

---

## 3b. Cloudflare Workers Cron Triggers

BattleBoardは既にCloudflareをインフラに採用している（CLAUDE.md: `Vercel / Cloudflare + Supabase + GitHub Actions`）。
Cloudflare WorkersにはCron Triggers機能が組み込まれており、新規サービス追加なしで利用できる。

### 3b.1 機能評価

| 要件 | 対応可否 | 詳細 |
|---|---|---|
| 30分間隔の定期実行 | **○** | unix-cron形式対応。最小1分間隔 |
| 1日1回の定期実行 | **○** | `0 15 * * *` で指定可能 |
| HTTPリクエスト（POST） | **○** | Worker内から `fetch()` で外部URLへPOST可能 |
| カスタムHTTPヘッダー | **○** | `fetch()` のオプションで自由に設定可能 |
| 外部URL（Vercel）への送信 | **○** | Workerから外部fetchは標準機能 |
| 直列実行（reset → stats） | **○** | Worker内で `await fetch(reset)` → `await fetch(stats)` と書ける |

### 3b.2 無料枠

| 項目 | 内容 |
|---|---|
| リクエスト上限 | **100,000リクエスト/日**（cron起動もリクエストとしてカウント） |
| 外部fetch上限 | **50回/起動**（1回のcron起動あたり） |
| CPU時間 | 10ms/リクエスト（無料枠） |
| Cron Triggers | **追加料金なし**（Workers無料枠に含まれる） |
| トリガー数 | **5トリガー/アカウント** |
| 商用利用 | **制限なし**（Cloudflare ToS上、商用/個人の区別なし） |

BattleBoardの必要トリガー数:
- bot-scheduler: `0,30 * * * *`（1トリガー）
- daily-maintenance: `0 15 * * *`（1トリガー）
- cleanup（将来）: `0 18 * * *`（1トリガー）

→ **5トリガー中2〜3使用。余裕あり。**

### 3b.3 GCP Cloud Schedulerに対する優位性

| 観点 | GCP Cloud Scheduler | Cloudflare Cron Triggers |
|---|---|---|
| 既存インフラ | **新規追加** | **既存（追加不要）** |
| アカウント管理 | GCP Billingアカウント必要 | **不要（既存Cloudflareアカウント）** |
| 直列実行 | 不可（API統合 or 時差起動） | **Worker内で逐次await可能** |
| 無料枠の余裕 | 3ジョブ（ぴったり） | **100,000リクエスト/日（桁違い）** |
| 認証情報管理 | GCP Secret Manager | **Cloudflare Workers Secrets（既存）** |
| インフラ追加承認 | エスカレーション必要 | **不要** |

### 3b.4 注意点

- Worker の CPU時間制限（無料枠: 10ms）は fetch の待ち時間を含まない（I/O待ちはカウント外）ため、HTTP POST + レスポンス待ちには十分
- Cron Triggerの設定変更の伝播に最大15分かかる
- Worker のデプロイは `wrangler` CLI で管理（既存ツールチェーンに追加）

---

## 4. 候補サービス比較

| 観点 | GitHub Actions cron | GCP Cloud Scheduler | **Cloudflare Cron Triggers** |
|---|---|---|---|
| 無料枠 | 2,000分/月（全CIと共有） | 3ジョブ（実行回数無制限） | **100,000リクエスト/日** |
| 起動精度 | **低い**（数分〜数十分の遅延） | **高い**（秒単位） | **高い** |
| 最小間隔 | 5分（実際はさらに間引き） | 1分 | **1分** |
| 認証情報管理 | GitHub Secrets | GCP Secret Manager | **Workers Secrets（既存）** |
| 直列ジョブ | `needs` で記述可能 | 不可 | **Worker内でawait** |
| 既存インフラ | ○ | **×（新規）** | **○（既存）** |
| 運用複雑性 | 低 | 中（GCPアカウント） | **低（既存Cloudflare）** |
| CI/CD枠との競合 | **あり** | なし | **なし** |
| スケールの自由度 | 枠に制限 | $0.10/ジョブ/月 | **Worker追加（無料枠内）** |

### 4.1 GitHub Actions cronの既知の問題

- **起動遅延**: 高負荷時に数分〜30分の遅延が発生する（GitHub公式に注記あり）
- **間引き**: リポジトリが非アクティブだとcronがスキップされることがある
- **無料枠のグローバル共有**: CI/CDパイプラインと同じ枠を消費するため、PR頻度が上がるとcron枠を圧迫する

→ 現状bot-schedulerは「30分間隔」かつ「DB予定時刻方式」で起動遅延を吸収する設計（TDR-010）になっているため、致命的ではないが理想的でもない。

---

## 5. 移行の推奨アプローチ

### 5.1 推奨: Cloudflare Cron Triggers への移行

| Phase | 作業 | リスク |
|---|---|---|
| 1. cron Worker作成 | `wrangler init` → cron handler実装 → Secrets設定 | 低 |
| 2. bot-schedulerを移行 | Worker デプロイ → 動作確認 → GitHub Actions側を無効化 | 低（並行稼働で安全に切替） |
| 3. daily-maintenanceを移行 | Worker内で reset → stats を逐次fetch | 低（API変更不要） |
| 4. GitHub Actions cronワークフローを削除 | 不要ファイルの削除 | 低 |

GCP Cloud Scheduler案と比較し、Phase 1のアカウント作成が不要、Phase 3のAPI統合が不要で、全体的にリスクが低い。

### 5.2 代替案: GCP Cloud Scheduler

Cloudflareが何らかの理由で使えない場合のフォールバック。§2参照。

---

## 6. 総合評価

| 評価軸 | GCP Cloud Scheduler | **Cloudflare Cron Triggers** |
|---|---|---|
| 機能適合性 | ○ | **◎**（直列実行もWorker内で可能） |
| 商用利用 | ○ | **○** |
| 無料枠の十分性 | ○（3ジョブでぴったり） | **◎**（桁違いの余裕） |
| 起動精度 | ◎ | **◎** |
| 導入コスト | △（新規アカウント） | **◎**（既存インフラ、追加不要） |
| 信頼性 | ○ | **○** |

### 結論

**無料で大量のcron実行を実現する手段は2つあり、どちらでもよい。**

| 選択肢 | 必要な作業 | 起動精度 |
|---|---|---|
| **A. GitHub Actions（リポジトリをパブリック化）** | リポジトリの公開設定を変更するだけ | 数分〜30分の遅延あり |
| **B. Cloudflare Cron Triggers** | cron用Workerの実装・デプロイ | 秒単位 |

- 実質的な差は起動精度のみ。ただしDB予定時刻方式（TDR-010）で遅延を吸収する設計のため、致命的差ではない
- ソースコード公開はゲーム設計上の問題にならない（本質的価値はコードではなく「場」）
- GCP Cloud Schedulerは無料枠が狭く（3ジョブ）新規アカウントも必要なため、上記2案に劣る

---

## 参考文献

### Cloudflare
- [Cloudflare Workers Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)

### GCP
- [Cloud Scheduler Pricing](https://cloud.google.com/scheduler/pricing)
- [Cloud Scheduler Quotas](https://docs.cloud.google.com/scheduler/quotas)
- [Cloud Scheduler - Manage cron jobs](https://docs.cloud.google.com/scheduler/docs/creating)
- [Cloud Scheduler - HTTP Target Auth](https://cloud.google.com/scheduler/docs/http-target-auth)
- [GCP Free Cloud Features](https://docs.cloud.google.com/free/docs/free-cloud-features)
- [GCP Terms of Service](https://cloud.google.com/terms)

### GitHub Actions
- [GitHub Actions billing](https://docs.github.com/billing/managing-billing-for-github-actions/about-billing-for-github-actions)
- [Pricing changes for GitHub Actions 2026](https://resources.github.com/actions/2026-pricing-changes-for-github-actions/)
