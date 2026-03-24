# チュートリアルBOTの !w コマンドがサイレント失敗

- **発生日**: 不明（!w コマンド搭載時点から。発見日: 2026-03-24）
- **発見者**: 人間（本番手動テスト）
- **影響**: チュートリアルBOTが投稿する `!w` コマンド（草を生やすデモ）が実行されない。新規ユーザーのウェルカム体験でコマンドのデモが機能しない
- **重大度**: Medium（ウェルカムシーケンス自体は動作。!w の不発のみ）
- **修正コミット**: cebd451（Sprint-111 TASK-300）— パーサー問題のみ修正
- **追加修正**: Sprint-119 TASK-316 — FK制約違反（真因）の修正

## 症状

チュートリアルBOTのウェルカムシーケンスで投稿されるレス:

```
>>5 !w  新参おるやん🤣
```

この `!w` コマンドが実行されず、対象レスに草が生えない。エラーメッセージもユーザーに見える形で表示されないため、外見上は「何も起きない」状態。

## 直接原因

コマンドパーサーのルール6（後方引数優先）と、コンテンツ生成の1行形式の組み合わせ。

### 解析過程

入力: `>>5 !w  新参おるやん🤣`

**Step 1 — COMMAND_PATTERN のマッチ:**

```
COMMAND_PATTERN: (?:^|(?<=[\s\u3000])|(?<=>>\\d+))!([a-zA-Z][a-zA-Z0-9_]*)((?:WHITESPACE+\S+|>>\d+)*)
```

`!w` にマッチ → `match[1]` = `"w"`, `match[2]` = `"  新参おるやん🤣"`

**Step 2 — 後方引数の分割:**

```typescript
argsString = "新参おるやん🤣"  // trim後
backwardArgs = ["新参おるやん🤣"]  // split(/[\s\u3000]+/)
```

**Step 3 — ルール6適用:**

```typescript
if (backwardArgs.length > 0) {
    args = backwardArgs;  // ["新参おるやん🤣"] — forwardArg ">>5" は無視される
}
```

**Step 4 — GrassHandler.execute:**

```typescript
const targetArg = ctx.args[0];  // "新参おるやん🤣"
const targetPost = await this.postRepository.findById("新参おるやん🤣");  // → null
return { success: false, systemMessage: "指定されたレスが見つかりません" };
```

結果: `!w` は `"新参おるやん🤣"` を post ID として検索 → 見つからない → エラー返却。だが PostService の try-catch 内で処理されるため、エラーがインライン表示に留まり、ユーザーにはサイレント失敗に見える。

## 根本原因

**コンテンツ生成モジュールがコマンドパーサーの引数解析ルールを考慮していなかった。**

`TutorialContentStrategy` はコマンド `!w` とフレーバーテキスト `新参おるやん🤣` を同一行に配置した。コマンドパーサーは同一行内の `!cmd` 後続テキストをすべて後方引数として解釈するため、フレーバーテキストが引数に含まれ、意図した前方引数 `>>5` が無視された。

これはモジュール間の暗黙の結合：コンテンツ生成（tutorial.ts）がコマンド解析（command-parser.ts）の内部ルールに依存するにもかかわらず、その依存関係が明示されていなかった。

## 修正内容

本文を改行で分割し、フレーバーテキストをコマンド行から分離:

```typescript
// 修正前（1行）
return `>>${targetPostNumber} !w  新参おるやん🤣`;

// 修正後（改行分割）
return `>>${targetPostNumber} !w\n新参おるやん🤣`;
```

COMMAND_PATTERN は行をまたがないため、改行後のテキストは後方引数に含まれない。`>>5 !w` のみがパーサーに渡り、前方引数 `>>5` が正しく解析される。

## テストで検知できなかった理由

| テスト層 | 検出可否 | 理由 |
|---|---|---|
| 単体テスト（tutorial-strategies.test.ts） | 不可能 | 生成される文字列の形式を検証。コマンドパーサーとの統合は検証対象外 |
| BDDテスト（welcome.feature） | 不可能 | 「以下の書き込みを投稿する」でBOTの投稿テキストを検証。!w が実行された結果（草が生えたか）は検証していない |
| BDDテスト（reactions.feature） | 不可能 | `!w >>5` 形式での直接実行を検証。BOT経由の間接実行パスは対象外 |
| E2Eテスト | 検出可能だが未実装 | ウェルカムシーケンスの全工程（BOT投稿 → !w 実行 → 草が生える）を通しで検証すれば検出できた |

**構造的な問題**: コンテンツ生成とコマンド解析が、テストの境界をまたぐ形で暗黙に結合している。それぞれの単体テストは個別に PASS するが、組み合わせた時の振る舞いを検証するテストが存在しなかった。

## 類似リスクの横展開

コマンドを内包する本文を生成する他の箇所を調査:

| # | 箇所 | 生成内容 | リスク |
|---|---|---|---|
| 1 | `tutorial.ts` (本件) | `>>N !w  新参おるやん🤣` | **顕在化** → 修正済み |
| 2 | `aori-content.ts` | AI生成テキスト + `!aori` | 低（aori はステルスコマンドで PostFieldOverrides 経由。パーサーの引数解析は使わない） |
| 3 | `newspaper-content.ts` | AI生成テキスト | 低（!newspaper はトリガー側。生成レスにコマンドは含まない） |

現時点で他に同種のリスクは確認されていない。

## 再発防止

1. **検出**: コマンドを内包する本文を生成するモジュールは、生成結果を `parseCommand()` に通して意図した引数が得られることを検証する単体テストを追加する（コンテンツ生成 × パーサーの統合テスト）
2. **防止**: コマンドを含む本文テンプレートでは、コマンド行とフレーバーテキストを改行で分離するパターンを標準とする

## 関連ファイル

- `src/lib/services/bot-strategies/content/tutorial.ts` — コンテンツ生成（修正対象）
- `src/lib/domain/rules/command-parser.ts` L45-48, L148-162 — COMMAND_PATTERN、ルール6
- `src/lib/services/handlers/grass-handler.ts` L129-148 — GrassHandler の引数チェック → findById
- `features/welcome.feature` L121 — BDDシナリオ（修正対象）

---

## 真因: grass_reactions.giver_id のFK制約違反（TASK-316 追記）

cebd451 の改行分割修正後もサイレント失敗が継続していた。

### 原因

改行分割修正により「パーサーの問題」は解消されたが、より深い層の問題が露出した。BOT書き込み時にコマンドパイプラインに渡される `userId` は `botUserId`（botsテーブルのUUID）であり、`grass_reactions.giver_id` は `users(id)` への外部キー制約を持つ。BOTのIDはusersテーブルに存在しないため、`GrassHandler` のステップ7（草記録作成）で FK制約違反（PostgreSQL error 23503）が発生し、PostService の try-catch で握りつぶされていた。

### 修正内容（Sprint-119 TASK-316）

`CommandContext` に `isBotGiver` フラグを追加し、BOT書き込み時は以下の処理をスキップ:
- ステップ4: 自己草チェック — スキップ
- ステップ6: 同日重複チェック — スキップ
- ステップ7: grass_reactions INSERT — **スキップ（FK制約違反の回避）**

以下は従来通り実行:
- ステップ8: 草カウント加算（受領者の草は実際に生える）
- ステップ9: システムメッセージ生成（ユーザーに見える）

### 修正ファイル

| ファイル | 変更内容 |
|---|---|
| `src/lib/services/command-service.ts` | `CommandContext`, `CommandExecutionInput` に `isBotGiver?: boolean` を追加。`executeCommand` で伝播 |
| `src/lib/services/handlers/grass-handler.ts` | `isBotGiver === true` の場合、自己草チェック・重複チェック・草記録INSERTをスキップ |
| `src/lib/services/post-service.ts` | `isBotWrite === true` の場合に `isBotGiver: true` を設定 |

### 調査詳細

`tmp/reports/debug_TASK-DEBUG-119.md` を参照。
