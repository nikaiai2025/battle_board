# インシデント報告: CommandService 本番未初期化

- **発生日:** 2026-03-18（発見日。実際はサービス開始以来）
- **影響範囲:** コマンドシステム全体（!tell, !w, !attack）
- **深刻度:** 中（機能が完全に無効だが、書き込み自体は正常動作）
- **修正:** Sprint-52 (TASK-148)

## 症状

本番環境（Cloudflare Workers / Vercel）で、コマンド（`!tell >>5`, `!w >>3` 等）を含む書き込みを行ってもシステムメッセージが表示されない。コマンドが完全に無視され、通常の書き込みとして処理される。

## 直接原因

`post-service.ts` の `commandServiceInstance` が `null` のまま本番稼働。

```typescript
// post-service.ts L122
let commandServiceInstance: CommandServiceType | null = null;

// L366: commandServiceInstance が null なので常に false
if (!isSystemMessage && commandServiceInstance) { ... }
```

`setCommandService()` を呼ぶコードが本番のAPIルート（`/api/threads/[threadId]/posts/route.ts`、`/test/bbs.cgi/route.ts`）に存在しなかった。

## 根本原因

1. **setter DI パターンの構造的欠陥**: テストコードのみが `setCommandService()` を呼び、本番側には初期化コードがない
2. **BDDテストの原理的限界**: サービス層テスト（D-10 §1）はAPIルートを経由しないため、本番のDI配線漏れを検出できない
3. **Cloudflare Workers の fs 制約**: CommandService コンストラクタが `fs.readFileSync` で `config/commands.yaml` を読むが、Cloudflare Workers に fs が存在しないため、仮に初期化コードがあっても動作しなかった

## 修正内容 (Sprint-52, TASK-148)

### Step 1: YAML → TS 定数化

`config/commands.yaml` の内容を `config/commands.ts` に TypeScript 定数としてエクスポート。`fs.readFileSync` 依存を排除。

### Step 2: CommandService コンストラクタ変更

- `fs`, `path`, `yaml` パッケージの import を削除
- 第3引数を `commandsYamlPath?: string` → `commandsYamlOverride?: CommandsYaml` に変更
- デフォルトで `config/commands.ts` の定数を使用

### Step 3: PostService lazy 初期化導入

- `getCommandService()` を導入し、初回呼び出し時に CommandService を自動生成
- `setCommandService()` はテスト用DIとして維持（lazy 初期化をバイパス）
- `commandServiceAutoInitDone` フラグで二重初期化・再試行を防止

## テスト結果

- vitest: 47ファイル / 1,191テスト / 全PASS
- cucumber-js: 234シナリオ (227 passed, 7 pending) / 0 failed

## 横展開

同様の `fs.readFileSync` パターンが以下にも存在する（本スプリントスコープ外）:

| ファイル | 読み込み対象 |
|---|---|
| `src/lib/services/bot-service.ts` L264 | `config/bot_profiles.yaml` |
| `src/lib/services/bot-strategies/content/fixed-message.ts` L47 | `config/bot_profiles.yaml` |

BotService は GitHub Actions (cron) 経由で実行されるため即座の問題はないが、同パターンの TS 定数化を将来的に適用すべき。

## 再発防止策

1. **構造的防止（実施済み）:** setter DI → lazy 初期化への変更（LL-004）
2. **検出強化（次スプリント予定）:** APIテストでコマンド実行→inlineSystemInfo表示の検証を追加
3. **教訓記録（実施済み）:** `docs/architecture/lessons_learned.md` LL-004

## タイムライン

| 時刻 | イベント |
|---|---|
| サービス開始〜 | CommandService 未初期化のまま稼働（潜在バグ） |
| 2026-03-18 | 人間が手動確認で発見 |
| 2026-03-18 | インシデント分析完了、根本原因特定 |
| 2026-03-18 | TASK-147（設計）+ TASK-148（実装）完了、全テストPASS |
