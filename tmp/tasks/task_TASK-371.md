---
task_id: TASK-371
sprint_id: Sprint-145
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-29T13:30:00+09:00
updated_at: 2026-03-29T13:30:00+09:00
locked_files:
  - .github/workflows/bot-scheduler.yml
  - config/bot-profiles.ts
---

## タスク概要

BOT挙動異常の調査で判明した2件のインフラ問題を修正する。

1. bot-scheduler.yml の schedule トリガー復活（3/21以降停止中でキュレーションBOTが投稿できない）
2. bot-profiles.ts に hiroyuki プロファイル追加（yaml正本との同期漏れにより「...」投稿・荒らし口調混入が発生）

## 修正内容

### 1. `.github/workflows/bot-scheduler.yml`

コメントアウトされている schedule トリガーを復活させる:
```yaml
# 現在（無効）:
# schedule:
#   - cron: '0,30 * * * *'

# 修正後（有効化）:
schedule:
  - cron: '0,30 * * * *'
```
コメント「AI API BOT が追加される際（Phase 3）に schedule を復活させる」は削除または「Phase 3対応で復活済み」に更新する。

### 2. `config/bot-profiles.ts`

`bot_profiles.yaml` の hiroyuki 定義に合わせて、`botProfilesConfig` に hiroyuki エントリを追加する:
```typescript
// hiroyukiBOT（!hiroyuki コマンドで召喚される使い切りBOT）
// ひろゆき風テキストは Gemini API で動的生成（固定文なし）
// See: features/command_hiroyuki.feature
// See: config/bot_profiles.yaml (正本)
hiroyuki: {
  hp: 10,
  max_hp: 10,
  reward: {
    base_reward: 10,
    daily_bonus: 0,
    attack_bonus: 0,
  },
  fixed_messages: [],
},
```
追加位置は aori の後（使い切りBOT同士で隣接）。

## 完了条件

- [ ] bot-scheduler.yml の schedule が有効化されていること
- [ ] bot-profiles.ts に hiroyuki プロファイルが追加されていること
- [ ] `npx vitest run` で全テストPASS（回帰なし）
- [ ] テストコマンド: `npx vitest run`

## スコープ外

- collect-topics の INSERT ロジック修正（話題Aの仕様変更で一緒に対応）
- strategy-resolver.ts の変更（hiroyuki は使い切りBOTのため、定期投稿フローには入らない設計）
- locked_files以外のファイル変更

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全修正実施 + vitest 全件 PASS 確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `.github/workflows/bot-scheduler.yml` — schedule トリガーのコメント解除（復活）、コメント文言を「Phase 3 対応で復活済み」に更新
2. `config/bot-profiles.ts` — aori の後に hiroyuki プロファイルを追加（yaml正本と同期）
3. `npx vitest run` で回帰なしを確認

### テスト結果サマリー

- 実行日時: 2026-03-29
- Test Files: 116 passed (116)
- Tests: 2224 passed (2224)
- Duration: 15.36s
- 失敗: 0件
