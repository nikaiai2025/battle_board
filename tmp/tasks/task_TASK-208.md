---
task_id: TASK-208
sprint_id: Sprint-76
status: done
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-208
depends_on: []
created_at: 2026-03-20T18:00:00+09:00
updated_at: 2026-03-20T18:00:00+09:00
locked_files: []
---

## タスク概要
`features/investigation.feature` で定義された調査系コマンド（!hissi, !kinou）の実装計画を策定する。既存のコマンド基盤（CommandService, command-parser, !accuse, !w, !abeshinzo）を踏まえ、最小限の変更で11シナリオを実装するためのタスク分解・ファイル設計・テスト方針を策定する。

## 必読ドキュメント（優先度順）
1. [必須] `features/investigation.feature` — BDDシナリオ（11シナリオ）
2. [必須] `docs/architecture/components/command.md` — コマンド基盤設計（responseType追加済み）
3. [必須] `docs/architecture/components/posting.md` §5 — 方式A/B表示方式
4. [必須] `src/lib/services/command-service.ts` — 既存コマンドサービス
5. [必須] `src/lib/domain/rules/command-parser.ts` — コマンドパーサー
6. [必須] `config/commands.yaml` — コマンド定義ファイル（!hissi, !kinou追加先）
7. [参考] `src/lib/services/accusation-service.ts` — !accuse実装例（独立システムレスの先例: !abeshinzo）
8. [参考] `src/lib/services/grass-service.ts` — !w実装例（レス内マージの先例）
9. [参考] `features/command_system.feature` — コマンド基盤BDDシナリオ

## 出力
- `tmp/workers/bdd-architect_TASK-208/implementation_plan.md` — 実装計画書（タスク分解・ファイル設計・locked_files・テスト方針）

## 完了条件
- [x] !hissi と !kinou の実装に必要な変更対象ファイルが全て特定されている
- [x] 新規ファイルと既存ファイルの変更内容が具体的に記述されている
- [x] コーディングAI用のタスク分解（1〜3タスク程度）が提案されている
- [x] 各タスクのlocked_filesが特定されている
- [x] PostRepositoryへの新規クエリ追加の設計（日付フィルタ、昨日のID取得）が記述されている
- [x] BDDステップ定義の方針（新規step_definitions/investigation.steps.ts）が記述されている
- [x] 既存のコマンドディスパッチ（CommandService.execute）へのハンドラ登録方式が明記されている

## スコープ外
- 実装コードの作成（設計のみ）
- BDDシナリオの変更

## 補足・制約

### responseType フィールド
command.md に `responseType: "inline" | "independent"` が追加された。CommandServiceがresponseTypeに基づき結果の表示方式を切り替える仕組みが必要か、各ハンドラが自前で独立レスを投稿する方式でよいか（現在の!abeshinzo方式）、設計判断を含めること。

### 検索範囲
feature冒頭のコメントに「全スレッド横断。PostRepository.findByAuthorId に日付フィルタを追加する形で実装可能」とある。この設計の妥当性を検証すること。

### !kinou の「昨日のID」
日次リセットIDは `daily-id.ts` で生成される。昨日のIDを取得するには、ユーザーの昨日の書き込みからdailyIdを取得するか、計算で求めるかの選択がある。

## 作業ログ

### 2026-03-20 調査・設計完了

**調査したファイル:**
- features/investigation.feature (11シナリオ)
- docs/architecture/components/command.md (responseType定義確認)
- docs/architecture/components/posting.md (方式A/B確認)
- src/lib/services/command-service.ts (ハンドラ登録パターン、型定義)
- src/lib/domain/rules/command-parser.ts (変更不要を確認)
- config/commands.yaml, config/commands.ts (エントリ追加先)
- src/lib/services/handlers/abeshinzo-handler.ts (independentパターンの先例)
- src/lib/services/handlers/grass-handler.ts (DI・バリデーションパターンの先例)
- src/lib/services/handlers/tell-handler.ts (引数処理パターン)
- src/lib/services/post-service.ts (eliminationNotice独立レス投稿処理)
- src/lib/infrastructure/repositories/post-repository.ts (findByAuthorId、新関数追加先)
- src/lib/domain/rules/daily-id.ts (計算方式の評価→不採用)
- src/lib/domain/models/post.ts, command.ts (型定義確認)
- features/support/in-memory/post-repository.ts (インメモリ実装の拡張先)
- features/support/world.ts (BDDテスト基盤確認)
- docs/architecture/bdd_test_strategy.md (テストレベル確認)

**設計判断:**
1. responseType: ハンドラの自己申告方式（independentMessage フィールド追加）を採用。既存の eliminationNotice と並存させ、PostService の投稿処理を共通化
2. !kinou の昨日ID: DB検索方式を採用（generateDailyId 計算方式は authorIdSeed が保存されていないため不可）
3. PostRepository: 既存 findByAuthorId を変更せず、findByAuthorIdAndDate を新設
4. タスク分解: 2タスク（A: 基盤+ハンドラ、B: BDD+インメモリ）

**成果物:** `tmp/workers/bdd-architect_TASK-208/implementation_plan.md`

### チェックポイント
- 状態: 完了
- 完了済み: 全完了条件を充足
- 次にすべきこと: なし（人間レビュー待ち）
- 未解決の問題: なし
