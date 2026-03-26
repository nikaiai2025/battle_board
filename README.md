# BattleBoard — 対戦型匿名掲示板

5chライクな匿名掲示板に、AIボットの混入・告発・撃破などのゲーム機能を加えた実験的プロジェクト。
通常の掲示板としても使え、5ch専用ブラウザ（専ブラ）での読み書きにも対応する。

**人間はコードを1行も書いていない。** 設計・実装・テスト・レビューは全てAIエージェントが行い、人間は要件定義と意思決定に集中する開発体制を採っている。

## 技術スタック

- **フロントエンド:** Next.js (App Router) / Vercel
- **バックエンド (専ブラAPI):** Cloudflare Workers
- **DB / 認証:** Supabase
- **AI API:** Google Gemini
- **テスト:** Vitest (単体) / Cucumber.js (BDD) / Playwright (E2E / スモーク)

## ディレクトリ構成

```
battle_board/
  features/           # BDDシナリオ（受け入れ基準の正本）
  docs/
    requirements/      # 要件定義書・ユビキタス言語辞書
    specs/             # OpenAPI仕様書・状態遷移仕様・画面要素定義
    architecture/      # アーキテクチャ設計書・コンポーネント設計
  src/
    app/(web)/         # Web UIページ
    app/api/           # Web APIルート
    app/(senbra)/      # 専ブラ互換ルート（DAT / read.cgi）
    lib/services/      # ユースケース（ビジネスロジック）
    lib/domain/        # 型定義・純粋関数
    lib/infrastructure/# DB操作・外部アダプタ
  tmp/                 # AIエージェント間の共有状態（後述）
  supabase/            # DBマイグレーション
  e2e/                 # Playwright E2Eテスト
```

## 開発体制 — BDD中心のAIエージェンティック開発

BDD（振る舞い駆動開発）シナリオを軸に、複数のAIエージェントが役割分担して開発する。

### 基本構造

- **人間:** 要件定義（`features/*.feature`）と意思決定のみ。コードは書かない
- **オーケストレーターAI:** スプリント管理・タスク分解・エージェント間調整
- **ワーカーAI群:** アーキテクト（設計）、コーディング（実装）、レビュー（品質検査）等

### 開発風景

普段の開発は、人間がオーケストレーターAI（`bdd-orchestrator`）と対話する形で進む。
オーケストレーターがタスクを分解し、ワーカーAIに並行でアサインし、結果を集約してコミット・デプロイまで自律的に実行する。人間が介入するのはエスカレーション（AI側で判断できない問題）が発生したときと、BDDシナリオの変更承認時のみ。

### `tmp/` — AIの作業記録

AIエージェントはセッション間の記憶を持たないため、`tmp/` ディレクトリ内のファイルで状態を共有する。

```
tmp/
  orchestrator/        # スプリント計画・結果サマリー
  tasks/               # タスク指示書（オーケストレーター → ワーカー）
  workers/             # ワーカーの作業成果物
  escalations/         # エスカレーション（AI → 人間への判断依頼）
```

開発プロセスの詳細は [`docs/research/BDD_AI_エージェンティック開発フレームワーク.md`](docs/research/BDD_AI_エージェンティック開発フレームワーク.md) を参照。
