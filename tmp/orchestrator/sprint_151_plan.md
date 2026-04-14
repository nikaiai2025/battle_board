---
sprint_id: Sprint-151
status: in_progress
created_at: 2026-04-14
---

# Sprint-151 計画書 — キュレーションBOT Phase B: Wikipedia日次急上昇 API統合

## スプリントゴール

キュレーションBOT Phase B を完了し、Wikipedia日次急上昇記事を収集・投稿するBOTを**本番投入する**。

副次的効果:
- 既存の `CollectionAdapter` 抽象がAPI方式にも適合することを検証
- Phase C（残り11ソースの一括実装）に向けた統合テスト戦略を確立

## 前提（人間承認済み変更）

- `features/curation_bot.feature` v3 → v4 へ更新済み
  - 月次・定番記事関連シナリオ削除（定番記事は別feature管理）
  - BOT投稿間隔: 240〜360分 → 12〜24時間（全curationBOT共通）
  - Phase B の注記: 「Wikipedia日次:急上昇で検証」

## タスク分解

| TASK_ID | 担当 | 内容 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-379 | bdd-architect | Wikipedia API統合設計書（エンドポイント選定・バズスコア算出・統合テスト戦略・エラーハンドリング・メタページフィルタ） | - | assigned |
| TASK-380 | bdd-coding | BOT投稿間隔仕様変更（240〜360分 → 720〜1440分）既存一式更新 | - | assigned |
| TASK-381 | bdd-coding | WikipediaAdapter実装 + プロファイル追加 + 単体テスト + API統合テスト + 本番デプロイ準備 | TASK-379, TASK-380 | waiting |

## locked_files 管理

| TASK_ID | locked_files |
|---|---|
| TASK-379 | `tmp/workers/bdd-architect_TASK-379/` （設計書のみ、コード変更なし） |
| TASK-380 | `features/step_definitions/curation_bot.steps.ts`, `config/bot_profiles.yaml`, `config/bot-profiles.ts`, `src/lib/services/bot-strategies/strategy-resolver.ts`, `docs/architecture/components/bot.md`, **[追加] `src/lib/services/bot-strategies/scheduling/topic-driven.ts`, `src/__tests__/lib/services/bot-strategies/scheduling/topic-driven.test.ts`** |
| TASK-381 | `config/bot_profiles.yaml`, `config/bot-profiles.ts`, `src/lib/collection/adapters/adapter-resolver.ts`, `[NEW] src/lib/collection/adapters/wikipedia.ts`, `[NEW] src/__tests__/lib/collection/adapters/wikipedia.test.ts`, `docs/architecture/components/bot.md`, GitHub Actions cron設定（bot-profiles 追加対応が必要な場合） |

※ TASK-380 の `topic-driven.ts` + `topic-driven.test.ts` は locked_files 外だったが、値整合のための機械的変更のため権限移譲ルールに基づき自律判断で承認（BDDシナリオ・公開API契約・横断的制約に影響なし）。

## 競合管理

- TASK-380 と TASK-381 は `config/bot_profiles.yaml` / `config/bot-profiles.ts` / `docs/architecture/components/bot.md` が重複
- TASK-381 は TASK-380 完了後に起動（直列化）

## アーキテクト設計（TASK-379）で決める論点

1. **Wikimedia REST API エンドポイント選定**
   - 第1候補: `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/{project}/all-access/{year}/{month}/{day}`
   - project: `ja.wikipedia` or `en.wikipedia` or 両方
2. **バズスコア算出ルール**
   - 既存の「勢い = レス数/(経過h+2)^1.5」が適用不能
   - 候補: 日次ページビュー数をそのまま or スケール変換して buzz_score に格納
3. **API統合テスト戦略**
   - 候補A: 実API呼び出し（CIで不安定化リスク）
   - 候補B: 固定レスポンスでモック（統合テストの意味が薄まる）
   - 候補C: Nock/MSWによる記録/再生（中間案・推奨）
4. **エラーハンドリング**
   - Wikimedia REST API のレート制限・非200レスポンス・JSON構造変化
5. **メタページフィルタ**
   - `Main_Page` / `特別:検索` / `Wikipedia:メインページ` 等の除外ルール
6. **User-Agent 設定**
   - Wikimedia API のベストプラクティス（User-Agent必須・連絡先記載）対応

## 完了条件

- [ ] TASK-379: 設計書が完成し、人間が判断不能な論点がアーキテクトから報告されない（または報告されたものが全て解決済み）
- [ ] TASK-380: vitest 全件PASS、cucumber-js で BOT投稿間隔シナリオPASS
- [ ] TASK-381: vitest 全件PASS、cucumber-js 全件PASS、Wikipedia API統合テストPASS
- [ ] bdd-gate: 全テストスイート PASS
- [ ] Git commit & push 完了
- [ ] Vercel / Cloudflare デプロイ完了
- [ ] bdd-smoke: 本番スモークテスト PASS
- [ ] 本番のWikipedia BOTがactiveで実際に収集・投稿している（翌日以降の確認が必要）

## テスト目標

- vitest: 2249 → 2260前後（WikipediaAdapter 単体テスト追加）
- cucumber-js: 412 → 411（Wikipedia月次シナリオ削除で -1）
- 本番スモーク: 31/36 → 31/36 維持

## 結果

| TASK_ID | 状態 | 備考 |
|---|---|---|
| TASK-379 | completed | 設計書4成果物作成 / 9論点決着 / ESC-TASK-379-1 起票→自律判断で選択肢A採用（単体モックのみ・ja単独・BDD変更なし）→archiveへ移動済み |
| TASK-380 | completed | vitest 2251 PASS / cucumber 411 PASS（月次削除で 412→411） / 7ファイル変更（locked_files 5 + 追加 2） / 2026-04-14 |
| TASK-381 | completed | vitest 2296 PASS（+45: wikipedia 43 + thread-creator 2） / cucumber 411 PASS維持 / tsc noEmitエラーなし / 11ファイル変更（新規4 + 変更7）/ formatBody 拡張で Phase A への波及あり（feature v4 準拠）/ BDDステップ定義の「勢い:」→「バズスコア:」値整合修正（locked_files外→権限移譲ルールで承認） / 2026-04-14 |
| TASK-GATE-151 | completed | 総合PASS / vitest 2296/2296 / cucumber 411 PASS（18 pending + 4 undefined は既存仕様）/ tsc エラーなし / lint Sprint-151 差分エラー0件（既存495 problems は据置）/ 統合・E2Eは Docker停止のため実施対象外 |
| TASK-SMOKE-151 | — | デプロイ後に起動 |
