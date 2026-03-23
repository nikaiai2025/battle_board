---
task_id: TASK-289
sprint_id: Sprint-108
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-24T13:00:00+09:00
updated_at: 2026-03-24T13:00:00+09:00
locked_files:
  - docs/specs/openapi.yaml
  - docs/specs/screens/thread-list.yaml
  - docs/requirements/ubiquitous_language.yaml
  - docs/requirements/requirements.md
  - docs/requirements/user_stories.md
  - docs/architecture/architecture.md
  - docs/operations/runbooks/
---

## タスク概要

サイトリネーム Phase 2 のドキュメント変更。仕様書・要件定義・設計書・運用手順書から旧サイト名を新名称に置換する。

## 名称対応表

| 概念 | 旧 | 新 |
|------|-----|-----|
| 板ID | `battleboard` | `livebot` |
| サイト名 | `BattleBoard` | `ボットちゃんねる` |
| 板名 | `BattleBoard総合` | `なんでも実況B（ボット）` |

**注意:** リポジトリ名 `battle_board`、CLAUDE.md 内の記述は変更しない。

## 必読ドキュメント（優先度順）

1. [必須] `tmp/site_rename_migration_plan.md` Section 3.7 — 変更対象一覧

## 出力（変更すべきファイル）

移行計画書 §3.7 に記載のファイル:
- 仕様書: `docs/specs/openapi.yaml`, `docs/specs/screens/thread-list.yaml`
- 用語辞書: `docs/requirements/ubiquitous_language.yaml`
- 要件定義: `docs/requirements/requirements.md`, `docs/requirements/user_stories.md`
- 設計書: `docs/architecture/architecture.md` 他
- 運用: `docs/operations/runbooks/` 内のURL例
- 調査資料: `docs/research/` 内（ヒストリカル資料、変更任意。変更する場合は最小限に）

## 完了条件

- [ ] docs/ 配下のファイルで `"BattleBoard"` が残存しない（CLAUDE.md・ヒストリカル文脈の引用を除く）
- [ ] docs/ 配下のファイルで板ID `battleboard` が `livebot` に更新されている
- [ ] docs/ 配下のファイルで板名 `BattleBoard総合` が `なんでも実況B（ボット）` に更新されている
- [ ] URLパス例が `/livebot/` に更新されている

## スコープ外

- ソースコード・テストコードの変更（TASK-288で実施）
- features/ の変更（人間が変更済み）
- CLAUDE.md の変更（禁止事項）
- ドメイン・URLのホスト部分変更（Phase 3）

## 補足・制約

- 要件定義書の変更は人間がサイトリネームを承認済みのため実施可
- `docs/research/` 内のヒストリカル資料は変更任意。原文を残す価値がある場合はスキップ可
- ドメイン（`battle-board.shika.workers.dev` 等）は Phase 3 で変更するため今回は変更しない

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全対象ファイルの更新
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- docs/specs/openapi.yaml: APIタイトル・説明を「BattleBoard」→「ボットちゃんねる」に更新
- docs/specs/screens/thread-list.yaml: site-title content を「ボットちゃんねる」に更新
- docs/requirements/ubiquitous_language.yaml: ヘッダ・「掲示板」定義・専ブラ notes の3箇所を更新
- docs/requirements/requirements.md: タイトル行を更新
- docs/requirements/user_stories.md: 7箇所のサイト名を更新（タイトル行含む）
- docs/architecture/architecture.md: タイトル行・概要説明・DBスキーマ例・DATFormatter説明の4箇所を更新
- docs/architecture/components/web-ui.md: リダイレクトパス・板ID説明の3箇所を更新
- docs/operations/runbooks/create-admin-account.md: admin@battleboard.local → admin@livebot.local（全5箇所）
- docs/operations/runbooks/senbra_compat_guide.md: /battleboard/ → /livebot/（2箇所）
- docs/research/: ヒストリカル調査資料のため変更スキップ（タスク指示に従い任意変更→原文保持を選択）

### テスト結果サマリー

本タスクはドキュメント変更のみ（ソースコード変更なし）のため、テスト実行なし。
完了条件の確認:
- [x] docs/ 配下（research/除く）で「BattleBoard」残存なし
- [x] docs/ 配下（research/除く）で板ID「battleboard」→「livebot」更新済み
- [x] URLパス例が /livebot/ に更新されている
- [x] 板名「BattleBoard総合」→「なんでも実況B（ボット）」: 元々docs/に板名の記述なし（ソースコード側のみ）
