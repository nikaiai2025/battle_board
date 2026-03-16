# タスク: 告発成功ボーナス・冤罪ボーナスの廃止

> ステータス: 未着手
> 起票日: 2026-03-16
> 起票者: アーキテクト（bot_system.feature v5 レビューにて決定）
> 優先度: 高（feature変更済み、コードとの不整合が発生中）

## 背景

!tell の設計意図を「推理ショーの報酬付き道具」から「安全偵察のコスト消費専用コマンド」に変更した。
!attack がBOTマークなしでも実行可能になり、人間への誤攻撃時に賠償金が発生する新仕様を導入。
!tell は賠償金リスクを回避するための偵察手段として位置づけ直された。

## 変更済みfeature（本タスクの前提）

- `features/ai_accusation.feature` v3 → v4
- `features/未実装/bot_system.feature` v4 → v5

## 対応内容

### 1. ドメインルール（accusation-rules.ts）

**ファイル:** `src/lib/domain/rules/accusation-rules.ts`

- `BonusCalculationResult` 型 → 削除または簡素化（ボーナス計算自体が不要に）
- `calculateBonus()` 関数 → 削除（呼び出し元もなくなる）
- `buildHitSystemMessage()` → ボーナス額パラメータを削除。メッセージから通貨付与行を除去
- `buildMissSystemMessage()` → 冤罪ボーナス行を除去。コスト消費のみのメッセージに簡素化

### 2. サービス（accusation-service.ts）

**ファイル:** `src/lib/services/accusation-service.ts`

- `AccusationBonusConfig` → `hitBonus`, `falseAccusationBonus` フィールドを削除。`cost` のみ残す
- `DEFAULT_BONUS_CONFIG` → 同上
- `accuse()` メソッド内:
  - Step 6（ボーナス計算）→ 削除
  - Step 7（ボーナス付与 `CurrencyService.credit` 呼び出し）→ 削除
  - Step 8（DB記録）→ `bonusAmount: 0` 固定に
  - Step 9（メッセージ生成）→ 簡素化されたメッセージ関数を呼ぶ
- `ICurrencyService` → 依存自体の削除を検討（!tell では通貨付与が不要になるため）

### 3. ドメインモデル（currency.ts）

**ファイル:** `src/lib/domain/models/currency.ts`

- `CreditReason` から以下を削除:
  - `"accusation_hit"` — 告発成功報酬
  - `"false_accusation_bonus"` — 冤罪ボーナス

### 4. ドメインモデル（accusation.ts）

**ファイル:** `src/lib/domain/models/accusation.ts`

- `AccusationResult.bonusAmount` → 常に0になるが、フィールド自体は互換性のため残してよい
- JSDocコメントから冤罪ボーナスの記述を除去

### 5. ハンドラ（tell-handler.ts）

**ファイル:** `src/lib/services/handlers/tell-handler.ts`

- 大きな変更なし（AccusationServiceに委譲しているだけ）
- JSDocコメントの更新のみ

### 6. テスト

**ファイル:** `src/__tests__/lib/domain/rules/accusation-rules.test.ts`

- `calculateBonus` のテストスイート → 全削除
- `buildHitSystemMessage` → ボーナス額関連のアサーションを削除
- `buildMissSystemMessage` → 冤罪ボーナス関連のアサーションを削除・更新

**ファイル:** `src/__tests__/lib/services/accusation-service.test.ts`

- `TEST_BONUS_CONFIG` → `hitBonus`, `falseAccusationBonus` を削除
- hit テスト → `currencyService.credit` が呼ばれ**ない**ことを検証に変更
- miss テスト → `currencyService.credit` が呼ばれ**ない**ことを検証に変更
- 冤罪ボーナス関連のテスト → 削除
- カスタムボーナス設定のテスト → 削除

### 7. 確認が必要なファイル（影響調査）

以下のファイルも `accusation` / `冤罪` / `false_accusation` を参照している可能性がある:

- `src/lib/services/command-service.ts`
- `src/lib/services/__tests__/currency-service.test.ts`
- `src/lib/infrastructure/repositories/accusation-repository.ts`
- `src/lib/infrastructure/repositories/currency-repository.ts`

→ `grep "accusation_hit\|false_accusation_bonus\|hitBonus\|falseAccusation"` で全影響箇所を確認すること

## 検証手順

1. `npx vitest run` — 全単体テストパス
2. 告発成功時にボーナスが付与されないことを確認
3. 告発失敗時に冤罪ボーナスが付与されないことを確認
4. システムメッセージからボーナス関連の文言が消えていることを確認

## 作業ログ

（コーディングAIが記録）
