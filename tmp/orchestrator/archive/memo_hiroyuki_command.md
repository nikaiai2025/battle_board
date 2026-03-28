# !hiroyuki コマンド — オーケストレーター向け引継ぎメモ

> 作成: 2026-03-27 アーキテクトセッション
> ステータス: **feature 承認済み — タスク発行可能**

## 概要

ひろゆき風AI BOTを召喚するコマンド `!hiroyuki`。
Gemini APIでひろゆき風テキストを生成し、使い切りBOTが「名無しさん」として投稿する。
ターゲット任意（`!hiroyuki` or `!hiroyuki >>5`）、非ステルス、BOT召喚。

## 成果物一覧（作成済み）

| ファイル | ステータス |
|---|---|
| `features/command_hiroyuki.feature` | **承認済み v1**（8シナリオ） |
| `config/commands.yaml` | **更新済み**（hiroyukiエントリ追加） |
| `config/hiroyuki-prompt.ts` | **作成済み**（システムプロンプト + モデルID） |

## 設計決定済み事項（再議論不要）

### 1. BOT方式（★システムレスではない）

「ひろゆきを !attack で殴れる」ゲーム体験のためBOT方式を採用。
BOTは使い切り（1回書き込み・定期書き込みなし・日次リセットで復活しない）。
command_aori.feature と同一のライフサイクル。

### 2. 非ステルス（stealth: false）

コマンド文字列が本文に残り、誰が召喚したか分かる。
aori（隠密暗殺）との差別化。BOTの書き込み自体は「名無しさん」+ 偽装IDで正体不明。

### 3. ターゲット任意（targetFormat: null）

- `!hiroyuki` → スレッド全体の流れを読み、ひろゆき風の感想を投稿
- `!hiroyuki >>5` → >>5 の投稿者のIDで全レスを抽出し、そのユーザーへのひろゆき風返信を投稿

command_omikuji.feature と同じターゲット任意パターン（D-08 command.md §5 準拠）。

### 4. AI API: gemini-3-flash-preview

Web検索不要のため Flash を使用（newspaper は Search Grounding のため 2.5）。
モデルIDは `config/hiroyuki-prompt.ts` に `HIROYUKI_MODEL_ID` として定義済み。

### 5. 経済バランス（aoriと同一）

召喚コスト: 10 / 撃破報酬: 10 / 攻撃コスト: 5。
自作自演: -10 -5 +10 = -5（赤字）→ ファーミング不可。

### 6. google-ai-adapter の拡張

現行の `IGoogleAiAdapter` は `generateWithSearch`（Search Grounding付き）のみ。
hiroyuki は検索不要のため、**検索なしの `generate()` メソッド**を追加する。
内部的には `tools: [{ googleSearch: {} }]` を渡さないだけの差分。

### 7. プロンプトインジェクション防止

UGC（スレッド本文）をAIに渡す初のコマンド。
`systemInstruction`（ハードコードされた人格設定）と `contents`（スレッド本文）を
Gemini APIの構造で分離する。同一メッセージに混在させない。

### 8. トークン制限

レス本文最大: 2,000文字 / スレッド最大レス数: 未定義（上限なし）。
1000レス × 平均150文字 ≈ 225Kトークン → Gemini の 1M コンテキスト内で問題なし。
実装時にトランケーション設定値（最大N件 or 最大Mトークン）を安全弁として設けること。

## 実装タスク一覧

依存順に記載。

| # | タスク | 成果物 | 参考パターン |
|---|---|---|---|
| 1 | Adapter拡張 + BOTプロファイル | `google-ai-adapter.ts` に `generate()` 追加、`config/bot_profiles.yaml` に hiroyuki 追加 | 既存 `generateWithSearch()` / `aori` プロファイル |
| 2 | コマンドハンドラ | `src/lib/services/handlers/hiroyuki-handler.ts` | `handlers/aori-handler.ts`（ターゲット任意に変更） |
| 3 | Cron処理（メイン実装） | `bot-service.ts` に `processHiroyukiCommands()` 追加 | `processAoriCommands()` + `newspaper-service.ts` の AI API 呼出 |
| 4 | Cronルート更新 | bot-execute API route で hiroyuki 処理を呼び出す | 既存の aori / newspaper 呼び出し |
| 5 | BDDステップ定義 + 単体テスト | `step_definitions/command_hiroyuki.steps.ts` + `__tests__/` | `command_aori.steps.ts` + `newspaper-service.test.ts` |
| 6 | ベーシックフローテスト | `e2e/flows/basic-flow.spec.ts` に hiroyuki テスト追加 | 既存コマンドのテストケース |

### タスク間の依存関係

```
1 (adapter + profiles) → 3 (Cron処理)
2 (ハンドラ) ──────────→ 3 (Cron処理) → 4 (ルート更新) → 6 (E2Eテスト)
                                                        ↗
5 (BDD + 単体テスト) ──────────────────────────────────
```

### 各タスクの実装ポイント

**タスク1: Adapter拡張**
- `IGoogleAiAdapter` インターフェースに `generate()` を追加
- `GoogleAiAdapter` クラスに実装追加（`_callGeminiApi` から `tools` を除外した版）
- `bot_profiles.yaml` に hiroyuki エントリ追加（aori と同一パラメータ: HP:10, base_reward:10, daily/attack_bonus:0）

**タスク2: ハンドラ**
- aori-handler.ts をベースに、ターゲット任意に対応（引数なしでも `success: true`）
- pending payload にターゲット有無を記録
- 非ステルスのため `systemMessage: null` でOK（コマンド文字列は本文に残る）

**タスク3: Cron処理（最も複雑）**
- pending 読取 → スレッド全レス取得 → (対象ユーザーのレス抽出)
- `HIROYUKI_SYSTEM_PROMPT` + スレッドコンテキストでプロンプト構築
- `generate()`（検索なし）で AI API 呼出
- 成功: BOT生成 → BOT投稿（aori の既存フローを再利用）
- 失敗: 通貨返却 → ★システムエラー通知（newspaper の既存フローを再利用）
- ユーザープロンプト構築時、対象ユーザーの全レスを特定する情報を含める

**タスク4: Cronルート更新**
- 既存の bot-execute ルートに `processHiroyukiCommands()` 呼び出しを追加

**タスク6: ベーシックフローテスト**
- `.claude/rules/command-handler.md` 準拠（新規コマンドにつき1本必須）
