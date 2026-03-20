---
task_id: TASK-147
sprint_id: Sprint-52
status: done
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-147
depends_on: []
created_at: 2026-03-18T12:00:00+09:00
updated_at: 2026-03-18T12:00:00+09:00
locked_files: []
---

## タスク概要

本番環境でCommandServiceが初期化されていないバグの修正方針を設計する。
Cloudflare Workers環境での `fs.readFileSync` 互換性を調査し、lazy初期化の具体的な実装パターンを提案する。

## 背景

`post-service.ts` の `commandServiceInstance` が `null` のまま本番稼働している。
setter DI（`setCommandService()`）はテストコード（`command_system.steps.ts` L157）からのみ呼ばれ、
本番のAPIルート（`/api/threads/[threadId]/posts/route.ts`, `/test/bbs.cgi/route.ts`）には初期化コードがない。

## 調査項目

### 1. Cloudflare Workers での fs.readFileSync 互換性

CommandServiceのコンストラクタ（`src/lib/services/command-service.ts`）は以下のコードで `config/commands.yaml` を読む:

```typescript
const yamlPath = commandsYamlPath ?? path.resolve(process.cwd(), "config/commands.yaml");
const yamlContent = fs.readFileSync(yamlPath, "utf-8");
```

確認すべき点:
- `wrangler.toml` の `compatibility_flags = ["nodejs_compat"]` で `fs` モジュールは利用可能か
- `@opennextjs/cloudflare` のバンドルプロセス（esbuild）が `fs.readFileSync` を静的解析してインライン化するか
- `process.cwd()` が Cloudflare Workers 上で何を返すか

調査方法:
- `@opennextjs/cloudflare` のドキュメント・ソースコード確認
- `.open-next/worker.js` のバンドル済みコード内の `commands.yaml` 参照を確認（ビルド済みファイルが存在する場合）
- 本番環境での実際の動作は未検証（CommandServiceが初期化されていないため問題が顕在化していない）

### 2. lazy初期化パターンの設計

以下の方針候補を評価し、推奨案を提示する:

**方針A: PostService内 lazy初期化（getter化）**
- `commandServiceInstance` のgetter内で null なら自動生成
- テスト時は従来通り `setCommandService(mock)` でオーバーライド

**方針B: commands.yaml の静的インポート**
- ビルド時にYAMLをJSオブジェクトとして解決する（webpack/esbuild loader）
- fs.readFileSync を排除

**方針C: 環境変数ベース設定**
- commands.yaml の内容を環境変数やハードコード定数に移行

**方針D: CommandService初期化の共通モジュール化**
- `src/lib/services/init-command-service.ts` を作成
- 各ルートのmodule scopeでimport

### 3. 評価基準

- Cloudflare Workers + Vercel 双方での動作保証
- テスト容易性（既存のsetCommandService DIとの互換性）
- 変更の影響範囲の最小化
- 将来のコマンド追加時の拡張性

## 必読ドキュメント（優先度順）

1. [必須] `src/lib/services/command-service.ts` — CommandServiceコンストラクタの依存
2. [必須] `src/lib/services/post-service.ts` L116-132 — setter DI パターン
3. [必須] `wrangler.toml` — Cloudflare Workers設定
4. [参考] `config/commands.yaml` — コマンド設定
5. [参考] `.open-next/` — バンドル済みコード（存在する場合）
6. [参考] `package.json` — @opennextjs/cloudflare のバージョン

## 出力（生成すべきファイル）

- `tmp/workers/bdd-architect_TASK-147/analysis.md` — 調査結果と推奨方針

## 完了条件

- [x] fs.readFileSync の Cloudflare Workers 互換性を結論付ける
- [x] 推奨する初期化パターンを1つ選定し、理由を記述する
- [x] 推奨パターンの擬似コードレベルの実装ガイドを提示する

## スコープ外

- コードの実装（設計のみ）
- BDDシナリオの変更
- OpenAPI仕様の変更

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全調査項目 + 推奨方針策定
- 次にすべきこと: 実装タスク（TASK-148等）の作成
- 未解決の問題: なし

### 進捗ログ

#### 2026-03-18 調査実施

1. **必読ドキュメント読了**
   - `command-service.ts` — fs.readFileSync + process.cwd() + YAML parse パターンを確認
   - `post-service.ts` L116-132 — setter DI パターン確認。setCommandService は全 API ルートから未呼出
   - `wrangler.toml` — `nodejs_compat` フラグ確認
   - `config/commands.yaml` — 3コマンド定義（tell, attack, w）
   - `package.json` — @opennextjs/cloudflare v1.17.1

2. **Cloudflare Workers fs.readFileSync 互換性調査**
   - `.open-next/` ディレクトリ不在（ビルド済みバンドル未生成）
   - `@opennextjs/cloudflare` ソース調査:
     - `load-manifest.js` — 「readFileSync is not supported by workerd」とコメントで明言
     - `find-dir.js` — 「existsSync is not supported by workerd」として静的置換
     - `dynamic-requires.js` — 動的 require を switch-case に変換
     - `bundle-server.js` — esbuild `platform: "node"` でバンドル。アプリコードの fs は未パッチ
   - **結論: fs.readFileSync は workerd で動作しない**

3. **影響範囲調査**
   - fs.readFileSync + YAML パターンが3箇所で使用:
     - `command-service.ts` L256 (config/commands.yaml)
     - `bot-service.ts` L264 (config/bot_profiles.yaml)
     - `fixed-message.ts` L47 (config/bot_profiles.yaml)
   - CommandService のみ本タスクスコープ

4. **方針A〜D評価 → 方針A+Bハイブリッドを推奨**
   - YAML → TS定数ファイル化（fs依存排除）+ PostService lazy初期化
   - 詳細は `tmp/workers/bdd-architect_TASK-147/analysis.md` に記載

### テスト結果サマリー
N/A（調査・設計タスク）

### 出力成果物
- `tmp/workers/bdd-architect_TASK-147/analysis.md` — 調査結果と推奨方針（全7章）
