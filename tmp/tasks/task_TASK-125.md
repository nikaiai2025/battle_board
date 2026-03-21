---
task_id: TASK-125
sprint_id: Sprint-42
status: done
assigned_to: bdd-architect
depends_on: [TASK-124]
created_at: 2026-03-17T21:30:00+09:00
updated_at: 2026-03-17T21:30:00+09:00
locked_files:
  - docs/architecture/components/bot.md
  - docs/architecture/architecture.md
---

## タスク概要

TASK-124で作成されたPhase 3 BOTシステム再設計レポート2件の内容を、プロジェクトの正式な設計ドキュメント（D-07, D-08）に反映する。
加えて、レビューで指摘された `ai_config.provider` フィールドとプロバイダー抽象化レイヤーの設計も追記する。

## 入力（前工程の成果物）

- `tmp/workers/bdd-architect_TASK-124/bot_system_redesign.md` — Phase 3 BOTシステム再設計書
- `tmp/workers/bdd-architect_TASK-124/bot_profiles_schema_proposal.yaml` — 拡張版スキーマ提案

## 反映先ドキュメントと反映内容

### 1. D-08 `docs/architecture/components/bot.md` — メイン反映先

以下のセクションを追加・更新する:

**追加すべき内容:**
- Strategy パターンによる3軸分離の設計（ContentStrategy / BehaviorStrategy / SchedulingStrategy）
- 各Strategyのインターフェース定義
- BotAction 判別共用体（`post_to_existing` / `create_thread`）
- Strategy解決ルール（resolveStrategies）
- ファイル配置計画（`src/lib/services/bot-strategies/` ディレクトリ構成）
- ネタ師の行動フロー（Phase 3 主要ユースケース）
- ユーザー作成ボットの管理構造（owner_id による統合管理）
- bot_profiles.yaml の拡張スキーマ（content_strategy, behavior_type, scheduling, ai_config, topic_sources 等）
- データモデル拡張計画（bot_user_configs, collected_topics テーブル）

**レビュー指摘の追加反映:**
`ai_config` に `provider` フィールドを追加し、サードパーティーAPI差異を吸収するプロバイダー抽象化レイヤーを設計に含める:
```yaml
ai_config:
  provider: google | openai | anthropic   # APIプロバイダー（新規追加）
  model: gemini-2.0-flash
  system_prompt: "..."
  max_tokens: 500
  temperature: 0.8
```
サービス層に `AiApiClient` アダプターインターフェースの設計を追記:
- `AiApiClient.generate(provider, model, prompt) -> string`
- プロバイダーごとのアダプター実装（GoogleAiAdapter, OpenAiAdapter, AnthropicAdapter）
- APIキーは環境変数で管理（CLAUDE.md制約: クライアントサイドに含めない）

**既存内容の更新:**
- §2.1 executeBotPost: Strategy委譲の設計に更新（外部インターフェースは変更なし）
- §2.11 selectTargetThread: BehaviorStrategy委譲に更新
- §3 依存関係: Strategy実装への依存を追加
- §6 設計上の判断: Strategy パターン採用の判断根拠を追記

**注意:**
- 既存の§2.2〜§2.10（applyDamage, isBot, revealBot等）は変更しない
- バージョンを v6 に上げる

### 2. D-07 `docs/architecture/architecture.md` — TDR追記

技術的意思決定記録（TDR）セクションに以下を追加:

```
TDR-XXX: BOTシステムのStrategy パターン採用
- 決定: BOTの行動をContentStrategy/BehaviorStrategy/SchedulingStrategyの3軸で抽象化
- 理由: Phase 3（ネタ師）・Phase 4（ユーザー作成ボット）で行動パターンが根本的に異なるため、if/switch分岐では組み合わせ爆発が起きる
- 代替案: サブクラス継承（菱形継承リスク）、完全分離（共通ロジック重複）
- 影響範囲: bot-service.ts, bot-strategies/（新規ディレクトリ）
```

## 必読ドキュメント（優先度順）

1. [必須] `tmp/workers/bdd-architect_TASK-124/bot_system_redesign.md` — 再設計書（反映元）
2. [必須] `tmp/workers/bdd-architect_TASK-124/bot_profiles_schema_proposal.yaml` — スキーマ提案（反映元）
3. [必須] `docs/architecture/components/bot.md` — 現在のD-08（反映先）
4. [必須] `docs/architecture/architecture.md` — 現在のD-07（TDR追記先）
5. [参考] `docs/requirements/requirements.md` — Phase 3/4 要件

## 出力（生成すべきファイル）

- `docs/architecture/components/bot.md` — v6 に更新
- `docs/architecture/architecture.md` — TDR追記

## 完了条件

- [ ] bot.md が再設計書の内容を反映し、v6 になっていること
- [ ] ai_config に provider フィールドが含まれ、プロバイダー抽象化レイヤーが設計されていること
- [ ] architecture.md にTDRエントリが追加されていること
- [ ] 既存の §2.2〜§2.10 セクションが保持されていること
- [ ] 新旧セクション間に矛盾がないこと

## スコープ外

- ソースコードの変更
- bot_profiles.yaml の実際の変更（スキーマはbot.mdに記載するのみ）
- BDDシナリオの変更
- OpenAPI仕様（D-04）の変更（Internal APIルートはTASK-123以降で対応）
- 状態遷移仕様（D-05）の変更（bot_state_transitions.yamlは今回変更不要）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: D-08 v6 更新、D-07 TDR-008 追記、自己反省
- 次にすべきこと: なし（レビュー待ち）
- 未解決の問題: なし

### 進捗ログ

#### 2026-03-17 作業実施

**入力資料の読み込み:**
- `tmp/workers/bdd-architect_TASK-124/bot_system_redesign.md` -- Phase 3 再設計書
- `tmp/workers/bdd-architect_TASK-124/bot_profiles_schema_proposal.yaml` -- 拡張スキーマ提案
- `docs/architecture/components/bot.md` -- 現行 D-08 (v5)
- `docs/architecture/architecture.md` -- 現行 D-07
- `docs/requirements/requirements.md` -- Phase 3/4 要件（参考）

**D-08 `bot.md` v5 -> v6 の変更内容:**

1. ヘッダ: バージョンを v6 / 2026-03-17 に更新。TDR-008 参照を追加
2. SS1 分割方針: Strategy パターンによる3軸分離の概要を追記
3. SS2.1 executeBotPost: Strategy 委譲版のフローに更新。シグネチャを `(botId)` に簡略化（threadId は BehaviorStrategy が内部決定）
4. SS2.2-2.10: **変更なし**（タスク指示通り完全保持）
5. SS2.11 selectTargetThread: BehaviorStrategy 委譲版に更新。BotAction 判別共用体を記載
6. SS2.12 (新設): Strategy パターン設計の全体
   - 2.12.1: 3つの Strategy インターフェース定義
   - 2.12.2: resolveStrategies の解決ルール
   - 2.12.3: Strategy 実装一覧（Phase 2/3/4 別）
   - 2.12.4: AiApiClient プロバイダー抽象化レイヤー（レビュー指摘反映。provider フィールド + 3アダプター）
   - 2.12.5: ネタ師の行動フロー
   - 2.12.6: ユーザー作成ボットの管理構造
   - 2.12.7: bot_profiles.yaml 拡張スキーマ（ai_config に provider 含む）
   - 2.12.8: ファイル配置計画
7. SS3 依存関係: Strategy 実装群 + AiApiClient を依存先に追加。3.3 に Strategy 依存構造を新設
8. SS4 隠蔽する実装詳細: Strategy 解決ロジック、AIプロバイダー切替、ネタ収集ジョブを追加
9. SS5 データモデル変更: 5.3-5.6 を追加（bots 追加カラム、bot_user_configs、collected_topics、v6 マイグレーション方針）
10. SS6 設計上の判断: 6.7-6.10 を追加（Strategy パターン採用理由、TASK-122 位置づけ、プロバイダー抽象化、ネタ収集分離）

**D-07 `architecture.md` の変更内容:**

1. TDR-008 を追加（SS13 技術的意思決定記録セクション）
2. SS3.3 サービス間依存関係: BotService に Strategy + AiApiClient 依存を追記
3. SS9 ディレクトリ構成: `bot-strategies/` と `ai-adapters/` を追加
4. SS2.2: AI API の備考に AiApiClient 経由のプロバイダー使い分けを追記
5. Infrastructure Layer テーブル: External API Client に AiApiClient アダプターを追記
6. SS14: ユーザー作成ボットの拡張ポイントを Strategy パターン導入済みに更新

**完了条件チェック:**
- [x] bot.md が再設計書の内容を反映し、v6 になっていること
- [x] ai_config に provider フィールドが含まれ、プロバイダー抽象化レイヤーが設計されていること
- [x] architecture.md に TDR-008 エントリが追加されていること
- [x] 既存の SS2.2-SS2.10 セクションが保持されていること
- [x] 新旧セクション間に矛盾がないこと

**自己反省:**
意思決定の振り返りを実施。TDR番号採番(008)、executeBotPost シグネチャ変更（後方互換ラッパーで対応）、AiApiClient インターフェース設計、provider フィールド追記、既存セクション保持、D-07/D-08 間の一貫性確保の各判断について妥当性を確認。明確かつ重要な誤りは検知されなかった。
