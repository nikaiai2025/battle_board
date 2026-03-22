---
task_id: TASK-266
sprint_id: Sprint-94
status: completed
assigned_to: bdd-coding
depends_on: [TASK-265]
created_at: 2026-03-22T22:00:00+09:00
updated_at: 2026-03-22T22:00:00+09:00
locked_files:
  - src/lib/services/command-service.ts
  - src/lib/services/post-service.ts
  - config/commands.yaml
  - config/commands.ts
  - "[NEW] src/lib/services/handlers/iamsystem-handler.ts"
  - "[NEW] features/step_definitions/command_iamsystem.steps.ts"
  - "[NEW] src/__tests__/lib/services/handlers/iamsystem-handler.test.ts"
---

## タスク概要

!iamsystem コマンドを実装する。ステルスコマンド基盤（コマンド文字列の除去 + ポストフィールド上書き）の初実装であり、将来の !aori 等のステルスコマンドの土台となる。

## 対象BDDシナリオ

- `features/command_iamsystem.feature` — 全7シナリオ

## 必読ドキュメント（優先度順）

1. [必須] `tmp/workers/bdd-architect_265/iamsystem_design.md` — 詳細設計書（型定義・擬似コード・影響分析）
2. [必須] `features/command_iamsystem.feature` — 対象シナリオ（7シナリオ）
3. [必須] `src/lib/services/post-service.ts` — PostService の処理フロー（Step 5.5 挿入箇所）
4. [必須] `src/lib/services/command-service.ts` — CommandExecutionResult / CommandHandlerResult 型定義
5. [参考] `docs/architecture/components/command.md` — §5 ステルス設計原則 + ステルスの実装メカニズム
6. [参考] `src/lib/services/handlers/abeshinzo-handler.ts` — 最も単純なハンドラの参考パターン

## 入力（前工程の成果物）

- `tmp/workers/bdd-architect_265/iamsystem_design.md` — TASK-265で出力された詳細設計書

## 出力（生成すべきファイル）

- `src/lib/services/handlers/iamsystem-handler.ts` — ハンドラ実装
- `src/lib/services/command-service.ts` — PostFieldOverrides型追加 + CommandExecutionResult拡張 + CommandHandlerResult拡張 + executeCommand戻り値拡張 + IamsystemHandler登録
- `src/lib/services/post-service.ts` — Step 5.5（ステルス除去 + フィールド上書き）追加
- `config/commands.yaml` + `config/commands.ts` — !iamsystem エントリ追加
- `features/step_definitions/command_iamsystem.steps.ts` — BDDステップ定義
- `src/__tests__/lib/services/handlers/iamsystem-handler.test.ts` — 単体テスト
- cucumber.js への paths/require 追加

## 完了条件

- [ ] `features/command_iamsystem.feature` 全7シナリオPASS
- [ ] 単体テスト全件PASS
- [ ] `npx vitest run` 全テストPASS
- [ ] `npx cucumber-js` 既存シナリオのリグレッションなし

## スコープ外

- !aori の非同期キュー（BOT関連、保留中）
- !newspaper のAI API（BOT関連、保留中）
- PostFieldOverrides の他のコマンドでの利用（将来タスク）

## 補足・制約

- 設計書の型定義・擬似コードに従って実装すること
- `is_system_message` は **false のまま維持**（feature で明示規定）
- ステルス3原則: 成功→除去 / 失敗→残す / 空本文→投稿する
- 既存ハンドラへの影響ゼロであること（追加フィールドは全てオプショナル）
- シナリオ6-7（!tell人間判定・!attack賠償金）は既存の tell/attack ハンドラとの相互作用テスト

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全7シナリオ実装・全テストPASS
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. 設計書・feature・既存コード読解完了
2. IamsystemHandler 単体テスト作成 (7テスト) -- RED確認後、ハンドラ実装でGREEN
3. command-service.ts 型拡張: PostFieldOverrides型追加、CommandExecutionResult/CommandHandlerResult拡張、executeCommand戻り値にステルス3フィールド追加、IamsystemHandler登録
4. config/commands.yaml + commands.ts に iamsystem エントリ追加
5. post-service.ts: Step 4 dailyId を let化、Step 5.5 ステルス処理（本文除去+フィールド上書き）追加、Step 7/9 で resolvedBody 使用に変更
6. BDDステップ定義作成（重複ステップは既存ファイルのものを再利用）
7. cucumber.js に paths/require 追加
8. 全テストPASS確認

### テスト結果サマリー

- **vitest**: 82ファイル / 1675テスト 全PASS（リグレッションなし）
- **cucumber-js**: 301シナリオ（285 passed, 16 pending[既存]）/ 1568ステップ 全PASS
- **iamsystem 7シナリオ**: 全PASS
  - シナリオ1: 成功時にコマンド文字列が投稿本文から除去される -- PASS
  - シナリオ2: コマンドのみの書き込みでは空本文で投稿される -- PASS
  - シナリオ3: 通貨不足で失敗するとコマンド文字列が本文に残り偽装も適用されない -- PASS
  - シナリオ4: 成功時に表示名とIDがシステム風に変更される -- PASS
  - シナリオ5: 表示名・IDのみ変更され、is_system_message は false のままである -- PASS
  - シナリオ6: !tell で人間と判定される -- PASS
  - シナリオ7: !attack すると人間への攻撃扱いで賠償金が発生する -- PASS

### 備考

- E2Eベーシックフローテスト（e2e/flows/basic-flow.spec.ts）への !iamsystem 追加は locked_files に含まれていないため未実施。必要であれば後続タスクで対応。
