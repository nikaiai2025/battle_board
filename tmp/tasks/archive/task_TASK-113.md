---
task_id: TASK-113
sprint_id: Sprint-39
status: done
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-113
depends_on: []
created_at: 2026-03-17T18:00:00+09:00
updated_at: 2026-03-17T18:00:00+09:00
locked_files:
  - docs/specs/openapi.yaml
  - docs/architecture/components/admin.md
  - docs/specs/user_state_transitions.yaml
  - docs/specs/currency_state_transitions.yaml
  - docs/specs/post_state_transitions.yaml
  - docs/requirements/ubiquitous_language.yaml
---

## タスク概要
Phase 5ドキュメントレビュー（TASK-111）で検出されたHIGH 2件 + MEDIUM 4件のドキュメント乖離を修正する。
既存実装に対するドキュメントの追記・同期であり、仕様変更ではない。人間承認済み。

## 修正項目

### HIGH-001: OpenAPI仕様書 (D-04) に管理API 10エンドポイント追加
対象: `docs/specs/openapi.yaml`
追加するエンドポイント:
1. `POST /api/admin/users/{userId}/ban` — ユーザーBAN
2. `DELETE /api/admin/users/{userId}/ban` — ユーザーBAN解除
3. `POST /api/admin/ip-bans` — IP BAN
4. `DELETE /api/admin/ip-bans/{banId}` — IP BAN解除
5. `POST /api/admin/users/{userId}/currency` — 通貨付与
6. `GET /api/admin/users` — ユーザー一覧
7. `GET /api/admin/users/{userId}` — ユーザー詳細
8. `GET /api/admin/users/{userId}/posts` — ユーザー書き込み履歴
9. `GET /api/admin/dashboard` — ダッシュボード
10. `GET /api/admin/dashboard/history` — ダッシュボード日次推移

各エンドポイントの仕様は実装コード（`src/app/api/admin/`配下）を正本として記述する。

### HIGH-002: コンポーネント境界設計書 (D-08) admin.md 更新
対象: `docs/architecture/components/admin.md`
追加する公開インターフェース:
- `banUser`, `unbanUser`, `banIpByUserId`, `unbanIp`, `listActiveIpBans`
- `grantCurrency`
- `getUserList`, `getUserDetail`, `getUserPosts`
- `getDashboard`, `getDashboardHistory`
追加する依存関係:
- `UserRepository`, `CurrencyRepository`, `IpBanRepository`, `DailyStatsRepository`

### MEDIUM-001: ユーザー状態遷移仕様書にBAN状態追加
対象: `docs/specs/user_state_transitions.yaml`
追加: BAN状態の遷移定義（通常→BAN、BAN→通常、BAN時の書き込み拒否）

### MEDIUM-002: 通貨状態遷移仕様書にadmin_grantイベント追加
対象: `docs/specs/currency_state_transitions.yaml`
追加: `admin_grant` イベントの定義

### MEDIUM-003: 廃止済み告発ボーナス記述の削除
対象: `docs/specs/post_state_transitions.yaml`, `docs/specs/currency_state_transitions.yaml`
削除: v4で廃止された `accusation_success_bonus`, `false_accusation_bonus` 関連記述

### MEDIUM-004: ユビキタス言語辞書に用語追加
対象: `docs/requirements/ubiquitous_language.yaml`
追加: 「ユーザーBAN」「IP BAN」「ダッシュボード」
注意: 「BAN」は既に `!mute` の `forbidden_alias` として存在。管理者BANは別概念として定義する。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-doc-reviewer_TASK-111/doc_review_report.md` — レビュー指摘の詳細
2. [必須] 実装コード `src/app/api/admin/` — API仕様の正本
3. [必須] `src/lib/services/admin-service.ts` — サービスインターフェースの正本
4. [参考] `features/admin.feature` — BDDシナリオ

## 出力（生成すべきファイル）
- 上記locked_filesの修正

## 完了条件
- [ ] OpenAPI仕様書に管理API 10エンドポイント定義追加
- [ ] admin.md に新機能12関数 + 4リポジトリ依存追加
- [ ] user_state_transitions.yaml にBAN状態追加
- [ ] currency_state_transitions.yaml にadmin_grant追加
- [ ] post_state_transitions.yaml / currency_state_transitions.yaml から廃止ボーナス記述削除
- [ ] ubiquitous_language.yaml に3用語追加

## スコープ外
- コード修正（ドキュメント同期のみ）
- 画面要素定義書（D-06）の更新（管理画面のscreen定義は未作成だが本タスクでは対象外）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全6ドキュメント修正完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

#### 2026-03-17 実施内容

**事前調査:**
- レビューレポート (`tmp/workers/bdd-doc-reviewer_TASK-111/doc_review_report.md`) を確認
- 実装コードを全て読み取り（admin-service.ts、全10 APIルート、IpBanRepository、DailyStatsRepository）
- 既存6ドキュメントを全て読み取り

**HIGH-001: OpenAPI仕様書 (D-04) に管理API 10エンドポイント追加**
- `docs/specs/openapi.yaml` に以下を追加:
  1. `POST /api/admin/users/{userId}/ban` -- ユーザーBAN
  2. `DELETE /api/admin/users/{userId}/ban` -- ユーザーBAN解除
  3. `POST /api/admin/ip-bans` -- IP BAN追加
  4. `GET /api/admin/ip-bans` -- IP BAN一覧
  5. `DELETE /api/admin/ip-bans/{banId}` -- IP BAN解除
  6. `POST /api/admin/users/{userId}/currency` -- 通貨付与
  7. `GET /api/admin/users` -- ユーザー一覧
  8. `GET /api/admin/users/{userId}` -- ユーザー詳細
  9. `GET /api/admin/users/{userId}/posts` -- ユーザー書き込み履歴
  10. `GET /api/admin/dashboard` -- ダッシュボード
  11. `GET /api/admin/dashboard/history` -- ダッシュボード日次推移
- 全エンドポイントの仕様は実装コード（APIルート + admin-service.ts）を正本として記述
- ステータスコードの使い分け（401 vs 403）は実装に忠実に反映

**HIGH-002: コンポーネント境界設計書 (D-08) admin.md 更新**
- `docs/architecture/components/admin.md` を全面改訂
- 公開インターフェースを5カテゴリに整理: 削除操作 / BAN操作 / 通貨付与 / ユーザー管理 / ダッシュボード
- 全12関数のシグネチャと説明を記載（deletePost の comment 引数も反映 -- LOW-001対応）
- 依存先に UserRepository, CurrencyRepository, IpBanRepository, DailyStatsRepository, CurrencyService, PostService を追加
- 設計判断に「BANの二層構造」「管理者へのIPハッシュ非公開」を追加

**MEDIUM-001: ユーザー状態遷移仕様書にBAN状態追加**
- `docs/specs/user_state_transitions.yaml` に `ban_states` / `ban_transitions` / `ban_constraints` セクションを追加
- BAN状態は認証状態・アカウント種別と直交する独立概念として定義

**MEDIUM-002: 通貨状態遷移仕様書にadmin_grantイベント追加**
- `docs/specs/currency_state_transitions.yaml` に `admin_grant` イベントを追加

**MEDIUM-003: 廃止済み告発ボーナス記述の削除**
- `docs/specs/currency_state_transitions.yaml` から `accusation_success_bonus` / `false_accusation_bonus` を削除（NOTEコメントで廃止記録を残存）
- `docs/specs/post_state_transitions.yaml` から告発成功ボーナス付与の action を削除、miss の feature_ref を現行シナリオ名に修正

**MEDIUM-004: ユビキタス言語辞書に用語追加**
- `docs/requirements/ubiquitous_language.yaml` に「ユーザーBAN」「IP BAN」「ダッシュボード」の3用語を追加
- 管理者の definition も更新（新機能を反映）
- ユーザーBANと !mute（書き込み禁止）の概念的区別を明記

**自己反省で修正した点:**
- post_state_transitions.yaml の miss outcome の feature_ref を、実際の feature ファイルのシナリオ名「AI告発に失敗するとコストのみ消費される」に修正

### テスト結果サマリー
本タスクはドキュメント修正のみ。コード変更なし、テスト実行対象外。
