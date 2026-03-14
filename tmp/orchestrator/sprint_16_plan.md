# Sprint-16 計画書

## 概要

SSR直接import変更（Cloudflare Workers error code 1042対応）に伴う残課題の一括対応。キャッシュ制御復元・ドキュメント整合性・TDR追記。

## 背景

- Sprint-15でCloudflare Pages移行を実施
- Cloudflare Workers環境ではServer Componentからの自己URL fetch がerror code 1042でブロックされるため、PostService直接importに変更済み
- この変更により以下の副作用が残っている:
  1. [CRITICAL] キャッシュ制御の喪失（`cache: "no-store"` → なし）→ Vercelで古いデータが表示される
  2. [HIGH] ドキュメント(web-ui.md)と実装の矛盾
  3. [HIGH] TDR未記録（アーキテクチャ決定の経緯が記録されていない）

## タスク一覧

| TASK_ID | 内容 | 担当 | 状態 | 依存 |
|---|---|---|---|---|
| TASK-039 | キャッシュ制御復元 + ドキュメント更新 + TDR追記 | bdd-coding | assigned | なし |

## 結果

### TASK-039: completed
- `export const dynamic = 'force-dynamic'` を2ページに追加（Vercelキャッシュ問題解消）
- `docs/architecture/components/web-ui.md` を実装と整合（§1, §2, §3.1, §5.1更新）
- `docs/architecture/architecture.md` に TDR-006 追記
- vitest 476テスト全PASS、cucumber 88シナリオ全PASS
