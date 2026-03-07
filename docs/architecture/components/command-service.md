# D-08 コンポーネント設計書: CommandService

> 作成日: 2026-03-07
> 対象: Phase 2 (MVP)

## 1. 概要

書き込み本文中のコマンド（`!command`形式）を解析・実行するコンポーネント。Phase 2 では `!tell`（AI告発）と攻撃コマンドを実装する。コマンド追加に対して拡張可能な構造とする。

## 2. 責務

- 本文からのコマンド解析（CommandParser）
- コマンドの存在チェック・コスト確認
- 通貨消費の CurrencyService への委譲
- コマンド固有ロジックの実行（ハンドラパターン）
- システムメッセージの生成・INSERT

## 3. 依存関係

```
CommandService
  ├── CommandParser          (コマンド文字列の解析)
  ├── CommandHandlerRegistry (コマンドハンドラの登録・取得)
  │   ├── TellCommandHandler     (!tell)
  │   └── AttackCommandHandler   (攻撃)
  ├── CurrencyService        (通貨消費)
  ├── AccusationService      (!tell 用)
  ├── BotService             (攻撃・撃破用)
  └── PostRepository         (システムメッセージ INSERT)
```

## 4. コマンド定義

Phase 2 で実装するコマンド:

| コマンド | 形式 | コスト | ステルス | 説明 |
|---|---|---|---|---|
| `!tell` | `!tell >>N` | TBD | No | AI告発 |
| 攻撃 | `!attack >>N` (仮) | TBD | No | BOTマーク付きボットへの攻撃 |

将来の拡張コマンド（Phase 4）に備え、以下の構造を用意:

```typescript
interface CommandDefinition {
  name: string;           // "!tell"
  cost: number;           // 通貨コスト（0 = 無料）
  isStealth: boolean;     // ステルス系か
  handler: CommandHandler; // 実行ロジック
}
```

## 5. コマンド解析（CommandParser）

```typescript
interface ParsedCommand {
  name: string;           // "!tell"
  args: string[];         // [">>5"]
  rawText: string;        // "!tell >>5"
  position: number;       // 本文中の開始位置
}

interface CommandParser {
  parse(body: string): {
    commands: ParsedCommand[];
    cleanBody: string;      // ステルスコマンドを除去した本文
  };
}
```

**解析ルール:**
1. 本文中の `!` で始まる単語をコマンド候補として検出
2. コマンド定義に存在するか確認
3. 存在しない場合は無視（通常テキストとして扱う）
4. ステルス系コマンドの場合、cleanBody から該当文字列を除去
5. 1書き込みに複数コマンドが含まれる場合の処理は Phase 2 では未定義（最初の1つのみ実行を推奨）

## 6. コマンドハンドラパターン

```typescript
interface CommandContext {
  threadId: string;
  postId: string;         // コマンドを含む書き込みのID
  postNumber: number;
  userId: string;
  dailyId: string;
  displayName: string;
}

interface CommandResult {
  success: boolean;
  systemMessage: string;  // スレッドに追加するメッセージ
  effects: CommandEffect[];
}

interface CommandHandler {
  execute(
    args: string[],
    context: CommandContext,
    tx: Transaction          // トランザクション内で実行
  ): Promise<CommandResult>;
}
```

**ハンドラ登録:**
```typescript
const registry = new CommandHandlerRegistry();
registry.register("!tell", tellCommandHandler);
registry.register("!attack", attackCommandHandler);
// Phase 4: registry.register("!w", wCommandHandler); ...
```

## 7. 処理フロー

```
CommandService.execute(commands, context, tx)
│
├── 各コマンドについて:
│   │
│   ├── 1. コマンド定義を取得
│   │   └── registry.get(command.name)
│   │       → 未登録: スキップ（通常テキスト扱い）
│   │
│   ├── 2. 通貨コスト確認
│   │   └── CurrencyService.deduct(userId, cost, tx)
│   │       → 残高不足: エラーのシステムメッセージを生成して次へ
│   │
│   ├── 3. コマンドハンドラ実行
│   │   └── handler.execute(args, context, tx)
│   │       → CommandResult を取得
│   │
│   └── 4. システムメッセージ INSERT
│       └── PostRepository.insertSystemMessage(
│             threadId, result.systemMessage, tx
│           )
│
└── 全コマンドの結果を返却
```

## 8. !tell ハンドラ詳細

AccusationService に委譲:

```
TellCommandHandler.execute([">>5"], context, tx)
│
├── 1. 対象レス番号を解析（>>5 → postNumber=5）
├── 2. 対象レスを取得
│   └── PostRepository.findByThreadAndNumber(threadId, 5, tx)
│       → 不存在: エラー
│       → 自分の書き込み: エラー
│       → システムメッセージ: エラー
│       → 告発済み: エラー
├── 3. AccusationService.accuse(accuserId, targetPostId, tx)
│   ├── bot_posts にレコード存在 → hit
│   │   → BOTマーク付与、告発成功ボーナス
│   └── bot_posts にレコードなし → miss
│       → 冤罪ボーナスを被告発者に付与
└── 4. システムメッセージを生成して返却
```

## 9. 拡張ガイドライン

新しいコマンドを追加する手順:
1. `CommandDefinition` を定義（名前・コスト・ステルスフラグ）
2. `CommandHandler` を実装
3. `CommandHandlerRegistry` に登録
4. 対応する BDD シナリオを `features/` に追加
5. テストを作成・実行
