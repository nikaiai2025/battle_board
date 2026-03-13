# Sprint-12 計画書

> フェーズ: Phase 2 準備（前提課題）
> 開始日: 2026-03-14
> 目的: 統合テスト基盤の構築（BDDシナリオをSupabase Local実DBで実行可能にする）

---

## スコープ

既存BDDシナリオ87件を、InMemoryリポジトリだけでなくSupabase Local実DBでも実行できるようにするリポジトリ切替の仕組みを構築する。

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-031 | 統合テスト基盤構築（リポジトリ切替 + cucumber profile） | bdd-coding | なし | assigned |

## 結果

### TASK-031: completed

**成果物:**
- `features/support/register-real-repos.js` — 統合テスト用requireエントリ（モック差し替えなし、実DB使用）
- `features/support/integration-hooks.ts` — 統合テスト用フック（接続確認 + TRUNCATE + 時刻復元）
- `cucumber.js` — integrationプロファイル追加
- `package.json` — `test:bdd:integration` スクリプト追加

**テスト結果:**
- default（InMemory）: 87シナリオ / 419ステップ / 全PASS（回帰なし）
- integration（Supabase Local）: 4シナリオ / 16ステップ / 全PASS

**設計判断:**
- InMemory固有メソッド（`_insert`, `_upsert`等）の使用が全ステップファイルに及ぶため、方針(C)を採用
- 統合テストはサービス層経由のみのシナリオ4件に絞り込み
- 今後、ステップ定義のリファクタリング（InMemory直接操作→サービス層経由）で統合テスト対象を拡大可能
