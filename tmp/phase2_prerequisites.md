# Phase 2 着手前の課題・検討事項

> Phase 1完了時点で判明している、Phase 2で対応すべき課題を記録する。

## 1. 専ブラ互換の実機テスト

**概要**: Phase 1で実装した専ブラ互換API（DAT形式・subject.txt・bbs.cgi・Shift_JIS等）が実際の専ブラで動作するか確認する。

**タイミング**: Vercelデプロイ後、Phase 2着手前

**手順**:
- curlによる事前検証（Shift_JISエンコード・DATフォーマット・bbs.cgiリクエスト/レスポンス）
- ChMate（Android）/ Siki（iOS）での実機接続テスト（板登録→スレ一覧→閲覧→書き込み→差分取得）
- 不具合があれば修正スプリントを挟む

**詳細な作戦**: Sprint-10完了時の議論を参照（専ブラ実機テスト手順・想定トラブルと対処を整理済み）

## 2. ブラウザ自動テスト（E2Eテスト）の導入検討

**概要**: Phase 1ではBDDテストをサービス層レベルで実行しており、ブラウザ自動操作（Playwright等）は含まれていない。Phase 2ではUIインタラクションが複雑化する（AIボット混在・告発・コマンド等）ため、E2Eテストの導入を検討する。

**Phase 1で不要だった理由**:
- featureファイルがビジネスロジックの振る舞いを記述しており、DOM操作やHTTPの検証を含まない
- UIは薄いアダプター（Service呼び出し→表示整形のみ）
- サービス層テストで十分なカバレッジが得られていた

**Phase 2で必要になる可能性がある領域**:
- 認証フロー（edge-token Cookie + Turnstileウィジェットの連携）
- ゲームコマンドのリアルタイムUI反映（AI告発結果の表示等）
- 複数ユーザー間の同時操作シナリオ

**検討事項**:
- ツール選定: Playwright（推奨）/ Cypress
- BDDシナリオとE2Eテストの役割分担（重複を避ける）
- CI実行時間への影響

## 3. Supabase Localセットアップ

**概要**: D-07 §2.4（TDR-ENV-001）で決定した2環境構成に基づき、ローカル開発環境にSupabase Local（Docker）をセットアップする。

**作業内容**:
- Docker Desktop のインストール確認
- `npx supabase init`（未実施の場合）
- `npx supabase start` でローカルDB起動
- `npx supabase db push` でマイグレーション適用
- `.env.local` をローカル用URL・キーに書き換え
- `npm run dev` で動作確認

**前提**: Docker Desktopが必要

## 4. 技術的負債

| 項目 | 詳細 | 優先度 |
|---|---|---|
| post-service.ts の `new Date()` 直接使用 | D-10 §5.3 未準拠（L277, L439）。`new Date(Date.now())` に統一すべき | 中 |
| `>>N` ステップ定義の汎用化 | ESC-TASK-021-1。thread.steps.tsの`>>1`固定リテラルとadmin.steps.tsの`>>5`/`>>999`固定リテラルを汎用`>>{int}`に統一 | 低 |

## 5. Phase 1除外シナリオ（Phase 2スコープ）

| シナリオ | feature | 理由 |
|---|---|---|
| 専ブラのコマンド文字列がゲームコマンドとして解釈される | specialist_browser_compat.feature | Phase 2コマンドシステム依存 |
| bbs.cgiへのPOSTがHTTPSリダイレクトでペイロードを消失しない | specialist_browser_compat.feature | インフラ制約（Vercel設定） |
| 専ブラ特有のUser-AgentがWAFにブロックされない | specialist_browser_compat.feature | インフラ制約（Vercel/CDN設定） |
