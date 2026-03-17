# スプリント状況サマリー

> 最終更新: 2026-03-17

## 現在のフェーズ

**Phase 5 検証完了 — Sprint-39 品質修正完了、ドキュメント同期は人間承認待ち**

Phase 2 実装完了（Sprint-34〜37）。Phase 5検証サイクル（Sprint-38）でHIGH 6件検出。
Sprint-39でコード品質修正4件 + Dateモック統一（120箇所）+ grass-handler修正を完了。
ドキュメント同期（OpenAPI・admin.md・D-05・D-02）は人間承認待ち。

## テスト状況

- vitest: 39ファイル / 1047テスト / 全PASS
- cucumber-js: 228シナリオ (219 passed, 9 pending) / 0 failed
  - pending 9件: インフラ制約3件 + bot_system UI/GitHub Actions 6件 — 意図的Pending
- playwright E2E smoke: 8テスト / 全PASS
- playwright E2E flow: 1テスト / 全PASS
- playwright API: 26テスト / 全PASS（専ブラ互換15 + 認証Cookie11）
- cucumber-js integration: 4シナリオ / 全PASS（Supabase Local実DB）

## Sprint-38 Phase 5検証結果

| TASK | エージェント | 判定 | 詳細 |
|---|---|---|---|
| TASK-109 | bdd-gate | PASS | Vitest 1047/1047, Cucumber 219+9pending |
| TASK-110 | bdd-code-reviewer | WARNING | HIGH 4件, MEDIUM 5件, LOW 2件 |
| TASK-111 | bdd-doc-reviewer | WARNING | HIGH 2件, MEDIUM 4件, LOW 1件 |

## Sprint-39 品質修正結果

| 修正項目 | 内容 | ステータス |
|---|---|---|
| HIGH-001 | 管理API try-catch追加（9ファイル） | completed |
| HIGH-002 | threads API err.message漏洩防止 | completed |
| HIGH-003 | getUserPosts offset伝播 | completed |
| HIGH-004 | ip_bans 部分一意インデックス化 | completed |
| LOW-002 | inline_system_info INSERT追加 | completed |
| Date統一 | new Date() → new Date(Date.now()) 全面置換（30ファイル120箇所） | completed |
| grass-handler | TASK-114漏れ分のDate修正 + コメント更新 | completed |

## ドキュメント同期（人間承認待ち）

Phase 5で検出されたドキュメント乖離。D-04/D-05変更のため人間承認必要:
- **D-04 OpenAPI**: 管理API 10エンドポイントの定義追加
- **D-05 状態遷移**: user_state_transitionsにBAN状態追加、currency_state_transitionsにadmin_grant追加、廃止済みボーナス削除
- **D-08 admin.md**: 公開インターフェース12関数 + 4リポジトリ依存の追加
- **D-02 ユビキタス言語**: 「ユーザーBAN」「IP BAN」「ダッシュボード」登録

## Phase 5 MEDIUM指摘（将来対応）

| ID | 内容 | 優先度 |
|---|---|---|
| CODE-MEDIUM-001 | sumAllBalances DB側集計化 | 低（パフォーマンス改善） |
| CODE-MEDIUM-002 | countActiveThreadsByDate DB側集計化 | 低 |
| CODE-MEDIUM-003 | aggregate-daily-stats タイムゾーン | 中 |
| CODE-MEDIUM-004 | 管理API認証ステータス統一 | 低 |
| CODE-MEDIUM-005 | スレッド削除N+1 UPDATE | 低 |

## 専ブラ実機テスト状況

| 専ブラ | ホスト | 読み取り | 書き込み | 備考 |
|---|---|---|---|---|
| Siki | Vercel | ✅ | ✅ | 正常動作 |
| Siki | Cloudflare | ✅ | ✅ | 正常動作 |
| ChMate | Vercel | ❌ | ❌ | HTTP:80→308リダイレクトで接続不可（既知。Vercel仕様） |
| ChMate | Cloudflare | ✅ | ✅ | 正常動作 |

## Phase 3 未実装事項（BDDスコープ外・インフラ層）

| 項目 | 必要な実装 |
|---|---|
| BOT定期書き込みcronジョブ | `.github/workflows/` cron + 内部APIルート |
| 日次リセットcronジョブ | `.github/workflows/daily-maintenance` cron |
| BOTマーク専ブラ反映 | DAT差分同期問題の解決 |

## 残課題

- ドキュメント同期（人間承認待ち）
- デザイン・レイアウト改善（機能優先のため後回し）
- Phase 5 MEDIUM指摘の対応（将来スプリント）

## スプリント履歴

| Sprint | 内容 | ステータス | 計画書 |
|---|---|---|---|
| Sprint-39 | Phase5検証修正（APIエラーハンドリング+Dateモック統一+ip_bans修正） | completed | `tmp/orchestrator/sprint_39_plan.md` |
| Sprint-38 | Phase 5検証サイクル（bdd-gate+code-reviewer+doc-reviewer） | completed | `tmp/orchestrator/sprint_38_plan.md` |
| Sprint-37 | 管理機能拡充②（ユーザー管理 + ダッシュボード + 管理画面UI） | completed | `tmp/orchestrator/sprint_37_plan.md` |
| Sprint-36 | 管理機能拡充①（BAN + 通貨付与） | completed | `tmp/orchestrator/sprint_36_plan.md` |
| Sprint-35 | 固定スレッド + 開発連絡板（dev板） | completed | `tmp/orchestrator/sprint_35_plan.md` |
| Sprint-34 | 草コマンド !w 本格実装 + mypage草カウント | completed | `tmp/orchestrator/sprint_34_plan.md` |
| Sprint-33以前 | Phase 1完了 + Phase 2実装 | completed | アーカイブ参照 |

## 未解決エスカレーション

なし

## アーカイブインデックス

| ファイル | 内容 |
|---|---|
| `tmp/orchestrator/archive/sprint_001_009.md` | Sprint 1〜9 計画書統合 |
| `tmp/orchestrator/archive/sprint_010_019.md` | Sprint 10〜19 計画書統合 |
| `tmp/orchestrator/archive/sprint_020_022.md` | Sprint 20〜22 計画書統合 |
| `tmp/tasks/archive/` | 全タスク指示書 (TASK-002〜062) |
| `tmp/escalations/archive/` | 全エスカレーション (13件、全resolved) |
| `tmp/workers/archive/` | ワーカー作業空間 |
| `tmp/reports/` | Phase 5検証レポート（code_review, doc_review） |
