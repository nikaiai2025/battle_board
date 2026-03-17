# ドキュメント整合性レビューレポート

> タスク: TASK-111
> 対象: Sprint-34 ~ Sprint-37 で追加・変更された機能
> レビュー日: 2026-03-17
> レビュアー: bdd-doc-reviewer

---

## 検出事項

### [HIGH-001] OpenAPI仕様書 (D-04) にSprint-34~37で追加された管理APIが未定義

**重要度:** HIGH
**カテゴリ:** ドキュメント間の整合性

OpenAPI仕様書 (`docs/specs/openapi.yaml`) には以下の管理APIエンドポイントが3つしか定義されていない:

- `/api/admin/login` (POST)
- `/api/admin/posts/{postId}` (DELETE)
- `/api/admin/threads/{threadId}` (DELETE)

Sprint-34~37で実装された以下のAPIルートが全て未定義:

| 実装済みAPIルート | 対応するBDDシナリオ | OpenAPI |
|---|---|---|
| `POST /api/admin/users/{userId}/ban` | 管理者がユーザーをBANする | **未定義** |
| `DELETE /api/admin/users/{userId}/ban` | 管理者がユーザーBANを解除する | **未定義** |
| `POST /api/admin/ip-bans` | 管理者がユーザーのIPをBANする | **未定義** |
| `DELETE /api/admin/ip-bans/{banId}` | 管理者がIP BANを解除する | **未定義** |
| `POST /api/admin/users/{userId}/currency` | 管理者が指定ユーザーに通貨を付与する | **未定義** |
| `GET /api/admin/users` | 管理者がユーザー一覧を閲覧できる | **未定義** |
| `GET /api/admin/users/{userId}` | 管理者が特定ユーザーの詳細を閲覧できる | **未定義** |
| `GET /api/admin/users/{userId}/posts` | 管理者がユーザーの書き込み履歴を確認できる | **未定義** |
| `GET /api/admin/dashboard` | 管理者がダッシュボードで統計情報を確認できる | **未定義** |
| `GET /api/admin/dashboard/history` | 管理者が統計情報の日次推移を確認できる | **未定義** |

OpenAPI仕様書はAPIインターフェースの単一ソース (CLAUDE.md) であり、実装との乖離はクライアント開発やテスト生成に支障をきたす。

---

### [HIGH-002] コンポーネント境界設計書 (D-08) admin.md がSprint-34~37の拡張を反映していない

**重要度:** HIGH
**カテゴリ:** ドキュメントとコードの整合性

`docs/architecture/components/admin.md` の公開インターフェース (Section 2) には `deletePost` と `deleteThread` のみが記載されている。実装済みの `admin-service.ts` には以下の関数が追加されているが、設計書に記載がない:

- `banUser` / `unbanUser` (ユーザーBAN)
- `banIpByUserId` / `unbanIp` / `listActiveIpBans` (IP BAN)
- `grantCurrency` (通貨付与)
- `getUserList` / `getUserDetail` / `getUserPosts` (ユーザー管理)
- `getDashboard` / `getDashboardHistory` (ダッシュボード)

依存関係 (Section 3.1) にも `UserRepository`, `CurrencyRepository`, `IpBanRepository`, `DailyStatsRepository` が記載されておらず、実装との乖離が大きい。

---

### [MEDIUM-001] ユーザー状態遷移仕様書 (D-05) にBAN状態が未定義

**重要度:** MEDIUM
**カテゴリ:** ドキュメント間の整合性

`docs/specs/user_state_transitions.yaml` にはユーザーの認証状態 (`unauthenticated` / `code_issued` / `authenticated`) とアカウント種別 (`free_user` / `premium_user`) が定義されているが、Sprint-34で実装された「BAN状態」(`is_banned = true`) の状態遷移が記載されていない。

BDDシナリオ (admin.feature) では以下の遷移が定義されている:
- 通常 -> BAN済み (管理者がBANする)
- BAN済み -> 通常 (管理者がBAN解除する)
- BAN済みユーザーの書き込み拒否

これらの状態と遷移をD-05に追記すべきである。

---

### [MEDIUM-002] 通貨状態遷移仕様書 (D-05) に管理者通貨付与イベントが未定義

**重要度:** MEDIUM
**カテゴリ:** ドキュメント間の整合性

`docs/specs/currency_state_transitions.yaml` の通貨増加イベント一覧に `admin_grant` (管理者通貨付与) イベントが未定義である。実装 (`admin-service.ts`) では `CurrencyService.credit(userId, amount, "admin_grant")` として利用されており、BDDシナリオ (admin.feature) でも検証されている。

---

### [MEDIUM-003] レス状態遷移仕様書 (D-05) の告発関連記述がv4廃止内容を反映していない

**重要度:** MEDIUM
**カテゴリ:** ドキュメント間の整合性

`docs/specs/post_state_transitions.yaml` の以下の箇所が、ユビキタス言語辞書 (D-02) のv4更新と矛盾している:

1. **行98**: `告発成功ボーナスを告発者に付与` -- D-02ではv4で告発成功ボーナスは廃止済み
2. **行130**: `被告発者（人間）に冤罪ボーナス付与` -- D-02では冤罪ボーナスはv4で廃止済み
3. **行132**: `feature_ref: ai_accusation.feature#AI告発に失敗すると冤罪ボーナスが被告発者に付与される` -- 廃止済みシナリオへの参照

同様に `docs/specs/currency_state_transitions.yaml` の行128-139にも `accusation_success_bonus` と `false_accusation_bonus` が残存している。

---

### [MEDIUM-004] ユビキタス言語辞書 (D-02) にSprint-34~37で導入された用語が未登録

**重要度:** MEDIUM
**カテゴリ:** ドキュメント間の整合性

admin.feature で使用されている以下の概念がユビキタス言語辞書に登録されていない:

| 用語 | 使用箇所 | 状態 |
|---|---|---|
| ユーザーBAN | admin.feature (US-013) | **未登録** |
| IP BAN | admin.feature (US-013) | **未登録** |
| ダッシュボード | admin.feature (US-016) | **未登録** |

なお、「BAN」はD-02の「書き込み禁止」の `forbidden_alias` として登録されている (行564)。ただし「書き込み禁止」はゲームコマンド `!mute` を指す用語であり、管理者によるユーザーBANとは異なる概念である。用語の衝突を避けるため、管理者BANの正式用語を定義して辞書に登録する必要がある。

---

### [LOW-001] admin.feature のdeletePostシグネチャが設計書と不一致

**重要度:** LOW
**カテゴリ:** ドキュメントとコードの整合性

D-08 admin.md Section 2 では `deletePost(postId, adminId, reason?)` と定義されているが、実装の `admin-service.ts` では `deletePost(postId, adminId, reason?, comment?)` と `comment` 引数が追加されている。BDDシナリオ (admin.feature) のコメント付き/なし削除に対応するための変更だが、設計書との乖離がある。

---

## 整合性確認結果サマリー

### BDDシナリオとステップ定義の対応

admin.feature の全22シナリオに対応するステップ定義が `features/step_definitions/admin.steps.ts` に存在し、実行可能である。

### テストコードの網羅性

| テスト層 | 状態 | 備考 |
|---|---|---|
| BDDサービス層 | OK | admin.steps.ts で全シナリオカバー |
| 単体テスト (Vitest) | OK | `ban-system.test.ts`, `admin-dashboard.test.ts` 存在 |
| E2Eスモーク | -- | 管理画面のスモークテストはスコープ外（D-10 S14.4 Phase B 参照） |

### ドキュメント間整合性チェック

| チェック項目 | 結果 |
|---|---|
| BDDシナリオ内の状態名がD-05と一致するか | WARN: BAN状態がD-05に未定義 |
| OpenAPIにBDDシナリオ対応のエンドポイントがあるか | FAIL: 10個のエンドポイントが未定義 |
| D-05の禁止遷移がBDDで検証されているか | OK: BANユーザー書き込み拒否は検証済み |
| ユビキタス言語の用語統一 | WARN: 3用語が未登録 |

---

## レビューサマリー

| 重要度   | 件数  | ステータス |
|----------|-------|-----------|
| CRITICAL | 0     | pass      |
| HIGH     | 2     | warn      |
| MEDIUM   | 4     | info      |
| LOW      | 1     | note      |

判定: WARNING -- マージ前に2件のHIGH（重要）な問題を解決してください。

### HIGH問題の対応方針

1. **HIGH-001**: OpenAPI仕様書 (`docs/specs/openapi.yaml`) にSprint-34~37で追加された管理APIエンドポイント10個の定義を追加する
2. **HIGH-002**: コンポーネント境界設計書 (`docs/architecture/components/admin.md`) の公開インターフェース・依存関係セクションをSprint-34~37の実装に合わせて更新する
