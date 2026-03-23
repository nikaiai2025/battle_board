# D-08 コンポーネント境界設計書: Command（コマンドシステム）

> ステータス: 運用中
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
    cost: 10
    targetFormat: ">>postNumber"
    responseType: inline
    enabled: true
    stealth: false
  w:
    description: "指定レスに草を生やす"
    cost: 0
    targetFormat: ">>postNumber"
    responseType: inline
    enabled: true
    stealth: false
  hissi:
    description: "対象ユーザーの本日の書き込みを表示"
    cost: 20
    targetFormat: ">>postNumber"
    responseType: independent
    enabled: true
    stealth: false
  kinou:
    description: "対象ユーザーの昨日のIDを表示"
    cost: 20
    targetFormat: ">>postNumber"
    responseType: independent
    enabled: true
    stealth: false
```

| フィールド | 型 | 説明 |
|---|---|---|
| description | string | ユーザー向け説明文（ヘルプページ表示用） |
| cost | number | 通貨コスト（0 = 無料） |
| targetFormat | string \| null | 必要な引数の形式（null = 引数なし） |
| responseType | "inline" \| "independent" | 結果の表示方式。inline=レス内マージ（方式A）、independent=独立システムレス（方式B）。エラー時は responseType に関わらず常にレス内マージ |
| enabled | boolean | falseにするとコマンド無効化（存在しないコマンドと同等の扱い） |
| stealth | boolean | trueの場合、コマンド文字列が本文から除去される（詳細は§5 ステルスコマンドの設計原則を参照） |

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
2. コマンド名の後にスペース区切りで引数を取得する（後方引数）
3. 本文中の任意の位置に出現可能（先頭でなくてもよい）
4. 1レス1コマンド: 複数のコマンド候補がある場合は先頭のみを返す
5. コマンドレジストリに存在しないコマンド名は null を返す（通常の書き込みとして扱う）
6. `targetFormat: ">>postNumber"` のコマンドについて、`>>N !cmd` と `!cmd >>N` を等価とみなす（前方引数）。後方引数がある場合は後方を優先する
7. 前方引数の認識条件: `>>N` と `!cmd` の間に半角スペースまたは全角スペースのみが存在すること。改行やテキストが挟まる場合は前方引数として認識しない
8. 後方引数の区切り文字も半角スペース・全角スペースの両方を許容する
9. アンカー引数（`>>N`）とコマンド名の間のスペースは省略可能。`!cmd>>N` と `!cmd >>N`、`>>N!cmd` と `>>N !cmd` はそれぞれ等価とする
10. **コンテンツ生成制約**: コマンドを含む本文を生成するモジュール（BOTコンテンツ等）は、コマンドとその引数のみを1行に記述し、フレーバーテキストは改行で分離しなければならない。ルール6により、コマンドと同一行のテキストは後方引数として解釈され、意図した前方引数が無視される。See: `docs/operations/incidents/2026-03-24_welcome_bot_w_command_silent_failure.md`

```
# OK: コマンド行とフレーバーテキストが改行で分離
>>5 !w
新参おるやん🤣

# NG: フレーバーテキストが後方引数として解釈される
>>5 !w  新参おるやん🤣
```

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
- ステルスコマンドの本文除去タイミングと条件分岐の詳細（§5 ステルスコマンドの設計原則を参照）

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

### ステルスコマンドの設計原則

`stealth: true` のコマンドは、本文からコマンド文字列を除去して副作用のみを実行する。以下の3原則に従う。

1. **成功時: コマンド文字列を除去する。** 残ったテキストのみが本文として保存される
2. **失敗時: コマンド文字列を除去しない。** 失敗したステルスの意図が他ユーザーに露出する。これはペナルティとして意図的な設計であり、ステルスの成功にはコスト（通貨）が必要であることを強調する
3. **除去後の本文が空: 空本文の書き込みとして投稿する。** PostService の契約（createPost は必ずレスを作る）を維持し、レス番号を消費する。レスが存在しない完全な不可視化はコマンドの責務範囲外とする

#### ステルスの実装メカニズム

ステルス除去と投稿フィールド上書きは **PostService の Step 5.5**（Step 5 コマンド実行の直後、Step 6 レス番号採番の前）で処理する。

- `CommandExecutionResult` に `isStealth`（設定層フラグの伝播）、`rawCommand`（除去対象文字列）、`postFieldOverrides`（表示名・dailyId 等の上書き指示）を追加する
- `isStealth` と `rawCommand` は CommandService が設定層（commands.yaml）とパーサーの出力から自動設定する。ハンドラは関与しない
- `postFieldOverrides` はハンドラが返す。ステルスのうちフィールド上書きを必要とするコマンドのみが使用する
- PostService は `commandResult.success === true && commandResult.isStealth === true` の場合のみ除去・上書きを適用する

詳細設計: `tmp/workers/bdd-architect_265/iamsystem_design.md` §1-2

### ターゲット任意パターン

`>>N` 引数の有無で挙動を変えるコマンドを「ターゲット任意」と呼ぶ。

- command-parser は引数の有無にかかわらず `ParsedCommand` を返す（`args: []` or `args: [">>N"]`）
- CommandService の `>>N → UUID` 解決（Step 1.5）は `args` が空ならスキップする
- **ハンドラが `args` の有無で分岐するだけ**で実現でき、パーサー・サービス層の変更は不要
- `targetFormat` は YAML 上のドキュメント用途であり、パーサーやサービスが強制バリデーションに使用しない。ターゲット任意コマンドでは `null` を設定する


### 非同期副作用のキューイングパターン

AI API 呼び出し等の長時間処理を伴うコマンドは、副作用を同期実行せず pending テーブル経由で非同期処理する。

```
PostService（同期）: コマンド解析 → 通貨消費 → pending INSERT → レス作成 → 即レスポンス
Cron（非同期）:       pending 読み取り → 副作用実行（AI API等）→ 結果反映 → pending 削除
```

これにより Cloudflare Workers の実行時間制限（30〜50秒）を回避し、ユーザーの書き込みレスポンスを即座に返せる。pending テーブルはコマンド種別ごとに作らず、`command_type` カラムで区別する汎用テーブル（`pending_async_commands`）とする。結果の反映形式はコマンドにより異なる（BOTスポーン、★システムレス投稿等）。チュートリアルBOT用の `pending_tutorials` は既存のまま分離を維持する（処理量・処理内容が異なるため）。

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
