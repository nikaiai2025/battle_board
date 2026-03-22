# コードレビュー: specialist_browser_compat.feature 配置変更と参照リンク書き換え

レビュー日: 2026-03-22
レビュー対象: specialist_browser_compat.feature の旧パス(`features/constraints/`)から新パス(`features/`)への移動に伴う参照書き換え

## レビュー方法

git statusがcleanのため、現在のコードベース全体に対して以下を確認した:
1. featureファイルの実際の配置場所
2. cucumber.js の paths/require 設定が新パスを正しく参照しているか
3. ソースコード・テストファイル内の See参照コメントが新パスに更新されているか
4. 旧パス(`features/constraints/`, `features/phase1/`, `features/phase2/`)の残存箇所
5. コメント以外のコードロジック（import文、ファイルパス参照、assertion等）に意図しない変更がないか

---

## カテゴリ1: 問題なし

### 1-1. featureファイルの配置

- `features/specialist_browser_compat.feature` に存在（旧: `features/constraints/specialist_browser_compat.feature`）
- 全20 feature ファイルがフラット構成（`features/*.feature` + `features/integration/crud.feature`）に統一済み

### 1-2. cucumber.js の設定

| 確認項目 | 結果 |
|---|---|
| default.paths | `"features/specialist_browser_compat.feature"` -- 新パスで正しい |
| default.require | `"features/step_definitions/specialist_browser_compat.steps.ts"` -- 変更なし、正しい |
| integration.paths | specialist_browser_compat は含まれない（元から除外） -- 影響なし |
| name フィルタ | 変更なし -- 影響なし |

### 1-3. ステップ定義 (specialist_browser_compat.steps.ts)

- import文: `@cucumber/cucumber`, `../../src/lib/domain/models/post` 等 -- パス変更による影響なし
- See参照: `features/specialist_browser_compat.feature` -- 新パスに更新済み
- テストロジック: コメント変更のみであり、Given/When/Then のステップ実装に変更なし

### 1-4. next.config.ts

- See参照: `features/specialist_browser_compat.feature @DATファイルが所定のフォーマットで返される` -- 新パス
- コード: rewrites設定に変更なし。DATファイルリライトとkako形式リライトの設定値はそのまま

### 1-5. src/app/(senbra)/test/bbs.cgi/route.ts (40行変更)

- 全20箇所のSee参照が `features/specialist_browser_compat.feature` の新パスで統一
- import文: 変更なし（`@/lib/` パスエイリアス使用、feature パスに依存しない）
- コードロジック: POST handler, handleCreateThread, handleCreatePost, setEdgeTokenCookie 等の全関数ロジックに変更なし

### 1-6. e2e/api/senbra-compat.spec.ts

- See参照: `features/specialist_browser_compat.feature` -- 新パス
- テストロジック: Playwright APIテストのassert/expect等に変更なし

### 1-7. src/lib/infrastructure/encoding/shift-jis.ts

- See参照: 7箇所すべて `features/specialist_browser_compat.feature` の新パス
- コードロジック: decodeHtmlNumericReferences, ShiftJisEncoder.encode/decode/decodeFormData 等に変更なし

### 1-8. src/lib/infrastructure/encoding/__tests__/shift-jis.test.ts

- See参照: 冒頭の5シナリオ参照が新パス
- テストロジック: describe/it ブロックの assertion に変更なし

### 1-9. src/lib/services/auth-service.ts

- See参照: 4箇所（authentication.feature参照含む）-- 新パス
- コードロジック: VerifyResult型、reduceIp、expandIpv6 等に変更なし

### 1-10. src/lib/constants/cookie-names.ts

- See参照: `features/specialist_browser_compat.feature` -- 新パス
- コードロジック: 定数定義 `EDGE_TOKEN_COOKIE`, `ADMIN_SESSION_COOKIE` に変更なし

### 1-11. src/lib/infrastructure/repositories/auth-code-repository.ts

- See参照: `features/specialist_browser_compat.feature @専ブラ認証フロー` -- 新パス
- コードロジック: AuthCode interface、CRUD操作に変更なし

### 1-12. その他ソースファイル (senbra配下のroute.ts群、adapter群、テスト群)

以下のファイル群はSee参照コメントの更新のみであり、import文・コードロジック・assertion に変更なし:
- `src/app/(senbra)/[boardId]/subject.txt/route.ts`
- `src/app/(senbra)/[boardId]/dat/[threadKey]/route.ts`
- `src/app/(senbra)/[boardId]/SETTING.TXT/route.ts`
- `src/app/(senbra)/[boardId]/kako/[...path]/route.ts`
- `src/app/(senbra)/test/read.cgi/[boardId]/[key]/route.ts`
- `src/app/(senbra)/layout.tsx`
- `src/app/(senbra)/bbsmenu.json/route.ts`
- `src/app/(senbra)/bbsmenu.html/route.ts`
- `src/app/(web)/auth/verify/page.tsx`
- `src/app/api/auth/auth-code/route.ts`
- `src/lib/infrastructure/adapters/*.ts` (4ファイル)
- `src/lib/infrastructure/adapters/__tests__/*.test.ts` (4ファイル)
- `src/__tests__/app/(senbra)/**/*.test.ts` (3ファイル)
- `src/lib/services/__tests__/auth-service.test.ts`
- `src/app/(senbra)/__tests__/route-handlers.test.ts`
- `src/app/(web)/auth/verify/__tests__/verify-page-logic.test.ts`
- `src/__tests__/app/(senbra)/test/bbs.cgi/pat-integration.test.ts`
- `features/step_definitions/thread.steps.ts`
- `features/step_definitions/authentication.steps.ts`
- `features/support/in-memory/auth-code-repository.ts`
- `features/user_registration.feature`
- `e2e/flows/basic-flow.spec.ts`

---

## カテゴリ2: 要確認（旧パス残存箇所）

以下のファイルに旧ディレクトリ構成（`features/constraints/`, `features/phase1/`, `features/phase2/`）への参照が残存している。

### [LOW] L-01: .claude/rules/Source_Layout.md に旧ディレクトリ構成が残存

ファイル: `.claude/rules/Source_Layout.md` 57-71行

```
features/
  phase1/
    thread.feature
    ...
  phase2/
    command_system.feature
    ...
  constraints/
    specialist_browser_compat.feature
```

問題点: AIエージェントがこのファイルを参照してfeatureファイルのパスを推定した場合、存在しない旧パスを指定してしまう可能性がある。実際のディレクトリ構成はフラット（`features/*.feature`）に統一済み。

修正案: Source_Layout.mdのfeatures配下のディレクトリ構成を実態に合わせて更新する。

### [LOW] L-02: src/__tests__/lib/infrastructure/repositories/admin-user-repository.test.ts に旧パス参照

ファイル: `src/__tests__/lib/infrastructure/repositories/admin-user-repository.test.ts` 4-10行, 143行, 255行

```typescript
// * @feature features/phase1/authentication.feature
// * See: features/phase1/authentication.feature @管理者が正しいメールアドレスとパスワードでログインする
// * See: features/phase1/authentication.feature @管理者が誤ったパスワードでログインすると失敗する
// * See: features/phase1/admin.feature @管理者がログイン済みである
```

問題点: コメントのみだがSee参照として旧パスが6箇所残存。今回の書き換え対象から漏れている。実際のパスは `features/authentication.feature`, `features/admin.feature`。

修正案: See参照を `features/authentication.feature`, `features/admin.feature` に更新する。

### [LOW] L-03: .claude/settings.json に旧パス参照

ファイル: `.claude/settings.json` 12行

```json
"Bash(for f in features/phase1/*.feature)",
```

問題点: permissions の allow リストに旧パス `features/phase1/*.feature` が残存。現在この glob に一致するファイルは存在しないため、このパーミッションは実質的に無効。直接的な実害はないが、メンテナンス上不整合。

### [LOW] L-04: supabase/migrations/00005_auth_verification.sql に旧パス参照

ファイル: `supabase/migrations/00005_auth_verification.sql` 11-12行

```sql
--   features/phase1/authentication.feature
--   features/constraints/specialist_browser_compat.feature
```

問題点: SQLマイグレーションファイルのコメント内に旧パスが残存。マイグレーションファイルはイミュータブルな性質上、既存マイグレーションの修正は推奨されない。

修正案: マイグレーションファイルの修正は不要（既に適用済みのマイグレーションの変更はリスクがある）。認識のみで可。

### [LOW] L-05: docs/ 配下の旧ドキュメントに旧パス参照

以下のドキュメントに旧パスが残存:
- `docs/operations/incidents/chmate_debug_report_2026-03-14.md` (1箇所)
- `docs/research/battleboard_eddist_adoption_report_2026-03-04.md` (1箇所)

問題点: 過去の障害報告書・調査レポートであり、当時の状況を記録した文書。内容の正確性としては当時のパスが正しいため、更新は任意。

### 参考: tmp/ 配下の旧パス残存（対応不要）

`tmp/` 配下（タスク指示書、スプリント計画、エスカレーション、レポート等）に約50ファイルの旧パス参照が残存するが、これらは過去のタスク記録であり、更新の対象外とする。

---

## レビューサマリー

| 重要度   | 件数  | ステータス |
|----------|-------|-----------|
| CRITICAL | 0     | pass      |
| HIGH     | 0     | pass      |
| MEDIUM   | 0     | pass      |
| LOW      | 5     | note      |

判定: **APPROVE**

59ファイルの変更は全てSee参照コメントの書き換えのみであり、**コードロジック（import文、関数実装、assertion、設定値、ルーティング）に意図しない変更は検出されなかった**。

cucumber.js のpaths/require設定は正しく新パスを指しており、BDDテスト・単体テスト・e2eテストの実行に影響はない。

LOW 5件は旧パスの残存であり、L-01（Source_Layout.md）と L-02（admin-user-repository.test.ts）は今回の書き換えから漏れた箇所として別途対応を推奨する。L-03〜L-05は実害なく、対応は任意。
