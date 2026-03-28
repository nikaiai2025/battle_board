---
sprint_id: Sprint-140
status: completed
created_at: 2026-03-29
---

# Sprint-140 計画書 — PostService/AttackHandler サブリクエスト最適化

## 背景・目的

03-27 に CF Workers Observability で検出された本番エラー（未解消）:
```
[PostService] 独立システムレス挿入失敗: ThreadRepository.countActiveThreads failed: Too many subrequests
```

PostService サブリクエスト監査レポート（`tmp/workers/bdd-architect_TASK-ARCH-POST-SUBREQUEST/subrequest_audit.md`）に基づき、
短期改善案 S1〜S4 を実装してワーストケースのサブリクエスト数を 139〜161 → 92〜114 に削減する。

## スコープ

| TASK_ID | 担当 | 内容 | ステータス | depends_on |
|---------|------|------|-----------|------------|
| TASK-360 | bdd-coding | Repository バッチメソッド追加（S1の前提） | assigned | - |
| TASK-361 | bdd-coding | AttackHandler 最適化（S1 + S2 + S3） | assigned | TASK-360 |
| TASK-362 | bdd-coding | PostService createPost 重複クエリ排除（S4） | assigned | - |

## locked_files

### TASK-360
- `src/lib/infrastructure/repositories/post-repository.ts`
- `src/lib/infrastructure/repositories/bot-post-repository.ts`
- `features/support/in-memory/post-repository.ts`
- `features/support/in-memory/bot-post-repository.ts`

### TASK-361
- `src/lib/services/handlers/attack-handler.ts`
- `src/__tests__/lib/services/handlers/attack-handler.test.ts`
- `src/lib/services/bot-service.ts`

### TASK-362
- `src/lib/services/post-service.ts`
- `src/__tests__/lib/services/post-service.test.ts`
- `src/lib/services/incentive-service.ts`

## 完了条件

- `npx vitest run` 全件 PASS（回帰なし）
- `npx cucumber-js` 既存 PASS 数維持（389 passed）
- 特に `bot_system.feature` の攻撃シナリオが全PASS

## 結果

| TASK_ID | 結果 | 備考 |
|---------|------|------|
| TASK-360 | completed | バッチメソッド追加: findByThreadIdAndPostNumbers, findByPostIds。vitest 120 PASS |
| TASK-361 | completed | AttackHandler S1(バッチ検証)+S2(findById排除)+S3(localBalance)。vitest 91 PASS(+7新規) / cucumber 389 PASS |
| TASK-362 | completed | PostService S4-1(isUserBanned排除)+S4-2(findByThreadIdキャッシュ)。S4-3は見送り。vitest 116 PASS(+7新規) |

### サブリクエスト削減効果（見積もり）
- S1: 事前検証バッチ化 — 6ターゲット時 30→3クエリ（-27）
- S2: BotService findById 排除 — 6ターゲット時 -12クエリ
- S3: ループ内 getBalance 排除 — 6ターゲット時 -6クエリ
- S4: PostService 重複排除 — -2クエリ/リクエスト
- **合計削減: 約47クエリ（139〜161 → 推定92〜114）**
