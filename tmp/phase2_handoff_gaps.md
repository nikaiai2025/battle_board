# Phase 2 コーディングAI引き渡し前の未解決事項

> 作成日: 2026-03-16
> 対象: command_system.feature (v4) の実装着手前に解消すべきドキュメント/スキーマの不整合

---

## 優先度: 高（これがないとコーディングAIが実装判断できない）

### GAP-1: Post モデルに `inlineSystemInfo` フィールドが未定義

**現状:** D-06 thread-view.yaml で `post.inlineSystemInfo` を参照する UI コンポーネントを定義したが、以下に未反映。

- `src/lib/domain/models/post.ts` — Post インターフェースにフィールドなし
- `docs/specs/openapi.yaml` — Post スキーマにフィールドなし
- DB テーブル定義（`docs/architecture/architecture.md` §4） — カラムなし

**対応案:**
```typescript
// post.ts に追加
inlineSystemInfo: string | null;  // レス内マージ型システム情報（コマンド結果・報酬等）
```

OpenAPI Post スキーマにも同フィールドを追加。DB は `posts.inline_system_info TEXT NULL` カラム追加。

---

### GAP-2: OpenAPI adminDeletePost にコメントパラメータがない

**現状:** admin.feature (v3) でレス削除時のコメント入力を追加したが、`DELETE /api/admin/posts/{postId}` のリクエストにコメントフィールドがない。

**対応案:** DELETE ボディまたはクエリパラメータに `comment` を追加。あるいは POST に変更（DELETE + ボディは非推奨のため）。

```yaml
# openapi.yaml adminDeletePost
requestBody:
  content:
    application/json:
      schema:
        type: object
        properties:
          comment:
            type: string
            nullable: true
            description: 削除時のコメント（システムレスに表示される。未入力時はフォールバックメッセージ）
```

---

### GAP-3: OpenAPI CommandResult のレスポンス設計が旧設計のまま

**現状:** 方式A（レス内マージ）により、コマンド結果は独立レスではなくPost.body（またはinlineSystemInfo）に結合される。現在の OpenAPI では `commandResult` が独立オブジェクトとしてレスポンスに含まれる設計。

**検討事項:**
- `createPost` レスポンスの `post.inlineSystemInfo` にコマンド結果が含まれるため、`commandResult` フィールドは冗長になる可能性がある
- ただし、クライアント側で「コマンドが実行されたか」「成功か失敗か」をプログラム的に判定する用途には有用
- 案A: `commandResult` を残す（メタ情報として）+ `post.inlineSystemInfo` にも表示用文字列を入れる
- 案B: `commandResult` を廃止し、`post.inlineSystemInfo` に統一する

---

## 優先度: 中（なくても実装は進むが、後で手戻りになる）

### GAP-4: D-05 post_state_transitions.yaml のシステムメッセージ表示名が旧形式

**現状:**
```yaml
display_name: "[システム]"
daily_id: "SYSTEM"
```

**対応:**
- 方式B（独立システムレス）は `display_name: "★システム"` に更新
- 方式A（レス内マージ）は `system_message` タイプではなく通常の `user_post` に `inlineSystemInfo` が付加される形。`post_types` セクションの再整理が必要

---

### GAP-5: config/commands.yaml が未作成

**現状:** D-08 command.md で YAML 設定層の方針を定義したが、実ファイルが存在しない。

**対応:** `config/commands.yaml` を作成。Phase 2 スコープ:

```yaml
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

---

### GAP-6: D-08 command.md §4「1レス1コマンド」が仕様未確定メモのまま

**現状:**
> コマンドの優先順位（1レスに複数コマンドが含まれる場合）→ **MVPでは1レス1コマンドのみ有効。複数ある場合は先頭のみ実行**（仕様として確定させること）

**対応:** feature で明記するか、D-08 で確定させるか判断が必要。コーディングAI が command-parser.ts を実装する際に「複数コマンドがあったらどうするか」で迷う。

---

## 優先度: 低（コーディングAIのスコープ内で対処可能）

### GAP-7: command-parser.ts が未実装

**現状:** `src/lib/domain/models/command.ts` に型定義（Command, ParsedCommand）のみ存在。パーサー本体は Phase 2 TODO。

**備考:** これはコーディングAIが実装するスコープなので問題ない。ただし以下のパース仕様を command.md または feature コメントで明記しておくと精度が上がる:
- `!` で始まる単語をコマンド候補として検出
- コマンド名の後にスペース区切りで引数
- 本文中の任意の位置に出現可能（先頭でなくてもよい）
- 1レス1コマンド（先頭のみ有効）

---

## 対応完了後のチェックリスト

- [ ] GAP-1: Post 型・OpenAPI・DB に inlineSystemInfo 追加
- [ ] GAP-2: adminDeletePost API に comment フィールド追加
- [ ] GAP-3: CommandResult のレスポンス設計を確定
- [ ] GAP-4: D-05 システムメッセージ表示名を ★システム に更新
- [ ] GAP-5: config/commands.yaml 作成
- [ ] GAP-6: 1レス1コマンドルールを確定・明記
- [ ] GAP-7: command-parser のパース仕様を明記（任意）
