# BDDテスト戦略書レビュー・改善レポート

- **日付:** 2026-03-18
- **担当:** bdd-architect
- **対象:** `docs/architecture/bdd_test_strategy.md` および InMemoryリポジトリ群

---

## 1. テスト戦略書のレビュー

### 1.1 指摘: 層の分け方が細かすぎる

テスト戦略書が7層を定義しているが、実装テスト数は下位2層（単体テスト1,550件 + BDD 240件）に99%が集中しており、上位5層は合計59件。ドキュメント量と実装量の重心が乖離していた。

**結論:** 上位層のテスト数が少ないこと自体は問題ではない。各層は下位層では原理的に検出できないバグの種類を担当しており、数の多寡で価値を測るべきではない。BDD全パスでも本番がバグだらけになる実態は、上位層の存在意義を裏付けている。

### 1.2 指摘: 整理軸が不明確で読みにくい

7つの層名と3つのツールチェーン（Vitest / Cucumber.js / Playwright）の対応関係が暗黙的であり、「統合テストとAPIテストは統合できないか」等の問いに対して、関心事の軸とツールの軸で異なる答えが出る混乱が生じていた。

**対応:** §7.1にツールチェーンマッピング表を追加。3つのツール × プロファイル/プロジェクトの対応を明示し、各層の実行コマンドを一覧化した。

### 1.3 指摘: §14（本番Smoke）が重すぎる

140行以上を費やしてPhase A/B分類、安全性制約、人間監督要件を記述していたが、同内容が `.claude/agents/auto-debugger.md` に（より実運用に即した形で）既に存在しており、§14は劣化コピーになっていた。

**対応:** §14を7行に圧縮し、auto-debugger.mdへの参照に置き換えた。

---

## 2. 変更内容

### 2.1 ドキュメント変更

| ファイル | 変更内容 |
|---|---|
| `docs/architecture/bdd_test_strategy.md` §7.1 | ツールチェーンマッピング表を追加 |
| `docs/architecture/bdd_test_strategy.md` §14 | 140行 → 7行に圧縮（auto-debugger.md参照） |
| `docs/architecture/lessons_learned.md` | 新規作成（LL-001, LL-002） |

### 2.2 InMemoryリポジトリ UUID バリデーション追加

**背景:** `!w >>1` コマンドのターゲット解決がサイレント失敗するバグが発見された。`PostRepository.findById(">>1")` がInMemoryリポジトリで黙って `null` を返し、BDDテストをすり抜けていた。実DBであればPostgreSQLが `invalid input syntax for type uuid` で即座にエラーを返す。

**対応:** 全InMemoryリポジトリの公開API関数にUUID形式バリデーションを追加。

| 新規作成 | 説明 |
|---|---|
| `features/support/in-memory/assert-uuid.ts` | 共有UUID検証ユーティリティ |

| 変更ファイル | バリデーション追加箇所数 |
|---|---|
| `in-memory/post-repository.ts` | 6 |
| `in-memory/thread-repository.ts` | 6 |
| `in-memory/user-repository.ts` | 14 |
| `in-memory/bot-repository.ts` | 9 |
| `in-memory/currency-repository.ts` | 6 |
| `in-memory/accusation-repository.ts` | 3 |
| `in-memory/edge-token-repository.ts` | 1 |
| `in-memory/admin-repository.ts` | 1 |
| `in-memory/bot-post-repository.ts` | 5 |
| `in-memory/attack-repository.ts` | 2 |
| `in-memory/auth-code-repository.ts` | 4 |
| `in-memory/ip-ban-repository.ts` | 3 |
| **合計** | **60箇所** |

**バリデーション対象:** エンティティのUUID主キー・外部キー引数（`id`, `*Id`）
**対象外:** token文字列、boardId、threadKey、email、date系（UUID形式ではない）
**テストヘルパー（`_insert`等）は対象外:** テストセットアップ用であり、本番コードパスと異なるため

---

## 3. Lessons Learned

`docs/architecture/lessons_learned.md` に以下を記録。

- **LL-001: リポジトリのID引数を `string` にしない** — 新規プロジェクトでは初日にブランド型 `UUID` を定義し、リポジトリ署名に使用する。後からの変更コストは極めて高い。
- **LL-002: InMemoryリポジトリは実DBの制約を再現する** — InMemoryは「何でも受け入れる簡易実装」ではなく、実DBの制約（ID形式、NOT NULL、ユニーク制約等）を模倣するテストダブルであるべき。

---

## 4. 未実施・今後の検討事項

| 項目 | 優先度 | 備考 |
|---|---|---|
| ブランド型 `UUID` の全面導入 | 低 | 既存コードへの影響が大きすぎるため見送り。新規プロジェクトでは初日に導入すべき |
| Vitestサービステスト / BDDシナリオの重複精査 | 低 | 現時点で実害なし。テスト実行時間がボトルネックになった場合に検討 |
| §8（統合テスト）/ §9（APIテスト）の統合検討 | 不要 | ツールチェーンが異なる（Cucumber vs Playwright）ため統合は不適切と判断 |
