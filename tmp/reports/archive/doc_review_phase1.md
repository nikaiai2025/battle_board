# Phase 1 ドキュメント整合性レビュー

> レビュー日: 2026-03-13
> レビュー対象: ドキュメント (D-04, D-07, D-08, D-10) と実装コードの整合性

---

## 1. OpenAPI仕様 (D-04) と APIルート実装の整合性

### 1.1 エンドポイント網羅性

| OpenAPI パス | HTTPメソッド | 実装ファイル | 状態 |
|---|---|---|---|
| `/api/auth/auth-code` | POST | `src/app/api/auth/auth-code/route.ts` | OK |
| `/api/threads` | GET | `src/app/api/threads/route.ts` | OK |
| `/api/threads` | POST | `src/app/api/threads/route.ts` | OK |
| `/api/threads/{threadId}` | GET | `src/app/api/threads/[threadId]/route.ts` | OK |
| `/api/threads/{threadId}/posts` | POST | `src/app/api/threads/[threadId]/posts/route.ts` | OK |
| `/api/mypage` | GET | `src/app/api/mypage/route.ts` | OK |
| `/api/mypage/username` | PUT | `src/app/api/mypage/username/route.ts` | OK |
| `/api/mypage/upgrade` | POST | `src/app/api/mypage/upgrade/route.ts` | OK |
| `/api/mypage/history` | GET | `src/app/api/mypage/history/route.ts` | OK |
| `/api/mypage/notifications` | GET | (未実装) | **欠落** |
| `/api/currency/balance` | GET | (未実装) | **欠落** |
| `/api/admin/login` | POST | `src/app/api/admin/login/route.ts` | OK |
| `/api/admin/posts/{postId}` | DELETE | `src/app/api/admin/posts/[postId]/route.ts` | OK |
| `/api/admin/threads/{threadId}` | DELETE | `src/app/api/admin/threads/[threadId]/route.ts` | OK |
| `/bbsmenu.html` | GET | `src/app/(senbra)/bbsmenu.html/route.ts` | OK |
| `/{boardId}/subject.txt` | GET | `src/app/(senbra)/[boardId]/subject.txt/route.ts` | OK |
| `/{boardId}/dat/{threadKey}.dat` | GET | `src/app/(senbra)/[boardId]/dat/[threadKey].dat/route.ts` | OK |
| `/{boardId}/SETTING.TXT` | GET | `src/app/(senbra)/[boardId]/SETTING.TXT/route.ts` | OK |
| `/test/bbs.cgi` | POST | `src/app/(senbra)/test/bbs.cgi/route.ts` | OK |

#### [W-01] Warning: `/api/mypage/notifications` エンドポイント未実装

OpenAPI仕様 (D-04) に `/api/mypage/notifications` (GET) が定義されているが、対応する `src/app/api/mypage/notifications/route.ts` が存在しない。D-04 の description に「Phase 1では枠として存在し、空配列を返す」と記載されているため、Phase 1 スコープでのスタブ実装が必要。

#### [W-02] Warning: `/api/currency/balance` エンドポイント未実装

OpenAPI仕様 (D-04) に `/api/currency/balance` (GET) が定義されているが、対応する `src/app/api/currency/balance/route.ts` が存在しない。残高情報は `/api/mypage` レスポンスの `balance` フィールドでも取得可能だが、D-04 に独立エンドポイントとして定義されている以上、整合性に欠ける。

### 1.2 レスポンス形式の整合性

#### [I-01] Info: `/api/mypage/history` レスポンスに `total` フィールドが欠落

D-04 では `/api/mypage/history` のレスポンスに `posts` 配列に加え `total`(integer) フィールドが定義されているが、実装 (`src/app/api/mypage/history/route.ts`) は `{ posts }` のみを返し `total` を含めていない。また D-04 では `offset` クエリパラメータも定義されているが、実装は `limit` のみサポートしている。

#### [I-02] Info: `/api/mypage` レスポンスと D-04 `UserProfile` スキーマの差異

D-04 の `UserProfile` スキーマでは `id`, `isPremium`, `username`, `balance`, `streakDays` を required としている。実装の `MypageService.getMypage` の戻り値（`MypageInfo` 型）は `authToken` フィールドを含んでいるが、D-04 の `UserProfile` スキーマには `authToken` は含まれていない。逆に D-04 で required な `id` が実装で返されているかは MypageService 内部の型定義に依存する。

---

## 2. admin.md (D-08) と AdminService 実装の整合性

### 2.1 公開インターフェース

| D-08 定義 | AdminService 実装 | 状態 |
|---|---|---|
| `deletePost(postId, adminId, reason?)` | `deletePost(postId: string, adminId: string, reason?: string)` | OK |
| `deleteThread(threadId, adminId, reason?)` | `deleteThread(threadId: string, adminId: string, reason?: string)` | OK |
| `getDeletedPosts(threadId)` | (未実装) | **欠落** |
| `getAuditLog(limit)` | (未実装) | **欠落** |

#### [W-03] Warning: `getDeletedPosts` / `getAuditLog` が未実装

D-08 2 で公開インターフェースとして定義されている `getDeletedPosts(threadId: UUID): Post[]` と `getAuditLog(limit: number): AuditLog[]` が `src/lib/services/admin-service.ts` に存在しない。D-08 に「管理画面用（削除済み含む全件）」「操作履歴」と記載されており、管理画面での利用を想定している。Phase 1 の BDD シナリオ (`admin.feature`) にはこれらの振る舞いが記述されていないため、現時点で BDD 的には不整合はないが、ドキュメント定義と実装に乖離がある。

### 2.2 依存関係

D-08 3.1 には `AuditLogRepository` への依存が記載されているが、AdminService 実装では `console.info` による簡易ログのみ。D-08 に「将来: 当初は簡易実装可」と記載されており、現状の実装は許容範囲内。

---

## 3. senbra-adapter.md (D-08) と adapters 実装の整合性

### 3.1 コンポーネント構成

| D-08 定義 | 実装ファイル | 状態 |
|---|---|---|
| `ShiftJisEncoder` | `src/lib/infrastructure/encoding/shift-jis.ts` | OK |
| `DatFormatter` | `src/lib/infrastructure/adapters/dat-formatter.ts` | OK |
| `SubjectFormatter` | `src/lib/infrastructure/adapters/subject-formatter.ts` | OK |
| `BbsCgiParser` | `src/lib/infrastructure/adapters/bbs-cgi-parser.ts` | OK |
| `BbsCgiResponseBuilder` | `src/lib/infrastructure/adapters/bbs-cgi-response.ts` | OK |

### 3.2 公開インターフェースの整合性

#### [C-01] Critical: `DatFormatter.buildDat` のシグネチャ不整合

D-08 では `buildDat(posts: Post[], threadTitle: string): string` は**関数**として定義されているが、実装は `DatFormatter` **クラスのインスタンスメソッド**として実装されている。`SubjectFormatter`、`BbsCgiParser`、`BbsCgiResponseBuilder` も同様にクラスとして実装されている。D-08 は関数的なインターフェースを記述しているが、実装はクラスベース。呼び出し方が `new DatFormatter().buildDat(...)` となり、D-08 の記述と乖離している。

ただし D-08 の記述はインターフェース概要であり、実装形態（関数 vs クラス）を強制する記述ではないとも解釈可能。Route Handler 側の利用パターンに支障がなければ実害は小さい。

#### [W-04] Warning: `ShiftJisEncoder` の配置がドキュメントと異なる

D-08 2 では `ShiftJisEncoder` を「専ブラ互換Adapter」の内部コンポーネントの1つとして列挙しているが、実装では `src/lib/infrastructure/adapters/` ではなく `src/lib/infrastructure/encoding/shift-jis.ts` に配置されている。D-07 9（ディレクトリ構成）では `encoding/` が独立ディレクトリとして設計されており、実装はD-07に従っている。D-08 の記述とD-07 の記述が微妙に不一致。

#### [I-03] Info: `BbsCgiParser` の edgeToken 取得元 Cookie 名

D-08 では `edgeToken` は「cookieから取得」と記載されている。実装の `BbsCgiParser` では `edge_token`（アンダースコア区切り）を Cookie 名として使用している。一方、Web API ルート側では `edge-token`（ハイフン区切り）を使用している。専ブラと Web UI で Cookie 名が異なる場合は意図的か確認が必要。

---

## 4. BDDテスト戦略書 (D-10) とステップ定義の整合性

### 4.1 テストレベル

D-10 1 に「サービス層の公開関数を直接呼び出す。APIルートは経由しない」と記載。全ステップ定義ファイル (`admin.steps.ts`, `mypage.steps.ts`, `posting.steps.ts` 等) はサービス層を `require()` で動的ロードして直接呼び出しており、D-10 に準拠。**整合性 OK**。

### 4.2 モック戦略

D-10 2 に「リポジトリ層のモジュールをインメモリ実装に差し替える」と記載。実装は `features/support/register-mocks.js` + `mock-installer.ts` で require キャッシュ書き換え方式を採用。D-10 に「具体的な実装方式はコーダーが選定する」と記載されており、整合。

#### [I-04] Info: `installMocks()` が no-op

`mock-installer.ts` の `installMocks()` は no-op（コメントに「register-mocks.js で差し込み済み」と記載）。D-10 2 のライフサイクルでは「BeforeAll: モジュール差し替えをインストール」と記載されており、`hooks.ts` の `BeforeAll` は `installMocks()` を呼んでいるが実質的に何もしない。機能的に問題はないが、D-10 の記述と実態に乖離がある。

### 4.3 World 設計

D-10 3 で定義されている World の状態カテゴリと `features/support/world.ts` の実装を比較:

| D-10 カテゴリ | World 実装 | 状態 |
|---|---|---|
| 現在のユーザー (userId, edgeToken, ipHash, isPremium, username) | 全て存在 | OK |
| 名前付きユーザーマップ (`Map<string, UserContext>`) | `namedUsers` | OK |
| 現在のスレッド (threadId, threadTitle) | 全て存在 | OK |
| 最後の操作結果 (lastResult, lastError) | `lastResult` のみ（`lastError` は `LastResult` 型の union で表現） | OK |
| 時刻制御 (currentTime) | 存在 | OK |

World は D-10 の設計を網羅しており、管理者コンテキスト・マイページコンテキスト等の追加プロパティも備えている。**整合性 OK**。

### 4.4 ディレクトリ構成

D-10 4 の「1 feature = 1 stepsファイル」原則を検証:

| Feature | Steps ファイル | 状態 |
|---|---|---|
| `authentication.feature` | `authentication.steps.ts` | OK |
| `posting.feature` | `posting.steps.ts` | OK |
| `thread.feature` | `thread.steps.ts` | OK |
| `currency.feature` | `currency.steps.ts` | OK |
| `incentive.feature` | `incentive.steps.ts` | OK |
| `admin.feature` | `admin.steps.ts` | OK |
| `mypage.feature` | `mypage.steps.ts` | OK |
| `specialist_browser_compat.feature` | `specialist_browser_compat.steps.ts` | OK |

共通ステップは `common.steps.ts` に存在。**D-10 4 に準拠**。

### 4.5 時刻制御

D-10 5 に記載の方針:
- `Date.now` をスタブ化 -> World の `setCurrentTime()` で実装済み
- Before で保存、After で復元 -> `hooks.ts` の `After` フックで `restoreDateNow()` 呼び出し済み
- `new Date(Date.now())` を使用 -> サービス層の確認は本レビューの直接スコープ外だが、World 側の準備は整合

**整合性 OK**。

---

## 5. Feature ファイルとステップ定義の網羅性

### 5.1 cucumber.js の除外設定

cucumber.js の設定を検証:

**paths に含まれるファイル (8件)**:
- `features/phase1/authentication.feature`
- `features/phase1/posting.feature`
- `features/phase1/thread.feature`
- `features/phase1/currency.feature`
- `features/phase1/incentive.feature`
- `features/phase1/admin.feature`
- `features/constraints/specialist_browser_compat.feature`
- `features/phase1/mypage.feature`

**name フィルタで除外されるシナリオ (3件)**:
1. 「コマンド文字列がゲームコマンドとして解釈される」(Phase 2依存)
2. 「bbs.cgiへのPOSTがHTTPSリダイレクトでペイロードを消失しない」(インフラ制約)
3. 「専ブラ特有のUser-AgentがWAFにブロックされない」(インフラ制約)

除外は D-10 6 の方針（paths で除外 + name で除外）に合致。**整合性 OK**。

### 5.2 Phase 2 feature ファイルの除外

`features/phase2/` 配下のファイル (`command_system.feature`, `ai_accusation.feature`, `bot_system.feature`) は paths に含まれていない。Phase 1 スコープとして適切。

### 5.3 ステップ定義の未定義リスク

各 feature ファイルのシナリオとステップ定義の対応を全量確認するにはテスト実行が必要だが、ファイル構成上は全 feature に対応する steps ファイルが存在し、主要な Given/When/Then パターンのステップ定義が確認できた。

#### [I-05] Info: `specialist_browser_compat.feature` の除外対象以外のシナリオ網羅性

`specialist_browser_compat.steps.ts` が存在し、除外対象3件を除く全シナリオ（エンコーディング2件、subject.txt 2件、DATファイル5件、bbs.cgi 3件、差分同期2件、SETTING.TXT 1件、bbsmenu.html 1件）のステップ定義が実装されていることを構造的に確認した。

---

## 6. architecture.md 2.4 環境戦略の妥当性

### 6.1 記載内容

- 2環境構成（ローカル + 本番）を採用
- ステージング環境は設けない
- BDD/単体テストはインメモリモックで実行し、DBに接続しない
- マイグレーション運用: ローカルで検証 -> 本番に適用

### 6.2 妥当性評価

#### [I-06] Info: 2環境構成のリスク認識

MVPフェーズでステージング不採用の判断は記載の通り合理的（ユーザー数限定・Supabase無料プラン制約）。ただし「必要になった時点で再検討する」の判断基準が曖昧。ユーザー数の閾値やインシデント基準を定義しておくと、再検討のタイミングが明確になる。

#### [I-07] Info: `supabase db push` の記載

2.4 に「ローカルで `supabase db push`」と記載。TDR-005 では `supabase migration new` でファイル作成、`supabase db push` で適用と記載されており整合。ただし `db push` はマイグレーションファイルを使わず直接スキーマを同期するコマンドであり、`db push` と migration ファイルベースの運用は異なるアプローチ。意図を再確認する価値がある。

---

## 検出事項サマリ

| ID | Severity | カテゴリ | 概要 |
|---|---|---|---|
| C-01 | Critical | D-08 vs 実装 | DatFormatter 等のインターフェースがドキュメントでは関数、実装ではクラス |
| W-01 | Warning | D-04 vs 実装 | `/api/mypage/notifications` エンドポイント未実装 |
| W-02 | Warning | D-04 vs 実装 | `/api/currency/balance` エンドポイント未実装 |
| W-03 | Warning | D-08 vs 実装 | `getDeletedPosts` / `getAuditLog` が AdminService に未実装 |
| W-04 | Warning | D-08 vs D-07 | ShiftJisEncoder の配置に関するドキュメント間の微妙な不一致 |
| I-01 | Info | D-04 vs 実装 | `/api/mypage/history` レスポンスの `total` フィールドと `offset` パラメータが未実装 |
| I-02 | Info | D-04 vs 実装 | `/api/mypage` レスポンスと `UserProfile` スキーマの差異 (`authToken` の有無) |
| I-03 | Info | D-08 vs 実装 | BbsCgiParser の Cookie 名が `edge_token` (実装) vs `edge-token` (Web API) で不一致 |
| I-04 | Info | D-10 vs 実装 | `installMocks()` が no-op になっている（機能的問題なし） |
| I-05 | Info | Feature vs Steps | specialist_browser_compat のステップ定義網羅性は構造的に確認済み |
| I-06 | Info | D-07 2.4 | 2環境構成のステージング再検討基準が曖昧 |
| I-07 | Info | D-07 2.4 | `supabase db push` とマイグレーションファイル運用の意図確認を推奨 |

---

## 推奨アクション

1. **C-01 への対応**: D-08 (senbra-adapter.md) のインターフェース記述を実装に合わせてクラスベースに更新する、または実装をスタンドアロン関数に変更する。いずれかで統一する。
2. **W-01, W-02 への対応**: D-04 に定義済みの未実装エンドポイントについて、Phase 1 スコープ内かどうかを明確にし、スコープ内であればスタブ実装を追加する。スコープ外であれば D-04 にその旨を注記する。
3. **W-03 への対応**: D-08 の `getDeletedPosts` / `getAuditLog` が Phase 1 で必要かどうかを確認し、不要であればD-08にフェーズ情報を追記する。
4. **I-03 への対応**: 専ブラとWeb UIで Cookie 名が異なる (`edge_token` vs `edge-token`) 件について意図的かどうかを確認し、統一が必要であれば修正する。
