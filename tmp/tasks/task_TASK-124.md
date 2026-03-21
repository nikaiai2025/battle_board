---
task_id: TASK-124
sprint_id: Sprint-42
status: done
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-124
depends_on: []
created_at: 2026-03-17T20:30:00+09:00
updated_at: 2026-03-17T20:30:00+09:00
locked_files: []
---

## タスク概要

Phase 3 BOTシステムの設計レビューと拡張設計。TASK-122で荒らし役専用の `executeBotPost` / `selectTargetThread` が実装されたが、Phase 3以降のBOT種別（ネタ師・レイドボス・常連・ユーザー作成ボット等）を扱えない設計になっている。将来のBOT種別を俯瞰し、現在の bot-service.ts / bot_profiles.yaml / bot.md の設計を評価・再設計すること。

## 背景・問題

TASK-122で実装された `executeBotPost` は以下の前提でハードコードされている:

1. **コンテンツ生成**: 固定文リストからランダム選択のみ（AI API呼び出しパスなし）
2. **行動パターン**: 既存スレッドへの投稿のみ（スレ立て不可）
3. **スケジュール**: 全BOT共通の60-120分間隔（種別ごとの差異なし）

要件定義書（D-01）で計画されているBOT種別:

| Phase | BOT種別 | コンテンツ生成 | 行動パターン | HP |
|---|---|---|---|---|
| Phase 2 | 荒らし役 | 固定文リスト | 既存スレッドに投稿 | 10 |
| Phase 3 | ネタ師 | AI API + Web収集 | **スレ立て** | 超高（レイドボス） |
| Phase 4 | 常連・火付け役等 | AI対話 | 会話に返信 | ペルソナごとに異なる |
| Phase 4 | ユーザー作成ボット | ユーザー設定プロンプト | 可変 | ガチャで決定 |

## 必読ドキュメント（優先度順）

1. [必須] `docs/architecture/components/bot.md` — 現在のコンポーネント設計（v5）
2. [必須] `src/lib/services/bot-service.ts` — 現在の実装（特にexecuteBotPost L585-649, selectTargetThread L665-688）
3. [必須] `docs/requirements/requirements.md` — Phase 3/4 BOT要件（L109-176）
4. [必須] `docs/requirements/user_stories.md` — US-023〜025（ネタ師）、US-028（ユーザー作成ボット）
5. [必須] `config/bot_profiles.yaml` — 現在のプロファイル定義（荒らし役のみ）
6. [参考] `docs/specs/bot_state_transitions.yaml` — 状態遷移仕様
7. [参考] `docs/requirements/ubiquitous_language.yaml` — ペルソナ、運営ボット等の定義
8. [参考] `src/lib/domain/models/bot.ts` — Botエンティティ（persona, botProfileKey フィールド）
9. [参考] `features/bot_system.feature` — 現在のBDDシナリオ

## 設計課題（検討すべき論点）

### 1. コンテンツ生成の抽象化

現在 `executeBotPost` 内で `getFixedMessages()` → ランダム選択がインラインで書かれている。
ネタ師は AI API 呼び出し + Web収集が必要。Strategy パターンまたは類似の拡張機構が必要か。

### 2. 行動パターンの分岐

| 行動 | 荒らし役 | ネタ師 | 常連 |
|---|---|---|---|
| 投稿先 | 既存スレッドからランダム | **新規スレッド作成** | 既存会話に返信 |
| 頻度 | 60-120分 | 別の頻度 | 文脈依存 |

`selectTargetThread` と `getNextPostDelay` をBOT種別ごとにどう差し替えるか。

### 3. bot_profiles.yaml の拡張

現在のスキーマ（hp, max_hp, reward, fixed_messages）でネタ師・常連を表現できるか。
content_strategy, behavior_type, scheduling 等のフィールドが必要か。

### 4. ユーザー作成ボットの管理構造

運営ボット（yaml定義）とユーザー作成ボット（DB定義・ガチャ・プロンプトサニタイズ）は根本的に管理方法が異なる。これをどう統合するか。

### 5. TASK-122実装の扱い

荒らし役専用として機能する現在の実装を:
- A: リファクタして汎用化する
- B: 荒らし役専用として残し、新BOT種別は別パスで実装する
- C: 汎用インターフェースを定義し、現在の実装をその一実装として位置づける

## 出力（生成すべきファイル）

以下を `tmp/workers/bdd-architect_TASK-124/` に出力すること:

1. **`bot_system_redesign.md`** — Phase 3 BOTシステム再設計書
   - 現状分析（何が問題か）
   - 設計方針（Strategy / 行動パターン / プロファイル拡張）
   - 推奨アーキテクチャ（クラス図 or インターフェース定義）
   - TASK-122実装の扱い（A/B/Cいずれか、理由つき）
   - 段階的移行計画（MVPの荒らし役を壊さずに拡張する手順）

2. **`bot_profiles_schema_proposal.yaml`** — 拡張版 bot_profiles.yaml のスキーマ提案

## 完了条件

- [ ] 上記2ファイルが出力されていること
- [ ] Phase 3（ネタ師）・Phase 4（ユーザー作成ボット）の両方をカバーしていること
- [ ] CLAUDE.md横断的制約（プロンプトサニタイズ、同一API経由の書き込み）との整合性が確認されていること
- [ ] TASK-122の既存実装からの移行パスが明確であること

## スコープ外

- ソースコードの変更（設計のみ）
- BDDシナリオの変更提案
- TASK-123（API routes / GitHub Actions）の設計（本タスクの結果を受けて別途計画）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全成果物の作成、完了条件の充足確認、自己反省
- 次にすべきこと: 人間レビュー待ち
- 未解決の問題: なし

### 進捗ログ

#### 2026-03-17 ドキュメント精読・分析

必読ドキュメント9件を精読:
- `docs/architecture/components/bot.md` (v5) -- 現在のBotService設計
- `src/lib/services/bot-service.ts` -- 現在の実装（817行）
- `docs/requirements/requirements.md` -- Phase 3/4 BOT要件
- `docs/requirements/user_stories.md` -- US-023〜025, US-042〜047
- `config/bot_profiles.yaml` -- 荒らし役プロファイル
- `docs/specs/bot_state_transitions.yaml` (v5) -- 状態遷移仕様
- `docs/requirements/ubiquitous_language.yaml` -- ペルソナ等の用語定義
- `src/lib/domain/models/bot.ts` -- Bot型定義
- `features/bot_system.feature` (v5.1) -- BDDシナリオ

#### 2026-03-17 設計方針の決定

主要な設計判断:
1. **Strategy パターン採用** -- コンテンツ生成・行動パターン・スケジュールの3軸を Strategy インターフェースとして分離
2. **方針C選択** -- TASK-122の既存実装を汎用インターフェースの一実装として位置づける
3. **運営/ユーザー作成ボットの統合管理** -- 単一 bots テーブルに owner_id カラムを追加して区別
4. **ネタ収集と投稿の分離** -- collected_topics テーブルによるバッファリング

#### 2026-03-17 成果物作成

出力ファイル:
- `tmp/workers/bdd-architect_TASK-124/bot_system_redesign.md` -- Phase 3 BOTシステム再設計書
- `tmp/workers/bdd-architect_TASK-124/bot_profiles_schema_proposal.yaml` -- 拡張版スキーマ提案

#### 2026-03-17 自己反省

主要な設計判断6件を振り返り。すべて妥当と判断。
ContentGenerationContext の型安全性（オプショナルフィールドのスーパーセット）について
Phase 4 での移行パス（判別共用体 or ジェネリクス）を注記として追記した。

### 完了条件チェック

- [x] 上記2ファイルが出力されていること
- [x] Phase 3（ネタ師）・Phase 4（ユーザー作成ボット）の両方をカバーしていること
- [x] CLAUDE.md横断的制約（プロンプトサニタイズ、同一API経由の書き込み）との整合性が確認されていること
- [x] TASK-122の既存実装からの移行パスが明確であること
