---
task_id: TASK-098
sprint_id: Sprint-34
status: done
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-098
depends_on: []
created_at: 2026-03-17T10:00:00+09:00
updated_at: 2026-03-17T10:00:00+09:00
locked_files:
  - "tmp/workers/bdd-architect_TASK-098/"
---

## タスク概要

草コマンド（!w）の本格実装に必要なシステム設計を行う。現在のGrassHandlerはMVPスタブ（メッセージ返却のみ）であり、reactions.featureの22シナリオを全てPASSさせるためのDB設計・Repository設計・Handler契約・ドメインルール設計が必要。

## 対象BDDシナリオ
- `features/reactions.feature` — 全22シナリオ
- `features/mypage.feature` — 草カウント表示2シナリオ

## 必読ドキュメント（優先度順）
1. [必須] `features/reactions.feature` — 草コマンドの全振る舞い定義
2. [必須] `features/mypage.feature` — 草カウント表示（末尾2シナリオ）
3. [必須] `docs/architecture/components/command.md` — コマンド基盤設計（CommandHandler契約）
4. [必須] `src/lib/services/handlers/grass-handler.ts` — 現在のMVPスタブ
5. [参考] `src/lib/services/handlers/tell-handler.ts` — 既存ハンドラの実装例（対象レス解決パターン）
6. [参考] `src/lib/services/handlers/attack-handler.ts` — 既存ハンドラの実装例（対象レス・ユーザー解決パターン）
7. [参考] `docs/architecture/architecture.md` — D-07 全体設計
8. [参考] `docs/requirements/ubiquitous_language.yaml` — D-02 用語定義

## 入力（前工程の成果物）
- なし（新規設計）

## 出力（生成すべきファイル）
- `tmp/workers/bdd-architect_TASK-098/grass_system_design.md` — 草システム設計書。以下を含む:
  1. **DBスキーマ設計**: 草リアクション記録テーブル、usersテーブルへのgrass_countカラム追加有無の判断
  2. **Repository設計**: GrassRepository のインターフェース定義（メソッド名・引数・戻り値）
  3. **ドメインルール設計**: アイコン決定関数（50ループ）、重複判定ルール
  4. **GrassHandler契約**: 既存CommandHandler契約との整合性、必要な依存注入
  5. **mypage連携**: MypageServiceへの草カウント取得方法
  6. **SQLマイグレーション案**: テーブルDDL + RLSポリシー

## 完了条件
- [x] 設計書がartifacts_dirに出力されている
- [x] reactions.featureの全22シナリオを満たすDB・Service設計が記載されている
- [x] 既存コマンド基盤（CommandService/CommandHandler）との整合性が確認されている
- [x] 重複制限（同日同一付与先1回）のDB設計が明確である
- [x] ボットへの草対応方針が記載されている

## スコープ外
- ソースコードの実装（TASK-099以降で実施）
- featureファイルの変更
- D-07/D-08への反映（実装完了後に同期）

## 補足・制約
- 既存の `tell-handler.ts`, `attack-handler.ts` のパターンを踏襲すること
- GrassHandlerに必要な依存（PostRepository, UserRepository等）の注入方式を明記すること
- `config/commands.yaml` の !w エントリ確認（cost: 0 が設定済みか）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 設計書出力、自己レビュー
- 次にすべきこと: TASK-099(実装タスク)へ引き継ぎ
- 未解決の問題: なし

### 進捗ログ

#### 2026-03-17 作業実施

**1. 必読ドキュメントの確認**
- `features/reactions.feature` — 22シナリオ全件読了
- `features/mypage.feature` — 草カウント2シナリオ確認
- `docs/architecture/components/command.md` — CommandHandler契約、2層構造確認
- `src/lib/services/handlers/grass-handler.ts` — MVPスタブ(メッセージ返却のみ)確認
- `src/lib/services/handlers/tell-handler.ts` — DI(AccusationService)パターン確認
- `src/lib/services/handlers/attack-handler.ts` — DI(BotService, CurrencyService, PostRepository)パターン、インターフェース定義パターン確認
- `src/lib/services/command-service.ts` — GrassHandler生成箇所、Registry構築フロー確認
- `config/commands.yaml` — `w: cost: 0, enabled: true` 確認済み
- `supabase/migrations/00001_create_tables.sql` — 既存テーブル構造確認
- `supabase/migrations/00007_bot_v5_attack_system.sql` — attacks テーブルの設計パターン(同日制限のUNIQUE制約)参照
- `src/lib/domain/models/user.ts`, `post.ts` — 既存ドメインモデル確認
- `src/lib/infrastructure/repositories/user-repository.ts`, `post-repository.ts` — 既存Repository関数確認
- `src/lib/services/mypage-service.ts` — MypageInfo型、getMypage関数確認

**2. 設計書出力**
- `tmp/workers/bdd-architect_TASK-098/grass_system_design.md` に設計書を出力
- 全9セクション: DBスキーマ、Repository、ドメインルール、GrassHandler契約、mypage連携、SQLマイグレーション案、処理フロー図、設計判断サマリー、実装ファイル一覧

**3. 自己レビュー**
- D-1〜D-6の設計判断を再検証。重大な誤りなし
- PostgreSQL UNIQUE制約のNULL扱い(ボット用別制約の必要性)を確認
- 事前重複チェック(existsForToday)の必要性(エラーメッセージ出し分けのため)を確認

### テスト結果サマリー
<!-- 設計タスクのため該当なし -->
