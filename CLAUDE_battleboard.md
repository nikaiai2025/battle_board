# BattleBoard — 大域ルール

> 本ファイルは全AIエージェントがセッション開始時に最初に読む「憲法」である。人間が編集し、AIは読み取り専用。

## プロジェクト概要

5chライクな匿名掲示板。AIボットが人間に偽装して混入し、議論投票・AI告発・ボット撃破などのゲーム機能を備えた「対戦型匿名掲示板」。
通常の掲示板としても使えることを前提とし、ゲーム機能はオプション。5ch専用ブラウザ（専ブラ）での読み書きにも対応する。

- 言語: TypeScript
- フレームワーク: Next.js (App Router)
- テストフレームワーク: Vitest
- BDDフレームワーク: Cucumber.js
- 単体テスト実行コマンド: `npx vitest run`
- BDDテスト実行コマンド: `npx cucumber-js`

## 必読ドキュメント

| ドキュメント | パス |
|---|---|
| 要件定義書 (D-01) | `docs/requirements/requirements.md` |
| ユビキタス言語辞書 (D-02) | `docs/requirements/ubiquitous_language.yaml` |
| BDDシナリオ集 (D-03) | `features/*.feature` |
| OpenAPI仕様書 (D-04) | `docs/specs/openapi.yaml` |
| 状態遷移仕様書 (D-05) | `docs/specs/{entity}_state_transitions.yaml` |
| 画面要素定義書 (D-06) | `docs/specs/screens/{screen_id}.yaml` |
| アーキテクチャ設計書 (D-07) | `docs/architecture/architecture.md` |
| コンポーネント設計書 (D-08) | `docs/architecture/components/{component}.md` |
| 内部BDDシナリオ | `features/internal/*.feature` |

## コーディング規約

- 実装コードには必ず対応するBDDシナリオへの参照コメントを付与する
  - 形式: `// See: features/{file}.feature @{TAG}`
  - 複数シナリオに関わる場合は複数行列挙する
- 変数名・関数名・クラス名はユビキタス言語辞書 (D-02) に従う
- TypeScript の strict モードを有効にする（`"strict": true`）
- `any` 型の使用を原則禁止。やむを得ない場合は `// eslint-disable-next-line @typescript-eslint/no-explicit-any` とコメントで理由を明記
- Next.js App Router を使用する。Pages Router は使用しない
- Server Components / Client Components の使い分けを意識する（`"use client"` は最小限に）
- Supabase へのアクセスはサーバーサイド（Server Actions または Route Handlers）から行い、クライアントに秘密鍵を露出させない
- コンポーネントファイルは `PascalCase.tsx`、それ以外は `kebab-case.ts`
- コミットメッセージは日本語可。形式: `種別: 内容`（例: `feat: AI告発機能を追加`）

## 横断的制約

IMPORTANT: 以下の制約は全エージェント・全フェーズで遵守必須。

- **セキュリティ制約:**
  - ユーザー作成ボットのプロンプトは必ずサニタイズし、管理者プロンプトで上書きする。ユーザー入力をそのままLLMに渡すことを禁止する
  - Supabase の RLS（Row Level Security）を全テーブルで有効にする
  - ユーザー入力は全てバリデーション・サニタイズを行ってからDBに書き込む
  - 環境変数（APIキー等）をクライアントサイドコードに含めることを禁止する（`NEXT_PUBLIC_` プレフィックスを持つ変数のみ公開可）
- **規制制約:**
  - MVPフェーズでは特定の規制要件なし。課金の実決済はMVPスコープ外のため決済関連法規は対象外
- **アーキテクチャ制約:**
  - インフラは Vercel + Supabase + GitHub Actions に固定する（他のクラウドサービスを追加する場合はエスカレーション必須）
  - 5ch専ブラ互換APIを提供すること（DAT形式 / read.cgi互換）
  - AIボットの書き込みはユーザーの書き込みと同一のAPIを通じて行い、直接DBを書き換えない
  - スレッドタイプは将来の拡張を想定した設計にする（現在は「ノーマルタイプ」のみ）

## 禁止事項

YOU MUST NOT:
- G2承認済みBDDシナリオ (`features/` 配下) を人間の承認なしに追加・変更・削除する
- G1承認済みの要件定義書 (D-01) を変更する
- BDDシナリオに対応しない機能を独自判断で実装する（スコープ逸脱の禁止）
- 他エージェントの作業ディレクトリ (`tmp/workers/` 配下の他タスク領域) を書き換える
- `locked_files` で他タスクがロック中のファイルを変更する
- CLAUDE.md 自体を変更する（人間のみが編集する）
- フェーズ5レビューAI（BDDゲート・コードレビュー・ドキュメントレビュー）はソースコード・ドキュメントを一切変更しない。書き込みは各自の担当レポート (`tmp/reports/`) のみ

## エスカレーション

以下のいずれかに該当する場合、作業を停止しオーケストレーターAI経由で人間に報告する:
1. BDDシナリオ (`features/`) の追加・変更・削除が必要な場合
2. OpenAPI契約 (D-04) またはstate遷移仕様 (D-05) の変更が必要な場合
3. セキュリティ・法規制・横断的制約への影響がある場合
4. TDR (技術的意思決定記録) の追加・変更、または新規依存関係の導入が必要な場合
5. ユーザーから見た振る舞いが変わる可能性がある場合
6. 実装中に3回のリトライでテストが通らない場合

エスカレーションは `tmp/escalations/escalation_{ESC_ID}.md` に起票する。

## tmp ディレクトリ

エージェント間の共有状態管理領域。セッションをまたぐ記憶の代替手段。

```
tmp/
  orchestrator/          ← オーケストレーターAI専用（スプリント計画・結果）
  tasks/                 ← タスク指示書（オーケストレーターが作成）
  workers/coding_{ID}/   ← コーディングAI作業空間（タスク単位で隔離）
  workers/architect_{ID}/← アーキテクトAI作業空間（タスク単位で隔離）
  escalations/           ← エスカレーション起票・応答
  reports/               ← フェーズ5レビューレポート
```

### アクセス権限

- 各エージェントは自分の書き込み権限があるディレクトリのみを変更する
- タスク指示書の `locked_files` が排他制御の唯一のソース
- タスクステータス: `assigned` → `in_progress` → `completed` / `escalated` / `aborted`

## 仕様変更の伝播ルール

変更したドキュメントより下流のドキュメントは必ず連動更新する。
- 正本の優先順位: BDD (振る舞いの意図) → OpenAPI/D-05 (契約・状態遷移) → 実装コード
- 衝突時: まずBDDで意図を確定 → OpenAPI/D-05を同期 → 実装を修正

## 人間承認ゲート

| ゲート | タイミング | 承認者 | 主な確認内容 |
|---|---|---|---|
| G1 | 要件定義完了後 | ビジネス責任者 | 要件の網羅性・スコープ |
| G2 | 外部仕様定義完了後 | ビジネス責任者+技術リード | BDDシナリオの網羅性 |
| G3 | 内部仕様定義完了後 | 技術リード | アーキテクチャ・TDRの妥当性 |
| G4 | AIが判断不能時(随時) | 技術リード | エスカレーション内容 |
| G5 | 検証完了後 | ビジネス責任者 | BDD全件PASS・ESC全解決 |
