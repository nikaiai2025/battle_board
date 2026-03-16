---
task_id: TASK-094
sprint_id: Sprint-33
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-16T12:00:00+09:00
updated_at: 2026-03-16T12:00:00+09:00
locked_files:
  - "src/lib/domain/models/bot.ts"
  - "src/lib/infrastructure/repositories/bot-repository.ts"
  - "[NEW] src/lib/infrastructure/repositories/attack-repository.ts"
  - "[NEW] supabase/migrations/00007_bot_v5_attack_system.sql"
  - "[NEW] config/bot_profiles.yaml"
  - "features/support/in-memory/bot-post-repository.ts"
  - "[NEW] features/support/in-memory/attack-repository.ts"
  - "[NEW] src/__tests__/lib/infrastructure/repositories/attack-repository.test.ts"
---

## タスク概要
Bot system v5 のDB基盤を構築する。attacks テーブルの新規作成、bots テーブルへの times_attacked/bot_profile_key カラム追加、Bot ドメインモデルの更新、AttackRepository の新規作成、BotRepository の拡張、bot_profiles.yaml の作成、インメモリモックの追加を行う。

## 対象BDDシナリオ
- `features/未実装/bot_system.feature` — 全シナリオ（本タスクはDB基盤のみ。BDDステップ定義は後続タスク）

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/components/bot.md` — D-08 v5（§5 データモデル変更が本タスクのスコープ）
2. [必須] `docs/architecture/components/attack.md` — D-08 v1（§2.2 コマンド設定）
3. [必須] `docs/specs/bot_state_transitions.yaml` — D-05 v5（撃破報酬パラメータ等）
4. [参考] `src/lib/infrastructure/repositories/bot-repository.ts` — 既存リポジトリ（拡張対象）
5. [参考] `src/lib/infrastructure/repositories/bot-post-repository.ts` — 既存パターン参照
6. [参考] `supabase/migrations/00001_create_tables.sql` — 既存テーブル定義参照

## 入力（前工程の成果物）
- `docs/architecture/components/bot.md` §5 — データモデル変更仕様
- `docs/architecture/components/attack.md` §2.2 — attacks テーブル仕様

## 出力（生成すべきファイル）
- `supabase/migrations/00007_bot_v5_attack_system.sql` — DBマイグレーション
- `src/lib/domain/models/bot.ts` — Bot インターフェースに timesAttacked, botProfileKey 追加
- `src/lib/infrastructure/repositories/bot-repository.ts` — incrementTimesAttacked, resetForDailyMaintenance 等の追加
- `src/lib/infrastructure/repositories/attack-repository.ts` — 新規 (create, findByAttackerAndBotAndDate, deleteByDateBefore)
- `config/bot_profiles.yaml` — 荒らし役のプロファイル定義（固定文リスト・報酬パラメータ等）
- `features/support/in-memory/attack-repository.ts` — BDD用インメモリモック
- `features/support/in-memory/bot-post-repository.ts` — 更新（必要に応じ）
- 単体テスト

## 完了条件
- [ ] マイグレーションSQLが D-08 bot.md §5.1〜§5.3 に完全準拠
- [ ] Bot ドメインモデルに timesAttacked (number), botProfileKey (string) が追加されている
- [ ] BotRepository に incrementTimesAttacked, bulkResetRevealed, bulkReviveEliminated 等の日次リセット用関数が追加されている
- [ ] AttackRepository が create, findByAttackerAndBotAndDate, deleteByDateBefore を公開している
- [ ] bot_profiles.yaml に荒らし役の固定文リスト・報酬パラメータが定義されている
- [ ] BDD用インメモリ attack-repository.ts が作成されている
- [ ] 単体テスト全件PASS: `npx vitest run`
- [ ] 既存テスト全件PASS: `npx vitest run` で回帰テスト確認

## スコープ外
- BotService のビジネスロジック実装（TASK-095）
- AttackHandler の実装（TASK-095）
- CommandService への !attack 登録（TASK-095）
- BDDステップ定義（TASK-096）
- bot_system.feature ファイルの移動（TASK-096）

## 補足・制約
- BotRow 型に times_attacked, bot_profile_key を追加し、rowToBot の変換も更新すること
- incrementColumn の対象に 'times_attacked' を追加すること
- attacks テーブルの RLS: anon/authenticated は全操作 DENY、service_role のみ可
- bot_profiles.yaml のフォーマット例:
  ```yaml
  荒らし役:
    hp: 10
    max_hp: 10
    reward:
      base_reward: 10
      daily_bonus: 50
      attack_bonus: 5
    fixed_messages:
      - "なんJほんま覇権やな"
      - "効いてて草"
      - "貧乳なのにめちゃくちゃエロい"
      - "【朗報】ワイ、参上"
  ```

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク完了
- 次にすべきこと: なし（TASK-095: BotServiceビジネスロジック実装へ）
- 未解決の問題: なし

### 進捗ログ
- 2026-03-16: タスク開始。必読ドキュメント（bot.md, attack.md, bot_state_transitions.yaml）および既存コード読み込み
- 2026-03-16: `supabase/migrations/00007_bot_v5_attack_system.sql` 作成（bots拡張 + attacks新規 + RLS + hp更新）
- 2026-03-16: `src/lib/domain/models/bot.ts` 更新（timesAttacked, botProfileKey フィールド追加）
- 2026-03-16: `src/lib/infrastructure/repositories/bot-repository.ts` 更新（BotRow型拡張, rowToBot更新, incrementTimesAttacked, bulkResetRevealed, bulkReviveEliminated, findAll追加）
- 2026-03-16: `src/lib/infrastructure/repositories/attack-repository.ts` 新規作成（Attack型, create, findByAttackerAndBotAndDate, deleteByDateBefore）
- 2026-03-16: `config/bot_profiles.yaml` 新規作成（荒らし役プロファイル、固定文15件、報酬パラメータ）
- 2026-03-16: `features/support/in-memory/attack-repository.ts` 新規作成（BDDインメモリモック）
- 2026-03-16: `src/__tests__/lib/infrastructure/repositories/attack-repository.test.ts` 作成（15テスト）
- 2026-03-16: `deleteByDateBefore` の null safe 修正（data ?? []）、全テストPASS

### テスト結果サマリー
- 単体テスト: 31ファイル / 889件 全PASS
  - attack-repository.test.ts: 15件 PASS（create 5件, findByAttackerAndBotAndDate 5件, deleteByDateBefore 5件）
- BDDテスト: 127シナリオ PASS（既存シナリオへの回帰なし）
- TypeScript型チェック: Bot/Attack関連エラーなし（既存Userテスト型エラーは本タスクスコープ外）
