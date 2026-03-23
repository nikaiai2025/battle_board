# 練習コマンド実装ガイド（オーケストレーター向け）

> 作成: 2026-03-22（アーキテクト）
> 目的: !hiroyuki（BOT召喚+ステルス+AI API）に向けた段階的実装の計画情報

---

## 1. 対象feature（全て承認済み）

| # | feature | シナリオ数 | 検証する概念 |
|---|---|---|---|
| ① | `command_iamsystem.feature` | 7 | ステルス（コマンド文字列除去） |
| ② | `command_omikuji.feature` | 4 | ターゲット任意（>>N の有無で分岐） |
| ③ | `command_aori.feature` | 7 | BOT召喚（非同期キュー + 使い切りBOT） |
| ④ | `command_newspaper.feature` | 5 | AI API（Gemini + 非同期 + ★システムレス） |

---

## 2. 実装順序と依存関係

```
② omikuji ──┐
             ├──→ ③ aori ──→ ④ newspaper
① iamsystem ┘
```

- **①② は相互に独立**。どちらを先に実装してもよい
- **③ は ① に依存**: ステルス除去の仕組みが必要（①で構築）
- **④ は ③ に依存**: 非同期キュー（pending_async_commands）が必要（③で構築）

### 推奨順: ② → ① → ③ → ④

②が最も軽量（既存の仕組みだけで実装可能）なので先に着手すると早期に成果が出る。

---

## 3. 各コマンドの実装スコープ

### ② !omikuji（最軽量 — 新規インフラ不要）

- **やること**: ハンドラ実装 + commands.yaml エントリ追加
- **既存で使えるもの**:
  - `independentMessage`（CommandHandlerResult に既存）→ ★システム独立レス
  - `targetFormat: null`（ターゲット任意。パーサー変更不要）
  - ハンドラ内で `ctx.args` の有無を見て分岐するだけ
- **新規作成**:
  - `handlers/omikuji-handler.ts`
  - おみくじ結果セット（100件、configで定義）
- **設計上の注意**: コスト0。同期処理。非同期キュー不使用

### ① !iamsystem（ステルス基盤の構築が必要）

- **やること**: ステルス除去メカニズムの実装 + ハンドラ実装
- **新規構築が必要なインフラ**:
  1. **CommandExecutionResult の拡張**: ポストフィールド上書き指示（display_name, daily_id）を返せるようにする
  2. **PostService のステルス除去パス**: コマンド実行（Step 5）とポストINSERT（Step 9）の間で、成功時にコマンド文字列を本文から除去するコードパス
- **現状のギャップ**:
  - `stealth: boolean` は commands.yaml スキーマに定義済み（command-service.ts L163）
  - しかし PostService にステルス除去のコードパスが存在しない
  - CommandExecutionResult にポストフィールド上書き（display_name等）を伝達する手段がない
- **設計上の注意**:
  - `is_system_message` は **false のまま** 維持すること（feature で明示的に規定）
  - ステルス3原則: 成功→除去 / 失敗→残す / 空本文→投稿する

### ③ !aori（非同期キューの構築が必要）

- **やること**: pending_async_commands テーブル + Cron処理 + ハンドラ実装
- **前提**: ①のステルス除去が動作すること
- **新規構築が必要なインフラ**:
  1. **`pending_async_commands` テーブル**: D-08 command.md §5 準拠。`command_type` カラムで種別を区別する汎用テーブル
  2. **CommandExecutionResult の拡張**: 非同期コマンドのキューイング指示を返せるようにする
  3. **Cron ジョブ**: pending読み取り → BOTスポーン → 煽り文句投稿 → pending削除
  4. **煽り文句セット**: 100件、configで定義
- **参考実装**: `pending_tutorials` + `pending-tutorial-repository.ts` が同パターン
- **Cronの配置**: AI API不使用 → Cloudflare Cron Triggers（TDR-013準拠）
- **設計上の注意**:
  - BOTは使い切り（1回書き込み、定期書き込みなし、日次リセットで復活しない）
  - ファーミング防止: 召喚10 + 攻撃5 - 報酬10 = -5（自作自演は赤字）

### ④ !newspaper（AI API統合が必要）

- **やること**: Gemini API クライアント + ハンドラ実装
- **前提**: ③の非同期キューが動作すること
- **新規構築が必要なインフラ**:
  1. **AI API クライアント**: `ai-adapters/google-ai-adapter.ts`（TDR-015準拠、Gemini 3 Flash Preview）
  2. **Google Search Grounding**: Web検索+生成を1 API callで実行
  3. **エラーハンドリング**: リトライ全失敗 → 通貨返却 + ★システムエラー通知
  4. **カテゴリセット**: 7件（芸能/World/IT/スポーツ/経済/科学/エンタメ）
- **Cronの配置**: AI API使用 → GitHub Actions（TDR-013準拠）
- **BOTではない**: 結果は★システム名義の独立レスで表示。BOTエンティティは生成しない。ステルスも不要
- **設計上の注意**:
  - `pending_async_commands.model_id` にプロバイダ識別子を格納（将来のマルチモデル対応）
  - プロンプトインジェクションリスクなし（ハードコードプロンプト、ユーザー入力はLLMに渡さない）
  - 環境変数: `GEMINI_API_KEY`

---

## 4. 設計詳細化の状況

各コマンドの**feature（振る舞い仕様）は確定済み**。ただし以下の**内部設計はD-08の詳細化が未了**:

| 設計課題 | 必要になるコマンド | 状況 |
|---|---|---|
| CommandExecutionResult 拡張（フィールド上書き・ステルス指示） | ①③ | 未設計 |
| PostService ステルス除去パス | ①③ | 未設計 |
| pending_async_commands テーブルスキーマ | ③④ | テーブル名・方針のみ決定、カラム未設計 |
| Cron ジョブ設計（非同期コマンド処理） | ③④ | pending_tutorials を参考に設計可能 |
| AI API クライアント設計 | ④ | TDR-015で方針決定済み、詳細未設計 |

→ 実装タスク発行前に**アーキテクトによる設計詳細化タスク**が必要。
　②のみ設計詳細化不要（既存の仕組みで実装可能）。

---

## 5. 関連ドキュメント

| ドキュメント | 参照すべき箇所 |
|---|---|
| D-08 `command.md` §5 | ステルス設計原則、ターゲット任意パターン、非同期キューイングパターン |
| D-08 `command.md` §2.1 | CommandExecutionResult（現行の型定義） |
| D-08 `command.md` §2.2 | コマンド定義の2層構造（YAML + Handler） |
| D-07 TDR-013 | Cron配置方針（CF Cron vs GitHub Actions） |
| D-07 TDR-015 | Gemini 3 Flash Preview 採用決定 |
| `src/lib/services/command-service.ts` | 現行のCommandExecutionResult / CommandHandlerResult 型定義 |
| `src/lib/services/handlers/` | 既存ハンドラの実装パターン（tell, attack, hissi, kinou, grass, abeshinzo） |
| `src/lib/infrastructure/repositories/pending-tutorial-repository.ts` | 非同期キューの参考実装 |
