# D-08 コンポーネント境界設計書: Currency（通貨）

> ステータス: 運用中
> 関連D-07: § 3.2 CurrencyService / § 7.2 同時実行制御 TDR-003

---

## 1. 分割方針

通貨の増減は複数のコンポーネント（CommandService・AccusationService・IncentiveService等）から横断的に呼び出される。**二重消費防止と残高のマイナス禁止**を単一箇所で保証するため、通貨操作を独立したコンポーネントに集約する。

呼び出し元は通貨の残高制約・楽観的ロックの実装詳細を知らなくてよい。

---

## 2. 公開インターフェース

```
deduct(userId: UUID, amount: number, reason: DeductReason): DeductResult
```
```
DeductResult:
  | { success: true;  newBalance: number }
  | { success: false; reason: "insufficient_balance" }
```

残高不足時は例外ではなく失敗型を返す。呼び出し元が失敗をどう扱うかはそれぞれの判断（CommandServiceはコマンドをスキップ、等）。

```
credit(userId: UUID, amount: number, reason: CreditReason): void
```

加算は必ず成功する（マイナスにならないため）。失敗する可能性がある場合（DB障害等）は例外をスローし、呼び出し元のトランザクションをロールバックさせる。

```
getBalance(userId: UUID): number
```

---

## 3. 依存関係

### 3.1 依存先

| コンポーネント | 依存の性質 |
|---|---|
| CurrencyRepository | `currencies` テーブルへの操作のみ |

### 3.2 被依存

```
CommandService     →  CurrencyService.deduct()
AccusationService  →  CurrencyService.credit()（ボーナス付与）
IncentiveService   →  CurrencyService.credit()
BotService         →  CurrencyService.credit()（撃破ボーナス）
Web APIRoute       →  CurrencyService.getBalance()（マイページ表示）
```

---

## 4. 隠蔽する実装詳細

- 楽観的ロックの実装（`UPDATE currencies SET balance = balance - :amount WHERE user_id = :uid AND balance >= :amount`。affected rows = 0 なら残高不足扱い）
- `DeductReason` / `CreditReason` のログ記録先（audit用途。呼び出し元は気にしない）

---

## 5. 設計上の判断

### 楽観的ロックの採用（TDR-003）

同時書き込みが少ない初期フェーズでは、`SELECT FOR UPDATE` の悲観的ロックは不要。`WHERE balance >= :amount` 条件付きUPDATEで十分な二重消費防止を実現する。競合時は呼び出し元に失敗型を返し、リトライは行わない（コマンド実行失敗として処理）。

### `deduct` と `credit` を非対称に設計

deductは残高チェックが必要なため失敗する可能性がある（Result型）。creditはマイナス制約に引っかからないため常に成功とし、API設計を単純に保つ。DB障害時のみ例外。

### Currency v5: 初期残高 0 への変更（Sprint-84）

従来 `INITIAL_BALANCE = 50` として新規ユーザーに登録時ボーナスを付与していた。v5 では初期残高を 0 に変更し、初回書き込み時に `welcome_bonus` として +50 を付与する方式に移行した。

**変更理由:**
- 書き込みしていない離脱ユーザーへの通貨付与が発生しなくなる
- ウェルカムシーケンス（チュートリアルBOT体験）と連動したボーナス体験を提供できる
- `CreditReason` に `"welcome_bonus"` を追加し、audit ログで初回書き込みボーナスを通常のインセンティブと区別できる

**実装変更:**
- `currency-service.ts`: `INITIAL_BALANCE = 0`
- `domain/models/currency.ts`: `CreditReason` に `"welcome_bonus"` を追加
- `PostService.createPost()`: 初回書き込み検出時に `CurrencyService.credit(userId, 50, "welcome_bonus")` を呼び出す

See: features/currency.feature @新規ユーザー登録時の通貨残高は0である
See: features/welcome.feature @初回書き込みボーナスとして+50が付与されレス末尾にマージ表示される
See: docs/architecture/components/posting.md §5 ウェルカムシーケンス
