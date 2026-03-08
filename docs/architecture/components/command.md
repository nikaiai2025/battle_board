# D-08 コンポーネント境界設計書: Command（コマンドシステム）

> ステータス: ドラフト / 2026-03-08
> 関連D-07: § 3.2 CommandService

---

## 1. 分割方針

「コマンドの解析・ディスパッチ・副作用の実行」を単一のコンポーネントに閉じる。
Phase 4 で20+コマンドへの拡張が予定されており、個別コマンドのロジックを追加しても PostService を変更しない構造が必要なため、**レジストリ（Handler Registry）パターン**を採用する。

告発（`!tell`）はコマンドの一種だが、判定ロジックの複雑さからAccusationServiceとして独立させる。CommandServiceはAccusationServiceを呼び出す側に位置づける。

---

## 2. 公開インターフェース

### 2.1 主要操作

```
executeCommand(input: CommandExecutionInput): CommandExecutionResult
```

**CommandExecutionInput:**
```
{
  rawCommand:  string   // 本文中から抽出されたコマンド文字列（例: "!tell 5"）
  postId:      UUID     // 実行元レスのID（システムメッセージを紐付けるため）
  threadId:    UUID
  userId:      UUID     // 通貨引き落とし先
}
```

**CommandExecutionResult:**
```
{
  success:        boolean
  systemMessage:  string | null  // 成功/失敗メッセージ。nullなら出力なし
  currencyCost:   number         // 実際に消費した通貨量（失敗時は0）
}
```

PostServiceはこの結果をもとに、必要であればシステムメッセージをPOSTとして挿入する。CommandService自体はシステムメッセージのDB挿入を行わない。

### 2.2 内部構造（境界として公開する設計方針）

コマンドハンドラは以下のインターフェースを実装することで、CommandHandlerRegistryに登録できる。

```
CommandHandler {
  commandName: string          // "tell" / "attack" 等
  cost:        number          // 通貨コスト
  stealth:     boolean         // trueの場合、コマンド実行がスレッド上に表示されない
  execute(ctx: CommandContext): Promise<CommandHandlerResult>
}
```

Phase 1-2のコマンド群はすべてこのインターフェースで実装する。Phase 4での追加も同様。

---

## 3. 依存関係

### 3.1 依存先

| コンポーネント | 依存の性質 |
|---|---|
| CurrencyService | コマンド実行前にコストを引き落とす（失敗時は実行しない） |
| AccusationService | `!tell` コマンドの実行をAccusationServiceに委譲 |
| BotService | 攻撃系コマンドのダメージ計算・HP更新をBotServiceに委譲 |
| PostRepository | システムメッセージ生成に必要なスレッド文脈の取得（読み取りのみ） |
| `domain/rules/command-parser` | 生テキストからのコマンド名・引数の抽出（純粋関数） |

### 3.2 被依存

```
PostService  →  CommandService
```

---

## 4. 隠蔽する実装詳細

- CommandHandlerRegistryの初期化タイミング（シングルトン / 呼び出しごと）
- コマンドの優先順位（1レスに複数コマンドが含まれる場合）→ **MVPでは1レス1コマンドのみ有効。複数ある場合は先頭のみ実行**（仕様として確定させること）
- ステルスコマンドの判定ロジック（`stealth=true` のコマンドが実行された場合、システムメッセージを生成しないのか、別形式で生成するのか）

---

## 5. 設計上の判断

### 通貨引き落としの順序

通貨引き落とし → コマンド実行の順とする。コマンド失敗時に通貨を戻す「補償処理」は行わない（UX上「失敗してもコストはかかる」として要件確認済みか要確認）。残高不足の場合はコマンド実行自体をスキップし、システムメッセージで通知する。

### CommandServiceはシステムメッセージをINSERTしない

システムメッセージの永続化責任はPostServiceが持つ。CommandServiceはシステムメッセージの**文字列**を返すにとどめる。これにより、システムメッセージの書式変更がCommandServiceに波及しない。
