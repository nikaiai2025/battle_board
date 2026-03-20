# ドキュメントレビューレポート (TASK-157)

> 対象: Sprint-46 ~ 55 で変更されたドキュメント
> レビュー日: 2026-03-19
> レビュアー: bdd-doc-reviewer

---

## 指摘事項

### [HIGH-001] OpenAPI仕様書 (D-04) に Internal API 3本が未定義

**対象**: `docs/specs/openapi.yaml`

Sprint-46~55 で新設された Internal API ルート 3 本が OpenAPI 仕様書に一切記載されていない。

| 実装パス | HTTPメソッド | 認証方式 |
|---|---|---|
| `/api/internal/bot/execute` | POST | Bearer (BOT_API_KEY) |
| `/api/internal/daily-reset` | POST | Bearer (BOT_API_KEY) |
| `/api/internal/daily-stats` | POST | Bearer (BOT_API_KEY) |

OpenAPI は D-04 として「APIインターフェースの単一ソース」と定められている (CLAUDE.md)。実装が先行し、D-04 が追従していないため、仕様と実装の乖離が存在する。

内部 API であるため呼び出し元は GitHub Actions のみに限定されるが、認証方式 (Bearer)、リクエストボディ、レスポンススキーマが仕様書に記録されていないと、新規開発者やエージェントが仕様を把握できない。

**推奨対応**: D-04 に Internal API セクションを追加し、3 エンドポイントのスキーマ (認証・リクエスト・レスポンス・エラー) を記載する。

---

### [HIGH-002] OpenAPI仕様書 (D-04) に Discord OAuth / 本登録関連ルート 3 本が未定義

**対象**: `docs/specs/openapi.yaml`

Sprint-46~55 で新設された認証ルート 3 本が OpenAPI 仕様書に未記載。

| 実装パス | HTTPメソッド | 用途 |
|---|---|---|
| `/api/auth/register/discord` | POST | Discord 本登録開始 |
| `/api/auth/login/discord` | POST | Discord ログイン開始 |
| `/api/auth/callback` | GET | OAuth / メール確認コールバック |

D-08 `user-registration.md` の section 12 では上記 3 本を含む全 API ルートが列挙されているが、上流の D-04 (OpenAPI) には反映されていない。仕様変更の伝播ルール (CLAUDE.md: BDD -> 外部仕様 -> 内部仕様 -> 実装) に照らすと、D-08 で定義されたルートは D-04 にも同期する必要がある。

なお `user-registration.md` section 12 に列挙されている他のルート (`/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/mypage/pat/regenerate`) も D-04 に未定義であり、本件と合わせて合計 7 本の認証関連エンドポイントが D-04 から欠落している。

**推奨対応**: D-04 に認証・本登録セクションを追加する。

---

### [MEDIUM-001] D-07 section 11.3 と TDR-009 の記述が矛盾

**対象**: `docs/architecture/architecture.md` section 11.3 vs TDR-009

section 11.3 には以下の方針が記述されている:

> 「各スレッドの『Shift_JIS 変換後の累積バイト数』を `threads` テーブルにキャッシュする。Range リクエスト時はこのバイト数と比較して差分レスのみをクエリ・変換・返却する」

一方、TDR-009 (section 13) では以下を決定している:

> 「現行の『全DAT再構築 + slice』方式を正式な実装方針として維持する。差分SELECTによる最適化は採用しない」

TDR-009 が section 11.3 を明示的に上書きしている。しかし section 11.3 本文はそのまま残っており、読者が section 11.3 を先に読むと誤った方針を把握してしまう。

**推奨対応**: section 11.3 本文に TDR-009 で決定変更された旨を注記するか、TDR-009 の決定内容で section 11.3 を書き換える。

---

### [MEDIUM-002] D-07 section 12.2 daily-maintenance の説明が実装と不一致

**対象**: `docs/architecture/architecture.md` section 12.2

section 12.2 の daily-maintenance ジョブの説明:

> 「日次リセットID・BOTマークリセット・生存日数加算」

しかし実際の `daily-maintenance.yml` は 2 ジョブを直列実行している:

1. `daily-reset`: 日次リセット (ID リセット・BOT マークリセット・生存日数加算)
2. `daily-stats`: 日次統計集計 (`/api/internal/daily-stats` を呼び出し、`daily_stats` テーブルに UPSERT)

日次統計集計は D-07 に言及がない。`daily_stats` テーブルはダッシュボード機能 (admin.feature) の基盤であり、ジョブ構成の文書化が不足している。

**推奨対応**: section 12.2 の daily-maintenance 行に日次統計集計の記述を追加する。

---

### [MEDIUM-003] bot-scheduler.yml の DEPLOY_URL コメントが TDR-010 の決定と矛盾

**対象**: `.github/workflows/bot-scheduler.yml` (コメント) vs `docs/architecture/architecture.md` TDR-010

TDR-010 では以下を決定している:

> 「DEPLOY_URL の向き先: **Vercel を選択**。Cloudflare Workers は通常ユーザー（専ブラ含む）のリクエストに専念させ、BOT cron の負荷を分離する」

しかし `bot-scheduler.yml` のコメント (行 21-25) は以下のように記述している:

> `DEPLOY_URL: 例: https://battle-board.xxx.workers.dev`
> `用途: Cloudflare Workers のデプロイURL（末尾スラッシュなし）`
> `注意: Cloudflare Workers を使用する（Vercelではない）。`

実際の `DEPLOY_URL` は GitHub Secrets で管理されるため、どちらのホストに向いているかはコメントからは確定できない。しかしコメントが TDR-010 の決定と明示的に逆を指示しており、運用者が混乱する原因となる。

一方、`daily-maintenance.yml` のコメント (行 19-21) も `Cloudflare Workers のデプロイURL` と記述しており、同様に TDR-010 と矛盾している。

**推奨対応**: TDR-010 の決定が現在も有効であれば、両 yml ファイルのコメントを Vercel に修正する。Cloudflare に変更した場合は TDR-010 を更新する。いずれか一方に統一する。

---

### [MEDIUM-004] D-07 section 2.2 の Supabase Auth 説明が本登録機能の追加を反映していない

**対象**: `docs/architecture/architecture.md` section 2.2

section 2.2 の構成要素表:

> `Supabase Auth: 管理者認証（メール+パスワード）。一般ユーザー認証には使わない`

しかし D-08 `user-registration.md` で本登録機能が設計・実装されており、本登録では Supabase Auth を一般ユーザーに対しても使用する (Discord OAuth, メール確認)。D-07 section 10.1 も同様に「管理者」のみの記述となっている。

**推奨対応**: section 2.2 および section 10.1 に「本登録ユーザーは Supabase Auth (Discord OAuth / メール確認) を使用する」旨を追記する。

---

### [MEDIUM-005] D-07 section 3.2 のサービス一覧に RegistrationService が欠落

**対象**: `docs/architecture/architecture.md` section 3.2 Application Layer サービス表

Sprint-46~55 で `RegistrationService` (`src/lib/services/registration-service.ts`) が新設され、Discord OAuth / メール本登録 / ログインフローを統括している。しかし D-07 section 3.2 のサービス一覧表と section 3.3 の依存関係図には `RegistrationService` が記載されていない。

**推奨対応**: section 3.2 に RegistrationService を追加し、section 3.3 の依存図に含める。

---

### [LOW-001] D-05 bot_state_transitions.yaml の日次リセット処理に next_post_at 再設定の記載なし

**対象**: `docs/specs/bot_state_transitions.yaml` daily_reset セクション

D-08 `bot.md` section 2.10 では、eliminated -> lurking 復活時に `next_post_at を再設定` と明記されている。しかし D-05 の日次リセット処理 (行 342-360) の eliminated ボット復活アクションには `next_post_at` の再設定が含まれていない。

D-05 は D-08 の上流 (外部仕様) であるため、本来は D-05 に先に定義されるべき内容。ただし `next_post_at` は TDR-010 で導入された内部実装上の詳細であり、D-05 の状態遷移仕様が扱うべき粒度かは判断が分かれる。

**推奨対応**: D-05 の eliminated -> lurking 復活アクションに `next_post_at = 再設定` を追記するか、内部実装詳細として D-08 のみに記載する方針を明示する。

---

## 問題なしの確認事項

以下の項目については問題がないことを確認した。

1. **TDR-009 の実装整合性**: `src/app/(senbra)/[boardId]/dat/[threadKey]/route.ts` は全 DAT 再構築 + slice 方式を採用しており、TDR-009 の決定と一致している
2. **TDR-010 の実装整合性**: `bots.next_post_at` カラムの追加 (migration 00015)、`bot-service.ts` での next_post_at 更新、`bot-scheduler.yml` の 30 分間隔 cron、Internal API の Bearer 認証方式 -- すべて TDR-010 の決定内容と一致している
3. **D-08 bot.md と実装の整合性**: section 2.1 (executeBotPost) の Strategy 委譲フロー、section 2.10 (performDailyReset) の処理内容、section 5.1 (next_post_at カラム) -- 実装コードと一致している
4. **LL-006 とインシデント報告の整合性**: `lessons_learned.md` LL-006 と `2026-03-18_bot_profiles_yaml_fs_dependency.md` は相互参照が正しく設定され、内容に矛盾がない
5. **ユビキタス言語辞書との整合**: 対象ドキュメントで使用されている用語 (AIボット、運営ボット、BOTマーク、日次リセットID、撃破、攻撃 等) は D-02 の定義と一致している。禁止別名の使用も検出されなかった
6. **D-05 と BDD シナリオの状態名整合**: bot_state_transitions.yaml の状態名 (lurking, revealed, eliminated) は bot_system.feature の step 定義と一致している
7. **Internal API 認証の CLAUDE.md 準拠**: `internal-api-auth.ts` は環境変数 `BOT_API_KEY` による Bearer 認証を実装しており、クライアントサイドコードに API キーを含めない制約を遵守している
8. **daily-stats route.ts のアーキテクチャ遵守**: DB 操作を `supabaseAdmin` 経由で行い、RLS を service_role でバイパスする設計は architecture.md section 10.1.1 と整合している

---

## レビューサマリー

| 重要度   | 件数  | ステータス |
|----------|-------|-----------|
| CRITICAL | 0     | pass      |
| HIGH     | 2     | warn      |
| MEDIUM   | 5     | info      |
| LOW      | 1     | note      |

判定: WARNING -- マージ前に 2 件の HIGH (OpenAPI 仕様書の未定義エンドポイント) を解決してください。

### HIGH 指摘の要旨

- **HIGH-001**: Internal API 3本 (`/api/internal/bot/execute`, `/api/internal/daily-reset`, `/api/internal/daily-stats`) が D-04 に未定義
- **HIGH-002**: 認証・本登録関連ルート 3本 (`/api/auth/register/discord`, `/api/auth/login/discord`, `/api/auth/callback`) + 同系統 4 本が D-04 に未定義

いずれも D-04 (OpenAPI) が「APIインターフェースの単一ソース」であるという位置づけに対する違反であり、伝播ルール (BDD -> 外部仕様 -> 内部仕様 -> 実装) が守られていない。
