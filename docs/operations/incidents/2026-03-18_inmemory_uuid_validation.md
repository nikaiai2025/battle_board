# InMemoryリポジトリ UUIDバリデーション欠落

- **日付:** 2026-03-18
- **担当:** bdd-architect
- **対象:** InMemoryリポジトリ群

---

## 1. 背景

`!w >>1` コマンドのターゲット解決がサイレント失敗するバグが発見された。`PostRepository.findById(">>1")` がInMemoryリポジトリで黙って `null` を返し、BDDテストをすり抜けていた。実DBであればPostgreSQLが `invalid input syntax for type uuid` で即座にエラーを返す。

## 2. 対応

全InMemoryリポジトリの公開API関数にUUID形式バリデーションを追加。

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
