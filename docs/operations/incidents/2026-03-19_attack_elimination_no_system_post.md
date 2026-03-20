# 2026-03-19: BDDステップの「Phase N 実装予定」スタブによる仕様未充足

## 概要

| 項目 | 内容 |
|---|---|
| 発見日 | 2026-03-19 |
| 発見者 | 人間（本番手動テスト） |
| 重大度 | 下表参照 |
| 種別 | 未実装機能（Phase 3 TODO の残存） |
| ステータス | Resolved（2026-03-21 修正完了） |

## 検出された問題一覧

| # | 箇所 | 症状 | 重大度 | BDD仕様 |
|---|---|---|---|---|
| 1 | `bot_system.steps.ts` L1490-1501 | `!attack` 撃破時に「★システム」名義の独立レスが投稿されない | Medium | `bot_system.feature` L238 |
| 2 | `bot_system.steps.ts` L796-808 | ボットの「既存スレッドのみに書き込む」制約が `assert(true)` で空検証 | Low | `bot_system.feature` L135-139 |

いずれも BDD ステップ定義内に「Phase 3 実装予定」コメントを残し、検証ロジックをスタブ化したことで、テストが PASS するにもかかわらず仕様が充足されていない状態。

---

## 問題 #1: !attack 撃破時の独立システムレス未投稿

### 症状

`!attack` でBOTを撃破した際、BDD仕様で定義されている「★システム」名義の独立レス（撃破通知）が投稿されない。攻撃結果はインライン表示（レス末尾マージ）のみ。

### BDD仕様との差異

`features/bot_system.feature` L237-243:

```gherkin
And レス末尾に攻撃結果がマージ表示される          # OK: 動作する
And 「★システム」名義の独立レスで撃破が通知される:    # NG: 未実装
  """
  ⚔️ ボット「荒らし役」が撃破されました！
  生存日数：5日 / 総書き込み：42件 / 被告発：3回
  撃破者：名無しさん(ID:Gz4nP7) に撃破報酬 +265
  """
```

## 直接原因

`CommandHandlerResult` 型が `{ success, systemMessage }` のみで、「独立レスの投稿が必要」という情報を伝える仕組みがない。

- `AttackHandler`: 撃破通知を `systemMessage` として文字列で返すのみ（L305-317）
- `PostService`: `commandResult.systemMessage` を `inlineSystemInfo`（レス末尾）に設定するのみ（L508-509）。独立レス投稿ロジックが存在しない
- `PostService` の戻り値 `systemMessages: []` が常に空配列（L572）

対照的に、`AdminService` の削除通知は `PostService.createPost()` を直接呼び出して「★システム」名義の独立レスを投稿しており、このパターンは動作する。

## 根本原因

コマンドシステムのアーキテクチャにおいて、コマンド結果から独立レスを生成する経路が設計されていない。AttackHandler のコメント（L305）には「★システム名義の独立レスで通知」と書かれているが、これを実現するための型設計・呼び出しフローが欠けている。

BDDステップ定義（`bot_system.steps.ts` L1494）にも以下のコメントが明記されている:

> `// ★システム名義の独立レス登録は PostService が担当（Phase 3 実装予定）。`

## なぜ今まで検出されなかったか

- BDDステップ定義が `systemMessage` に「撃破」文字列が含まれることだけを検証するスタブ実装だった
- 独立レスがDBに存在するかの検証が Phase 3 TODOとしてスキップされていた
- 単体テスト（`attack-handler.test.ts`）はハンドラの戻り値のみを検証しており、PostServiceとの統合はスコープ外

## 修正方針

### 案A（推奨）: CommandHandlerResult に独立レス情報を追加

```typescript
interface CommandHandlerResult {
  success: boolean;
  systemMessage: string | null;       // インライン表示用（既存）
  eliminationNotice?: string | null;   // ★システム名義の独立レス本文（新規）
}
```

PostService側で `eliminationNotice` が存在する場合、AdminService と同じパターンで `PostService.createPost()` を追加呼び出しする。

### 必要な変更箇所

1. `src/lib/services/command-service.ts` — `CommandHandlerResult` / `CommandExecutionResult` に `eliminationNotice` フィールド追加
2. `src/lib/services/handlers/attack-handler.ts` — 撃破時に `eliminationNotice` を返すよう変更
3. `src/lib/services/post-service.ts` — `commandResult.eliminationNotice` がある場合に独立レスを投稿
4. `features/step_definitions/bot_system.steps.ts` — スタブ検証を実検証に格上げ

---

## 問題 #2: ボットの「既存スレッドのみ書き込み」制約が空検証

### 症状

`bot_system.feature` L135-139 で定義されている「荒らし役ボットはスレッドを作成しない」シナリオのステップが `assert(true)` で常にPASSする空のアサーションになっている。実際にボットが既存スレッドのみに書き込むことを検証していない。

### BDD仕様

```gherkin
Scenario: 荒らし役ボットはスレッドを作成しない
  Given 荒らし役ボットが活動中である
  When ボットが書き込みを行う
  Then ボットは既存のスレッドに書き込む       # assert(true) で空検証
  And 新しいスレッドの作成は行わない           # assert(true) で空検証
```

### ステップ定義の現状

```typescript
// bot_system.steps.ts L796-808
Then("ボットは既存のスレッドに書き込む", async function () {
    // selectTargetThread が既存スレッドをランダム選択するのみ（Phase 3 実装予定）。
    assert(true, "ボットは既存スレッドにのみ書き込む設計で保証されています");
});

Then("新しいスレッドの作成は行わない", async function () {
    assert(true, "ボットはスレッドを作成しない設計で保証されています");
});
```

### 影響度

**Low.** `BotService.executeBotPost()` は既存スレッドIDを引数として受け取る設計であり、構造的にスレッド作成は行えない（L709-713 で `create_thread` アクションは明示的にエラーを投げる）。設計上の保証は存在するが、テストとしての検証が形骸化している。

### 修正方針

`executeBotPost` を呼び出した前後でスレッド数が変化しないことを検証する、または `create_thread` アクション時にエラーが発生することを検証するステップに置き換える。

---

## 共通の根本原因

BDDステップ定義内に「Phase N 実装予定」コメントを残してスタブ検証とするパターンが、テストの空洞化を引き起こしている。テストフレームワーク（Cucumber）の実行結果には PASS と表示されるため、未実装の検証ロジックが存在することが不可視。

詳細は `docs/architecture/lessons_learned.md` LL-007 を参照。

## 関連ファイル

- `src/lib/services/handlers/attack-handler.ts` L295-317
- `src/lib/services/command-service.ts` L88-93
- `src/lib/services/post-service.ts` L500-572
- `src/lib/services/bot-service.ts` L708-713
- `features/bot_system.feature` L135-139, L228-243
- `features/step_definitions/bot_system.steps.ts` L796-808, L1490-1501
- `src/lib/services/admin-service.ts` L117-138（動作する先行パターン）

---

## 修正履歴

### 2026-03-19: Sprint-70 — eliminationNotice 型・フロー追加（部分修正）

コミット `0336504` で問題 #1 の修正方針（案A）を実装。
`CommandHandlerResult.eliminationNotice` フィールド追加、PostService Step 9b での独立レス投稿、BDDステップの実検証化。

**しかし本番では依然として撃破通知が表示されなかった。**

### 2026-03-21: attacks.post_id UUID型エラーによるサイレント失敗の修正

#### 真の根本原因

Sprint-70 の修正（eliminationNotice フロー）は正しかったが、それ以前から存在していた別のバグにより本番で効果が発揮されていなかった。

PostService は書き込み処理の Step 5 で CommandService を呼び出す際、レスがまだ INSERT されていないため `postId: ""` を渡す:

```typescript
// post-service.ts L426
commandResult = await cmdService.executeCommand({
    postId: "", // ← INSERT前のためプレースホルダ
    ...
});
```

この空文字が AttackHandler → BotService.recordAttack → AttackRepository.create を通じて `attacks.post_id` カラム（`UUID NOT NULL REFERENCES posts(id)`）に INSERT される。PostgreSQL は UUID 型構文エラーを返し、AttackHandler.executeFlowB 全体が例外で中断。PostService の try-catch がこの例外を握りつぶすため、`commandResult` は null のまま。結果:

- インラインメッセージ（HP変化表示）: 表示されない
- 撃破報酬: 付与されない
- eliminationNotice（★システム独立レス）: 投稿されない
- コスト消費・HP減少・撃破状態変更: 実行済み（B7 より前のため）

#### BDDテストで検出できなかった理由

BDDテストは AttackHandler を PostService 経由ではなく直接呼び出しており、`postId` に `crypto.randomUUID()`（有効な UUID）を渡す。また InMemory AttackRepository は UUID バリデーションや FK 制約チェックを行わない。このため、BDD テストでは `postId: ""` が流入する経路が再現されなかった。

なお、この問題は本番固有ではない。ローカル E2E テスト（Phase B）であれば、実 API → PostService → CommandService の経路を Supabase Local（実 PostgreSQL）上で実行するため、同じ UUID 型エラーが検出可能だった。バグの所在は PostService → CommandService の境界であり、この境界を通過し、かつ実 PostgreSQL を使用するテストであれば環境を問わず検出できる。Phase B テスト（ローカル・本番共通）が未実装だったことが検出遅延の原因。

#### 修正内容

1. `supabase/migrations/00020_attacks_post_id_nullable.sql` — `attacks.post_id` の NOT NULL / FK 制約を削除
2. `src/lib/infrastructure/repositories/attack-repository.ts` — `Attack.postId` 型を `string | null` に変更
3. `src/lib/services/handlers/attack-handler.ts` — `ctx.postId || null` で空文字を null に変換
4. `src/lib/services/bot-service.ts` — `recordAttack` の postId 引数を `string | null` に変更

### 2026-03-21: CommandContext に dailyId が未提供 — 表示文字列に内部UUID露出

上記 post_id nullable 修正により B7-B9 が到達可能になったことで、表示文字列に新たな不具合が判明。
AttackHandler のインラインメッセージ・撃破通知が `ctx.userId`（内部UUID）を使用しており、BDD仕様が期待する日次ID形式（例: `Gz4nP7`）と不一致。`CommandContext` に `dailyId` フィールドが存在しなかったことが原因。

修正: `CommandExecutionInput` / `CommandContext` に `dailyId` を追加し、PostService Step 4 の生成結果を Step 5 経由でハンドラに伝播。同じ問題を持っていた TellHandler（`accuserDailyId` の仮実装）も同時に修正。

---

## 横展開調査（Q9）

`postId: ""` と同じパターン（UUID列に到達し得る空文字プレースホルダ）をコードベース全体で検索した結果:

| # | 箇所 | パターン | リスク | 対処要否 |
|---|---|---|---|---|
| 1 | `post-service.ts` L428 `userId: resolvedAuthorId ?? ""` | 未ログインユーザーの場合 `ctx.userId` が `""` になり得る | 低（コマンドハンドラが事前に認証済みユーザーを要求するため到達しない） | 不要 |
| 2 | `post-service.ts` L430-434 try-catch パターン | コマンド実行の全例外をサイレントに握りつぶす | 中（新コマンド追加時に同種のサイレント失敗を引き起こす構造） | 要注意 |

教訓として LL-011 を `docs/architecture/lessons_learned.md` に追記。
