# Doc Review Report: TASK-254 (Sprint-85)

> Reviewer: bdd-doc-reviewer
> 対象スプリント: Sprint-85
> レビュー日: 2026-03-21
> 対象ドキュメント:
>   - docs/architecture/components/bot.md
>   - docs/architecture/components/posting.md
>   - docs/architecture/components/currency.md
>   - features/welcome.feature (参照)
>   - features/mypage.feature (参照)

---

## 検出事項

### [HIGH-1] D-05 currency_state_transitions.yaml: initial_balance 制約が更新されていない

**重要度:** HIGH
**カテゴリ:** ドキュメント間の整合性（D-05 vs D-03/D-08）
**確信度:** 95%

D-05 `docs/specs/currency_state_transitions.yaml` の `constraints` セクション（L31-34）に以下の記載が残っている:

```yaml
- name: initial_balance
  description: 新規ユーザー登録時に初期通貨 50 が付与される
  value: 50
  feature_ref: currency.feature#新規ユーザー登録時に初期通貨 50 が付与される
```

Sprint-84 の Currency v5 変更により:
- 初期残高は **0** に変更済み（D-08 currency.md 5 "Currency v5: 初期残高 0 への変更" で明記）
- 初回書き込み時に `welcome_bonus` として +50 が付与される方式に移行済み
- `features/currency.feature` のシナリオ名は「新規ユーザー登録時の通貨残高は **0** である」に変更済み
- `feature_ref` のリンク先も存在しない旧シナリオ名を参照している

**修正案:**
```yaml
- name: initial_balance
  description: >
    新規ユーザー登録時の通貨残高は 0 である。
    初回書き込み時に welcome_bonus として +50 が付与される（welcome.feature 参照）。
  value: 0
  feature_ref: currency.feature#新規ユーザー登録時の通貨残高は0である
```

**該当ファイル:** `docs/specs/currency_state_transitions.yaml` (L31-34)

---

### [HIGH-2] D-05 bot_state_transitions.yaml: eliminated -> lurking 遷移にチュートリアルBOT除外条件が記載されていない

**重要度:** HIGH
**カテゴリ:** ドキュメント間の整合性（D-05 vs D-03/D-08）
**確信度:** 90%

D-05 `docs/specs/bot_state_transitions.yaml` の `eliminated -> lurking` 遷移（L166-184）では、guard 条件が「ボットの状態が eliminated である」のみとなっている。チュートリアルBOT (`bot_profile_key = 'tutorial'`) の除外条件が記載されていない。

一方:
- D-08 bot.md 2.10（L164-167）では明確に「チュートリアルBOT（`bot_profile_key = 'tutorial'`）は復活対象から除外する」と記載
- features/welcome.feature には「チュートリアルBOTは日次リセットで復活しない」シナリオが存在
- 実装コードの `bulkReviveEliminated()` でも除外が実装済み

D-05 は状態遷移の正本であり、遷移条件の不備はBDDシナリオとの不整合を意味する。

**修正案:** `eliminated -> lurking` 遷移の guard に以下を追加:
```yaml
guard:
  - ボットの状態が eliminated である
  - bot_profile_key が 'tutorial' でないこと（チュートリアルBOTは復活対象外）
```
`daily_reset` セクションの `eliminated` 対象操作にも同様の除外注記を追記すべき。

**該当ファイル:** `docs/specs/bot_state_transitions.yaml` (L166-184, L354-358)

---

### [MEDIUM-1] D-08 posting.md: 依存関係テーブル(3.1)に CurrencyService と PendingTutorialRepository が記載されていない

**重要度:** MEDIUM
**カテゴリ:** ドキュメントとコードの整合性（D-08 vs 実装）
**確信度:** 95%

posting.md の 5「ウェルカムシーケンス」Step 6.5 で以下を呼び出すことが本文に記載されている:
1. `CurrencyService.credit(userId, 50, "welcome_bonus")`
2. `PendingTutorialRepository.create()`

しかし 3.1「依存先」テーブルにはいずれも記載されていない。実装コード（`post-service.ts`）でも両方を import して使用していることを確認済み。

**修正案:** 依存先テーブルに以下を追加:

| コンポーネント | 依存の性質 |
|---|---|
| CurrencyService | 初回書き込み検出時に welcome_bonus +50 を付与。失敗しても書き込みを巻き戻さない |
| PendingTutorialRepository | 初回書き込み検出時にチュートリアルBOTのキューイング。失敗しても書き込みを巻き戻さない |

**該当ファイル:** `docs/architecture/components/posting.md` (L65-74)

---

### [MEDIUM-2] D-08 currency.md: 被依存(3.2)に PostService が記載されていない

**重要度:** MEDIUM
**カテゴリ:** ドキュメントとコードの整合性（D-08 vs 実装）
**確信度:** 95%

currency.md の 3.2「被依存」に PostService が記載されていない。Sprint-84 で PostService が `CurrencyService.credit(userId, 50, "welcome_bonus")` を直接呼び出すようになったため、被依存に追加が必要。

現在の被依存リスト:
```
CommandService     ->  CurrencyService.deduct()
AccusationService  ->  CurrencyService.credit()
IncentiveService   ->  CurrencyService.credit()
BotService         ->  CurrencyService.credit()
Web APIRoute       ->  CurrencyService.getBalance()
```

**修正案:** 以下を追加:
```
PostService        ->  CurrencyService.credit()（初回書き込みボーナス welcome_bonus）
```

**該当ファイル:** `docs/architecture/components/currency.md` (L51-57)

---

### [LOW-1] features/welcome.feature: シナリオ名とヘッダーコメントで cron 実行基盤の表記が不一致

**重要度:** LOW
**カテゴリ:** ドキュメント内の整合性
**確信度:** 80%

welcome.feature のヘッダーコメント（L11）では:
```
# ③ チュートリアルBOT応答（!w + 挑発） <- 非同期：Cloudflare Cron（5分間隔）
```
と記載されている。

一方、シナリオ名（L146-149）では:
```
Scenario: チュートリアルBOTはGitHub Actions cronの定期書き込みを行わない
  When ボットの定期実行（GitHub Actions cron）が行われる
```
と記載されている。

D-08 bot.md 3.2 では、荒らし役BOT + チュートリアルBOTの cron は CF Cron に移行済み（TDR-013）で、GitHub Actions は Phase 3 以降の AI API BOT 用として残されている。

このシナリオの意図は「チュートリアルBOTは通常BOTの定期書き込みサイクルに含まれない」ことの検証であり、実行基盤が GitHub Actions でも CF Cron でも検証の本質は同じだが、用語の一貫性が欠けている。ただし features ファイルの変更は人間承認が必要なため、ここでは指摘に留める。

**該当ファイル:** `features/welcome.feature` (L11, L146-149)

---

## 確認済み（問題なし）

以下の項目は検証の結果、整合性に問題がないことを確認した。

1. **D-08 bot.md: チュートリアルBOT Strategy 設計（2.11, 2.13.3）** -- welcome.feature のシナリオ（スポーン、HP:10、!w反応、1回撃破、毎回新規、日次リセット非復活、cron非書き込み）と整合
2. **D-08 posting.md: PostInput.botUserId フィールド** -- bot.md 6.10 との相互参照が正しく設定されている
3. **D-08 posting.md: ウェルカムシーケンス Step 6.5/11.5** -- welcome.feature のシナリオ名が See 参照で正しくリンクされている
4. **D-08 currency.md: Currency v5** -- currency.feature「新規ユーザー登録時の通貨残高は 0 である」およびwelcome.feature「初回書き込みボーナスとして+50が付与されレス末尾にマージ表示される」との整合を確認
5. **BDDステップ定義** -- welcome.steps.ts / mypage.steps.ts が存在し、D-10 テスト戦略書の「1 feature = 1 stepsファイル」原則に準拠。InMemoryPendingTutorialRepo も in-memory ディレクトリに配置済み
6. **ユビキタス言語辞書** -- 通貨の定義に「初回書き込み時に初回書き込みボーナス+50が付与される（welcome.feature参照）」が追加されており、D-08/D-03 との整合を確認
7. **BDDシナリオのステップ定義カバレッジ** -- welcome.feature 全11シナリオ、mypage.feature 全シナリオに対応するステップ定義が実装済み（Sprint-85 結果: 274 passed, 0 failed）
8. **D-08 bot.md: CF Cron / GitHub Actions の被依存記載** -- TDR-013 に基づく CF Cron への移行が 3.2 被依存に正しく反映されている

---

## レビューサマリー

| 重要度   | 件数  | ステータス |
|----------|-------|-----------|
| CRITICAL | 0     | pass      |
| HIGH     | 2     | warn      |
| MEDIUM   | 2     | info      |
| LOW      | 1     | note      |

判定: WARNING -- マージ前に2件のHIGHな問題を解決してください。

### HIGH の概要

1. **D-05 currency_state_transitions.yaml** の `initial_balance` 制約が旧仕様（初期残高50）のまま。Currency v5（初期残高0 + welcome_bonus方式）に更新が必要。feature_ref のリンク先も壊れている。
2. **D-05 bot_state_transitions.yaml** の `eliminated -> lurking` 遷移にチュートリアルBOT除外条件が欠落。D-08 bot.md / welcome.feature / 実装では除外が明記・実装済みだが、状態遷移の正本に反映されていない。
