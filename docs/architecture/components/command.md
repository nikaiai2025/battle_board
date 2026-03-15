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

### 2.2 コマンド定義の2層構造（設定層 + ロジック層）

コマンドの**設定**と**実行ロジック**を分離し、設定変更がコード修正を要しない構造とする。

#### 設定層: `config/commands.yaml`

コマンドの設定値をYAMLファイルで一元管理する。コスト調整やコマンドの有効/無効切り替えは本ファイルの編集のみで完了し、ハンドラコードの修正やデプロイを必要としない。

```yaml
# config/commands.yaml
commands:
  tell:
    description: "指定レスをAIだと告発する"
    cost: 50
    targetFormat: ">>postNumber"
    enabled: true
    stealth: false
  w:
    description: "指定レスに草を生やす"
    cost: 0
    targetFormat: ">>postNumber"
    enabled: true
    stealth: false
```

| フィールド | 型 | 説明 |
|---|---|---|
| description | string | ユーザー向け説明文（ヘルプページ表示用） |
| cost | number | 通貨コスト（0 = 無料） |
| targetFormat | string \| null | 必要な引数の形式（null = 引数なし） |
| enabled | boolean | falseにするとコマンド無効化（存在しないコマンドと同等の扱い） |
| stealth | boolean | trueの場合、コマンド文字列が本文から除去される（Phase 2ではすべてfalse） |

#### ロジック層: CommandHandler

各コマンドの実行ロジックはTypeScriptのハンドラとして実装する。ハンドラはCommandHandlerインターフェースを実装し、CommandHandlerRegistryに登録する。

```
CommandHandler {
  commandName:  string          // "tell" / "w" 等（"!" プレフィックスなし）
  execute(ctx: CommandContext): Promise<CommandHandlerResult>
}
```

CommandServiceは起動時にYAML設定を読み込み、対応するハンドラとマージしてRegistryを構築する。YAMLに定義があるがハンドラが未実装のコマンドは起動時エラーとする。

#### 新規コマンド追加の手順

1. `config/commands.yaml` に設定エントリを追加
2. `handlers/xxx.ts` にCommandHandler実装を作成
3. Registryに登録

PostServiceやCommandServiceのコア処理に変更は不要。

### 2.3 コマンド解析仕様（command-parser）

command-parser はドメインルール層（`src/lib/domain/rules/command-parser.ts`）に配置する純粋関数。

#### 入力
- 書き込み本文（UTF-8文字列）

#### 出力
- `ParsedCommand | null`（コマンドが検出されなければ null）

#### 解析ルール
1. 本文中から `!` で始まる単語をコマンド候補として検出する
2. コマンド名の後にスペース区切りで引数を取得する
3. 本文中の任意の位置に出現可能（先頭でなくてもよい）
4. 1レス1コマンド: 複数のコマンド候補がある場合は先頭のみを返す
5. コマンドレジストリに存在しないコマンド名は null を返す（通常の書き込みとして扱う）

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
- コマンドの優先順位: **MVPでは1レス1コマンドのみ有効。本文中に複数のコマンドが含まれる場合は先頭のコマンドのみを実行し、残りは無視する**
- ステルスコマンドの判定ロジック（`stealth=true` のコマンドが実行された場合、システムメッセージを生成しないのか、別形式で生成するのか）

---

## 5. 設計上の判断

### 通貨引き落としの順序

通貨引き落とし → コマンド実行の順とする。コマンド失敗時に通貨を戻す「補償処理」は行わない（UX上「失敗してもコストはかかる」として要件確認済みか要確認）。残高不足の場合はコマンド実行自体をスキップし、システムメッセージで通知する。

### CommandServiceはシステムメッセージをINSERTしない

システムメッセージの永続化責任はPostServiceが持つ。CommandServiceはシステムメッセージの**文字列**を返すにとどめる。これにより、システムメッセージの書式変更がCommandServiceに波及しない。

### 設定層をYAMLファイルとした理由

コマンドの設定値（コスト・説明文等）をコード内に埋め込まず、YAMLファイルとして分離した理由：

1. **バランス調整の容易さ**: コスト変更等の頻繁な調整がコード修正・デプロイなしで可能
2. **可読性**: 人間にもAIにも読み書きしやすいフォーマット
3. **将来のDB移行パス**: YAMLの構造をそのままDBスキーマに移行でき、管理画面からの操作も容易になる

---

## 6. 拡張構想（将来ビジョン）

> 以下は現時点では実装対象外だが、設計判断の背景として記録する。

### AIによるコマンド自動実装

将来的に、ユーザーが掲示板上でコマンドの要望を投稿し、AIがそれを読み取って自動的にコマンドを設計・実装するフローを構想している。

```
ユーザー: 「!reversi でオセロ対戦できるコマンドほしい」
  ↓
AI: 要望を解析 → commands.yaml にエントリ追加 + handlers/reversi.ts を生成
  ↓
テスト・レビュー → デプロイ
```

この構想が2層分離（YAML設定 + ハンドラ実装）を採用した根本的な動機である。AIが新コマンドを追加する際に：
- `commands.yaml` を読めば既存コマンドの設計パターンを把握できる
- ハンドラの実装はCommandHandlerインターフェースに従うだけで完結する
- 既存のコア処理（PostService, CommandService）を一切変更しない

具体的なフロー設計（人間の承認プロセス、テスト自動化、安全性検証等）は将来のフェーズで検討する。
