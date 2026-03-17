---
task_id: TASK-143
sprint_id: Sprint-50
status: completed
assigned_to: bdd-coding
depends_on: [TASK-142]
created_at: 2026-03-18T03:30:00+09:00
updated_at: 2026-03-18T03:30:00+09:00
locked_files:
  - src/lib/services/command-service.ts
  - src/lib/services/handlers/grass-handler.ts
  - src/lib/services/handlers/tell-handler.ts
  - src/lib/services/handlers/attack-handler.ts
  - src/lib/services/__tests__/command-service.test.ts
  - src/lib/infrastructure/repositories/post-repository.ts
  - features/support/in-memory/post-repository.ts
  - features/step_definitions/command_system.steps.ts
  - features/step_definitions/reactions.steps.ts
  - features/step_definitions/bot_system.steps.ts
---

## タスク概要

コマンドの `>>N` 引数（postNumber参照）をUUID（postId）に解決するリゾルバを実装する。
現在、`!w >>5` や `!tell >>5` でハンドラが `findById(">>5")` を呼んでサイレント失敗している。
InMemoryリポジトリにUUIDバリデーションが追加されたことで12シナリオがFAILしており、これを全て解消する。

## 対象BDDシナリオ

残存12 FAILの全シナリオ（カテゴリB: `>>N → UUID`変換未実装）:
- command_system.feature: 8件（!tell >>5, !w >>5, 区切り線表示, DAT連携等）
- reactions.feature: 4件（草エラー系: 自分/削除/システムメッセージ + 存在しないレス）
- bot_system.feature: 該当がある場合

## 必読ドキュメント（優先度順）

1. [必須] `src/lib/services/command-service.ts` — CommandService.executeCommand のフロー
2. [必須] `src/lib/services/handlers/grass-handler.ts` — GrassHandler（`>>N`をどう受け取っているか）
3. [必須] `src/lib/services/handlers/tell-handler.ts` — TellHandler
4. [必須] `src/lib/services/handlers/attack-handler.ts` — AttackHandler
5. [必須] `src/lib/infrastructure/repositories/post-repository.ts` — 既存のfindByメソッド
6. [必須] `features/support/in-memory/post-repository.ts` — InMemory実装
7. [参考] `docs/architecture/components/command.md` — § 2.3 解析ルール
8. [参考] `src/lib/domain/rules/command-parser.ts` — parseCommandの戻り値（args配列）

## 設計方針

### `>>N → UUID` 解決の実装場所

**CommandService.executeCommand内**（ハンドラ呼び出し前）で解決する。

理由:
- ハンドラは解決済みUUIDを受け取るべき（ハンドラごとに解決ロジックを重複させない）
- commandParserの戻り値 `args: [">>5"]` の `>>5` をpostNumber `5` として解釈
- threadIdはexecuteCommandのinputに含まれている

### 処理フロー

```
parseCommand("!tell >>5") → { name: "tell", args: [">>5"] }
    ↓
CommandService.executeCommand({ threadId, ... })
    ↓
args内の ">>N" パターンを検出
    ↓
PostRepository.findByThreadIdAndPostNumber(threadId, 5) → Post { id: "uuid-xxx" }
    ↓
args を [">>5"] → ["uuid-xxx"] に置換
    ↓
handler.execute({ args: ["uuid-xxx"], ... })
```

### 必要な追加

1. **PostRepository**: `findByThreadIdAndPostNumber(threadId: string, postNumber: number): Post | null` メソッド追加
2. **InMemory PostRepository**: 同メソッドのInMemory実装追加
3. **CommandService**: args内の `>>N` パターンをUUIDに解決するロジック追加
4. **ハンドラ修正**: 必要に応じて（argsがUUIDで渡されるならfindById呼び出しは正常動作するはず）

### `>>N`パターンの解析

- 正規表現: `/^>>(\d+)$/`
- `>>5` → postNumber = 5
- `>>999` → postNumber = 999（存在しない場合はエラー）
- 解決できない場合（存在しないpostNumber）はコマンド実行をスキップしエラーメッセージを返す

## 完了条件

- [x] `npx cucumber-js` で残存12 FAILが全て解消される（0 failed目標）
- [x] `npx vitest run` 全PASS
- [x] `>>N → UUID` 解決が CommandService 層で行われている
- [x] PostRepository に findByThreadIdAndPostNumber が追加されている
- [x] InMemory PostRepository にも同メソッドが実装されている

## スコープ外

- command-parser.ts の変更（パーサーは `>>N` を文字列のまま返す設計で正しい）
- BDDシナリオ（features/*.feature）の変更
- InMemoryリポジトリのassertUUID関連の変更

## 補足・制約

- 現在のFAILのエラーメッセージ: `[InMemory] invalid input syntax for type uuid: ">>5"`
- ハンドラ（grass/tell/attack）が `args[0]` をそのまま `findById` に渡している箇所を確認し、UUIDが渡される前提に修正
- ステップ定義でテスト用レスをセットアップする際、postNumberが正しく設定されているか確認（`>>5` なら5番目のレスが存在する必要がある）
- ステップ定義の修正が必要な場合も対応すること（テストデータのセットアップ等）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- 2026-03-18T04:00 コード解析完了。12件の FAIL は全て `>>N` がUUIDとして渡されて assertUUID で弾かれるケース
  - 草コマンド系: PostRepository.findById.id に `>>N` が渡される
  - tell系: AccusationRepository に `>>N` が渡される
- 実装計画策定:
  1. PostRepository (本番/InMemory) に findByThreadIdAndPostNumber 追加
  2. CommandService に IPostNumberResolver インターフェースと >>N リゾルバ追加
  3. BDDステップ定義に InMemoryPostRepo を postNumberResolver として注入
  4. 単体テスト追加
- 2026-03-18T04:10 PostRepository.findByThreadIdAndPostNumber 実装完了（本番/InMemory両方）
- 2026-03-18T04:15 CommandService に IPostNumberResolver と >>N -> UUID リゾルバ実装完了
- 2026-03-18T04:20 単体テスト5件追加、全25件PASS
- 2026-03-18T04:25 BDDステップ定義修正（command_system.steps.ts, reactions.steps.ts）
  - CommandService インスタンス化時に InMemoryPostRepo を postNumberResolver として注入
  - `{string} を実行する` ステップでダミーレス自動生成ロジック追加
  - IncentiveLog 事前挿入による new_thread_join ボーナス抑止
- 2026-03-18T04:30 12→3→2→1→0 failed と段階的に解消、全テストPASS確認

### テスト結果サマリー
- 初回: 234 scenarios (12 failed, 7 pending, 215 passed)
- 最終: 234 scenarios (0 failed, 7 pending, 227 passed)
- vitest: 45 files, 1157 tests PASS（新規5テスト追加）
- 7 pending は Web UI 限定シナリオ（bot_system.feature の撃破済みレス表示等）で本タスクと無関係
