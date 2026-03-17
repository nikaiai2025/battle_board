# 監査レポート: Date モック不整合 — 残存箇所の全体調査

- **日付:** 2026-03-17
- **起点:** `tmp/fix_report_20260317_date_mock.md` の修正内容の妥当性検証
- **結論:** 修正レポートの内容は正確だが、修正範囲が不十分。同一パターンが50箇所以上残存しており、高リスク箇所が6件ある。

---

## 1. 問題の構造

BDDテストの時刻モックは `Date.now = () => time.getTime()` で実装されている。
JavaScript の仕様上、この方式では `new Date()`（引数なし）に影響しない。
修正レポートでは3ファイルのみ `new Date(Date.now())` に修正されたが、同一パターンが広範に残存している。

## 2. 高リスク残存箇所（要修正）

時刻モック下で実行され、時刻依存のビジネスロジックに直結する箇所。

| # | ファイル | 行 | コード | 影響 |
|---|---|---|---|---|
| 1 | `src/lib/services/post-service.ts` | 483 | `updateLastPostAt(threadId, new Date())` | **元バグと同種**。lastPostAtはスレッド活性度判定に使われるため、incentive低活性誤判定が再発しうる |
| 2 | `src/lib/services/post-service.ts` | 633 | `firstPostCreatedAt = new Date()` | スレッド作成時の最初の投稿のcreatedAtが実時刻になる |
| 3 | `src/lib/services/bot-service.ts` | 620 | `getTodayJst()` 内の `new Date()` | 日次リセット・攻撃制限の日付判定に影響（現在はステップ定義側でワークアラウンド） |
| 4 | `src/lib/services/handlers/grass-handler.ts` | 209 | `new Date().toISOString().split("T")[0]` | 同日重複チェックに影響（現在はステップ定義側でワークアラウンド） |
| 5 | `src/lib/services/admin-service.ts` | 590 | `const today = new Date()` | ダッシュボード日次推移の期間計算 |
| 6 | `features/support/in-memory/auth-code-repository.ts` | 92 | `const now = new Date()` | 有効期限切れ判定が実時刻で行われる |

## 3. 中リスク残存箇所（推奨修正）

タイムスタンプとして記録される箇所。現在のテストでは顕在化しにくいが、将来のシナリオ追加で踏む可能性がある。

| ファイル | 箇所数 |
|---|---|
| `features/support/in-memory/attack-repository.ts` | 2 |
| `features/support/in-memory/accusation-repository.ts` | 1 |
| `features/support/in-memory/incentive-log-repository.ts` | 1 |
| `features/support/in-memory/bot-repository.ts` | 1 |
| `features/support/in-memory/currency-repository.ts` | 3 |
| `features/support/in-memory/user-repository.ts` | 4 |
| `features/support/in-memory/edge-token-repository.ts` | 2 |
| `features/support/in-memory/ip-ban-repository.ts` | 3 |
| `features/support/in-memory/daily-stats-repository.ts` | 1 |

## 4. ワークアラウンドの存在

以下のステップ定義では、本番コードが `new Date()` を使う前提でテスト側が回避策を記述している。
本番コードを修正した場合、これらも連動修正が必要。

- `features/step_definitions/bot_system.steps.ts` L2004-2012 — bot-service.getTodayJst の回避
- `features/step_definitions/reactions.steps.ts` L966-968, L1008-1010, L1047-1048 — grass-handler の回避

## 5. 推奨対応

### 短期: 全統一パッチ

1. 高リスク6件を `new Date(Date.now())` に修正
2. 中リスク（インメモリリポジトリ）18件を同様に修正
3. 高リスク#3,#4の修正後、対応するステップ定義のワークアラウンドも `new Date(Date.now())` に更新
4. 全BDDテスト実行で回帰確認

### 中期: 再発防止

grepベースのCIチェックを導入し、`features/` および `src/lib/services/` 配下の `new Date()` 単独使用を検知する。
例: `grep -rn "new Date()" --include="*.ts" | grep -v "new Date(Date.now())" | grep -v "new Date(.*[^)])"`
