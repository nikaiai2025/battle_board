---
task_id: TASK-399
sprint_id: Sprint-156
status: cancelled
assigned_to: bdd-coding
depends_on: []
created_at: 2026-04-21T00:42:23.0818521+09:00
updated_at: 2026-04-21T02:06:00+09:00
locked_files:
  - src/app/(web)/mypage/page.tsx
  - "[NEW] src/app/(web)/mypage/_components/ThemeTonePicker.tsx"
  - src/app/(web)/layout.tsx
  - src/app/api/mypage/route.ts
  - src/app/api/mypage/theme/route.ts
  - src/lib/constants/cookie-names.ts
  - src/lib/domain/models/theme.ts
  - src/lib/domain/models/user.ts
  - src/lib/domain/rules/theme-rules.ts
  - src/lib/infrastructure/repositories/user-repository.ts
  - src/lib/services/theme-service.ts
  - src/lib/services/mypage-service.ts
  - src/lib/services/__tests__/mypage-service.test.ts
  - src/__tests__/lib/domain/models/theme.test.ts
  - src/__tests__/lib/domain/rules/theme-rules.test.ts
  - features/step_definitions/theme.steps.ts
  - features/support/in-memory/user-repository.ts
  - "[NEW] supabase/migrations/00050_add_custom_theme_tones.sql"
---

## タスク概要

`features/theme.feature` に追加された「3段階トーンカスタマイズ」を実装する。
既存のテーマプリセット選択とフォント選択は維持したまま、ユーザーが固定パレットから `background` / `muted` / `card` の3色を選択できるようにし、`foreground` は `background` から自動決定する。その他の色トークンは固定値のままとし、自由入力UIは追加しない。

## 取り下げ

2026-04-21: ユーザー指示により TASK-399 は取り下げ。実装しない。

## 対象BDDシナリオ

- `features/theme.feature` — `ユーザーが3段階トーンを設定する`
- `features/theme.feature` — `foreground は background に応じて自動決定される`
- `features/theme.feature` — 既存のテーマ/フォント関連シナリオ全般（既存挙動を壊さないこと）

## 必読ドキュメント（優先度順）

1. [必須] `features/theme.feature` — 新規追加された3段階トーンシナリオを含む正本
2. [必須] `src/app/(web)/mypage/page.tsx` — 現行のテーマ/フォント設定UI
3. [必須] `src/app/api/mypage/theme/route.ts` — テーマ設定保存API
4. [必須] `src/app/(web)/layout.tsx` — Cookieベースのテーマ適用経路
5. [必須] `src/lib/domain/models/theme.ts` — テーマカタログ/テーマ表現
6. [必須] `src/lib/domain/rules/theme-rules.ts` — テーマ解決/バリデーションの現行ルール
7. [必須] `src/lib/services/mypage-service.ts` — マイページ返却値の現行仕様
8. [参考] `docs/specs/screens/mypage.yaml` — マイページ要素定義
9. [参考] `src/__tests__/lib/domain/rules/theme-rules.test.ts` — 既存のテーマルールテスト

## 入力（前工程の成果物）

- `features/theme.feature` — 2026-04-21 追記済みの3段階トーンカスタマイズ仕様

## 出力（生成すべきファイル）

- `supabase/migrations/00050_add_custom_theme_tones.sql` — ユーザーごとの3段階トーン保存用カラム追加
- `src/app/(web)/mypage/page.tsx` — 3段階トーン選択UIと保存導線
- `src/app/(web)/mypage/_components/ThemeTonePicker.tsx` — 固定パレット選択UI（必要な場合）
- `src/app/api/mypage/theme/route.ts` — theme/font に加えて3段階トーン保存に対応
- `src/app/api/mypage/route.ts` — マイページ取得レスポンスに3段階トーンを含める場合の反映
- `src/app/(web)/layout.tsx` — 保存済み3段階トーンをSSR時に適用
- `src/lib/domain/models/theme.ts` — 3段階トーン用の固定パレット定義、および foreground 自動決定の表現追加
- `src/lib/domain/rules/theme-rules.ts` — foreground 自動決定ロジック、および固定トークン適用ルールの整理
- `src/lib/domain/models/user.ts` — ユーザーモデルへのトーン設定フィールド追加
- `src/lib/infrastructure/repositories/user-repository.ts` — DB永続化/取得対応
- `src/lib/services/theme-service.ts` — 保存対象拡張
- `src/lib/services/mypage-service.ts` — 取得DTO拡張
- `src/lib/constants/cookie-names.ts` — 必要なら3段階トーン用Cookie名を追加
- `src/__tests__/lib/domain/models/theme.test.ts` — パレット/foreground 決定のユニットテスト
- `src/__tests__/lib/domain/rules/theme-rules.test.ts` — 自動決定/固定トークン維持のテスト
- `src/lib/services/__tests__/mypage-service.test.ts` — マイページ返却値/フォールバックのテスト
- `features/step_definitions/theme.steps.ts` — 追加シナリオ対応
- `features/support/in-memory/user-repository.ts` — BDD用 InMemory 永続化対応

## 完了条件

- [ ] `features/theme.feature` の新規2シナリオがPASSする
- [ ] 既存のテーマ/フォント関連シナリオが回帰なくPASSする
- [ ] `npx vitest run src/__tests__/lib/domain/models/theme.test.ts src/__tests__/lib/domain/rules/theme-rules.test.ts src/lib/services/__tests__/mypage-service.test.ts` がPASSする
- [ ] `npx cucumber-js features/theme.feature` がPASSする
- [ ] custom tone 未設定時は既存のテーマプリセット挙動が維持される

## スコープ外

- `features/theme.feature` の再変更
- `background` / `muted` / `card` 以外のユーザー自由設定
- `accent` / `link` / `destructive` 等のユーザー選択機能
- フォント機能の拡張
- 専ブラUIへの適用
- テーマプリセット課金条件の変更

## 補足・制約

- 3段階トーンは **固定パレットからの選択のみ** とし、HEX自由入力やカラーピッカー自由入力は追加しない
- `foreground` は `background` に対する明暗判定から **機械的に自動決定** する。曖昧なヒューリスティクスは禁止
- `background / muted / card` 以外のトークンは既存テーマシステムの固定値を利用し、ユーザー設定対象にしない
- custom tone が未設定（null）の場合は既存の `themeId` ベースの描画結果をそのまま使う
- SSR反映が必要なため、DB保存だけでなく Cookie または同等の軽量反映経路を用意すること
- `features/support/in-memory/user-repository.ts` を更新する場合、UUID引数には `assertUUID()` 規約を維持すること
- locked_files 外の変更が必要と判明した場合はエスカレーションすること

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 未着手
- 完了済み: なし
- 次にすべきこと: 必読資料を確認し、custom tone の保存モデルと反映経路を確定したうえでテストファーストで実装を開始する
- 未解決の問題: なし

### 進捗ログ
<!-- ワーカーが作業中に逐次追記 -->

### テスト結果サマリー
<!-- テスト実行後にワーカーが追記。詳細はartifacts_dirに出力 -->
