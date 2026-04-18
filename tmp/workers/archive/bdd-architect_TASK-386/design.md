# TASK-386 設計検証書: 荒らし役BOT増殖 / hiroyuki累積 の原因分析と修正方針

> 種別: 設計検証（読み取り専用・実装変更なし）
> 対象: bots 107 active / hiroyuki 26 active / 要件10 の乖離解消
> 関連: Sprint-152 17日障害解消後の日次リセット複数走行
> 成果物: 本ファイル（design.md）+ summary.md

---

## 1. 原因分析

### 1.1 `bulkReviveEliminated()` 完全コード精査

`src/lib/infrastructure/repositories/bot-repository.ts` L604-678。構造は以下の3ステップ。

| Step | 行 | 処理 |
|---|---|---|
| A | L607-611 | `bots` から `is_active=false` かつ `bot_profile_key` が `tutorial/aori/hiroyuki` 以外（または NULL）のレコードを SELECT |
| B | L620-638 | 取得した各旧レコードをループ |
| C | L642-675 | 各旧レコードについて、同じ `name / persona / bot_profile_key / max_hp` で **新規 INSERT**（新 UUID・新 daily_id・is_active=true） |

**決定的欠陥**: Step A の SELECT 条件には「**この旧レコードから既に新世代を生成済みか**」を判定する述語が**一切ない**。旧レコードは「`is_active=false` のまま凍結保持」が設計意図（§6.11 インカーネーションモデル）なので、何度 `bulkReviveEliminated()` を呼んでも同じレコードが再ヒットする。

### 1.2 非冪等性の帰結（発生経路）

```
Day0:  10体 active（正常）
Day1: 10体撃破 → 日次リセット実行 → 旧10体 is_active=false のまま凍結、新10体 INSERT
     この時点で bots 総数 = 20, active = 10（健全）

Sprint-152 17日間インシデント発生。日次リセットが17日分滞留。

解消日: 滞留していた日次リセットが複数回実行される
  1回目: SELECT ヒット = 旧10体 → 10体 新規 INSERT → active = 20
  2回目: SELECT ヒット = 旧10体（同じまま）→ さらに 10体 INSERT → active = 30
  ...N回目: active = 10 + 10N
```

本番観測値 `active = 107` は N = 約9〜10回（10 + 10×9.7 ≒ 107）と整合する。Sprint-152 の障害解消オペレーション（`bulk_update_daily_ids` 修正後の再投入）で daily-reset ルートが複数回呼ばれた可能性が高い。

**補足**: `countLivingBots()` / `findDueForPost()` / `updateHp()` など本番機能は全て新世代レコード（is_active=true）のみを対象とするため、動作不全は顕在化しづらい（DB膨張・統計不正確・cron 負荷増のみが表面化する）。

### 1.3 hiroyuki 累積の原因

`src/lib/services/hiroyuki-service.ts` L215-228（`completeHiroyukiCommand`）で、`!hiroyuki` 召喚が成功するたびに `createBotFn` で新規 `bot_profile_key='hiroyuki'` レコードが INSERT される。

- 撃破された hiroyuki は `is_active=false` で凍結される（これは正常）
- 撃破されない hiroyuki は `is_active=true` のまま残り続ける
- `bulkReviveEliminated()` の除外リストには hiroyuki が含まれているため、撃破済み hiroyuki は復活対象外（正常）
- ただし `deleteEliminatedTutorialBots()` 相当のクリーンアップは **tutorial 専用**で、aori / hiroyuki には存在しない

したがって hiroyuki は:
1. 撃破された → `is_active=false` で永続残留（DB 増加のみ）
2. 撃破されなかった → `is_active=true` で永続残留（**active 26体の実害**。荒らし役と共に cron で投稿対象になる）

aori も同じ構造だが、ステルスコマンドのため召喚頻度が hiroyuki より低く、現在は本番で顕在化していないだけで**潜在的に同じ問題**を抱える。

### 1.4 本番 created_at 集中パターン（推測）

オーケストレーター提示のとおり、荒らし役 active 107 体の `created_at` は Sprint-152 解消日（2026-04 の該当日）に集中しているはず。旧10体（2026-03 以前の seed/復活日時）と、復活日の新世代 10×N 体という2山構造を想定。

---

## 2. 推奨案との整合性判断

### 2.1 Q1（荒らし役 107 → 10 縮退）: **推奨案 A に同意**

**推奨案 A**: 最新 `created_at` 10 体を残し 97 体を `is_active=false` ソフト削除。

**同意根拠**:
- §6.11 インカーネーションモデルは「旧レコードを is_active=false で凍結保持」が設計意図。物理 DELETE は設計と不整合。
- `bot_posts` FK の整合性を保てる（bulk_update_daily_ids のマイグレーションでも FK を CASCADE 化済み）。
- 「最新 created_at」は「最新世代」と等価であり、cron や countLivingBots の挙動と整合。
- 撃破履歴（survival_days / total_posts / accused_count / times_attacked）は新世代では 0 にリセットされる設計のため、旧レコードを凍結保持しても履歴表示（管理画面 `findEliminated`）で別物と分離される。

**代替案 B（total_posts 上位10体残し）却下理由**: 「長く活動した個体を保存する」意図は分かるが、bots は毎日リセットされる前提なので 1 日分の total_posts 差で残す個体を決めても意味が薄い。さらに SELECT 順序が非決定的（NULL / 同値 tie-break）になりやすい。

**代替案 C（物理DELETE + seed再実行）却下理由**: §6.11 の設計と反する。`bot_posts` FK CASCADE が効いているとはいえ、過去日の bot_posts レコードが物理削除されると既存スレッド表示のボット判定（`isBot()`）が false に反転する可能性がある（旧日の撃破判定が壊れる）。

### 2.2 Q2（hiroyuki 26 体の扱い）: **推奨案 A に条件付き同意**

**推奨案 A**: hiroyuki を tutorial と同様にクリーンアップ対象に追加。

**条件付き同意の内容**:
- **同意**: 撃破済み hiroyuki（`is_active=false`）は日次クリーンアップで物理削除する
- **追加提案**: 7日経過の未撃破 hiroyuki（`is_active=true` のまま放置）も削除対象に含める（tutorial と同一ルール）
- **追加提案**: aori にも同一クリーンアップを拡張適用する（現在は顕在化していないだけで同じ爆発リスクを持つ）
- **制約事項**: aori / hiroyuki の「未撃破 active を削除」は、プレイヤーが召喚した直後のBOTに対する操作になる。保持期間を「7日」に設定することで、召喚〜放置の間にユーザーが攻撃できる猶予を十分確保する。

**代替案 B（放置）却下理由**: 仕様上「使い切り」と明記されているのに累積するのは明らかに設計意図と反する。「仕様上正しい残存」とはみなせない。

**代替案 C（全 26 体を is_active=false で凍結）却下理由**: 未撃破 hiroyuki を管理者が強制 eliminate するのは、ユーザーへの通知なしにゲーム進行を変える操作で行動原則に反する。物理削除（削除対象が「7日経過」基準）の方が自然。ただし**今回の 26 体データ訂正に限っては**、直近 N日以内に召喚されたものだけ残し、古いものを物理削除する一括クリーンアップで十分（ソフト削除不要）。

### 2.3 Q3（冪等化方式）: **推奨案 A を修正して代替 B に寄せた統合案**

**推奨案 A**: 旧レコードに `incarnated_to` (UUID) カラムを追加、SELECT 時に除外。

**最終推奨（統合案 B'）**: **`bots` テーブルに `revived_at TIMESTAMPTZ` カラムを追加**（代替 B）し、`bulkReviveEliminated()` の SELECT 条件に `revived_at IS NULL` を追加する。新世代 INSERT 時に旧レコードを `UPDATE SET revived_at = NOW()` する。

**推奨 A を採用しない理由（技術的）**:
- `incarnated_to` は「旧 → 新」の**参照関係**を持つため、将来の他の世代からの復活（多重復活）シナリオでセマンティクスが曖昧になる（FK 制約の向きも不自然）。
- シンプルに「復活済みかどうか」だけを判定したいなら、単純なタイムスタンプで十分。
- `incarnated_to` に新 UUID を入れる処理は、新レコード INSERT 後に旧レコードを UPDATE する必要があり、結局2操作必要。`revived_at = NOW()` も同じ操作数。

**代替 C（created_at 近接レコード重複検知）却下理由**:
- 時系列近接判定は境界値問題が避けられない（1秒差なら重複？10秒差なら別？）。
- バッチ遅延や複数リージョン書き込みで時刻がずれた場合、誤判定が発生する。
- アプリロジックでの暗黙ルールは保守性が低い。

**統合案 B' の実装方針（概略。実装は TASK-387）**:

```
-- Step 1: bots にカラム追加
ALTER TABLE bots
  ADD COLUMN revived_at TIMESTAMPTZ NULL;
CREATE INDEX idx_bots_revived_at_null
  ON bots (bot_profile_key, is_active)
  WHERE revived_at IS NULL;

-- Step 2: bulkReviveEliminated() の SELECT 条件
WHERE is_active = false
  AND revived_at IS NULL
  AND (bot_profile_key IS NULL
       OR bot_profile_key NOT IN ('tutorial','aori','hiroyuki'))

-- Step 3: 新レコード INSERT と同一トランザクションで
UPDATE bots SET revived_at = NOW() WHERE id = :old_id
```

**冪等性保証**:
- 同じ旧レコードに対して2回 `bulkReviveEliminated()` が呼ばれても、2回目の SELECT で `revived_at IS NOT NULL` によりヒットしない。
- トランザクション境界: 「旧レコード UPDATE + 新レコード INSERT」を1トランザクションで囲む（片方だけ成功する中間状態を防ぐ）。現実装はループ内で順次 INSERT するのみでトランザクションなし。TASK-387 ではこの点も改善する。

---

## 3. 代替案比較（表形式）

### 3.1 Q1 比較（荒らし役縮退方式）

| 案 | メリット | デメリット | 再発防止効果 | 移行コスト |
|---|---|---|---|---|
| **A: 最新10体残し97体ソフト削除** | §6.11 と整合、FK 安全、履歴保持、管理画面 findEliminated が自然に機能 | クエリ精度が `created_at DESC LIMIT 10` に依存 | なし（Q3 とセット） | 小（1 UPDATE 文） |
| B: total_posts 上位10体 | 「活発な個体を残す」建前 | 日次リセット前提では意味なし、tie-break 不安定 | なし | 小 |
| C: 物理DELETE + seed再実行 | データがきれいになる | bot_posts CASCADE で過去のボット判定が反転、履歴喪失、§6.11 と反する | なし | 中（migration 2本） |

### 3.2 Q2 比較（hiroyuki 累積対応）

| 案 | メリット | デメリット | 再発防止効果 | 移行コスト |
|---|---|---|---|---|
| **A': tutorial 流クリーンアップ + aori 拡張** | 使い切り仕様と整合、将来 aori 爆発も予防 | BDD に明示シナリオなし（但し設計コメントでは「使い切り」明記） | あり（以降累積しない） | 小（既存 `deleteEliminatedTutorialBots` のパラメタ化） |
| B: 放置 | 変更なし | DB 膨張継続、cron 負荷増、active 数不正確 | なし | ゼロ |
| C: 全 26 体を is_active=false で凍結 | 一度きりで完了 | 未撃破 BOT をユーザー通知なしに管理者が eliminate するのは UX 不適切 | なし（根本原因が残る） | 小 |

### 3.3 Q3 比較（冪等化方式）

| 案 | メリット | デメリット | 再発防止効果 | 移行コスト |
|---|---|---|---|---|
| A: `incarnated_to UUID` | 世代の親子関係を追跡可能 | 参照の向きが不自然、多重復活で意味曖昧、結局 UPDATE も必要 | あり | 中（FK 追加 + UPDATE 処理） |
| **B'（推奨統合案）: `revived_at TIMESTAMPTZ`** | シンプル、タイムスタンプで観測性も得られる、部分 INDEX で軽量 | 親子関係は追跡不可（必要なら別カラム） | あり | 小（1 カラム + 1 INDEX） |
| C: created_at 近接検知 | スキーマ変更なし | 境界問題で誤判定、時刻ずれ耐性なし | 弱い | 小だが信頼性低 |

---

## 4. BDD 影響分析

### 4.1 既存 BDD シナリオとの整合性

| シナリオ | 影響 | 変更要否 |
|---|---|---|
| `bot_system.feature` L116-118「荒らし役ボットは10体が並行して活動する」 | データ訂正後は 10 体に収束するため遵守される | なし |
| `bot_system.feature` `@撃破済みボットは翌日にHP初期値で復活する` | 冪等化後も復活挙動自体は不変（1日1回の復活は保証される） | なし |
| `bot_system.feature` `@翌日になるとBOTマークが解除され新しい偽装IDで再潜伏する` | 不変 | なし |
| `welcome.feature` 「チュートリアルBOTは日次リセットで復活しない」 | hiroyuki/aori にも同じ "使い切り" 性質が拡張適用されるが、既存シナリオには影響なし | なし |
| `command_aori.feature` L110-113 「煽りBOTは日次リセットで復活しない」 | 既存復活除外ロジックは不変 | なし |
| `command_hiroyuki.feature` L40 コメント「使い切り（1回書き込み・定期書き込みなし・日次リセットで復活しない）」 | コメントのみで Scenario は未定義。挙動一致 | なし |

### 4.2 新規シナリオ要否

**結論: 新規 BDD シナリオ追加は必須ではない（人間承認ゲートは原則不要）。**

理由:
1. 既存のチュートリアルBOTクリーンアップ（§2.10 Step 6）も feature ファイル内に独立 Scenario として記述されていない（コード側コメントで `welcome.feature @撃破済みチュートリアルBOTは翌日クリーンアップされる` と参照しているが、welcome.feature 内に該当タグは実在しない＝**孤児参照**）。
2. クリーンアップは「ユーザーから見た振る舞いが変わらない内部メンテナンス処理」に該当（CLAUDE.md エスカレーション条件に該当しない）。
3. hiroyuki / aori クリーンアップは「使い切り」仕様の逆説的帰結であり、feature コメントの範囲内。

**ただし**以下の**軽微な改善提案**は人間承認を経て実施する余地あり（必須ではなく推奨）:
- `command_hiroyuki.feature` に `command_aori.feature` L110-113 と同形式の「ひろゆきBOTは日次リセットで復活しない」 Scenario を追加する（既存仕様の明文化。振る舞い変更ではなくドキュメント化）。
- `features/bot_system.feature` または専用ファイルに「冪等性: 日次リセット処理を同日に複数回実行しても荒らし役は10体を維持する」Scenario を追加する（今回の障害再発を BDD でガードする）。

→ 上記2つは TASK-387 実装と並行ではなく、**先行で人間承認を取った方が安全**。オーケストレーター判断を仰ぐ。

### 4.3 docs コメント孤児参照の修正（軽微）

`src/lib/infrastructure/repositories/bot-repository.ts` L862 の `See: features/welcome.feature @撃破済みチュートリアルBOTは翌日クリーンアップされる` は welcome.feature に該当タグが存在しない。TASK-387 で hiroyuki クリーンアップを追加する際にまとめて修正するか、別タスクで整理する。

---

## 5. docs 変更範囲

| ドキュメント | 変更種別 | 内容 |
|---|---|---|
| `docs/architecture/components/bot.md` §2.10 | 更新 | Step 4（`bulkReviveEliminated`）に `revived_at IS NULL` 条件追記 |
| `docs/architecture/components/bot.md` §2.10 | 更新 | Step 6（`deleteEliminatedTutorialBots`）を「hiroyuki / aori を含む**使い切りBOTクリーンアップ**」にリネーム・対象拡張 |
| `docs/architecture/components/bot.md` §5.1 | 更新 | bots テーブル変更行に `revived_at TIMESTAMPTZ NULL` を追加 |
| `docs/architecture/components/bot.md` §6.11 | 更新 | 「冪等性保証」節を追加（`revived_at` 方式の根拠） |
| `docs/specs/bot_state_transitions.yaml` #daily_reset | 更新 | operations の eliminated→lurking action に「旧レコードに revived_at = NOW() を設定」追記 |
| `docs/specs/bot_state_transitions.yaml` #daily_reset | 更新 | operations に「aori / hiroyuki 撃破済みクリーンアップ」を追加 |
| `docs/requirements/ubiquitous_language.yaml` | 更新（軽微） | 「インカーネーション世代」「復活済み（revived_at）」の用語定義を追加 |
| `docs/architecture/architecture.md` §13 | 追加なし | TDR-010 は cron 間隔の話なので別 TDR 起票の必要はなし。インカーネーション冪等化は §6.11 の補足で十分 |
| `CLAUDE.md` | 変更なし | 原則変更なし |

---

## 6. 後続タスク分解提案

### 6.1 TASK-387（ロジック実装 + マイグレーション）

**スコープ**:
1. `bots.revived_at TIMESTAMPTZ NULL` カラム追加 + 部分 INDEX
2. `BotRepository.bulkReviveEliminated()` 改修: SELECT 条件に `revived_at IS NULL` 追加、INSERT 成功時に旧レコードを `UPDATE SET revived_at = NOW()`、かつ旧レコード UPDATE と新レコード INSERT を1トランザクション（PostgREST では現実装同様だが、RPC 関数化で原子性を確保するのが望ましい）
3. `BotRepository.deleteEliminatedSingleUseBots()` を新設（`deleteEliminatedTutorialBots()` を汎化）: `bot_profile_key IN ('tutorial','aori','hiroyuki')` AND (`is_active=false` OR `created_at < NOW() - 7日`) を削除
4. `BotService.performDailyReset()` Step 6 の呼び出し先を差し替え
5. docs 更新（§5 の範囲）
6. 単体テスト追加（§7）

**locked_files 候補**:
- `supabase/migrations/NEW_revive_idempotency.sql`
- `supabase/migrations/NEW_cleanup_single_use_bots.sql`
- `src/lib/infrastructure/repositories/bot-repository.ts`
- `src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts`
- `src/lib/services/bot-service.ts`
- `src/__tests__/lib/services/bot-service.test.ts`
- `docs/architecture/components/bot.md`
- `docs/specs/bot_state_transitions.yaml`

**依存**: TASK-388 とは**並行実施不可**。TASK-387 のマイグレーションが先に本番適用されないと、TASK-388 のデータ訂正で新世代 10 体に `revived_at = NULL` を正しく付与できない（革命中間状態で再増殖が起きうる）。

### 6.2 TASK-388（データ訂正マイグレーション）

**スコープ**:
1. 荒らし役 107 体のうち、`is_active=true` の中で `created_at` が最新の 10 体を残し、**残り 97 体を `is_active=false` かつ `revived_at = NOW()` に更新**（ソフト削除 + 復活済みマーカー付与で冪等化）
2. `bot_profile_key='hiroyuki'` かつ `is_active=true` のうち 7 日経過したものを `is_active=false` に降格、または直接物理削除（人間承認の方針に従う）
3. 本番反映前にステージングで `SELECT COUNT(*) FROM bots WHERE bot_profile_key='荒らし役' AND is_active=true` 確認
4. 反映後、`bot_scheduler` cron が正常動作することを確認（10 体が投稿サイクルに乗る）

**locked_files 候補**:
- `supabase/migrations/NEW_data_correction_bots_purge.sql`
- `docs/operations/runbooks/` 配下に手順書（任意）

**依存**: **TASK-387 完了後でないと実施不可**（`revived_at` カラムが存在しない状態で UPDATE できない）。

**実施順序の絶対制約**:

```
TASK-387 (マイグレーション + コード改修 + docs + 単体テスト)
    ↓ 本番反映
TASK-388 (データ訂正のみ、事実上1本の migration)
```

### 6.3 オプション: TASK-389（BDD シナリオ追記）

**スコープ**（人間承認必須）:
- `command_hiroyuki.feature` に「ひろゆきBOTは日次リセットで復活しない」Scenario 追加
- `bot_system.feature` に「日次リセットは冪等である」Scenario 追加（再発防止用）

**依存**: TASK-387/388 と独立。振る舞いの変更ではなく既存仕様の明文化のみなので、先行実施も可能。

---

## 7. 単体テスト追加提案

### 7.1 `bot-repository.test.ts` への追加

既存 `describe("bulkReviveEliminated")` 内に **冪等性テスト** を新設する。

```typescript
describe("bulkReviveEliminated 冪等性（revived_at 方式）", () => {
  it("同一 eliminated ボットに対して連続2回呼び出しても新世代は1体のみ INSERT される", async () => {
    // Arrange: eliminated かつ revived_at=null の bot 1件をセット
    // 1回目の SELECT は 1件ヒット → INSERT 1回 + 旧レコード UPDATE
    // 2回目の SELECT は revived_at=NOT NULL で 0件 → INSERT されない

    // Assert: INSERT が正確に1回だけ呼ばれる
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("SELECT 条件に revived_at IS NULL が含まれる", async () => {
    // フィルタ文字列に "revived_at.is.null" が渡されることを確認
  });

  it("INSERT 成功後に旧レコードの revived_at が UPDATE される", async () => {
    // mockUpdate が呼ばれ、対象 id が旧レコード id、revived_at が non-null であること
  });

  it("INSERT 失敗時は旧レコードの revived_at UPDATE は発生しない（ロールバック相当）", async () => {
    // INSERT がエラーを返すシナリオ
    // Assert: mockUpdate は呼ばれない、エラーが throw される
  });

  it("tutorial / aori / hiroyuki は依然として除外される（既存挙動維持）", async () => {
    // 除外 or 条件に bot_profile_key.not.in.(tutorial,aori,hiroyuki) が含まれる
  });
});
```

### 7.2 `bot-service.test.ts` への追加（performDailyReset）

```typescript
describe("performDailyReset 冪等性", () => {
  it("同日に performDailyReset を2回実行しても荒らし役は10体以下を維持する", async () => {
    // Arrange: 荒らし役 10 体 (is_active=true), 昨日撃破済み1体 (is_active=false, revived_at=null)
    // Act: performDailyReset() を 2 回連続実行
    // Assert:
    //   1回目: 新世代1体 INSERT → 合計 11 (10 active + 1 frozen + 1 new active = 12)
    //   2回目: 撃破済みの revived_at IS NOT NULL でヒットゼロ → INSERT なし
    //   最終的な is_active=true 件数 = 11
  });
});
```

### 7.3 `bot-service.test.ts` への追加（使い切りクリーンアップ）

```typescript
describe("performDailyReset Step 6 使い切りBOTクリーンアップ", () => {
  it("撃破済み hiroyuki / aori / tutorial がすべて削除される", async () => {
    // 削除対象の profile_key 配列が tutorial / aori / hiroyuki を全て含むこと
  });

  it("7日経過の未撃破 hiroyuki も削除される", async () => {
    // created_at < NOW() - 7日 の active hiroyuki も削除対象になること
  });

  it("7日以内の未撃破 hiroyuki は削除されない", async () => {
    // 召喚直後のユーザー体験を保護する
  });
});
```

### 7.4 テスト観点のまとめ

| 観点 | 目的 | 必須度 |
|---|---|---|
| 同日2回実行の冪等性 | 今回の障害再発防止 | 必須 |
| SELECT 条件の正確性 | `revived_at IS NULL` 漏れ検知 | 必須 |
| 旧レコード UPDATE の確実性 | 新世代 INSERT 直後の UPDATE 実行確認 | 必須 |
| INSERT 失敗時の挙動 | 旧レコードの状態維持（整合性保護） | 推奨 |
| 既存除外リストの維持 | 回帰バグ防止 | 必須 |
| 7日基準のクリーンアップ境界値 | UX 保護（直近召喚BOTの誤削除防止） | 必須 |

---

## 8. 人間承認ゲートに関する最終結論

**必須でない**: Q1/Q2/Q3 の推奨案はすべて「内部の管理・冪等化」に関する変更であり、ユーザーから見た振る舞い（BDD シナリオ）は変更されない。

**推奨（必須ではない）**: TASK-389 として、既存仕様の明文化（hiroyuki の復活不可シナリオ、冪等性シナリオ）を BDD に追加することを提案。これは人間承認が必要だが、TASK-387/388 とは独立に進められる。

**特記事項**: オーケストレーターが「BDD シナリオ変更が必要と判断した場合」の分岐に入ることを懸念していたが、**今回は入らない**。TASK-387/388 は即時起票可能。

---

## 9. 参照

- 実装: `src/lib/infrastructure/repositories/bot-repository.ts` L604-678, L867-904
- 設計書: `docs/architecture/components/bot.md` §2.10, §5.1, §6.11
- 状態遷移: `docs/specs/bot_state_transitions.yaml` #daily_reset
- BDD: `features/bot_system.feature` L116-118, L465-470 / `features/command_aori.feature` L110-113 / `features/command_hiroyuki.feature` L40
- Seed: `supabase/migrations/00016_seed_arashi_bot.sql`, `00019_seed_arashi_bot_remaining9.sql`
- 関連 Sprint: Sprint-152 17日障害解消（`1389dcf` 前後）
