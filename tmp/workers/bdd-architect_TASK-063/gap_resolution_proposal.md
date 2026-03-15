# GAP-1〜7 解消方針提案書

> 作成日: 2026-03-16
> タスク: TASK-063
> 目的: Phase 2実装着手前のドキュメント・スキーマ不整合の解消方針を提案する

---

## GAP-1: Post モデルに `inlineSystemInfo` フィールドが未定義

### ステータス
- [ ] 未解消

### 現状分析

**D-06 (thread-view.yaml)**: `post-inline-system-info` コンポーネントが `post.inlineSystemInfo` を参照する定義が存在する（行75-95）。Phase 2更新済みで、方式A（レス内マージ）の表示仕様が明確に定義されている。

**D-08 (posting.md)**: 方式Aの設計方針が記載済み。「PostServiceは `createPost` のトランザクション内で、コマンド実行結果・インセンティブ結果を取得し、本文末尾に結合してからINSERTする」と明記。

**未反映箇所（3点）:**

1. **`src/lib/domain/models/post.ts`**: Post interfaceに `inlineSystemInfo` フィールドが存在しない
2. **`docs/specs/openapi.yaml`**: Post スキーマに `inlineSystemInfo` プロパティが存在しない
3. **`docs/architecture/architecture.md` §4.2 posts テーブル定義**: `inline_system_info` カラムが存在しない

### 提案

D-08 posting.md §5 の方式A設計を踏まえ、以下の変更を行う。

**1. `src/lib/domain/models/post.ts` に追加:**
```typescript
/** レス内マージ型システム情報（コマンド結果・書き込み報酬等）。null なら表示なし */
inlineSystemInfo: string | null;
```

**2. `docs/specs/openapi.yaml` Post スキーマに追加:**
```yaml
inlineSystemInfo:
  type: string
  nullable: true
  description: レス内マージ型システム情報（コマンド結果・書き込み報酬等）
```

**3. `docs/architecture/architecture.md` §4.2 posts テーブルに追加:**
```
| inline_system_info | TEXT, NULLABLE | レス内マージ型システム情報（方式A） |
```

**4. DBマイグレーション:**
```sql
ALTER TABLE posts ADD COLUMN inline_system_info TEXT NULL;
```

### 影響範囲
- `src/lib/domain/models/post.ts`
- `docs/specs/openapi.yaml` (Post スキーマ)
- `docs/architecture/architecture.md` (§4.2 posts テーブル定義)
- `supabase/migrations/` (新規マイグレーションファイル)
- `src/lib/infrastructure/repositories/post-repository.ts` (クエリ/マッピング)
- `src/lib/infrastructure/adapters/dat-formatter.ts` (DAT形式でinlineSystemInfoを本文に結合して出力)

### 判断が必要な点
- **inlineSystemInfoの格納形式**: D-08 posting.mdでは「本文末尾に結合してからINSERT」と記載がある。これは `body` カラムに直接結合する方式（独立カラム不要）とも読めるが、D-06では `post.inlineSystemInfo` を独立フィールドとして参照している。2つの解釈がある:
  - **案A（独立カラム方式）**: `body` と `inline_system_info` を分離してDB保存し、表示時に結合。Web UIでは区切り線付きスタイル、DATでは連結文字列として出力。**推奨: こちらを採用**。分離保存の方が表示制御の柔軟性が高く、D-06の設計意図と整合する。
  - **案B（body統合方式）**: body自体にシステム情報を含めてINSERT。独立カラム不要だが、後から表示方式を変更しにくい。
- 人間に判断を仰ぐ。

---

## GAP-2: OpenAPI adminDeletePost にコメントパラメータがない

### ステータス
- [ ] 未解消

### 現状分析

**admin.feature (v3)**: レス削除時のコメント入力シナリオが明確に定義済み。

```
When レス >>5 の削除をコメント "個人情報を含むため削除しました" 付きで実行する
```

**command_system.feature (v4)**: システムレスとしてのコメント表示シナリオも定義済み。

```
Given 管理者がスレッド内のレス >>7 をコメント "スパム投稿のため削除" 付きで削除した
Then 「★システム」名義の独立レスが追加される
And システムレスの本文に管理者のコメントが表示される
```

**`docs/specs/openapi.yaml`**: `adminDeletePost` (DELETE `/api/admin/posts/{postId}`) にはcommentフィールドが一切存在しない。requestBodyの定義もない。

### 提案

DELETEメソッドにリクエストボディを付与するのはHTTP仕様上非推奨（RFC 9110 §9.3.5でbodyの意味を定義していない）。以下の2案がある:

**案1（推奨）: DELETEを維持しつつ、クエリパラメータでコメントを渡す**
```yaml
parameters:
  - name: postId
    in: path
    required: true
    schema:
      type: string
      format: uuid
  - name: comment
    in: query
    required: false
    schema:
      type: string
      description: 削除時のコメント（システムレスに表示。未入力時はフォールバックメッセージ）
```

**案2: POSTメソッドに変更 (`POST /api/admin/posts/{postId}/delete`)**
```yaml
requestBody:
  content:
    application/json:
      schema:
        type: object
        properties:
          comment:
            type: string
            nullable: true
```

案1は既存のAPI設計との一貫性を保てるが、コメントが長い場合にURL長制限に抵触する可能性がある。案2はRESTful設計からは逸脱するが実装は素直。

### 影響範囲
- `docs/specs/openapi.yaml` (adminDeletePost)
- `src/app/api/admin/posts/[postId]/route.ts`
- `src/lib/services/admin-service.ts` (コメント受け取り → システムレス生成)
- `src/app/(web)/admin/page.tsx` (削除UIにコメント入力欄追加)

### 判断が必要な点
- DELETE + クエリパラメータ（案1）か、POST + requestBody（案2）か。
- コメントの最大文字数制限（案1を採用する場合は特に重要）。

---

## GAP-3: OpenAPI CommandResult のレスポンス設計が旧設計のまま

### ステータス
- [ ] 未解消

### 現状分析

**D-08 posting.md §5**: 方式A（レス内マージ）により、コマンド結果は `post.inlineSystemInfo` に格納される設計。CommandServiceは `CommandExecutionResult.systemMessage` として文字列を返すのみで、PostServiceがDB操作を担う。

**D-08 command.md §2.1**: `CommandExecutionResult` は `{ success, systemMessage, currencyCost }` の構造。

**openapi.yaml**: `createPost` レスポンスに `commandResult` オブジェクト（`commandName`, `success`, `systemMessage`）が独立して含まれる旧設計のまま。

**BDDシナリオ (command_system.feature)**: コマンド実行結果の表示はすべて「レス末尾にマージ表示される」形式。独立した`commandResult`オブジェクトとしての返却を要求するシナリオは存在しない。

### 提案

**案A（推奨）: `commandResult` を残しつつ、`post.inlineSystemInfo` にも反映する**

`commandResult` はクライアントがコマンド実行の成否をプログラム的に判定するメタ情報として有用。表示用文字列は `post.inlineSystemInfo` で一元化する。

```yaml
# createPost レスポンス
post:
  $ref: "#/components/schemas/Post"
  # post.inlineSystemInfo に表示用文字列が含まれる
commandResult:
  $ref: "#/components/schemas/CommandResult"
  nullable: true
  description: コマンドが含まれていた場合のメタ情報（プログラム的判定用）
```

`CommandResult` スキーマは現行のまま維持。`systemMessage` プロパティの description を「表示用文字列は post.inlineSystemInfo を参照」に更新。

**案B: `commandResult` を廃止し、`post.inlineSystemInfo` に統一する**

シンプルだが、クライアントがコマンド成否をパースで判定する必要がありUX低下の可能性。

### 影響範囲
- `docs/specs/openapi.yaml` (Post スキーマ、createPost レスポンス)
- `src/app/api/threads/[threadId]/posts/route.ts` (レスポンス構築)

### 判断が必要な点
- `commandResult` を維持するか廃止するか。推奨は維持（案A）。

---

## GAP-4: D-05 post_state_transitions.yaml のシステムメッセージ表示名が旧形式

### ステータス
- [ ] 未解消

### 現状分析

**D-05 post_state_transitions.yaml** の `post_types.system_message`:
```yaml
display_name: "[システム]"
daily_id: "SYSTEM"
```

**BDDシナリオ (command_system.feature v4, admin.feature v3)**: 方式B（独立システムレス）は「★システム」名義と明記。
```
And 「★システム」名義の独立レスが追加される
```

**D-08 posting.md §5**: 方式Bの投稿者名は「★システム」と明記。

**D-06 thread-view.yaml**: `post-display-name` のsystemスタイルは `"[システム] プレフィックス付き"` となっており、表示名の文字列自体は未更新。

**D-07 architecture.md §4.2 posts テーブル**: `display_name` の説明に `「名無しさん」/ユーザーネーム/「[システム]」` と旧形式のまま。

**まとめ**: BDDシナリオとD-08は「★システム」で統一済みだが、D-05/D-06/D-07の記載が「[システム]」のままで不整合。

### 提案

以下のドキュメントを「★システム」に統一する。

**1. `docs/specs/post_state_transitions.yaml`**:
```yaml
# 変更前
display_name: "[システム]"
daily_id: "SYSTEM"

# 変更後
display_name: "★システム"
daily_id: ""
# daily_idは空文字列とする（D-08 posting.md: 「dailyIdなし」）
```

**2. `docs/specs/screens/thread-view.yaml`**:
```yaml
# 変更前
system_message: "[システム] プレフィックス付き、背景色変更"

# 変更後
system_message: "「★システム」名義、背景色変更"
```

**3. `docs/architecture/architecture.md` §4.2 posts テーブル**:
```
# 変更前
display_name | VARCHAR | 表示名（「名無しさん」/ユーザーネーム/「[システム]」）

# 変更後
display_name | VARCHAR | 表示名（「名無しさん」/ユーザーネーム/「★システム」）
```

**4. 方式Aの再整理**: 方式A（レス内マージ）では `post_type = user_post` のまま `inlineSystemInfo` が付加される。D-05の `post_types` セクションに方式Aの説明ノートを追加する:

```yaml
# post_types の注記として追加
notes:
  - >
    方式A（レス内マージ）ではpost_typeはuser_postのまま。
    コマンド結果・書き込み報酬は inline_system_info カラムに格納され、
    表示時に本文末尾に区切り線付きで付加される。
    system_message タイプにはならない。
```

### 影響範囲
- `docs/specs/post_state_transitions.yaml`
- `docs/specs/screens/thread-view.yaml`
- `docs/architecture/architecture.md`

### 判断が必要な点
- 独立システムレスの `daily_id` を空文字列とするか、特定の識別子（例: "SYSTEM"）を維持するか。BDDシナリオには `daily_id` の具体値への言及がない。D-08 posting.md は「dailyIdなし」と記載。推奨は空文字列。

---

## GAP-5: config/commands.yaml が未作成

### ステータス
- [ ] 未解消

### 現状分析

**D-08 command.md §2.2**: YAML設定層の方針・スキーマが詳細に定義済み。サンプルYAMLも記載。

**実ファイル**: `config/commands.yaml` は存在しない（Globで確認済み）。

### 提案

D-08 command.md §2.2 のスキーマに準拠して `config/commands.yaml` を新規作成する。Phase 2スコープのコマンド（`!tell`, `!w`）のみ定義。

```yaml
# config/commands.yaml
# コマンド設定（D-08 command.md §2.2 準拠）
# Phase 2 スコープ: !tell, !w のみ

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

### 影響範囲
- `config/commands.yaml` (新規作成)
- `src/lib/services/command-service.ts` (YAML読み込み・Registry構築の実装時に参照)

### 判断が必要な点
- 特になし。D-08の設計が明確なため、そのまま作成して問題ない。コーディングAIのタスクとして実装時に同時作成してもよい。

---

## GAP-6: D-08 command.md §4「1レス1コマンド」が仕様未確定メモのまま

### ステータス
- [ ] 未解消（仕様は実質確定済みだが、記述が未確定メモのまま）

### 現状分析

**D-08 command.md §4**:
> コマンドの優先順位（1レスに複数コマンドが含まれる場合）→ **MVPでは1レス1コマンドのみ有効。複数ある場合は先頭のみ実行**（仕様として確定させること）

「確定させること」のメモが残っているが、BDDシナリオ側での根拠を確認する:

**command_system.feature (v4)**: 全シナリオが1レス1コマンドの前提で記述されている。複数コマンドの挙動に言及するシナリオはない。

**GAP文書 (GAP-7 備考)**: 「1レス1コマンド（先頭のみ有効）」と記載。

### 提案

D-08 command.md §4 の記述を「仕様確定」として更新する。

```markdown
# 変更前
- コマンドの優先順位（1レスに複数コマンドが含まれる場合）→ **MVPでは1レス1コマンドのみ有効。複数ある場合は先頭のみ実行**（仕様として確定させること）

# 変更後
- コマンドの優先順位: **MVPでは1レス1コマンドのみ有効。本文中に複数のコマンドが含まれる場合は先頭のコマンドのみを実行し、残りは無視する**
```

また、BDDシナリオに「複数コマンドが含まれる場合は先頭のみ実行」のシナリオ追加が望ましいが、feature変更はスコープ外のためエスカレーション対象。ただし、現行シナリオで動作的に矛盾はないため、エスカレーションの優先度は低い。

### 影響範囲
- `docs/architecture/components/command.md` (§4 の記述更新のみ)

### 判断が必要な点
- BDDシナリオに複数コマンドのテストケースを追加するか。推奨は「Phase 2実装後に必要と判断された場合に追加」で十分。

---

## GAP-7: command-parser.ts が未実装

### ステータス
- [x] 解消済み（コーディングAIのスコープ内）

### 現状分析

**`src/lib/domain/models/command.ts`**: `Command` と `ParsedCommand` の型定義が存在。パーサー本体は未実装。

**`src/lib/domain/rules/command-parser.ts`**: ファイルが存在しない（Globで確認済み）。

**D-08 command.md**: command-parserの位置づけ（純粋関数、domain/rules配下）が設計済み。

**D-07 architecture.md §9**: `src/lib/domain/rules/command-parser.ts` のパスが明記。

**GAP文書の見解**: 「コーディングAIが実装するスコープなので問題ない」と記載。

### 現状分析結果

command-parser.ts の実装はコーディングAIタスクの一部として自然に実施される。パース仕様は以下の情報源から十分に導出可能:

1. D-08 command.md §2.2: コマンド名・引数の形式
2. command_system.feature: 「本文に "これAIだろ !tell >>5" を含めて投稿する」等の具体例
3. GAP文書 GAP-7 備考: パース仕様の要約
4. `ParsedCommand` 型: パース結果の構造

ただし、パース仕様を command.md に明記しておくとコーディングAIの実装精度が向上する。

### 提案

D-08 command.md にパース仕様セクションを追加する（任意だが推奨）:

```markdown
## 2.3 コマンド解析仕様（command-parser）

command-parser はドメインルール層（`src/lib/domain/rules/command-parser.ts`）に配置する純粋関数。

### 入力
- 書き込み本文（UTF-8文字列）

### 出力
- `ParsedCommand | null`（コマンドが検出されなければ null）

### 解析ルール
1. 本文中から `!` で始まる単語をコマンド候補として検出する
2. コマンド名の後にスペース区切りで引数を取得する
3. 本文中の任意の位置に出現可能（先頭でなくてもよい）
4. 1レス1コマンド: 複数のコマンド候補がある場合は先頭のみを返す
5. コマンドレジストリに存在しないコマンド名は null を返す（通常の書き込みとして扱う）
```

### 影響範囲
- `docs/architecture/components/command.md` (パース仕様セクション追加、任意)

### 判断が必要な点
- 特になし。

---

## Phase 2 実装着手の前提条件チェックリスト

| GAP | タイトル | ステータス | 優先度 | 対応内容 |
|-----|---------|----------|--------|---------|
| GAP-1 | Post モデルに inlineSystemInfo 未定義 | 未解消 | 高 | Post型・OpenAPI・DB・マイグレーションへの追加。格納方式（独立カラム vs body統合）の判断が必要 |
| GAP-2 | adminDeletePost にコメントパラメータなし | 未解消 | 高 | OpenAPI更新。DELETE+クエリパラメータ or POST変更の判断が必要 |
| GAP-3 | CommandResult レスポンス設計が旧設計 | 未解消 | 高 | commandResultの扱い確定。推奨は維持（メタ情報）+ inlineSystemInfoとの役割分担を明記 |
| GAP-4 | D-05 システムメッセージ表示名が旧形式 | 未解消 | 中 | D-05/D-06/D-07の「[システム]」を「★システム」に統一 |
| GAP-5 | config/commands.yaml が未作成 | 未解消 | 中 | D-08準拠のYAMLファイル新規作成（コーディングAIタスクと同時でも可） |
| GAP-6 | 1レス1コマンドルールが未確定メモ | 未解消 | 中 | D-08 §4 のメモを確定記述に更新 |
| GAP-7 | command-parser.ts が未実装 | 解消済み | 低 | コーディングAIのスコープ内。パース仕様の明記は推奨 |

### 実装着手の判断

- **GAP-1, GAP-2, GAP-3** は実装着手前に解消が必須。コーディングAIがPost型の構造・API仕様・レスポンス形式を確定できないとコードが書けない。
- **GAP-4, GAP-5, GAP-6** はドキュメント整合性の問題であり、実装と並行して解消可能。ただし早期に解消する方が手戻りリスクを減らせる。
- **GAP-7** は解消済み。

### 人間に判断を仰ぐべき事項（まとめ）

1. **GAP-1**: `inlineSystemInfo` の格納方式（独立カラム vs body統合）
2. **GAP-2**: レス削除APIの設計（DELETE+クエリパラメータ vs POST変更）
3. **GAP-3**: `commandResult` の維持 vs 廃止
4. **GAP-4**: 独立システムレスの `daily_id` の値（空文字列 vs "SYSTEM"）
