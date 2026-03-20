# E2Eフィクスチャ方式移行 + 管理者削除フロー実装レポート

> 実施日: 2026-03-20
> 実施者: bdd-architect

## 対象タスク

| # | タスク | D-10 参照 |
|---|---|---|
| 1 | フィクスチャ方式への移行 — e2e/fixtures/ 作成、e2e/flows/ への移動、e2e/prod/smoke.spec.ts 廃止、Playwright config更新 | §10.1.1, §10.3.3 |
| 3 | 管理者テストデータ削除フロー — Phase Bの検証範囲に明記済みだが未実装 | §10.3.2 |

## D-10 変更

§10.1.1 `authenticate` ローカル実装を「AuthModal UI経由」→「Supabase REST で user + edge_token 作成 → Cookie設定」に変更。設計根拠を追記。

## ファイル変更一覧

### 新規作成

| ファイル | 役割 |
|---|---|
| `e2e/fixtures/index.ts` | カスタムフィクスチャ定義。`test` と `expect` をエクスポート。specファイルはここから import する |
| `e2e/fixtures/auth.fixture.ts` | `authenticate` / `adminSession` の環境別実装（ローカル: DB直接シーディング / Supabase Auth、本番: Cookie設定 / admin login API） |
| `e2e/fixtures/data.fixture.ts` | `seedThread` / `cleanup` の環境別実装（ローカル: Supabase REST、本番: アプリAPI / 管理者API） |
| `e2e/flows/basic-flow.spec.ts` | Phase B 環境共通テスト。4テストケース（コマンド, !abeshinzo, 専ブラAPI整合, 管理者削除） |
| `e2e/flows/auth-flow.spec.ts` | Phase B ローカル限定テスト。未認証→AuthModal→認証→リトライの連結フロー |

### 書換

| ファイル | 変更内容 |
|---|---|
| `e2e/smoke/navigation.spec.ts` | `@playwright/test` → `../fixtures` に import 変更。helpers直接呼び出し → フィクスチャ経由に移行。マイページテストは `authenticate` フィクスチャ使用に簡素化 |
| `playwright.config.ts` | e2e プロジェクトの testDir を `./e2e` → `./e2e/flows` に変更。testIgnore 不要に |
| `playwright.prod.config.ts` | testDir `./e2e/prod` → `prod-smoke`（e2e/smoke）+ `prod-flows`（e2e/flows）の2プロジェクト構成。isProduction=true をフィクスチャオプションとして注入。.env.prod.smoke 読み込み追加 |
| `docs/architecture/bdd_test_strategy.md` | §10.1.1 フィクスチャ表の authenticate ローカル実装変更 + 設計根拠追記 |

### 削除

| ファイル | 理由 |
|---|---|
| `e2e/basic-flow.spec.ts` | `e2e/flows/basic-flow.spec.ts` + `e2e/flows/auth-flow.spec.ts` に分離移動 |
| `e2e/prod/smoke.spec.ts` | フィクスチャの isProduction 切替で吸収。D-10「同一テストケースを環境を変えて2回実行する」に準拠 |
| `e2e/prod/` | ディレクトリごと削除 |

### 変更なし（存続）

| ファイル | 理由 |
|---|---|
| `e2e/helpers/auth.ts` | `completeAuth()` を auth-flow.spec.ts が直接使用 |
| `e2e/helpers/database.ts` | 旧コード。fixtures の local 実装が同等機能を内包したため、今後の整理対象 |
| `e2e/helpers/turnstile.ts` | `mockTurnstile()` を auth-flow.spec.ts が直接使用 |
| `e2e/api/*` | 変更対象外 |
| `e2e/cf-smoke/*` | 変更対象外 |

## フィクスチャ設計

### インターフェース

```typescript
type TestFixtures = {
  authenticate: { userId: string; edgeToken: string };
  adminSessionToken: string;
  seedThread: { threadId: string; threadKey: string };
  cleanup: (threadIds?: string[]) => Promise<void>;
};
type TestOptions = {
  isProduction: boolean;  // config から注入
};
```

### 環境別実装

| フィクスチャ | ローカル | 本番 |
|---|---|---|
| `authenticate` | Supabase REST で users + currencies + edge_tokens 作成 → Cookie設定 | `.env.prod.smoke` の PROD_SMOKE_EDGE_TOKEN → Cookie設定 |
| `adminSessionToken` | Supabase Auth でテスト管理者を冪等作成 → `/api/admin/login` | `/api/admin/login`（PROD_ADMIN_EMAIL/PASSWORD） |
| `seedThread` | Supabase REST INSERT（users → threads → posts） | `POST /api/threads`（authenticate 済み edge-token 使用） |
| `cleanup` | Supabase REST DELETE（全件） | `DELETE /api/admin/threads/{threadId}`（admin_session 使用） |
| `isProduction` | `false`（デフォルト） | `true`（prod config で注入） |

### cleanup の遅延取得パターン

`cleanup` フィクスチャは `adminSessionToken` フィクスチャに依存しない。管理者セッションは `cleanup(threadIds)` が本番で呼ばれた時のみ遅延取得する。これにより、ナビゲーションテストの `beforeEach` で `cleanup()` を呼んでも不要な管理者認証が走らない。

## テストケース一覧

### flows/basic-flow.spec.ts（環境共通 — 4本）

| テスト名 | 検証内容 | D-10 参照 |
|---|---|---|
| コマンド書き込み時に inlineSystemInfo がレス末尾に表示される | !w >>1 → post-inline-system-info 表示 | §10.3.2 コマンドシステム |
| 隠しコマンド !abeshinzo で★システム名義の独立レスが投稿される | !abeshinzo → >>3 に★システムレス | §10.3.2 コマンドシステム |
| 書き込んだスレッドが subject.txt と DAT に反映される | seedThread → subject.txt に threadKey.dat 存在、DAT 取得成功 | §10.3.2 専ブラAPI整合 |
| 管理者がテストスレッドを削除し公開APIから消える | seedThread → admin DELETE → /api/threads + subject.txt から消失 | §10.3.2 管理者操作 |

### flows/auth-flow.spec.ts（ローカル限定 — 1本）

| テスト名 | 検証内容 | D-10 参照 |
|---|---|---|
| 未認証でスレッド作成→AuthModal認証→作成成功→レス書き込みが完結する | 401→AuthModal→completeAuth→リトライ成功→レス書き込み | §10.3.1 ローカル限定テスト |

## 実行方法

```bash
# ローカル全テスト
npx playwright test

# ローカル: フロー検証のみ
npx playwright test --project=e2e

# ローカル: ナビゲーションのみ
npx playwright test --project=smoke

# 本番
npx playwright test --config=playwright.prod.config.ts
```

## 前提条件

- **ローカル:** Supabase Local が起動していること。管理者アカウントはフィクスチャが自動作成（冪等）
- **本番:** `.env.prod.smoke` に以下が設定されていること:
  - `PROD_SMOKE_EDGE_TOKEN` — スモーク用 edge-token
  - `PROD_ADMIN_EMAIL` — 管理者メールアドレス
  - `PROD_ADMIN_PASSWORD` — 管理者パスワード
  - `PROD_BASE_URL`（任意）— デフォルト: `https://battle-board.shika.workers.dev`

## セッション引き継ぎ後の追加修正

### バグ修正: `seedThreadProd()` レスポンスパース

`POST /api/threads` は `Thread` オブジェクトを直接返す（`{ id, threadKey, ... }`）。
`seedThreadProd()` が `body.threadId` を参照していたが、正しくは `body.id`。修正済み。

- `e2e/fixtures/data.fixture.ts`: `body.threadId` → `body.id` に修正

### デッドコード削除: `e2e/helpers/database.ts`

fixtures 移行で全 spec ファイルのインポートが fixtures 経由に切り替わり、`e2e/helpers/database.ts` への参照がゼロになった。削除済み。
