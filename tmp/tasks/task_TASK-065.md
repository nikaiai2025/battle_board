---
task_id: TASK-065
sprint_id: Sprint-23
status: done
assigned_to: bdd-architect
depends_on: [TASK-063]
created_at: 2026-03-16T11:00:00+09:00
updated_at: 2026-03-16T11:00:00+09:00
locked_files:
  - docs/specs/openapi.yaml
  - docs/architecture/architecture.md
  - docs/specs/post_state_transitions.yaml
  - docs/specs/screens/thread-view.yaml
  - src/lib/domain/models/post.ts
  - "[NEW] config/commands.yaml"
---

## タスク概要

GAP-1,2,3,4,5 の解消として、OpenAPI・Post型・DB定義・D-05・D-06・D-07・コマンド設定ファイルを更新する。人間が以下の設計判断を確定済み:

- GAP-1: **独立カラム方式**（`inline_system_info TEXT NULL` カラム追加）
- GAP-2: **DELETE + クエリパラメータ**（comment をqueryで渡す）
- GAP-3: **commandResult を維持**（メタ情報として残す + inlineSystemInfoとの役割分担明記）
- GAP-4: **`daily_id: "SYSTEM"`**、表示名は「★システム」に統一
- GAP-5: config/commands.yaml を D-08準拠で新規作成

## 必読ドキュメント（優先度順）

1. [必須] `tmp/workers/bdd-architect_TASK-063/gap_resolution_proposal.md` — 各GAPの提案詳細
2. [必須] `docs/specs/openapi.yaml` — 更新対象
3. [必須] `docs/architecture/architecture.md` — 更新対象（§4.2 postsテーブル定義）
4. [必須] `docs/specs/post_state_transitions.yaml` — 更新対象
5. [必須] `docs/specs/screens/thread-view.yaml` — 更新対象
6. [必須] `src/lib/domain/models/post.ts` — 更新対象
7. [必須] `docs/architecture/components/command.md` — config/commands.yaml のスキーマ参照（読み取りのみ）
8. [必須] `docs/architecture/components/posting.md` — 方式A/Bの設計参照（読み取りのみ）

## 入力（前工程の成果物）

- `tmp/workers/bdd-architect_TASK-063/gap_resolution_proposal.md` — 解消方針提案書

## 出力（生成すべきファイル）

- `docs/specs/openapi.yaml` — Post スキーマに inlineSystemInfo 追加、adminDeletePost に comment パラメータ追加、CommandResult の description 更新
- `docs/architecture/architecture.md` — §4.2 posts テーブルに inline_system_info カラム追加、display_name の「[システム]」→「★システム」
- `docs/specs/post_state_transitions.yaml` — display_name/daily_id 更新 + 方式Aの注記追加
- `docs/specs/screens/thread-view.yaml` — system_message スタイル記述の「[システム]」→「★システム」
- `src/lib/domain/models/post.ts` — inlineSystemInfo フィールド追加、displayName のJSDocコメント更新
- `config/commands.yaml` — 新規作成（!tell, !w）

## 完了条件

- [x] GAP-1: Post型・OpenAPI・DB定義に inlineSystemInfo / inline_system_info が追加
- [x] GAP-2: adminDeletePost に comment クエリパラメータが追加
- [x] GAP-3: CommandResult が維持され、description に inlineSystemInfo との役割分担が明記
- [x] GAP-4: 全ドキュメントで「[システム]」→「★システム」、daily_id: "SYSTEM" に統一
- [x] GAP-5: config/commands.yaml が作成され、D-08 command.md §2.2 のスキーマに準拠

## スコープ外

- ソースコードの実装変更（post.ts の型定義変更のみ実施。Service/Repository/Adapter等のロジック変更はPhase 2実装タスクで対応）
- DBマイグレーションSQLの作成（実装タスクで対応）
- BDDシナリオの変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: GAP-1, GAP-2, GAP-3, GAP-4, GAP-5
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

#### 2026-03-16 GAP-1〜5 一括解消

**GAP-1: Post型・OpenAPI・DB定義に inlineSystemInfo 追加**
- `src/lib/domain/models/post.ts`: `inlineSystemInfo: string | null` フィールド追加
- `docs/specs/openapi.yaml`: Post スキーマに `inlineSystemInfo` プロパティ追加（type: string, nullable: true）
- `docs/architecture/architecture.md`: §4.2 posts テーブルに `inline_system_info` カラム追加、ER図にも反映

**GAP-2: adminDeletePost に comment クエリパラメータ追加**
- `docs/specs/openapi.yaml`: adminDeletePost に `comment` クエリパラメータ追加（type: string, required: false, maxLength: 200）

**GAP-3: CommandResult 維持 + inlineSystemInfo との役割分担明記**
- `docs/specs/openapi.yaml`: CommandResult の description を「メタ情報（プログラム的判定用）」に更新、systemMessage に「表示には post.inlineSystemInfo を使用」と明記
- createPost レスポンスの commandResult description も同様に更新

**GAP-4: 「[システム]」→「★システム」、daily_id: "SYSTEM" に統一**
- `docs/specs/post_state_transitions.yaml`: display_name を「★システム」に変更、方式Aの注記追加
- `docs/specs/screens/thread-view.yaml`: system_message スタイルを「「★システム」名義、背景色変更」に変更
- `docs/architecture/architecture.md`: posts テーブル display_name 説明を「★システム」に変更
- `src/lib/domain/models/post.ts`: displayName JSDoc を「★システム」に変更、dailyId JSDoc にシステムメッセージ時の値を追記
- daily_id の値は "SYSTEM" を維持（タスク指示書の判断に従う）

**GAP-5: config/commands.yaml 新規作成**
- `config/commands.yaml`: D-08 command.md §2.2 準拠で新規作成（!tell, !w の2コマンド定義）

**スコープ外として未変更のファイル:**
- `features/step_definitions/command_system.steps.ts`: BDDステップ定義内の「[システム]」表記はスコープ外
- `docs/requirements/ubiquitous_language.yaml`: locked_filesに含まれず、D-01変更はエスカレーション対象
- `src/app/(web)/_components/PostItem.tsx`: ソースコード実装変更はスコープ外
- DBマイグレーションSQL: 実装タスクで対応
