# インシデント報告: Daily Maintenance 500 の17日連続障害（型キャスト + FK CASCADE 欠落）

> 日付: 2026-04-15
> 重大度: 高（日次メンテナンス（偽装ID再生成・インカーネーション・attacksクリーンアップ等）が17日間完全停止）
> 発見手段: GitHub Actions 失敗通知（ci-failure-notifier）が2026-03-29にIssue #2 を自動起票。ただし17日間コメント0件で放置され、2026-04-14 に人間が気付いて調査開始
> 修正コミット: `8e1706f`（00043 型キャスト）、`423e246`（00044 bot_posts FK CASCADE）、00045 予定（残り3 FK CASCADE）

---

## 症状

GitHub Actions `daily-maintenance.yml` の `daily-reset` ジョブ（`POST /api/internal/daily-reset` を Vercel に curl）が HTTP 500 を返し、17日連続失敗。

- 初回失敗: 2026-03-27 15:02 UTC
- 最後の成功: 2026-03-26 16:04 UTC
- 連続失敗期間: 17日（2026-03-27 〜 2026-04-14）
- 連動停止: 依存ジョブ `daily-stats`（`needs: daily-reset`）も同期間停止

---

## Phase 1: 原因理解

### Q1. なぜ起きたか

本障害は**時系列に現れる2段構造**だった。

#### 直接原因 A: `bulk_update_daily_ids` RPC の型キャスト欠落

コミット `bfae891`（2026-03-29 `performDailyReset` バッチ化）で追加された RPC が、`text` 型で受け取ったパラメータを `DATE` 列に暗黙キャストで代入。PostgreSQL は `text → date` の暗黙キャストを禁止するため毎回 throw。

```sql
-- 誤: text を date 列に直接代入（暗黙キャスト禁止）
UPDATE bots SET daily_id_date = p_daily_id_date  -- p_daily_id_date は text
-- 正: ::date で明示キャスト
UPDATE bots SET daily_id_date = p_daily_id_date::date
```

実際のエラー（Vercel Runtime Log 2026-04-14T18:42:14Z）:
```
column "daily_id_date" is of type date but expression is of type text
```

#### 直接原因 B: 複数テーブルの FK に `ON DELETE CASCADE` 欠落

`performDailyReset` Step 6 の `deleteEliminatedTutorialBots()` は撃破済みチュートリアルBOTを `bots` から物理削除する。しかし以下4つの FK が `ON DELETE` 未指定（デフォルト `NO ACTION`）のため、参照レコードがあると削除失敗:

| テーブル | カラム | 定義 Migration | 発覚順 |
|---|---|---|---|
| `bot_posts` | `bot_id` | 00001 | 1回目エラー |
| `grass_reactions` | `receiver_bot_id` | 00008 | 2回目エラー |
| `attacks` | `bot_id` | 00007 | 未発覚（推定3回目） |
| `collected_topics` | `source_bot_id` | 00034 | 未発覚（`tutorial` は source にならないため実害なし） |

この問題は Sprint-84（チュートリアルBOT設計）以来潜在していたが、**原因 A が Step 1 で17日間 throw し続けていたため Step 6 が一度も実行されず表面化しなかった**。原因 A を修正した直後に次々と露見した。

### 根本原因

#### 根本原因 1: RPC パラメータ型と DB 列型の整合性検証機構の不在

RPC 関数を手書き SQL で定義しているが、入出力パラメータ型と `UPDATE`/`INSERT` 対象の列型を突合する仕組み（lint・CI・レビューチェックリスト）が一切ない。同一 RPC 内で `text[]` で受け取る `dailyIds`（VARCHAR列なので暗黙キャスト可能）と `text` で受け取る `dailyIdDate`（DATE列なので不可能）の違いが、設計時に見落とされた。

#### 根本原因 2: 「設計意図」と「schema 制約」の整合性検証の欠如

`docs/architecture/components/bot.md` §2.10 Step 6 / §6.10 は「撃破後は翌日の `deleteEliminatedTutorialBots` で DB から削除する」と明記しているが、schema 側（00001/00007/00008）の FK はデフォルト `NO ACTION` のまま。設計書と schema がバラバラに書かれるため、設計で「削除する」と宣言しても schema が削除を許容しない不整合が潜在化していた。

### Q2. なぜ今まで気付かなかったか

| テスト層 | 担当すべき範囲 | 実態 | 原理的限界か |
|---|---|---|---|
| 単体テスト (Vitest) | BotService ロジック | 2296件あり。`InMemoryBotRepository` 使用のため **PostgreSQL の型エラー・FK制約は検証範囲外** | 該当（LL-002 の原理的限界） |
| BDDサービス層 (Cucumber) | サービス横断のユースケース | 411件あり。同様に InMemory 使用のため型・FK制約を検証不可 | 該当 |
| 統合テスト (Supabase Local) | SQL/RLS/マイグレーション/リポジトリ層 | `schema-consistency.test.ts` は **Row型とDBカラム名の存在のみ検証**。FK の `ON DELETE` 句・RPC の暗黙キャスト挙動は検証対象外 | 該当せず（テスト拡張で検出可能） |
| API テスト | 専ブラ互換/認証/エラー | `/api/internal/daily-reset` は対象外（D-10 §9.2 が専ブラと認証に限定） | 該当せず（API テストの範囲拡張で検出可能） |
| E2E テスト | UI 経由の振る舞い | `daily-maintenance` はバッチ経路のため UI 非依存で対象外 | 該当 |

**本件は「BDDサービス層テストの原理的限界」に該当する（LL-002 と同根）**。InMemory は実DBの型制約・FK制約を再現しないため、単体・BDDがいくら PASS しても本件の静的検出はできない。統合テスト層で新規テストを追加すれば検出可能だった。

### Q3. なぜ今になって気付いたか

**検知メカニズムは即時に機能しており、人間も起票直後に認知していた。17日間の遅延は、人間判断による意図的な対応保留（別件優先）の結果である。**

| 時刻 (UTC) | イベント |
|---|---|
| 2026-03-21 | `ci-failure-notifier.yml` 作成（検知メカニズム整備） |
| 2026-03-27 15:02 | Daily Maintenance 初回 500 失敗（Issue 起票なし。原因は不明） |
| **2026-03-29 15:23:45** | **Issue #2 "CI: Daily Maintenance failed" 自動起票 — 人間はほぼ即日で認知済み** |
| 2026-03-29 〜 2026-04-14 | Issue #2 は open のまま（ci-failure-notifier は同名 open Issue に追加起票しないため、17回分の失敗が1 Issue に集約）。**人間の判断で別件を優先、対応保留が継続** |
| 2026-04-14 | 人間が他タスクの区切りを機に、保留していた Issue #2 の調査を開始 |
| 2026-04-14 | オーケストレーター AI が調査依頼を受理、`auto-debugger` サブエージェントで Vercel Runtime Log ストリーミング取得 → 型エラーを特定 |
| 2026-04-15 | Sprint-152 開始（TASK-382 で 00043、TASK-383 で 00044 投入） |
| 2026-04-15 | Step 6 で別 FK エラーが順次露見（TASK-384 で 00045 投入） |

**検知・認知・対応の各段階の評価:**

| 段階 | 成否 | 備考 |
|---|---|---|
| 送達（自動起票） | ✓ 機能した | 起票から2日以内に発動 |
| 認知（人間の気付き） | ✓ 即日認知 | 追加の仕組み不要 |
| 対応（修正作業の着手） | 17日保留 | 別件優先の業務判断による。通知機構や運用フローの欠陥ではない |

**本件は「通知システムの構造的欠陥」ではなく、「人間の優先順位判断の結果として保留期間が長期化した」事象である。** 類似事象が再発しても同じ Issue 起票経路で即時検知可能であり、構造的な監視強化は不要と判断する（人間承認: 2026-04-15）。

---

## ゲート: 真因検証

### Q4. 特定した原因は本当に真因か

**原因 A（型キャスト）:**
- 証拠1: Vercel Runtime Log に `column "daily_id_date" is of type date but expression is of type text` を確認
- 証拠2: コミット `bfae891` の git diff で当該 RPC 追加箇所を特定、`daily_id_date = p_daily_id_date` の暗黙キャスト行を実証
- 証拠3: `migration 00043` 適用後、このエラーは消失し、処理が Step 6 まで到達
- **確証度:** 高（修正で確実に消えることを本番再現で実証済み）

**原因 B（FK CASCADE 欠落）:**
- 証拠1: Vercel Runtime Log に `violates foreign key constraint "bot_posts_bot_id_fkey"` → 次に `grass_reactions_receiver_bot_id_fkey` を確認
- 証拠2: 各 schema 定義 (00001/00007/00008/00034) の `REFERENCES bots(id)` に `ON DELETE` 未指定を git grep で実証
- 証拠3: `migration 00044` 適用後、`bot_posts` 関連 FK 違反は消失
- **確証度:** 高（残り3 FK も同構造であることを網羅検索で確認）

**別原因の可能性:**
- BOT ロジック変更（`a80c90f` インカーネーション導入 等）: Step 1 より手前で throw しているため関係なし
- Vercel/CF デプロイ同期ずれ: 複数回検証で再現するため可能性なし
- **真因は A + B で確定**

### Q4b. 他に隠れている要因はないか

`performDailyReset` のエンドツーエンドパスを追跡:

| Step | 処理 | 検証結果 |
|---|---|---|
| 1 | 偽装ID再生成 (`bulk_update_daily_ids`) | 原因A、00043 で解消 |
| 2 | revealed→lurking (`bulkResetRevealed`) | UPDATE のみ、FK波及なし ✅ |
| 3 | survival_days +1 (`bulkIncrementSurvivalDays`) | UPDATE のみ ✅ |
| 4 | eliminated → INSERT（インカーネーション） | INSERT のみ ✅ |
| 4.5 | `next_post_at` 再設定 | UPDATE のみ ✅ |
| 5 | attacks 前日分クリーンアップ (`deleteByDateBefore`) | `attacks` は `accusations` から参照されていないか要確認 |
| 6 | 撃破済みチュートリアルBOT削除 | 原因B、00044 + 00045 で解消見込み |
| 後続 | `daily-stats` ジョブ（別 workflow step） | daily-reset が通るまで未検証 |

**Step 5 の `attacks` テーブル削除:** `attacks` 側を参照するテーブルがあれば同構造の FK 違反リスク。要検証。

**daily-stats ジョブ:** Step 6 が通過した先でまだ別の障害がある可能性。今回の修正（00043+00044+00045）後に必ず実機検証する。

**横展開調査（Q9 で詳述）:** 他の `REFERENCES` 宣言にも同じ `ON DELETE` 未指定パターンがある。今回はチュートリアルBOT削除パスのみ優先対応。

---

## Phase 2: 対策

### Q5. 対策は何か

#### 即時対策（Sprint-152 内で実施）

| # | 修正 | 実施状況 |
|---|---|---|
| 1 | `migration 00043_fix_bulk_update_daily_ids_cast.sql`: RPC に `::date` 明示キャスト | ✅ 完了・デプロイ済み |
| 2 | `migration 00044_bot_posts_cascade_on_bot_delete.sql`: `bot_posts.bot_id` FK → `ON DELETE CASCADE` | ✅ 完了・デプロイ済み |
| 3 | `migration 00045`（仮）: `attacks.bot_id` / `grass_reactions.receiver_bot_id` / `collected_topics.source_bot_id` FK → `ON DELETE CASCADE` | ⏳ TASK-384 検討中（人間承認待ち） |

#### 検討したが採用しなかった案

- **案B: コード側で bot_posts/grass_reactions 等を先に DELETE**
  - 理由: 冗長で InMemory 版との同期コストが発生。schema 側で宣言的に対処する方が一元的かつ堅牢

### Q6. 対策による悪影響はないか

**物理削除の影響範囲:**
- `src/lib/` 全体で `bots` を DELETE する箇所は `deleteEliminatedTutorialBots()` の1関数のみ
- 対象は `bot_profile_key = 'tutorial'` 限定（撃破済み + 7日経過未撃破）
- 運営BOT（荒らし役・キュレーション・煽り・ひろゆき・コピペ）はインカーネーションモデル（§6.11）で INSERT のため物理削除されず、CASCADE 発動せず

**CASCADE 発動時のデータ影響（チュートリアルBOT削除時のみ）:**
- `bot_posts`: 撃破済みBOTの投稿紐付け消失。当該レスは「誰の書き込みか特定不能」になるが、チュートリアルBOTは1発撃破前提の使い捨てで履歴価値なし
- `grass_reactions`: チュートリアルBOT書き込みへの草記録消失。同様に価値低
- `attacks`: チュートリアルBOT撃破記録消失。ただし Step 5 で前日分は既に削除されるため実質当日撃破分のみ
- `collected_topics`: チュートリアル BOT は source にならないため発動せず

**既存テストへの影響:** 単体・BDDテストとも InMemory のため FK 影響なし。統合テストも pre-existing 失敗以外に新規FAILなし（TASK-GATE-152-FINAL PASS確認済み）

---

## Phase 3: 再発防止

### Q7. どうすれば防げていたか

#### 設計段階

- **schema 規約:** 「`REFERENCES tbl(col)` を書くときは `ON DELETE {CASCADE|SET NULL|RESTRICT}` を必ず明示する」を運用ルール化すれば、設計意図（削除 vs 凍結）が schema に現れる
- **RPC パラメータ型ガイド:** 「RPC パラメータ型と UPDATE 対象列の型が異なる場合は `::type` 明示キャストを必須にする」を運用ルール化

#### テスト層

- **`schema-consistency.test.ts` 拡張:** FK 制約の `confdeltype`（PostgreSQL `pg_constraint` 参照）を検証する integration test を追加し、「コードで DELETE する bot_profile_key='tutorial' → bots への FK は CASCADE 必須」といったドメインルールを自動検証
- **`performDailyReset` 統合テスト:** Supabase Local で `撃破済みチュートリアルBOT + 関連 bot_posts/grass_reactions/attacks` を仕込んだ状態で実 DB に対して performDailyReset を1回走らせる end-to-end integration test を追加
- **internal API スモーク:** `bdd-smoke` に `POST /api/internal/daily-reset` の手動トリガを組み込む

#### プロセス

- **Issue 監視:** 本件では認知も成立しており、追加の仕組み化は不要と判断（人間承認: 2026-04-15）。類似事象が再発しても同じ起票経路で検知可能
- **PR レビューチェックリスト:** 新規 FK 追加時に「ON DELETE 句が明示されているか」「コード側で削除するテーブルか」を確認（任意）

### Q8. 今後の再発防止策

**人間判断（2026-04-15）により、本件の再発防止投資は実施しない。** 理由は以下:

- 検知・認知は即時に成立しており、構造的欠陥ではない
- 類似事象が再発した場合も Issue 起票経路で即座に検知可能なため、被害は限定的
- integration test 拡充・schema 規約明文化はいずれもコスト対効果が本件インパクトに見合わない

以下は**参考として記録するが、現時点では対応しない**候補:

#### 参考: 検出（テスト追加）

- **`schema-consistency.test.ts` の拡張**（将来課題）
  - PostgreSQL `pg_constraint.confdeltype` を検証し、全 FK に `ON DELETE` 句が明示されていることを確認
- **`performDailyReset` integration test の新設**（将来課題）
  - Supabase Local で撃破済みチュートリアルBOT + 関連4テーブルを仕込んだ後、`deleteEliminatedTutorialBots()` + 全 Step の E2E 成功を検証

#### 参考: 検出（運用監視）

- **`bdd-smoke` への internal API トリガ追加**（将来課題）
  - 本番デプロイ後の smoke に `POST /api/internal/daily-reset` を含める（ただし日次冪等性を考慮して任意 flag で制御）

### Q9. 他にも同じ構造の問題がないか

#### 横展開 1: 他テーブルの FK `ON DELETE` 未指定箇所

grep した結果、`REFERENCES` を使う FK の多くで `ON DELETE` 未指定。現状コードで DELETE する箇所は以下に限定されているが、将来の GDPR 対応等で拡張する際のリスクとして認識が必要:

| 削除元テーブル | 削除関数 | リスク |
|---|---|---|
| `bots` | `deleteEliminatedTutorialBots` | 本件で対応中 |
| `auth_codes` | 各種認証フロー | 他テーブルから参照なし、安全 |
| `attacks` | `deleteByDateBefore` (Step 5) | 要検証: `attacks` を参照するテーブルがないか |
| `user_copipe_entries` | マイページUI | 単独テーブル、安全 |
| `edge_tokens` | ログアウト等 | 単独テーブル、安全 |
| `pending_async_commands` | 非同期実行後 | 単独テーブル、安全 |
| `pending_tutorials` | チュートリアル実行後 | 単独テーブル、安全 |

**要対応:** `attacks` の参照テーブル有無を次回 BOT 関連スプリントで確認。

#### 横展開 2: RPC パラメータ型不整合

他 RPC 関数 (00004, 00014, 00031, 00035) に同類の型不整合がないか要レビュー。特に `text`/`varchar`/`integer`/`uuid` 等、PostgreSQL が暗黙キャストを拒否する型組み合わせを含む RPC。

#### 横展開 3: 検知フローの評価（訂正済み）

初稿では「検知フローの断絶」として構造的問題があると記述したが、事実関係の確認（2026-04-15 人間からの証言）により、本件では **検知・認知とも即時に成立しており、構造的欠陥はない** と判明した。17日間の遅延は人間判断による意図的な対応保留（別件優先）の結果である。

類似事象が再発しても同じ Issue 起票経路で即座に検知可能なため、能動的な通知ルート（Slack/Discord/AIセッション起点チェック）への投資は不要と判断する。

---

## 対応ステータス

- ✅ 原因 A（型キャスト）: migration 00043 で解消、本番適用済み
- ✅ 原因 B の4/4: migration 00044（`bot_posts`）+ 00045（`attacks` / `grass_reactions` / `collected_topics`）で解消、本番適用済み
- ✅ 本番実機検証: `gh workflow run daily-maintenance.yml`（run #24427737023）で daily-reset 5s PASS / daily-stats 4s PASS
- ✅ GitHub Issue #2 クローズ: 2026-04-15
- **再発防止策は実施せず**（人間判断 2026-04-15）: 検知・認知は即時に機能しており構造的欠陥なし。integration test 拡充・schema 規約明文化は費用対効果が見合わないため見送り

---

## 関連資料

- 調査レポート: `tmp/reports/daily_maintenance_500_investigation.md`
- Sprint 計画: `tmp/orchestrator/sprint_152_plan.md`
- 設計書: `docs/architecture/components/bot.md` §2.10 / §6.10 / §6.11
- 関連教訓: LL-002（InMemoryリポジトリは実DBの制約を再現する）/ LL-017（FK の `ON DELETE` 指定は必須）
- 関連 GitHub Issue: #2（closed）
