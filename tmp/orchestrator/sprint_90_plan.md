# Sprint-90 計画書

> 作成日: 2026-03-22

## 目的

独立システムレスのdailyIdが`"SYSTEM"`固定にならずハッシュ値が生成されているバグを修正。

## スコープ

### TASK-259: システムレスのdailyIdを"SYSTEM"固定にする

- **担当:** bdd-coding
- **優先度:** 高（モデル定義と実装の乖離）
- **内容:** `post-service.ts` の `createPost` で `isSystemMessage=true` の場合、`generateDailyId()` をスキップし `dailyId = "SYSTEM"` を固定設定する
- **locked_files:**
  - `src/lib/services/post-service.ts`

## 結果

| TASK | ステータス | 備考 |
|---|---|---|
| TASK-259 | assigned | |
