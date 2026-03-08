---
task_id: TASK-003
sprint_id: Sprint-2
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-08T20:00:00+09:00
updated_at: 2026-03-08T20:00:00+09:00
locked_files:
  - "src/lib/domain/models/*"
  - "src/lib/domain/rules/*"
  - "src/types/index.ts"
  - "[NEW] src/lib/domain/models/*.ts"
  - "[NEW] src/lib/domain/rules/*.ts"
  - "[NEW] src/lib/domain/rules/__tests__/*.test.ts"
---

## タスク概要
Phase 1 Step 2 — ドメインモデルの型定義と純粋関数（ドメインルール）を実装し、単体テストを作成する。
アーキテクチャ設計書(D-07) §3 Domain Layer の定義に基づく。MVPフェーズではモデルはTypeScriptの `interface`/`type` 定義（薄いデータ型）に留め、ビジネスロジックはルール関数に実装する（§3 運用指針）。

## 対象BDDシナリオ
- なし（ドメイン型・純粋関数はBDD前のユニットテスト対象）

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/architecture.md` — §3 Domain Layer（§3.1 レイヤ構成、§3.2 各レイヤの責務）
2. [必須] `docs/architecture/architecture.md` — §4.2 主要テーブル定義（型定義の根拠）
3. [必須] `docs/architecture/architecture.md` — §5.2 日次リセットID生成（daily-id.tsの仕様）
4. [必須] `docs/architecture/architecture.md` — §9 ディレクトリ構成
5. [必須] `docs/architecture/components/posting.md` — PostInput/PostResult型
6. [必須] `docs/architecture/components/currency.md` — DeductResult/CreditReason型
7. [必須] `docs/architecture/components/authentication.md` — VerifyResult/AuthCodeResult型
8. [必須] `docs/architecture/components/incentive.md` — PostContext/IncentiveResult型、8種イベント一覧
9. [参考] `docs/requirements/ubiquitous_language.yaml` — 用語統一
10. [参考] `docs/specs/openapi.yaml` — API型（参考情報）
11. [参考] `features/phase1/incentive.feature` — インセンティブ発火条件の確認

## 入力（前工程の成果物）
- Sprint-1 で作成済みのディレクトリ骨格（`.gitkeep` 配置済み）

## 出力（生成すべきファイル）

### ドメインモデル型定義 (`src/lib/domain/models/`)
- `thread.ts` — Thread型
- `post.ts` — Post型
- `user.ts` — User型
- `currency.ts` — Currency型、DeductResult型、DeductReason/CreditReason
- `bot.ts` — Bot型
- `command.ts` — Command型（コマンド定義: 名前・コスト・ステルスフラグ）
- `accusation.ts` — Accusation型、AccusationResult
- `incentive.ts` — IncentiveEventType, PostContext, IncentiveResult型

### 共有型定義 (`src/types/`)
- `index.ts` — ApiResponse<T>, ApiError, PostInput, PostResult 等の経路横断型

### ドメインルール純粋関数 (`src/lib/domain/rules/`)
- `daily-id.ts` — 日次リセットID生成: `generateDailyId(authorIdSeed, boardId, dateJst) → string(8文字)`
  - アルゴリズム: `truncate(sha256(dateJst + boardId + authorIdSeed), 8)`
- `anchor-parser.ts` — アンカー解析: `parseAnchors(body) → number[]`（`>>1`, `>>1-3` 等を検出）
- `incentive-rules.ts` — ボーナス発火条件の純粋判定関数群（8種）
- `validation.ts` — 入力バリデーション（スレッドタイトル96文字制限、本文空チェック等）

### 単体テスト (`src/lib/domain/rules/__tests__/`)
- `daily-id.test.ts`
- `anchor-parser.test.ts`
- `incentive-rules.test.ts`
- `validation.test.ts`

## 完了条件
- [ ] 全モデル型定義ファイルが作成されている
- [ ] `src/types/index.ts` にApiResponse/ApiError/PostInput/PostResult型が定義されている
- [ ] 4つのドメインルール関数が実装されている
- [ ] 各ルール関数に対応する単体テストが存在する
- [ ] テストコマンド: `npx vitest run` で全テストPASS
- [ ] daily-id.tsのテスト: 同一入力→同一出力、異なる日付→異なるID、8文字出力を検証
- [ ] anchor-parser.tsのテスト: `>>1`, `>>1-3`, `>>1,3,5`, 複数アンカー、不正入力を検証
- [ ] validation.tsのテスト: 空文字拒否、96文字超拒否、正常値受理を検証

## スコープ外
- サービス層の実装（PostService, AuthService等）— Step 5以降
- リポジトリ層の実装 — Step 3
- BDDシナリオのステップ定義 — Step 4以降
- `command-parser.ts` — Phase 2のコマンドシステム用。Step 2では型定義のみ
- `accusation-rules.ts`, `bot-combat.ts` — Phase 2用。Step 2では型定義のみ

## 補足・制約
- モデルはTypeScriptの `type` または `interface` で定義する（classは不要。§3 MVP運用指針）
- 純粋関数は外部依存を持たないこと（DB・API呼び出し禁止）
- `daily-id.ts` は Node.js 組み込みの `crypto` モジュール（`createHash('sha256')`）を使用する
- ユビキタス言語辞書(D-02)に従い、英語プロパティ名はD-02のenglishフィールドに準拠すること

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: completed
- 完了済み: 全ファイル作成・全テストPASS
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- [完了] 必読ドキュメント読み込み（architecture.md, components/*.md, ubiquitous_language.yaml, incentive.feature）
- [完了] ドメインモデル型定義ファイルの作成（8ファイル）
  - `src/lib/domain/models/thread.ts` — Thread型, ThreadInput型
  - `src/lib/domain/models/post.ts` — Post型
  - `src/lib/domain/models/user.ts` — User型
  - `src/lib/domain/models/currency.ts` — Currency型, DeductResult型, DeductReason, CreditReason
  - `src/lib/domain/models/bot.ts` — Bot型
  - `src/lib/domain/models/command.ts` — Command型, ParsedCommand型
  - `src/lib/domain/models/accusation.ts` — Accusation型, AccusationResult型
  - `src/lib/domain/models/incentive.ts` — IncentiveEventType, PostContext, IncentiveResult, IncentiveLog
- [完了] 共有型定義ファイルの作成
  - `src/types/index.ts` — ApiResponse<T>, ApiError, PostInput, PostResult, ThreadInput
- [完了] ドメインルール純粋関数の実装（4ファイル）
  - `src/lib/domain/rules/daily-id.ts` — generateDailyId（sha256 truncate 8文字）
  - `src/lib/domain/rules/anchor-parser.ts` — parseAnchors（>>N, >>N-M, >>N,M 対応）
  - `src/lib/domain/rules/incentive-rules.ts` — 8+1種ボーナス判定関数群
  - `src/lib/domain/rules/validation.ts` — スレッドタイトル/本文/ユーザーネーム/認証コード/板IDバリデーション
- [完了] 単体テストの作成（4ファイル）
  - `src/lib/domain/rules/__tests__/daily-id.test.ts` — 14テスト
  - `src/lib/domain/rules/__tests__/anchor-parser.test.ts` — 33テスト
  - `src/lib/domain/rules/__tests__/incentive-rules.test.ts` — 62テスト
  - `src/lib/domain/rules/__tests__/validation.test.ts` — 55テスト
- [完了] `npx vitest run` 全テストPASS確認

### テスト結果サマリー

- テストファイル: 4 passed (4)
- テスト件数: 164 passed (164)
- 実行時間: 382ms
- 失敗: 0件

テスト対象関数と検証内容:
| ファイル | 検証内容 |
|---|---|
| daily-id.test.ts | 同一入力→同一出力、異なる日付/seed/板ID→異なるID、8文字出力、sha256アルゴリズム検証 |
| anchor-parser.test.ts | >>N, >>N-M, >>N,M,... 形式、複数アンカー、重複排除、昇順ソート、null/undefined/不正型、境界値 |
| incentive-rules.test.ts | 9種ボーナス判定関数の発火条件・不発条件・境界値、定数値確認 |
| validation.test.ts | 空文字拒否、最大文字数+1拒否、正常値受理、null/undefined/数値/配列等の不正型拒否、境界値 |
