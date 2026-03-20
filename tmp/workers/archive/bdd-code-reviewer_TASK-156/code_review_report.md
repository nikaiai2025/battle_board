# Code Review Report: Sprint-46 ~ 55

> Reviewer: bdd-code-reviewer
> Task: TASK-156
> Date: 2026-03-19
> Scope: Sprint-46 ~ 55 で変更された実装コード 14 ファイル + インフラ 3 ファイル

---

## 指摘事項

### [HIGH-001] Internal API 認証のタイミング攻撃耐性

ファイル: `src/lib/middleware/internal-api-auth.ts:42`

問題点: `token === apiKey` による単純な文字列比較を使用しており、タイミング攻撃に対して脆弱である。コード内コメントで「固定長キーの比較であれば単純比較でも実用上問題ない」と記述されているが、BOT_API_KEY は固定長とは限らず（運用者が任意に設定する）、文字列比較の早期打ち切りにより、正しいトークンの先頭部分をバイト単位で推測される可能性がある。Internal API はインターネットから到達可能であるため、実用上のリスクは低くないと判断する。

```typescript
// 現状（不適切）
return token === apiKey;

// 修正案: crypto.timingSafeEqual を使用する
import { timingSafeEqual } from "crypto";

const tokenBuf = Buffer.from(token);
const keyBuf = Buffer.from(apiKey);
if (tokenBuf.length !== keyBuf.length) return false;
return timingSafeEqual(tokenBuf, keyBuf);
```

重要度: **HIGH** -- セキュリティ観点。認証トークンの比較にはタイミング安全な関数を使用すべき。

---

### [HIGH-002] daily-stats ルートにおける依存方向違反 + 巨大なルートファイル

ファイル: `src/app/api/internal/daily-stats/route.ts`

問題点1 (依存方向違反): `app/` レイヤーが `@/lib/infrastructure/supabase/client` を直接 import している（15行目）。Source_Layout ルールでは `app/ -> lib/services/ -> lib/domain/ / lib/infrastructure/` と定められており、`app/` からの `infrastructure/` 直接参照は違反である。

```typescript
// 現状（不適切: app/ -> infrastructure/ 直接参照）
import { supabaseAdmin } from "@/lib/infrastructure/supabase/client";

// 修正案: Service 層または Repository 層にロジックを移譲する
// 例: src/lib/services/daily-stats-service.ts を新設し、
//     集計ロジックをそちらに配置する
```

問題点2 (巨大なルートファイル): 301行の route.ts に11個の集計クエリ関数がインライン定義されている。ルートハンドラの責務は「リクエスト受付 -> Service 呼び出し -> レスポンス返却」に限定すべきであり、集計ロジックは Service / Repository 層に分離すべきである。

重要度: **HIGH** -- 依存方向ルール違反。アーキテクチャ制約の遵守は横断的制約である。

---

### [HIGH-003] Discord ログインルートのエラーハンドリング欠落

ファイル: `src/app/api/auth/login/discord/route.ts:38-51`

問題点: `RegistrationService.loginWithDiscord()` が例外をスローした場合の try-catch が存在しない。Supabase や Discord API の一時的障害により例外が発生すると、Next.js のデフォルト 500 エラーページがレンダリングされ、内部スタックトレースがクライアントに漏洩する可能性がある。同様の Internal API ルート（bot/execute, daily-reset, daily-stats）は全て try-catch で 500 エラーを安全にハンドリングしている。

```typescript
// 現状（不適切: try-catch なし）
export async function POST(req: NextRequest): Promise<NextResponse> {
    const origin = req.nextUrl.origin;
    const redirectTo = `${origin}/api/auth/callback?flow=login`;
    const result = await RegistrationService.loginWithDiscord(redirectTo);
    return NextResponse.json(...);
}

// 修正案:
export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const origin = req.nextUrl.origin;
        const redirectTo = `${origin}/api/auth/callback?flow=login`;
        const result = await RegistrationService.loginWithDiscord(redirectTo);
        return NextResponse.json(
            { success: true, redirectUrl: result.redirectUrl },
            { status: 200 },
        );
    } catch (err) {
        console.error("[POST /api/auth/login/discord] Error:", err);
        return NextResponse.json(
            { success: false, error: "Discord認証の開始に失敗しました" },
            { status: 500 },
        );
    }
}
```

重要度: **HIGH** -- エラー情報漏洩リスク。テストコード (route.test.ts:127-133) でも `rejects.toThrow()` でキャッチされることを確認しているが、これは「例外がそのまま伝搬する」ことの検証であり、プロダクションコードとしては不適切。

---

### [HIGH-004] Discord 本登録ルートのエラーハンドリング欠落

ファイル: `src/app/api/auth/register/discord/route.ts:43-80`

問題点: HIGH-003 と同様に、`RegistrationService.registerWithDiscord()` の例外が未捕捉。認証チェック後のサービス呼び出しで例外が発生した場合、スタックトレースが漏洩する。

重要度: **HIGH** -- HIGH-003 と同類の問題。

---

### [MEDIUM-001] daily-stats の `getActiveUsers` / `getActiveThreads` が制限なしの全件取得

ファイル: `src/app/api/internal/daily-stats/route.ts:43-54`, `80-90`

問題点: `getActiveUsers()` と `getActiveThreads()` は、対象日のレコードを全件取得してからアプリケーション側で `Set` によるユニーク集計を行っている。`select("author_id")` / `select("thread_id")` に LIMIT がなく、書き込み数が膨大な場合（例: 1日1万件以上）にメモリ消費が増大する。Internal API であるため即座に問題になる可能性は低いが、SQL の `COUNT(DISTINCT ...)` を利用するか、RPC 関数化して DB 側で完結させることが望ましい。

```typescript
// 現状: 全件取得 + アプリケーション側 Set
const { data } = await supabaseAdmin
    .from("posts")
    .select("author_id")
    .gte(...)
    .lt(...);
const uniqueUsers = new Set((data ?? []).map((r) => r.author_id));

// 改善案: RPC / DB View で COUNT(DISTINCT author_id) を実行する
```

重要度: **MEDIUM** -- スケーラビリティ懸念。MVP では問題ないが、成長に伴い改善が必要。

---

### [MEDIUM-002] daily-stats の `getCurrencyInCirculation` が全件取得

ファイル: `src/app/api/internal/daily-stats/route.ts:93-103`

問題点: `getCurrencyInCirculation()` は `currencies` テーブルの `balance` を全件取得してアプリケーション側で合計している。ユーザー数の増加に伴い、全行フェッチのコストが増大する。Supabase の `.select("balance")` は全行を返すため、SQL の `SUM()` を RPC 関数化して DB 側で集計すべきである。

重要度: **MEDIUM** -- MEDIUM-001 と同種のスケーラビリティ懸念。

---

### [MEDIUM-003] OAuth callback の `userId` がクエリパラメータで渡されている

ファイル: `src/app/api/auth/register/discord/route.ts:72`, `src/app/api/auth/callback/route.ts:55`

問題点: Discord 本登録フローで `userId` を OAuth redirectTo URL のクエリパラメータとして付与している (`?flow=register&userId=${userId}`)。このフローでは Supabase の OAuth state パラメータ経由で安全に渡すことが理想だが、redirectTo のクエリパラメータに含めることで、OAuth プロバイダー（Discord/Supabase）経由で userId がログに残る可能性がある。userId 自体は UUID であり直接的なセキュリティリスクは限定的だが、callback 側で code 検証後に Supabase Auth のセッションから userId を再確認するなどの補強が望ましい。

重要度: **MEDIUM** -- OAuth のベストプラクティスとして、認可サーバーを経由する URL にアプリケーション固有の識別子を含めることは避けるべき。ただし、callback 側で code 検証を経由するため、userId の偽造による攻撃は Supabase 側で防御される。

---

### [MEDIUM-004] bot-service.ts の `bulkReviveEliminated` が N+1 更新

ファイル: `src/lib/infrastructure/repositories/bot-repository.ts:436-477`

問題点: `bulkReviveEliminated()` は eliminated 状態のボットを全件取得した後、各ボットに対して個別に UPDATE を発行している（N+1 問題）。コメントで「Supabase は UPDATE ... SET hp = max_hp のような自己参照 UPDATE をサポートしない」と説明されているが、RPC 関数を使用すれば単一クエリで自己参照 UPDATE が可能である。MVP でボット数が少ない（数体程度）うちは問題ないが、Phase 4 でユーザー作成ボットが増加した場合にボトルネックになる。

重要度: **MEDIUM** -- 現時点ではボット数が限定的なため許容範囲だが、将来に向けた改善事項。

---

### [MEDIUM-005] bot-service.ts の `performDailyReset` Step 4.5 の二重 findAll

ファイル: `src/lib/services/bot-service.ts:599-613`

問題点: `performDailyReset()` の Step 4.5 で、`botsRevived > 0` の場合に `findAll()` を再度呼び出して全ボットを取得し直している（Step 1 の `findAll()` と合わせて2回の全件取得）。復活したボットの ID リストを `bulkReviveEliminated()` の戻り値に含めることで、二重フェッチを回避できる。

重要度: **MEDIUM** -- パフォーマンス改善。現時点では即座の問題にはならない。

---

### [LOW-001] senbra dat ルートの `app/` から `infrastructure/` 直接 import

ファイル: `src/app/(senbra)/[boardId]/dat/[threadKey]/route.ts:20-24`

問題点: 専ブラルートが `DatFormatter`, `ShiftJisEncoder`, `PostRepository`, `ThreadRepository` を `@/lib/infrastructure/` から直接 import している。Source_Layout ルールでは `app/` は `lib/services/` を呼ぶべきとされている。ただし、検索結果から他の専ブラルート（subject.txt, bbs.cgi, SETTING.TXT 等）でも同様のパターンが確認されたため、これは専ブラルートのプロジェクト共通パターンとして確立していると推測される。Sprint-46~55 の変更範囲で新たに導入されたパターンではないため、重要度を下げる。

重要度: **LOW** -- 既存の専ブラルート共通パターンの踏襲。将来的にリファクタリングを検討。

---

### [LOW-002] bot-service.ts の `generateFakeDailyId` が暗号学的に安全でない乱数を使用

ファイル: `src/lib/services/bot-service.ts:1070-1077`

問題点: 偽装日次リセットID の生成に `Math.random()` を使用している。この ID はボットの「人間偽装」に使用されるため、予測可能な乱数では理論上パターン分析による推測が可能になる。`crypto.getRandomValues()` の使用が望ましい。ただし、ID は毎日リセットされ、ゲーム上の影響は限定的であるため、重要度は低い。

重要度: **LOW** -- ゲーム上の公平性に軽微な影響。

---

## 対象外の確認結果（問題なし）

以下の観点は確認済みで、問題は検出されなかった。

1. **セキュリティ: ハードコードされた認証情報** -- 全対象ファイルにハードコードされたAPIキー、パスワード、トークン等は存在しない。環境変数 (`process.env.BOT_API_KEY`, `process.env.NODE_ENV`) を使用している。
2. **セキュリティ: Internal API の BOT_API_KEY 未設定時の挙動** -- `internal-api-auth.ts` は `!apiKey` チェックにより空文字・未設定時に全リクエストを拒否する（安全側に倒れる）。テストで網羅されている。
3. **エラーハンドリング: Internal API ルート** -- `bot/execute`, `daily-reset`, `daily-stats` の3ルートは全て try-catch で 500 エラーを適切にハンドリングしており、内部エラーの詳細をクライアントに漏洩しない。
4. **横断的制約: AIボットの書き込みパス** -- `bot-service.ts` の `executeBotPost()` は `PostService.createPost` を `isBotWrite: true` で呼び出しており、「AIボットの書き込みはユーザーの書き込みと同一のAPIを通じて行い、直接DBを書き換えない」制約に準拠している。
5. **テストカバレッジ** -- 新規ファイル7件に対し、テストファイル7件（+既存テスト4件の修正）が確認された。Internal API 認証、OAuth コールバック、BOT 投稿実行、日次リセット、日次統計、BOT スケジューリングの各テストが存在する。
6. **ユビキタス言語** -- コード内のコメント・変数名はユビキタス言語辞書に準拠している（例: `bot` ではなく適切な文脈での使用、`dailyId` = 日次リセットID、`reveal` = BOTマーク付与 等）。
7. **Cookie セキュリティ** -- `callback/route.ts` の Cookie 設定は `httpOnly: true`, `secure: process.env.NODE_ENV === "production"`, `sameSite: "lax"` と適切。
8. **GitHub Actions ワークフロー** -- Secrets (`BOT_API_KEY`, `DEPLOY_URL`) を使用しており、ハードコード値なし。cron スケジュールも適切。
9. **SQL マイグレーション** -- `00015_bot_next_post_at.sql` は `IF NOT EXISTS` を使用した冪等なマイグレーション。既存データの初期値設定も含まれている。
10. **domain モデル (bot.ts)** -- 外部依存なしの純粋な interface 定義。依存方向ルールに準拠。

---

## レビューサマリー

| 重要度   | 件数 | ステータス |
|----------|------|-----------|
| CRITICAL | 0    | pass      |
| HIGH     | 4    | warn      |
| MEDIUM   | 5    | info      |
| LOW      | 2    | note      |

判定: **WARNING** -- マージ前に4件のHIGH問題の解決を推奨する。

- HIGH-001: タイミング安全な比較関数への置き換え
- HIGH-002: daily-stats の依存方向違反の解消 + Service 層への分離
- HIGH-003/004: Discord OAuth ルートの try-catch 追加

CRITICAL は0件のため、マージを完全にブロックする致命的問題はない。HIGH の4件は全て修正が容易であり（推定作業量: 合計1~2時間）、次スプリントの冒頭での対応を推奨する。
