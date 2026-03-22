# Sprint-95 計画書

> 開始: 2026-03-22

## 目標

BOT投稿FK制約違反修正 + 固定案内板リンクフルURL化 + 開発連絡板レトロUI更新

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-267 | bdd-coding | 固定案内板リンクをフルURL化（/mypage, /dev/ → フルURL） | なし | completed |
| TASK-268 | bdd-coding | BOT投稿FK制約違反修正（author_id=NULL維持 + コマンドパイプラインuserId分離） | なし | completed |
| SMOKE-S95 | bdd-smoke | 本番スモークテスト | TASK-267, TASK-268 | done |

### 競合管理

TASK-267とTASK-268は locked_files が重複しないため並行実行。

## 結果

### TASK-267: 固定案内板リンクフルURL化
- 変更: `scripts/upsert-pinned-thread.ts`（リンクセクションの /mypage, /dev/ → フルURL）
- テスト: vitest 82ファイル/1675テスト全PASS

### TASK-268: BOT投稿FK制約違反修正
- 変更: `src/lib/services/post-service.ts`（resolvedAuthorId代入除去 + コマンドパイプラインuserId分離）
- 追加: `src/__tests__/lib/services/post-service.test.ts`（BOT書き込みテスト3件追加）
- テスト: vitest 82ファイル/1678テスト全PASS / BDD 285 passed

### 人間変更同梱
- `src/app/(dev)/dev/page.tsx`: レトロUI更新
- `src/types/jsx-deprecated.d.ts`: marquee要素型宣言追加
- `docs/research/`: レトロWebリサーチ3件追加
- `.claude/agents/retro-ui-tuner.md`: UIチューニングエージェント追加
- `features/ドラフト_実装禁止/command_bot_summon.feature`: ドラフト追加

### デプロイ・スモーク
- Vercel: Ready ✅
- Cloudflare Workers: 2026-03-22T07:44:51Z ✅
- 本番スモーク: 30/35 PASS（5 skipped = ローカル限定）✅
