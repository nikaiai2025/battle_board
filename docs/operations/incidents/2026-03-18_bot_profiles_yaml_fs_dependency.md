# インシデント報告: bot_profiles.yaml の fs.readFileSync 依存による全コマンド無効化

- **発生日:** 2026-03-18
- **発見方法:** 人間による本番手動テスト（`!w >>1` コマンド実行）
- **影響範囲:** 全コマンド（!w, !tell, !attack）が本番で無効化
- **影響期間:** 2026-03-18 00:41（最終デプロイ）〜 2026-03-18 修正デプロイ
- **修正コミット:** `4b4de1f`（bot_profiles.yaml の TS定数化）

## 症状

本番環境で `!w >>1` を投稿しても、システムメッセージ（`>>1 (ID:xxx) に草 🌱(計N本)`）が表示されない。`inlineSystemInfo` が `null` のままDBに保存される。`!tell`, `!attack` も同様に無効。

## 直接原因

`BotService` コンストラクタ（`bot-service.ts:264`）が `fs.readFileSync("config/bot_profiles.yaml")` を呼び出し、Cloudflare Workers (workerd) で例外が発生。

```
[PostService] CommandService lazy init failed:
Error: no such file or directory, readAll '/bundle/config/bot_profiles.yaml'
```

例外の伝播チェーン:

```
getCommandService()  [post-service.ts]
  → new CommandService(...)  [コンストラクタ]
    → attack: enabled: true  [config/commands.ts]
      → require("./bot-service").createBotService()  [command-service.ts:303]
        → new BotService(repos...)  [bot-service.ts:250]
          → fs.readFileSync("config/bot_profiles.yaml")  [bot-service.ts:264]
            ← workerd で fs が使えず例外発生
```

`getCommandService()` 内の try-catch が例外を吸収し `commandServiceAutoInitDone = true` を設定するため、以降の全リクエストで `commandServiceInstance = null` が返り続け、全コマンドが永久に無効化された。

## 根本原因

commit `68fe555` で `commands.yaml` の fs.readFileSync 依存を除去した際、同じ問題を持つ `bot_profiles.yaml` を見落とした。`CommandService` → `AttackHandler` → `BotService` → `fs.readFileSync` という間接的な依存チェーンであったため、`commands.yaml` の修正スコープに含まれなかった。

## 修正内容

`commands.yaml` → `commands.ts` の先例と同じパターンで `bot_profiles.yaml` をTS定数化:

| 操作 | ファイル |
|---|---|
| 新規作成 | `config/bot-profiles.ts`（YAMLのTS定数版） |
| fs依存除去 | `src/lib/services/bot-service.ts` |
| fs依存除去 | `src/lib/services/bot-strategies/content/fixed-message.ts` |
| 引数型変更 | `src/lib/services/bot-strategies/strategy-resolver.ts` |
| テスト修正 | `fixed-message.test.ts`, `strategy-resolver.test.ts` |

## 再発防止

1. **防止（構造）:** `src/lib/` 配下に `fs` モジュールの import が残っていないことを確認済み
2. **防止（lint）:** ESLint `no-restricted-imports` で `src/lib/` 配下の `fs` import を禁止する（TODO）
3. **検出:** デプロイ後のスモークテストでコマンド実行を自動検証する（TODO）

## 関連

- `docs/operations/incidents/2026-03-18_command_service_not_initialized.md` — 前段の障害（setter DI未呼び出し）
- `docs/architecture/lessons_learned.md` LL-004 — setter DI の教訓
- `docs/architecture/lessons_learned.md` LL-006 — 本件の教訓
