# R-012 Defense Report

レビュアー: Blue Team
日付: 2026-03-25

---

## ATK-012-1 [CRITICAL] not_admin 判定時に Supabase Auth セッションが破棄されない

**判定: REJECT**

**根拠:**

攻撃レポートは「`access_token` を直接 `verifyAdminSession` に渡すバイパス経路が存在する（ATK-012-3 参照）」を前提とする連鎖攻撃として構成されている。しかしこの前提は成立しない。

`verifyAdminSession`（`src/lib/services/auth-service.ts` L474–503）は以下の2段階検証を行う。

1. `supabaseAdmin.auth.getUser(sessionToken)` でトークンが有効かを確認
2. `admin_users` テーブルに対象ユーザーが存在するかを確認し、存在しない場合は `null` を返す（L493–495）

すなわち、`not_admin` ケースのユーザーは Supabase Auth セッションが生存していても、`verifyAdminSession` の第2段階（L487–495）で必ず弾かれる。`admin_session` Cookie は `POST /api/admin/login` の成功時にのみ発行されるため（`route.ts` L86–101）、`not_admin` ユーザーの `access_token` が Cookie として設定されることはない。

攻撃者がこの `access_token` を「直接 `verifyAdminSession` に渡す」経路は存在しない。全ての管理者向けエンドポイントは `admin_session` Cookie を読み取る実装であり、任意のトークンを外部から注入できるインターフェースは確認されない。

孤立セッションの蓄積については、Supabase Auth 側のデフォルト有効期限（1時間）での自然失効に委ねており、管理画面への侵害経路には繋がらない。現実的な被害シナリオが成立しないため REJECT とする。

---

## ATK-012-2 [CRITICAL] `createAuthClient` が `SUPABASE_SERVICE_ROLE_KEY` で `signInWithPassword` を実行する

**判定: ACCEPT**

**根拠:**

`createAuthClient()`（`admin-user-repository.ts` L34–38）は `SUPABASE_SERVICE_ROLE_KEY` でクライアントを生成している。一方、`src/lib/infrastructure/supabase/client.ts` L46–50 には同一問題に対するより適切な解決策として `createAuthOnlyClient()` が既に実装されており、`anon` キー + `persistSession: false` + `autoRefreshToken: false` で使い捨てクライアントを生成する。コメントにも「同一パターン」として `admin-user-repository.ts` が参照されている。

これは同じコードベース内に最小権限原則に沿った実装（`createAuthOnlyClient`）が存在するにもかかわらず、`admin-user-repository.ts` だけが `service_role` キーを使い続けている不整合である。

攻撃レポートが指摘する「`.from(...)` を追加するコード変更が入った場合に RLS バイパスが即座に有効化される」リスクは現実的である。`createAuthClient()` のコメントには RLS バイパスの危険性への注記がなく、将来の修正者が意図を誤解して流用するリスクが高い。`signInWithPassword` 専用であれば `service_role` キーは技術的必然性がなく、`anon` キーで代替可能。修正として `createAuthOnlyClient()` への置き換えが望ましい。

---

## ATK-012-3 [HIGH] `POST /api/admin/login` にレート制限がなく、パスワードブルートフォースが無制限に可能

**判定: REJECT**

**根拠:**

本指摘はBDDシナリオのスコープ外であり、かつ Supabase Auth インフラ層でカバーされる。

BDDシナリオ（`context.md`）は「正しい認証情報でのログイン成功」「誤ったパスワードでのログイン失敗」の2シナリオのみを受け入れ基準としており、レート制限・ロックアウトの振る舞いはシナリオに含まれない。CLAUDE.md の禁止事項「BDDシナリオに対応しない機能を独自判断で実装する（スコープ逸脱の禁止）」が適用される。

また、ブルートフォース防御は Supabase Auth のデフォルト機能（Auth > Rate Limits）として提供されており、インフラ設定の責務である。攻撃レポートは「実装レベルの防御層が存在しない」と指摘するが、インフラ層の設定で対応することはシステム設計として適切であり、アプリケーション層での二重実装は不要である。

本指摘を採用する場合はBDDシナリオへの追加（`features/authentication.feature` 変更）が必要となり、CLAUDE.md の「要件定義書・BDDシナリオ集を人間の承認なしに変更する」禁止事項に抵触する。人間のレビュー・承認を経てシナリオに追加されるべき要件であるため、現時点ではスコープ外として REJECT とする。
