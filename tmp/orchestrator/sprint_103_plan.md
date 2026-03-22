# Sprint-103 計画書

> 開始: 2026-03-23

## 目標

!livingbot「無反応」修正。Sprint-102のネストselect型不整合を修正する。

## 背景

Sprint-102で`countLivingBots()`のN+1クエリをSupabaseネストselectに最適化したが、本番で「無反応」（500ではなくコマンド応答なし）が発生。

根本原因: Supabase PostgRESTのネストselectで、many-to-one FK関係（bot_posts→posts, posts→threads）は**単一オブジェクト**を返すが、コードは`Array<>`として`.some()`を呼んでいる。TypeErrorがPostServiceのtry-catch（line 471-475）で黙殺される。

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-280 | bdd-coding | countLivingBots ネストselect型修正 | なし | assigned |

### TASK-280 locked_files
- src/lib/infrastructure/repositories/bot-repository.ts

## 結果

### TASK-280: countLivingBots ネストselect型修正
- **ステータス**: completed
- **修正内容**: ネストselect（1クエリ）を2クエリに分離。PostgREST many-to-one のオブジェクト/配列両対応（Array.isArray）
- **テスト**: BDD 310 passed / 16 pending / vitest 1734 passed（1 fail は既存schema-consistency）
- **livingbot 14シナリオ全PASS**
