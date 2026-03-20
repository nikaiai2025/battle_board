# Sprint-50 計画書: InMemory UUIDバリデーション導入 + テスト修正

> 作成日: 2026-03-18
> ステータス: completed

## 背景

Sprint-49で発見した `>>N → UUID` 変換バグの根本原因は、InMemoryリポジトリが非UUID文字列を黙って受け入れていたこと。
人間が全InMemoryリポジトリにUUIDバリデーション（60箇所）を追加済み。

## 人間による変更（コミット前）

| ファイル | 変更内容 |
|---|---|
| `features/support/in-memory/assert-uuid.ts` | [NEW] UUID検証ユーティリティ |
| `features/support/in-memory/*.ts` (12ファイル) | 公開API 60箇所にassertUUID追加 |
| `docs/architecture/bdd_test_strategy.md` | §7.1 ツールチェーンマッピング表追加、§14 圧縮 |
| `docs/architecture/lessons_learned.md` | [NEW] LL-001, LL-002 |
| `docs/operations/incidents/2026-03-18_bdd_test_strategy_review.md` | [NEW] レビューレポート |

## テスト実行結果（UUIDバリデーション追加後）

- **vitest: 45ファイル / 1152テスト / 全PASS**（影響なし）
- **cucumber-js: 234シナリオ / 22 failed / 7 pending / 205 passed**

### FAIL分類（22シナリオ）

#### カテゴリA: ステップ定義の非UUID文字列（6シナリオ）

ステップ定義が `nonexistent-XXX` 等の非UUID文字列をリポジトリに渡している。`crypto.randomUUID()` に修正。

| Feature | 失敗ステップ | ステップ定義 | 問題 |
|---|---|---|---|
| admin.feature | `レス >>5 の削除を試みる` | admin.steps.ts:296 | 非UUID文字列 |
| admin.feature | `ユーザー "UserA" のIPをBANする` | admin.steps.ts:1089 | 非UUID文字列 |
| admin.feature (x3) | `ユーザー "UserA" のIPがBANされている` | admin.steps.ts:1152 | 非UUID文字列 |
| admin.feature | `通貨付与APIを呼び出す` | admin.steps.ts:1492 | 非UUID文字列 |

#### カテゴリB: `>>N → UUID` 変換未実装（13シナリオ）

コマンドの `>>N` 引数がUUIDに変換されずハンドラに到達する本番コードのバグ。

| Feature | 失敗ステップ | 件数 |
|---|---|---|
| command_system.feature | `コマンド "!tell" が対象 ">>5" に対して実行される` | 4 |
| command_system.feature | `コマンド "!w" が対象 ">>5" に対して実行される` | 2 |
| command_system.feature | `本文の下に区切り線が表示される` | 1 |
| command_system.feature | `コマンド実行結果がレス末尾にマージされた状態でDATファイルに含まれる` | 1 |
| ai_accusation.feature | `"!tell >>999" を実行する`（存在しないレス） | 1 |
| reactions.feature | 草エラー系（自分/削除/システムメッセージ） | 3 |
| bot_system.feature | `ユーザーが "!attack >>999" を含む書き込みを投稿する` | 1 |

#### カテゴリC: Bot系（`>>N → UUID` の派生、3シナリオ）

| Feature | 失敗ステップ | 問題 |
|---|---|---|
| bot_system.feature | `荒らし役ボットが書き込み先を決定する` | ボットの書き込みパスでUUID不整合 |
| bot_system.feature | `ボットが撃破された` | 攻撃パスでUUID不整合 |
| bot_system.feature | `レス末尾にエラーがマージ表示される` | 攻撃エラー表示パスでUUID不整合 |

## タスク分解

| TASK_ID | 担当 | 内容 | 依存 | 対象FAIL |
|---|---|---|---|---|
| TASK-142 | bdd-coding | ステップ定義の非UUID文字列修正 | なし | カテゴリA (6件) |
| TASK-143 | bdd-coding | `>>N → UUID` リゾルバ実装 + 全ハンドラ修正 | TASK-142 | カテゴリB+C (16件) |

### TASK-142: ステップ定義修正（カテゴリA）

locked_files:
- `features/step_definitions/admin.steps.ts`
- `features/step_definitions/ai_accusation.steps.ts`
- `features/step_definitions/bot_system.steps.ts`
- `features/step_definitions/reactions.steps.ts`

修正方針: `nonexistent-XXX` → `crypto.randomUUID()` に統一（admin.steps.tsの正しいパターンに揃える）

### TASK-143: `>>N → UUID` リゾルバ実装（カテゴリB+C）

locked_files:
- `src/lib/services/command-service.ts`
- `src/lib/services/handlers/*.ts`（必要に応じて）
- `src/lib/infrastructure/repositories/post-repository.ts`（findByThreadIdAndPostNumber追加が必要な場合）
- `features/step_definitions/command_system.steps.ts`（ステップ内での>>N解決が必要な場合）
- `features/step_definitions/bot_system.steps.ts`

設計方針:
- `>>N` → threadId + postNumber → postId (UUID) の解決をCommandService層で行う
- PostRepositoryに `findByThreadIdAndPostNumber(threadId: UUID, postNumber: number): Post | null` を追加
- ハンドラには解決済みUUIDを渡す

## 実行手順

1. ~~テスト実行（現状確認）~~ → **完了: 22 failed**
2. TASK-142: ステップ定義修正 → カテゴリA 6件解消
3. 中間テスト: FAIL数が16件に減ることを確認
4. TASK-143: `>>N → UUID` リゾルバ実装 → カテゴリB+C 16件解消
5. テスト全件PASS確認
6. コミット・プッシュ

## 結果

### TASK-142 (bdd-coding) — completed
- admin.steps.ts: TEST_ADMIN_ID / TEST_NON_ADMIN_USER_ID を crypto.randomUUID() に修正
- ai_accusation.steps.ts: `nonexistent-${postNumber}` → crypto.randomUUID()
- bot_system.steps.ts: 非UUID文字列4種を crypto.randomUUID() に修正
- reactions.steps.ts: `nonexistent-post-${postNumber}` → crypto.randomUUID()
- 結果: 22 failed → 12 failed（10件解消）

### TASK-143 (bdd-coding, Opus) — completed
- command-service.ts: IPostNumberResolver インターフェース + `>>N → UUID` 解決ロジック追加
- post-repository.ts (本番): findByThreadIdAndPostNumber メソッド追加
- post-repository.ts (InMemory): 同メソッドのInMemory実装追加
- command-service.test.ts: リゾルバ単体テスト5件追加
- command_system.steps.ts / reactions.steps.ts: postNumberResolver 注入 + テストデータ生成修正
- 結果: 12 failed → 0 failed（全件解消）

### 最終テスト結果
- vitest: 45ファイル / 1157テスト / 全PASS（+5件）
- cucumber-js: 234シナリオ / 0 failed / 7 pending / 227 passed

## 判定

全タスク completed。InMemory UUIDバリデーション60箇所追加により顕在化した22件のFAILを全て解消。
`>>N → UUID` リゾルバにより、コマンドのターゲット解決が本番でも正しく動作するようになった。
