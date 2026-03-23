---
task_id: TASK-283
sprint_id: Sprint-105
status: assigned
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_283
depends_on: []
created_at: 2026-03-23T06:00:00+09:00
updated_at: 2026-03-23T06:00:00+09:00
locked_files: []
---

## タスク概要

画面テーマ機能（段階1: 切り替え機構）のコンポーネント設計を行う。実装計画 `tmp/orchestrator/theme_feature_plan.md` を詳細化し、TASK-285（コーディング）に引き渡すための設計書を出力する。

## 対象BDDシナリオ
- `features/theme.feature` — 承認済み v1（12シナリオ）

## 必読ドキュメント（優先度順）
1. [必須] `features/theme.feature` — 全シナリオ
2. [必須] `tmp/orchestrator/theme_feature_plan.md` — 実装計画
3. [必須] `docs/architecture/architecture.md` TDR-016 — 資源管理方式の決定
4. [参考] `docs/architecture/components/authentication.md` — 認証フロー（ユーザー特定に使用）
5. [参考] `src/app/(web)/layout.tsx` — 現行のWeb UIレイアウト
6. [参考] `src/app/(web)/mypage/page.tsx` — 現行のマイページ
7. [参考] `src/app/api/mypage/route.ts` — GET /api/mypage の既存実装
8. [参考] `src/lib/infrastructure/repositories/user-repository.ts` — ユーザーリポジトリ
9. [参考] `docs/specs/screens/mypage.yaml` — マイページ画面要素定義

## 出力（生成すべきファイル）
- `tmp/workers/bdd-architect_283/theme_design.md` — テーマ機能段階1 設計書

## 設計観点
1. **DBマイグレーション**: `users` テーブルへの `theme_id`, `font_id` カラム追加SQL
2. **ドメインモデル**: `theme.ts` のテーマ/フォントカタログ定数の型・構造
3. **API設計**: `PUT /api/mypage/theme` のリクエスト/レスポンス/バリデーション。既存 `GET /api/mypage` のレスポンス拡張
4. **SSRテーマ適用**: layout.tsxでのCSSクラス付与方式（Cookie vs DB取得、未認証時のフォールバック）
5. **マイページUI**: テーマ設定セクションのコンポーネント構成
6. **InMemory実装**: BDDテスト用のモック方針
7. **BDDステップ定義**: ステップ一覧と実装概要
8. **段階1スコープの明確化**: 有料テーマ/フォントは「カタログ定義のみ、CSSなし」で段階2に持ち越す範囲

## 完了条件
- [ ] 設計書がTASK-285のコーディングに十分な詳細度を持つ
- [ ] locked_files が明確に列挙されている
- [ ] 既存コードへの影響範囲が特定されている

## スコープ外
- コード実装（TASK-285で実施）
- features/ の変更
- 段階2（有料テーマの具体的なデザイン）

## 作業ログ

### 2026-03-23 設計完了

1. 必読ドキュメントを全て読了（theme.feature, theme_feature_plan.md, TDR-016, 既存コード群）
2. 設計書を `tmp/workers/bdd-architect_283/theme_design.md` に出力
3. 自己レビュー実施:
   - マイグレーション番号を 00012 → 00025 に修正（既存最新が 00024 だった）
   - SSR時のisPremium=trueパススルーについて、段階1では有料テーマCSSが存在しないため実害なしと判断
   - その他の設計判断は既存コードベースのパターンと一貫性があることを確認

### チェックポイント
- 状態: 完了
- 完了済み: 設計書出力、自己レビュー
- 次にすべきこと: TASK-285（コーディング）への引き渡し
- 未解決の問題: なし
