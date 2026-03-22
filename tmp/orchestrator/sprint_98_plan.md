# Sprint-98 計画書

> 開始: 2026-03-22

## 目標

Phase 5 検証 HIGH 指摘の修正（Sprint-96/97 差し戻し）

## 背景

Sprint-96/97（!aori + !newspaper）の Phase 5 検証で HIGH 3件が確認された。いずれも内部実装・ドキュメントの修正であり、BDDシナリオ・OpenAPI・ユーザー振る舞いに影響しない。

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-273 | bdd-coding | Phase 5 HIGH修正（コード1件 + ドキュメント2件） | なし | completed |

### 修正対象

1. **Code HIGH-1**: `src/lib/services/bot-service.ts` processAoriCommands catch ブロックに pending 削除を追加
2. **Doc HIGH-1**: `docs/architecture/components/command.md` stealth記述「Phase 2ではすべてfalse」を削除
3. **Doc HIGH-2**: `docs/architecture/components/command.md` サンプルYAML tell cost:50 → 10 に修正（または正本参照の注記追加）

### 競合管理

単一タスク。競合なし。

## 結果

### TASK-273: Phase 5 HIGH修正
- Code HIGH-1: bot-service.ts processAoriCommands catch に pending 削除追加（newspaper-service.ts と同パターン）
- Doc HIGH-1: command.md stealth「Phase 2ではすべてfalse」→ §5参照に変更
- Doc HIGH-2: command.md サンプルYAML tell cost:50 → 10 に修正
- テスト: vitest 1724 passed / BDD 297 passed — 回帰なし
