---
task_id: TASK-038
sprint_id: Sprint-15
status: completed
assigned_to: bdd-coding
depends_on: [TASK-037]
created_at: 2026-03-15T01:00:00+09:00
updated_at: 2026-03-15T01:00:00+09:00
locked_files:
  - "docs/architecture/bdd_test_strategy.md"
  - "playwright.config.ts"
  - "[NEW] e2e/cf-smoke/workers-compat.spec.ts"
---

## タスク概要

Cloudflare Workers環境（`wrangler dev`）に対するスモークテストを追加する。目的はWorkers Runtime固有の互換性（iconv-lite/crypto/Buffer/rewrites）の回帰検知。ビジネスロジックのテストではなく、インフラ境界の互換性チェックに限定する。

## 作業内容

### 1. テスト戦略書（D-10）への追記

`docs/architecture/bdd_test_strategy.md` の §7（テストピラミッド）に「CF Smokeテスト」層を追加する。

テストピラミッド図に新しい層を追加:
```
        ┌──────────────┐
        │    E2E       │  Playwright — 重要フローのみ
       ─┼──────────────┼─
       │  API テスト    │  HTTPレベル検証
      ──┼───────────────┼──
      │  CF Smoke       │  ← NEW: wrangler dev に対する互換性スモークテスト
     ───┼────────────────┼───
     │  統合テスト       │  Supabase Local実DB
    ────┼─────────────────┼────
    │  BDD サービス層     │  InMemoryリポジトリ
   ─────┼──────────────────┼─────
   │   単体テスト (Vitest)  │  純粋関数・ドメインモデル
  ──────┴───────────────────┴──────
```

§7.2の責務テーブルにも行を追加:
| CF Smoke | Workers Runtime互換性（Shift_JIS, crypto, Buffer, rewrites, SSR） | ビジネスロジック、Cookie、認証フロー |

また、§13として新セクション「CF Smokeテスト方針」を追加:
- 目的: `nodejs_compat` 経由のNode.js API互換性の回帰検知
- 対象: iconv-lite（Shift_JIS）、crypto（createHash）、Buffer、rewrites、SSR基本動作
- 実行環境: `wrangler dev`（Cloudflare Workers ローカルランタイム）
- テスト件数: 7件程度（固定。機能追加に連動して増えない）
- 増やす基準: 新しいNode.js固有APIを使い始めた場合のみ

### 2. Playwrightプロジェクト追加

`playwright.config.ts` に `cf-smoke` プロジェクトを追加:

```typescript
{
  name: "cf-smoke",
  testDir: "./e2e/cf-smoke",
  use: {
    baseURL: "http://localhost:8788",  // wrangler dev のデフォルトポート
  },
},
```

注意:
- `cf-smoke` プロジェクト用のwebServerは設定しない（`wrangler dev` は手動起動前提）
- 既存のwebServer設定（next dev）には影響を与えないこと

### 3. スモークテスト実装

`e2e/cf-smoke/workers-compat.spec.ts` を新規作成。以下の7件:

| # | テスト名 | リクエスト | 検証内容 |
|---|---|---|---|
| 1 | subject.txt Shift_JIS | `GET /battleboard/subject.txt` | 200 + Content-Type に charset=Shift_JIS |
| 2 | DATファイル rewrite | `GET /battleboard/dat/{任意key}.dat` | rewriteが動作（500でないこと） |
| 3 | bbsmenu.html Shift_JIS | `GET /bbsmenu.html` | 200 + Shift_JISレスポンス |
| 4 | bbsmenu.json JSON | `GET /bbsmenu.json` | 200 + Content-Type: application/json + JSON parse成功 |
| 5 | SETTING.TXT Shift_JIS | `GET /battleboard/SETTING.TXT` | 200 + Shift_JISレスポンス |
| 6 | bbs.cgi POST | `POST /test/bbs.cgi` with body | 200（Buffer.from + Shift_JISデコードの動作確認） |
| 7 | Web UI SSR | `GET /` | 200 + HTMLレスポンス |

注意:
- DBアクセスが必要なエンドポイント（subject.txt, .dat等）はデータがなくても200で空レスポンスが返ること、または404であることを確認すれば十分。500でないことがポイント
- bbs.cgiはShift_JISエンコードされたPOSTボディを送信し、レスポンスが返ることを確認

### 4. package.json にスクリプト追加

```json
"test:cf-smoke": "playwright test --project=cf-smoke"
```

## 必読ドキュメント（優先度順）

1. [必須] `docs/architecture/bdd_test_strategy.md` — 現在のテスト戦略書
2. [必須] `playwright.config.ts` — 現在のPlaywright設定
3. [参考] `e2e/api/senbra-compat.spec.ts` — 既存APIテスト（参考にして類似構造で実装）

## 完了条件

- [ ] `docs/architecture/bdd_test_strategy.md` にCF Smokeテスト方針が追記されている
- [ ] `playwright.config.ts` に `cf-smoke` プロジェクトが追加されている
- [ ] `e2e/cf-smoke/workers-compat.spec.ts` が存在し7件のテストが定義されている
- [ ] `package.json` に `test:cf-smoke` スクリプトが追加されている
- [ ] `npx vitest run` 全PASS（回帰なし）
- [ ] `npx cucumber-js` 全PASS（回帰なし）
- [ ] `npx playwright test --project=cf-smoke` は `wrangler dev` 起動中に実行可能であること（起動していない場合はスキップ/失敗で可）

## スコープ外

- `wrangler dev` の自動起動（手動起動前提）
- GitHub Actions CI への組み込み（別タスク）
- 既存テスト（e2e, api）の変更

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全4成果物の作成 + 回帰確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `docs/architecture/bdd_test_strategy.md` に CF Smokeテスト方針を追記
   - S7.1 テストピラミッド図に「CF Smoke」層を追加
   - S7.2 責務テーブルに CF Smoke 行を追加
   - S13 新セクション「CF Smokeテスト方針」を追加（S13.1〜S13.6）
2. `playwright.config.ts` に `cf-smoke` プロジェクトを追加
   - baseURL: `http://localhost:8788`（wrangler dev デフォルトポート）
   - webServer 設定なし（手動起動前提）
   - 既存 e2e プロジェクトの testIgnore に `**/cf-smoke/**` を追加して干渉を防止
3. `e2e/cf-smoke/workers-compat.spec.ts` を新規作成（7件のスモークテスト）
   - subject.txt Shift_JIS、DATファイル rewrite、bbsmenu.html Shift_JIS、bbsmenu.json JSON、SETTING.TXT Shift_JIS、bbs.cgi POST、Web UI SSR
4. `package.json` に `test:cf-smoke` スクリプトを追加

### テスト結果サマリー

- **vitest**: 15ファイル / 476テスト 全PASS（回帰なし）
- **cucumber-js**: 88シナリオ / 424ステップ 全PASS（回帰なし）
- **cf-smoke**: wrangler dev 未起動のため実行スキップ（定義の正しさは構文レベルで確認済み）
