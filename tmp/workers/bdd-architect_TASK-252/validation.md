# Phase 5 HIGH指摘 検証レポート

> Task: TASK-252 (Sprint-85)
> 検証者: bdd-architect
> 検証日: 2026-03-21

---

## H-001: processPendingTutorials の重複スポーンリスク

**検証対象:** `src/lib/services/bot-service.ts` L936-986
**元レポート:** `tmp/workers/bdd-code-reviewer_TASK-253/code_review_report.md`

### 検証結果: 妥当（ただし実影響度は LOW）

指摘の事実関係は正しい。L936-986 のコードは以下の3ステップを単一 try-catch で囲んでいる:

1. `botRepository.create()` -- BOT生成
2. `executeBotPost()` -- 書き込み実行
3. `pendingTutorialRepository.deletePendingTutorial()` -- pending削除

ステップ3が失敗した場合、pending レコードが残存し、次回 cron（5分後）で同一 pending が再処理される。この場合、同一ユーザーに対して2体目のチュートリアルBOTがスポーンされる。

### 影響度の評価

重複スポーンが発生する条件は「BOT生成+書き込みが成功し、かつ pending 削除のみが失敗する」という限定的なケースに限られる。pending 削除は単純な DELETE 文であり、DB接続断以外で失敗する可能性は低い。また、DB接続断であればステップ1-2も失敗する可能性が高く、このケースが単独で発生する確率は極めて低い。

仮に重複スポーンが発生した場合の影響:
- ユーザーに対して2体のチュートリアルBOTが反応する（混乱を招くが、機能的な障害ではない）
- チュートリアルBOTは使い捨てであり、撃破すれば消える
- 通貨バランスへの影響: 2回分の撃破報酬（+20 x 2）が得られる程度

### 修正方針

**推奨: 次スプリント対応（即時修正不要）**

レビュアー提案の「pending 削除を独立 try-catch にする」方式が妥当。BOT生成+書き込みが成功していれば success として記録し、pending 削除失敗はログに記録するのみとする。これにより at-least-once から at-most-once のセマンティクスに変更することなく、結果の正確性が改善される。

なお、「pending 削除を先に行う」方式は推奨しない。pending を先に削除すると、BOT生成や書き込みが失敗した場合にチュートリアルが完全に欠落する（ユーザー体験の損失）。チュートリアルBOTの重複（2体反応）と欠落（0体反応）を比較すると、欠落のほうがユーザー体験への悪影響が大きい。

```typescript
// 推奨修正案
try {
    const newBot = await this.botRepository.create({...});
    const postResult = await this.executeBotPost(newBot.id, ...);

    // BOT生成+書き込み成功を先に記録
    results.push({ pendingId: pending.id, success: true, botId: newBot.id, ... });

    // pending削除は独立。失敗しても結果は変えない
    try {
        await this.pendingTutorialRepository.deletePendingTutorial(pending.id);
    } catch (deleteErr) {
        console.error(
            `BotService.processPendingTutorials: pending=${pending.id} の削除に失敗（BOT書き込みは成功済み）`,
            deleteErr,
        );
    }
} catch (err) {
    // BOT生成 or 書き込みが失敗
    results.push({ pendingId: pending.id, success: false, error: ... });
}
```

加えて、将来的にはべき等性を保証するために `pending_tutorials` テーブルに `processed_at` カラムを追加し、削除ではなくマーク方式に変更することも選択肢となる。ただし MVP 段階ではオーバーエンジニアリングであり、上記の try-catch 分離で十分。

### 対応優先度: 次スプリント

---

## HIGH-1: D-05 currency_state_transitions.yaml の initial_balance

**検証対象:** `docs/specs/currency_state_transitions.yaml` L31-34
**元レポート:** `tmp/workers/bdd-doc-reviewer_TASK-254/doc_review_report.md`

### 検証結果: 妥当（修正必要）

以下の4つの情報源すべてが初期残高 0 を示しており、D-05 のみが旧仕様のまま:

| 情報源 | 初期残高 | ステータス |
|---|---|---|
| D-03 `currency.feature` L20-22 | 0 | v5 更新済み |
| D-08 `currency.md` L78-90 | 0 (INITIAL_BALANCE = 0) | v5 更新済み |
| 実装 `currency-service.ts` L36 | `INITIAL_BALANCE = 0` | v5 更新済み |
| **D-05 `currency_state_transitions.yaml` L31-34** | **50** | **旧仕様のまま** |

D-05 の `feature_ref` も壊れたリンク（旧シナリオ名「新規ユーザー登録時に初期通貨 50 が付与される」）を参照しており、正しいシナリオ名は「新規ユーザー登録時の通貨残高は 0 である」。

### 修正方針

**推奨: 即座に修正**

D-05 は状態遷移の正本であり、BDDシナリオ・実装・D-08 すべてと不整合が生じている。修正範囲は小さく、リスクもない。

```yaml
# 修正前
- name: initial_balance
  description: 新規ユーザー登録時に初期通貨 50 が付与される
  value: 50
  feature_ref: currency.feature#新規ユーザー登録時に初期通貨 50 が付与される

# 修正後
- name: initial_balance
  description: >
    新規ユーザー登録時の通貨残高は 0 である。
    初回書き込み時に welcome_bonus +50 が付与される（welcome.feature 参照）。
  value: 0
  feature_ref: currency.feature#新規ユーザー登録時の通貨残高は0である
```

### 対応優先度: 即座に修正

---

## HIGH-2: D-05 bot_state_transitions.yaml のチュートリアルBOT除外

**検証対象:** `docs/specs/bot_state_transitions.yaml` L166-184, L342-360
**元レポート:** `tmp/workers/bdd-doc-reviewer_TASK-254/doc_review_report.md`

### 検証結果: 妥当（修正必要）

以下の3つの情報源でチュートリアルBOT除外が明記されているが、D-05 には記載がない:

| 情報源 | チュートリアルBOT除外 |
|---|---|
| D-03 `welcome.feature` L141-144 | 「チュートリアルBOTは日次リセットで復活しない」シナリオあり |
| D-08 `bot.md` L165-166 | `bot_profile_key = 'tutorial'` は復活対象から除外と明記 |
| 実装 `bot-repository.ts` L472-477 | `.or("bot_profile_key.is.null,bot_profile_key.neq.tutorial")` で除外実装済み |
| **D-05 `bot_state_transitions.yaml` L170-172** | **guard に除外条件なし** |

D-05 は状態遷移の正本であり、ここに遷移条件が不足しているのは明確な不備。

### 修正方針

**推奨: 即座に修正**

2箇所の修正が必要:

**1. `eliminated -> lurking` 遷移の guard（L170-172）:**

```yaml
# 修正前
guard:
  - ボットの状態が eliminated である

# 修正後
guard:
  - ボットの状態が eliminated である
  - bot_profile_key が 'tutorial' でないこと（チュートリアルBOTは復活対象外。welcome.feature 参照）
```

**2. `daily_reset` セクションの eliminated 対象操作（L353-358）:**

```yaml
# 修正前
- target: eliminated状態のボット
  action: >
    復活処理（is_active=true, is_revealed=false, hp=max_hp, ...）→ lurking

# 修正後
- target: eliminated状態のボット（bot_profile_key != 'tutorial'）
  action: >
    復活処理（is_active=true, is_revealed=false, hp=max_hp, ...）→ lurking
    チュートリアルBOTは復活対象外（welcome.feature 参照）
```

### 対応優先度: 即座に修正

---

## 総括

| 指摘ID | 妥当性 | 実影響度 | 対応時期 |
|---|---|---|---|
| H-001 (コード: 重複スポーン) | 妥当 | LOW (発生確率が極めて低い) | 次スプリント |
| HIGH-1 (D-05: initial_balance) | 妥当 | HIGH (正本の不整合) | 即座に修正 |
| HIGH-2 (D-05: tutorial除外) | 妥当 | HIGH (正本の不整合) | 即座に修正 |

### 推奨アクション

1. **HIGH-1 と HIGH-2 は Sprint-85 のクローズ前に D-05 を修正する。** 修正範囲はドキュメントのみ（YAML の数行変更）であり、コード変更は不要。テスト再実行も不要。
2. **H-001 は次スプリントのバックログに積む。** try-catch 分離の修正は小規模だが、現時点で本番障害リスクは極めて低いため、スプリントの区切りをまたいでも問題ない。
