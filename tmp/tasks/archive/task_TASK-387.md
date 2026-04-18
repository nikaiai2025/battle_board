---
task_id: TASK-387
sprint_id: Sprint-154
status: completed
assigned_to: bdd-coding
depends_on: [TASK-386]
created_at: 2026-04-17
updated_at: 2026-04-17
locked_files:
  - "[NEW] supabase/migrations/00047_add_revived_at_for_idempotency.sql"
  - src/lib/infrastructure/repositories/bot-repository.ts
  - src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts
  - src/lib/services/bot-service.ts
  - src/__tests__/lib/services/bot-service.test.ts
  - src/lib/domain/models/bot.ts
  - docs/architecture/components/bot.md
  - docs/specs/bot_state_transitions.yaml
  # --- ESC-TASK-387-1 解決により拡張（モック定義の機械的同期・in-memory実装同期） ---
  - src/__tests__/lib/services/admin-premium.test.ts
  - src/__tests__/lib/services/admin-dashboard.test.ts
  - src/__tests__/lib/services/admin-service.test.ts
  - src/lib/services/__tests__/admin-service.test.ts
  - src/__tests__/lib/services/bot-service-scheduling.test.ts
  - features/support/in-memory/bot-repository.ts
  - features/step_definitions/welcome.steps.ts
  # --- ESC-TASK-387-2 解決により拡張（design §2.2 aori 拡張に伴う step assertion 修正） ---
  - features/step_definitions/command_aori.steps.ts
  # --- ESC-TASK-387-3 解決により拡張（Bot 型必須プロパティ revivedAt 追加に伴うモック/フィクスチャ網羅漏れ同期） ---
  - src/__tests__/lib/services/bot-strategies/strategy-resolver.test.ts
  - src/__tests__/lib/services/bot-strategies/tutorial-strategies.test.ts
  - src/__tests__/lib/services/post-service.test.ts
  - src/lib/services/hiroyuki-service.ts
---

## タスク概要

荒らし役BOT増殖バグの**根本原因となっているロジックの修正**を実施する。

1. `bots.revived_at TIMESTAMPTZ NULL` カラム追加 + 部分 INDEX（migration 00047）
2. `BotRepository.bulkReviveEliminated()` の冪等化（SELECT に `revived_at IS NULL` 追加、INSERT 成功時に旧レコードを `UPDATE SET revived_at = NOW()`）
3. `BotRepository.deleteEliminatedTutorialBots()` を `deleteEliminatedSingleUseBots()` に汎化（tutorial / aori / hiroyuki をクリーンアップ対象に拡張、7日経過の未撃破も削除）
4. `BotService.performDailyReset()` Step 6 の呼び出し先差し替え
5. docs 更新（bot.md §2.10 / §5.1 / §6.11、state_transitions.yaml #daily_reset）
6. 単体テスト追加（冪等性検証・クリーンアップ拡張・境界値）

**データ訂正 migration は本タスクのスコープ外**（TASK-388 で実施）。

## 対象BDDシナリオ

- `features/bot_system.feature` L116-118「荒らし役ボットは10体が並行して活動する」
- `features/bot_system.feature` @撃破済みボットは翌日にHP初期値で復活する（冪等化後も挙動不変を確認）
- `features/command_hiroyuki.feature` L40 コメント「使い切り」仕様
- `features/command_aori.feature` L110-113「煽りBOTは日次リセットで復活しない」

**新規 BDD シナリオは追加しない**（TASK-386 architect 検証で「BDD 変更不要」と結論）。

## 必読ドキュメント（優先度順）

1. [必須] `tmp/workers/bdd-architect_TASK-386/design.md` — 本タスクの設計根拠（特に §2.3, §6.1, §7）
2. [必須] `src/lib/infrastructure/repositories/bot-repository.ts` L604-678（`bulkReviveEliminated`）, L862-904（`deleteEliminatedTutorialBots`）
3. [必須] `src/lib/services/bot-service.ts`（`performDailyReset` Step 6 呼び出し箇所）
4. [必須] `docs/architecture/components/bot.md` §2.10 / §5.1 / §6.11
5. [必須] `docs/specs/bot_state_transitions.yaml` #daily_reset
6. [必須] `supabase/migrations/00016_seed_arashi_bot.sql` / `00019_seed_arashi_bot_remaining9.sql`
7. [参考] `src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts` L661-759（既存 `bulkReviveEliminated` テスト）
8. [参考] `features/support/in-memory/bot-repository.ts` L437 前後（in-memory 実装の同期）

## 入力（前工程の成果物）

- `tmp/workers/bdd-architect_TASK-386/design.md` — 完全な設計根拠
- `tmp/workers/bdd-architect_TASK-386/summary.md` — サマリー

## 出力（生成すべきファイル）

### 1. `supabase/migrations/00047_add_revived_at_for_idempotency.sql`（NEW）

```sql
-- =============================================================================
-- 00047_add_revived_at_for_idempotency.sql
-- bulkReviveEliminated 冪等化のため bots.revived_at を追加
-- See: tmp/workers/bdd-architect_TASK-386/design.md §2.3
-- =============================================================================

ALTER TABLE bots
  ADD COLUMN IF NOT EXISTS revived_at TIMESTAMPTZ NULL;

-- 部分 INDEX: 未復活の撃破済みレコードを高速 SELECT するため
CREATE INDEX IF NOT EXISTS idx_bots_pending_revival
  ON bots (bot_profile_key, is_active)
  WHERE revived_at IS NULL;

COMMENT ON COLUMN bots.revived_at IS '撃破されたボットが bulkReviveEliminated で次世代を生成済みであることを示すタイムスタンプ。NULL は未復活（復活対象）、NON-NULL は復活済み（SELECT 対象外）。';
```

**冪等性:** `IF NOT EXISTS` で再実行安全。

### 2. `src/lib/infrastructure/repositories/bot-repository.ts` 改修

#### 2.1 `Bot` 型 / `BotRow` 型に `revivedAt: Date | null` / `revived_at` を追加

`rowToBot()` と `Bot` interface（`domain/models/bot.ts`）の両方を更新。

#### 2.2 `bulkReviveEliminated()` 冪等化

- SELECT 条件に `.is("revived_at", null)` を追加
- 各旧レコードに対して新レコード INSERT 成功後、**同トランザクション相当の順序で旧レコードを UPDATE**:
  ```typescript
  const { error: updateError } = await supabaseAdmin
    .from("bots")
    .update({ revived_at: new Date().toISOString() })
    .eq("id", oldRow.id);
  ```
- INSERT 失敗時は旧レコード UPDATE を行わない（現状と同様にエラー throw）
- **注記**: PostgREST は単一 RPC によるトランザクション境界を持たないため、真の原子性は Supabase Function 化が必要だが、今回は「INSERT成功→UPDATE」の順序を厳格に守ることで実用上十分（二度目の失敗リスクは極小）。アーキテクトの設計書 §2.3 と一致。

#### 2.3 `deleteEliminatedTutorialBots()` → `deleteEliminatedSingleUseBots()` への汎化

- 新メソッド `deleteEliminatedSingleUseBots()` を新設
- 削除対象:
  - `bot_profile_key IN ('tutorial','aori','hiroyuki')` AND `is_active=false`（撃破済み）
  - `bot_profile_key IN ('tutorial','aori','hiroyuki')` AND `created_at < NOW() - INTERVAL '7 days'`（7日経過の未撃破）
- 旧メソッド `deleteEliminatedTutorialBots()` は**削除**（呼び出し元を新メソッドに差し替え）
- コメントの孤児参照（L862 `See: features/welcome.feature @撃破済みチュートリアルBOTは翌日クリーンアップされる`）もこのタイミングで整理（該当タグは存在しないため、代わりに `features/command_aori.feature @煽りBOTは日次リセットで復活しない` などの実在する参照に修正するか、単に `docs/architecture/components/bot.md §2.10 Step 6` を指す）

### 3. `src/lib/services/bot-service.ts` 改修

- `performDailyReset()` Step 6 の `deleteEliminatedTutorialBots()` 呼び出しを `deleteEliminatedSingleUseBots()` に差し替え
- 関連 JSDoc / コメントを更新（「使い切りBOTクリーンアップ」）

### 4. `features/support/in-memory/bot-repository.ts` 同期

- `bulkReviveEliminated` の in-memory 実装に `revived_at` の考慮を同期
- `deleteEliminatedTutorialBots` の in-memory 実装を `deleteEliminatedSingleUseBots` に差し替え
- 既存 BDD テストへの影響を確認し、必要に応じて同期

### 5. 単体テスト追加（`src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts`）

design.md §7.1 のテスト観点を実装:

- `describe("bulkReviveEliminated 冪等性（revived_at 方式）")`
  - 同一 eliminated ボットに対して2回呼び出しても新世代は1体のみ INSERT される
  - SELECT 条件に `revived_at IS NULL` が含まれる
  - INSERT 成功後に旧レコードの `revived_at` が UPDATE される
  - INSERT 失敗時は旧レコードの `revived_at` UPDATE は発生しない
  - tutorial / aori / hiroyuki は依然として除外される（既存挙動維持）

- `describe("deleteEliminatedSingleUseBots")`
  - 撃破済み tutorial / aori / hiroyuki がすべて削除される
  - 7日経過の未撃破 hiroyuki / aori / tutorial も削除される
  - 7日以内の未撃破 hiroyuki は削除されない（境界値テスト）

### 6. 単体テスト追加（`src/__tests__/lib/services/bot-service.test.ts`）

design.md §7.2, §7.3 のテスト観点を実装:

- `describe("performDailyReset 冪等性")`
  - 同日に performDailyReset を2回実行しても荒らし役の active 数は一定（2回目は INSERT されない）

- `describe("performDailyReset Step 6 使い切りBOTクリーンアップ")`
  - deleteEliminatedSingleUseBots が呼ばれる
  - tutorial / aori / hiroyuki 3種とも削除対象に含まれる

### 7. docs 更新

#### 7.1 `docs/architecture/components/bot.md`

- **§2.10 Step 4**: `bulkReviveEliminated` の SELECT 条件に `revived_at IS NULL` 追記、旧レコードに `revived_at = NOW()` を設定する旨を追記
- **§2.10 Step 6**: 「撃破済みチュートリアルBOTのクリーンアップ」を「**使い切りBOTクリーンアップ**（tutorial / aori / hiroyuki）」にリネーム・対象拡張。削除対象1/2 を tutorial → 使い切り全種に展開
- **§5.1 bots テーブル**: `revived_at TIMESTAMPTZ NULL` カラム追加
- **§6.11 インカーネーションモデル**: 「冪等性保証」節を追加（`revived_at IS NULL` 述語による二重復活防止の根拠を記述）

#### 7.2 `docs/specs/bot_state_transitions.yaml`

- `#daily_reset` operations の eliminated→lurking アクションに「旧レコードに `revived_at = NOW()` を設定」追記
- `#daily_reset` operations に「aori / hiroyuki 撃破済み・7日経過クリーンアップ」を追加

## 完了条件

- [ ] migration 00047 がローカル Supabase に適用成功（`npx supabase migration up`）
- [ ] `bulkReviveEliminated()` 冪等性単体テストが PASS（新規5件以上）
- [ ] `deleteEliminatedSingleUseBots()` 単体テストが PASS（新規3件以上）
- [ ] `performDailyReset()` 統合的単体テストが PASS（新規2件以上）
- [ ] 既存単体テスト全件 PASS（`npx vitest run`: 2296+）
- [ ] BDDテスト全件 PASS（`npx cucumber-js`: 411+）
- [ ] 孤児コメント参照の修正（L862）
- [ ] docs 更新完了（bot.md §2.10 / §5.1 / §6.11、state_transitions.yaml #daily_reset）
- [ ] **データ訂正 migration は作らない**（TASK-388 で実施）

## スコープ外

- 本番データの訂正（荒らし役 97 体ソフト削除、hiroyuki 7日経過削除）→ TASK-388
- 新規 BDD シナリオの追加 → 任意の TASK-389（今回は見送り）
- `ubiquitous_language.yaml` の更新 → design.md §5 で「軽微」とされており、必要性が低い場合は省略可
- `architecture.md` §13 の TDR 追加（不要、§6.11 補足で十分）

## 補足・制約

- architect の design.md §2.3 で **`revived_at TIMESTAMPTZ` 方式が推奨案 A (`incarnated_to UUID`) より優れる** と結論されている。実装はこの方式で進める
- hiroyuki クリーンアップは `aori` にも同時適用する（design.md §2.2 拡張条件）
- 既存 `bulkReviveEliminated` 単体テスト（L661-759）は変更するがシグネチャは維持する（後方互換）
- トランザクション境界は厳密な原子性までは要求しない（INSERT 成功後 UPDATE で実用十分、design.md §2.3 末尾）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント（最新）
- 状態: escalated（ESC-TASK-387-2 起票中）
- 中断理由: `command_aori.feature @煽りBOTは日次リセットで復活しない` シナリオが `deleteEliminatedSingleUseBots` の aori 物理削除拡張により failing。`command_aori.steps.ts` の step assertion 修正が必要だが locked_files 外
- 完了済み（ESC-TASK-387-1 解決後に追加された作業分）:
  6. モック定義プロパティ名同期（5テストファイル + in-memory + welcome.steps.ts コメント更新）
  7. in-memory `bot-repository.ts` 実装同期（`bulkReviveEliminated` に `revivedAt == null` フィルタ追加・`deleteEliminatedSingleUseBots` 実装）
  8. 単体テスト追加: `bot-repository.test.ts` 8件 / `bot-service.test.ts` 2件 全 PASS
  9. docs 更新: `bot.md` §2.10 / §5.1 / §6.11 / `bot_state_transitions.yaml #daily_reset`
  10. migration 00047 ローカル Supabase 適用完了
  11. vitest 全 2306 tests PASS
  12. cucumber: 410 PASS / 3 → 1 に縮小（2件は in-memory filter 修正で解決、残 1 件のみ step assertion 改修待ち）
- 次にすべきこと（ESC-TASK-387-2 解決後）:
  - 選択肢A 採用時: `features/step_definitions/command_aori.steps.ts` L714-729 の Then 実装を「削除 OR isActive=false」両対応に修正 → `npx cucumber-js` で全 411 PASS を確認 → 完了報告
  - 選択肢B 採用時: `deleteEliminatedSingleUseBots` の aori 除外を実装修正（production + in-memory + unit test 調整）
- 未解決の問題:
  1. `command_aori.feature` 1 シナリオが failing（locked_files 外 step 実装の修正許可待ち）

### チェックポイント（旧: ESC-TASK-387-1 中断時）
- 状態: escalated（ESC-TASK-387-1 起票中）
- 中断理由: インターフェース名変更 `deleteEliminatedTutorialBots` → `deleteEliminatedSingleUseBots` に伴い、locked_files 外のテストモック定義（5ファイル）および in-memory 実装（1ファイル）の修正が必須となるため、locked_files の範囲確認が必要
- 完了済み:
  1. design.md / 既存コード / 既存テスト / docs の読込完了
  2. `supabase/migrations/00047_add_revived_at_for_idempotency.sql` 作成完了（ALTER TABLE + 部分 INDEX + COMMENT）
  3. `src/lib/domain/models/bot.ts` に `revivedAt: Date | null` 追加
  4. `src/lib/infrastructure/repositories/bot-repository.ts`:
     - `BotRow.revived_at` 追加
     - `rowToBot()` に `revivedAt` マッピング追加
     - `bulkReviveEliminated()` を冪等化（SELECT に `.is("revived_at", null)` 追加・INSERT 後に旧レコードへ UPDATE）
     - `deleteEliminatedTutorialBots` → `deleteEliminatedSingleUseBots` にリネーム＆対象拡張（tutorial/aori/hiroyuki）
  5. `src/lib/services/bot-service.ts`:
     - `IBotRepository` のメソッド名差し替え
     - `performDailyReset` Step 6 の呼び出し先更新＋コメント整備

### 進捗ログ
- 2026-04-17: タスク受領、設計書・既存コード読込完了
- 2026-04-17: migration 00047 作成、bot-repository.ts の冪等化ロジック実装完了
- 2026-04-17: インターフェース名変更の影響範囲調査中、locked_files 外の 5 テストファイルに波及と判明
- 2026-04-17: ESC-TASK-387-1 起票、作業中断
- 2026-04-17: ESC-TASK-387-1 選択肢A で解決。モック定義同期・in-memory 同期・単体テスト追加・docs 更新を実施
- 2026-04-17: migration 00047 ローカル適用・vitest 全 2306 PASS 確認
- 2026-04-17: cucumber-js 初回実行で 3件 failing 発見
  - 2件は in-memory `bulkReviveEliminated` フィルタの `revivedAt === null` → `revivedAt == null` への緩和で解決
  - 1件（`command_aori.feature @煽りBOTは日次リセットで復活しない`）は `deleteEliminatedSingleUseBots` の aori 物理削除により step assertion が壊れる問題。step 実装修正が必要だが locked_files 外のため ESC-TASK-387-2 起票
- 2026-04-17: ESC-TASK-387-2 起票、作業再度中断

### escalation_resolution (ESC-TASK-387-1)

**解決方針: 選択肢A 採用（オーケストレーター自律判断）**

**権限移譲ルール適合性:**
- BDDシナリオ (`features/`) の変更を伴わない ✓
- 公開API契約 (OpenAPI) ・状態遷移仕様 (D-05) の変更を伴わない ✓（state_transitions.yaml の更新は本タスク原計画に含まれ D-05 自体の公開契約変更ではない）
- CLAUDE.md の横断的制約およびTDRに反しない ✓
- セキュリティ・法規制・ユーザー振る舞い影響なし ✓

**承認した追加変更:**
モック定義のプロパティ名機械的書き換えのため、以下をlocked_filesに追加:
- `src/__tests__/lib/services/admin-premium.test.ts`
- `src/__tests__/lib/services/admin-dashboard.test.ts`
- `src/__tests__/lib/services/admin-service.test.ts`
- `src/lib/services/__tests__/admin-service.test.ts`
- `src/__tests__/lib/services/bot-service-scheduling.test.ts`
- `features/support/in-memory/bot-repository.ts`（§4 で元々指示あり）
- `features/step_definitions/welcome.steps.ts`（コメントのみ、必要時のみ修正）
- `src/lib/domain/models/bot.ts`（§2.1 で元々指示あり、明示化）

**制約:**
- 上記ファイルで実施可能なのは「モック定義のプロパティ名変更」および「in-memory実装の同期」のみ
- 当該ファイル群の他のロジック変更・テスト追加は行わない
- 戻り値シグネチャ・呼び出し頻度は不変

**作業再開指示:**
タスク状態を `assigned` に戻した。選択肢A に従い、locked_files 同期 → 新規単体テスト追加 → docs 更新 → 全テスト実行 の順で作業を継続すること。

### テスト結果サマリー

#### 単体テスト (`npx vitest run`)
- 結果: **2306 tests PASS / 120 files PASS**（所要時間: 10.91s）
- 新規追加テスト:
  - `bot-repository.test.ts`: 冪等性 describe ブロックで5件（SELECT 述語・INSERT→UPDATE 連鎖・INSERT 失敗・UPDATE 失敗・2回目 0件）PASS
  - `bot-repository.test.ts`: `deleteEliminatedSingleUseBots` describe で 3件（3 profile keys 対象・7日境界値・delete count 合計）PASS
  - `bot-service.test.ts`: `performDailyReset` 冪等性と Step 6 呼び出し検証 2件 PASS

#### BDDテスト (`npx cucumber-js`)
- 結果: **410 passed / 1 failed / 4 undefined / 18 pending（全 433 scenarios）**
- 初回実行時は 3 件 FAIL（以下の BOT 関連シナリオ）:
  1. `bot_system.feature @撃破済みボットは翌日にHP初期値で復活する` — 解決済み
  2. `bot_system.feature @撃破されたボットの生存日数は撃破時にリセットされる` — 解決済み
  3. `command_aori.feature @煽りBOTは日次リセットで復活しない` — **未解決（ESC-TASK-387-2）**
- 1, 2 は `features/support/in-memory/bot-repository.ts` の `bulkReviveEliminated` フィルタを `revivedAt === null` → `revivedAt == null` に変更して解決（テストヘルパー `createTrollBot` が `revivedAt` を設定しないため、`undefined` を null 等価として扱う必要があった）
- 3 は `deleteEliminatedSingleUseBots` が eliminated 済みの aori レコードを物理削除することが原因。`command_aori.steps.ts` L720 の assertion が「削除」を想定していないため failing。step 実装変更が必要だが locked_files 外のため ESC-TASK-387-2 を起票

### エスカレーション (ESC-TASK-387-2) 起票

- パス: `tmp/escalations/archive/escalation_ESC-TASK-387-2.md`（解決済み）
- 推奨: 選択肢A（`command_aori.steps.ts` L714-729 の assertion を「削除 OR isActive=false」両対応に緩める）
- 対象ファイル（locked_files 外）: `features/step_definitions/command_aori.steps.ts`

### escalation_resolution (ESC-TASK-387-2)

**解決方針: 選択肢A 採用（オーケストレーター自律判断）**

**権限移譲ルール適合性:**
- BDDシナリオテキスト（`features/*.feature`）の変更なし — step 実装内 assertion の修正のみ ✓
- 公開API契約・状態遷移仕様の公開契約変更なし ✓（state_transitions.yaml 更新は原計画に含まれる）
- CLAUDE.md の横断的制約およびTDRに反しない ✓
- ユーザーから見た振る舞い不変 — aori BOT が「復活しない」という意味は保持される ✓（復活とは isActive=true になること。物理削除も「復活していない」に該当）
- design §2.2 で既に検証・採択済みの振る舞い変更の自然な帰結

**承認した追加変更:**
`features/step_definitions/command_aori.steps.ts` を locked_files に追加。修正範囲は**同ファイル L714-729 の Then 実装の assertion 緩和のみ**に限定。

```typescript
if (bot !== null) {
  assert.strictEqual(bot.isActive, false, "煽りBOTが復活しています");
}
```

**制約:**
- 当該ファイルでの修正は「assertion の "bot is null or isActive=false" への緩和」のみ
- feature ファイル（`command_aori.feature`）の変更は禁止
- 他の step 実装への波及変更は禁止
- コメントとして変更理由を明記すること（`// Sprint-154 TASK-387: ...` 形式）

**作業再開指示:**
タスク状態を `assigned` に戻した。選択肢A の変更を適用 → `npx cucumber-js` 再実行で 411+ PASS を確認 → 作業ログにテスト結果を追記 → ステータスを `completed` に更新すること。

### design.md §4.1 の訂正事項
後続作業（TASK-388 完了後または別タスク）で、`tmp/workers/bdd-architect_TASK-386/design.md` §4.1 の BDD 影響分析を訂正すべき（§2.2 の aori 物理削除が step 実装に影響することを追記）。ただし design.md は既に成果物として完了しているため、訂正は必須ではない（本 escalation_resolution セクションに記録することで代替）。

---

### ESC-TASK-387-2 解決後の再開作業（2026-04-17）

#### 実施内容
1. `features/step_definitions/command_aori.steps.ts` L714-729 の Then 実装の assertion を選択肢A に従って緩和:
   - `findById` が null の場合は削除済みとして pass 扱い（early return）
   - 非null の場合のみ `isActive === false` を検証
   - コメントとして `// Sprint-154 TASK-387: deleteEliminatedSingleUseBots により aori は物理削除されるケースと、他テストで is_active=false 残留するケースの両方に対応する。` を追記
   - `docs/architecture/components/bot.md §2.10 Step 6` および該当 feature のタグへの参照コメントを付与

#### 修正範囲（制約遵守）
- 修正対象: `features/step_definitions/command_aori.steps.ts` L714-729 の Then 実装のみ
- feature ファイル（`command_aori.feature`）: 変更なし ✓
- 他の step 実装への波及変更: なし ✓
- 他の locked_files への追加変更: なし ✓

#### 最終テスト結果サマリー

##### 単体テスト (`npx vitest run`)
- **結果: 2306 tests PASS / 120 files PASS**（所要時間: 11.96s）
- 前回セッション比: 変化なし（step 実装修正のため単体テストへの影響なし）

##### BDDテスト (`npx cucumber-js`)
- **結果: 411 passed / 4 undefined / 18 pending / 0 failed**（433 scenarios 合計、所要時間: 2.586s）
- 前回セッション比: 410 passed → **411 passed**（+1）、1 failed → **0 failed**
- `command_aori.feature @煽りBOTは日次リセットで復活しない` が GREEN に遷移
- undefined / pending は本タスクスコープ外の既存状態

#### 完了条件チェック
- [x] migration 00047 がローカル Supabase に適用成功（前セッションで完了）
- [x] `bulkReviveEliminated()` 冪等性単体テストが PASS（新規5件以上）
- [x] `deleteEliminatedSingleUseBots()` 単体テストが PASS（新規3件）
- [x] `performDailyReset()` 統合的単体テストが PASS（新規2件）
- [x] 既存単体テスト全件 PASS（2306 tests）
- [x] BDDテスト全件 PASS（411 passed / 0 failed）
- [x] 孤児コメント参照の修正（L862）
- [x] docs 更新完了（bot.md §2.10 / §5.1 / §6.11、state_transitions.yaml #daily_reset）
- [x] データ訂正 migration は作らない（TASK-388 で実施）

タスク完了。

---

### escalation_resolution (ESC-TASK-387-3)

**問題:** pre-commit フックの TypeScript コンパイルチェックで、`Bot` 型に `revivedAt: Date | null` を必須追加したことにより、既存モック/フィクスチャ群（locked_files 外 4 ファイル）で `revivedAt` プロパティ欠落エラーが 9 件発生。

**エラー対象ファイル:**
- `src/__tests__/lib/services/bot-strategies/strategy-resolver.test.ts` L33
- `src/__tests__/lib/services/bot-strategies/tutorial-strategies.test.ts` L33, L60
- `src/__tests__/lib/services/post-service.test.ts` L152, L178
- `src/lib/services/hiroyuki-service.ts` L215

**解決方針: 選択肢A 採用（オーケストレーター自律判断）**

**権限移譲ルール適合性:**
- BDDシナリオ変更なし ✓
- 公開API契約・状態遷移仕様変更なし ✓
- CLAUDE.md 横断的制約違反なし ✓
- 機械的な `revivedAt: null` プロパティ追加のみ。ロジック・テスト観点・挙動の変更なし ✓

**承認した追加変更:**
上記 4 ファイルを locked_files に追加。修正範囲は**`revivedAt: null` プロパティの機械的追加のみ**。
- 既存フィクスチャ・モックに `revivedAt: null` を既存のプロパティ並びの適切な位置に挿入
- ロジック変更、テスト追加、他の挙動修正は一切禁止
- vitest / cucumber の件数維持を確認（2306 / 411）

**再開作業指示:**
1. 上記 4 ファイルで `revivedAt: null` 追加のみ実施
2. TypeScript コンパイルチェック (`npx tsc --noEmit`) で エラー 0 件を確認
3. vitest 2306 PASS / cucumber 411 PASS 維持を確認
4. 作業ログにテスト結果を追記してステータスを `completed` に更新

---

### ESC-TASK-387-3 解決後の再開作業（2026-04-17）

#### 実施内容
9箇所のエラー箇所すべてに対して `revivedAt: null` を `revealedAt: null` の直後に機械的に追加:

- `src/__tests__/lib/services/bot-strategies/strategy-resolver.test.ts` L33 (`createBot`)
- `src/__tests__/lib/services/bot-strategies/tutorial-strategies.test.ts` L33 (`createTutorialBot`), L60 (`createDefaultBot`)
- `src/__tests__/lib/services/post-service.test.ts` L152 (`createEliminatedBot`), L178 (`createActiveBot`)
- `src/lib/services/hiroyuki-service.ts` L215 (`createBotFn` 呼び出し引数)
- `src/__tests__/lib/services/bot-service-scheduling.test.ts` L35 (`createLurkingBot`)
- `src/__tests__/lib/services/bot-service.test.ts` L33 (`createLurkingBot`)
- `src/lib/services/bot-service.ts` L1754 (`createBotForStrategyResolution`)

#### 修正範囲（制約遵守）
- ロジック変更・テスト観点変更・新規テスト追加: なし ✓
- 上記8ファイル以外の変更: なし ✓
- `revivedAt` に `null` 以外の値を設定: なし（全て `null`）✓
- 並び順: `revealedAt: null` の直後に統一 ✓（`src/lib/domain/models/bot.ts` の型定義順に一致）

#### 最終テスト結果サマリー

##### TypeScript コンパイルチェック (`npx tsc --noEmit`)
- **結果: エラー 0 件** ✓（出力なし = 全 TS ファイルが型整合）

##### 単体テスト (`npx vitest run`)
- **結果: 2306 tests PASS / 120 files PASS**（所要時間: 11.77s）
- 前回セッション比: 変化なし（件数維持）

##### BDDテスト (`npx cucumber-js`)
- **結果: 411 passed / 4 undefined / 18 pending / 0 failed**（433 scenarios 合計、所要時間: 2.245s）
- 前回セッション比: 変化なし（件数維持）

#### 完了条件チェック
- [x] `npx tsc --noEmit` で TypeScript エラー 0 件
- [x] `npx vitest run` で 2306 PASS 維持
- [x] `npx cucumber-js` で 411 passed / 0 failed 維持
- [x] 作業ログに ESC-TASK-387-3 の実施結果を追記、ステータスを `completed` に更新

タスク完了。

