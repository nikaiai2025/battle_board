# 設計書陳腐化レビュー — 技術負債（将来対応）

> 作成日: 2026-03-19
> 起因: 設計当時WebSearch未使用だったため、最新情報との突合レビューを実施

## 優先度: 中（Phase 3 開始前に検討推奨）

### TD-ARCH-001: Next.js 16.2 へのアップグレード（ダウングレード済み・再アップグレード待ち）

- **現状**: `~16.1.6`（チルダ固定。マイナーバージョン自動更新を防止）
- **経緯**: Sprint-71 (2026-03-20) で 16.2.0 にアップグレードしたが、`@opennextjs/cloudflare 1.17.1` との非互換により CF Workers が起動不能（Error 1101）となった。16.2.0 で導入された `prefetch-hints.json` マニフェストを `@opennextjs/cloudflare` の `loadManifest` パッチが認識できず、Worker 起動時に未捕捉例外がスローされる。詳細は `tmp/reports/INCIDENT-CF1101.md` を参照。即時復旧のため 16.1.6 にダウングレードし、バージョンをチルダ固定とした
- **修正待ち issue**: [opennextjs/opennextjs-cloudflare#1157](https://github.com/opennextjs/opennextjs-cloudflare/issues/1157)（2026-03-18 報告、2026-03-20 時点で open / triage ラベル）
- **メリット**: dev起動 ~400%高速化、SSRレンダリング ~50%高速化。ただし 16.2.0 固有機能の使用箇所は現時点でなし
- **再アップグレード条件**: 以下の全てを満たすこと
  1. issue #1157 が closed になる
  2. 修正を含む `@opennextjs/cloudflare` の新バージョンがリリースされる
  3. ローカルで `build:cf` + `preview:cf` が正常動作することを確認する
- **次回確認時期**: ウォッチリスト参照（2026-03-24）

### TD-ARCH-002: `use cache` ディレクティブのキャッシュ戦略への反映

- **現状**: D-07 §11.1 のキャッシュ戦略はEdge Cache + Cache-Control + ISRのみ言及
- **メリット**: Next.js 16標準のコンポーネント/関数レベルキャッシュを活用可能
- **作業内容**: §11.1にuse cacheの選択肢を追記 + スレッド一覧等への適用を検討
- **推奨時期**: TD-ARCH-001（16.2アップデート）と同時

### TD-ARCH-003: React Compiler 有効化の検討

- **現状**: 未言及・未有効化
- **メリット**: 自動メモ化によるクライアント再レンダリング削減
- **リスク**: 中（コンパイラが想定外の最適化をする可能性。テストで確認要）
- **作業内容**: `next.config.ts` に `reactCompiler: true` 追加 + 全ページ動作確認
- **推奨時期**: Phase 3（ユーザー数増加でパフォーマンス重要度が上がる時期）

## 優先度: 低（必要が生じた時点で対応）

### TD-ARCH-004: Vitest Visual Regression によるpendingシナリオ解消

- **現状**: D-10 §7.3.1 のDOM/CSS表示系シナリオはpending扱い
- **メリット**: スクリーンショット比較でUI変更の自動検知が可能に
- **作業内容**: Vitest Browser Mode + Visual Regression の導入、対象シナリオの代替テスト作成
- **前提**: UIデザインが安定してから（頻繁にUI変更がある段階では参照画像の更新コストが高い）
- **推奨時期**: Phase 3以降、UIが安定した時点

### TD-ARCH-005: BDDテストのESM移行検討

- **現状**: CJS互換の手法（requireキャッシュ書き換え等）で動作中
- **メリット**: ESMネイティブによるモジュール解決の簡素化、ts-node依存の削減可能性
- **リスク**: 中（モック機構の全面書き換えが必要。動いているものを壊すリスク）
- **判断基準**: CJS方式でメンテナンス困難になった場合のみ移行を検討
- **推奨時期**: 問題が発生するまで見送り

## ウォッチリスト（対応不要・監視のみ）

| 項目 | 概要 | 次回確認時期 |
|---|---|---|
| **opennextjs/cloudflare #1157** | **Next.js 16.2.0 の prefetch-hints.json 非互換。修正後に再アップグレード** | **2026-03-24（4日後）** |
| Cloudflare Vinext | Viteベース Next.js再実装。実験的 | Phase 3開始時 |
| supabase-js v3 | monorepo化進行中。v3リリース時に移行検討 | v3リリース時 |
| Playwright Agent CLI | エージェント向けCLIモード。bdd-gate効率化の可能性 | 次回テスト戦略見直し時 |
