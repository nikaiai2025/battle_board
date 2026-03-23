# レビュー結果: アーキテクチャ・コンポーネント設計

## サマリー
- 判定: WARNING
- 指摘件数: HIGH: 2件 / MEDIUM: 2件 / LOW: 1件

---

## 指摘事項

### [HIGH] A-01: architecture.md — users テーブルの is_verified 説明に旧関数名 `verifyAuthCode` が残存

- ファイル: `docs/architecture/architecture.md`
- 箇所: L466（§4.2 users テーブル定義）
- 問題: `is_verified` カラムの説明が「`verifyAuthCode` または `verifyWriteToken` 成功時に `true` に更新される」となっている。6桁コード廃止後は `verifyAuthCode` は存在せず、統合後の関数名は `verifyAuth` である。authentication.md §2 の公開インターフェース定義（`verifyAuth`）と不整合。
- 推奨対応: `verifyAuth` または `verifyWriteToken` 成功時に `true` に更新される」に修正

---

### [HIGH] A-02: web-ui.md — §4 認証フロー（UI観点）が旧フロー（6桁コード入力）のまま未更新

- ファイル: `docs/architecture/components/web-ui.md`
- 箇所: L129-136（§4 認証フロー）
- 問題: フロー説明の全4ステップが旧フローのままである。
  - L133: `AuthModalを表示（6桁コード入力UI）` — 6桁コードは廃止済み
  - L134: `ユーザーがコードを入力 → POST /api/auth/auth-code を呼び出し` — コード入力は廃止
  - このセクションは認証フロー簡素化の中核であり、計画書（案B）の「コード入力なし → Turnstile通過 → 認証成功」フローに更新されるべき
- 推奨対応: §4 を以下の趣旨に更新する
  1. PostFormが `authRequired` レスポンスを受け取る
  2. AuthModalを表示（Turnstile認証UI）
  3. Turnstile通過 → `POST /api/auth/auth-code` を呼び出し
  4. 成功したら書き込みをリトライ（edgeTokenがCookieにセットされた状態）

---

### [MEDIUM] A-03: web-ui.md — §3.2 コンポーネントツリーの AuthModal コメントに旧記述が残存

- ファイル: `docs/architecture/components/web-ui.md`
- 箇所: L87（§3.2 スレッドページのコンポーネントツリー）
- 問題: `AuthModal [Client Component]    // 認証コード入力（未認証時）` のコメントが「認証コード入力」のままである。AuthModal は Turnstile 認証UIに変更されているため、コメントが実態と乖離する。
  - 注: §3.1（L65）の `AuthModal [Client Component]   // Turnstile認証（未認証時）` は正しく更新済み。同一ファイル内で記述が不統一。
- 推奨対応: `// Turnstile認証（未認証時）` に統一（L65 と同じ表現）

---

### [MEDIUM] A-04: architecture.md — auth_codes ER図に `code` カラムが含まれていないが、テーブル定義にも記載がない点の明示的確認

- ファイル: `docs/architecture/architecture.md`
- 箇所: L391-403（ER図）、L550-561（auth_codes テーブル定義）
- 問題: ER図・テーブル定義ともに `code` カラムが記載されていない。これは計画書（案B）の方針「code列は廃止候補」と整合するが、計画書 §5.2 DB セクションでは「`auth_codes.code` カラムをnullable化（ロールバック容易性を考慮）」と記載されており、カラム自体は即時削除ではなく nullable 化で残す方針となっている。設計書上から `code` カラムの記述が完全に消えていることは、マイグレーション方針（nullable 化）との齟齬を生む可能性がある。
- 推奨対応: 以下のいずれか
  - (a) マイグレーション方針通り nullable 化で残す場合: auth_codes テーブル定義に `code | VARCHAR, NULLABLE | 廃止予定（後方互換のため残存）` を追記
  - (b) 即時削除する場合: 計画書のマイグレーション方針を「nullable 化」から「カラム削除」に修正

---

### [LOW] A-05: bdd_test_strategy.md — 認証テストのフロー説明は更新済みだが、AuthModal の役割説明に暗黙の前提

- ファイル: `docs/architecture/bdd_test_strategy.md`
- 箇所: L400（§10.3.1 認証テスト対象説明）
- 問題: `「未認証で書き込み→AuthModal表示→Turnstile認証→認証成功→操作リトライ」の連結フロー` と記載されており、6桁コードへの言及はなく、Turnstile のみの新フローと整合している。問題はない。ただし L330 の `AuthModal UI検証は認証テスト（auth-flow.spec.ts、ローカルのみ）が担う` という記述は AuthModal の具体的な内容（何を検証するか）には言及していないため、認証テスト実装者にとって AuthModal = Turnstile のみ であることが暗黙の前提になっている。
- 推奨対応: 改修の優先度は低い。認証テストの実装時に auth-code.yaml（画面要素定義）を参照すれば Turnstile のみであることは明確にわかるため、bdd_test_strategy.md 側での追加説明は不要と判断してもよい。

---

## 整合性確認結果（指摘なし）

以下の観点では問題は検出されなかった。

| 観点 | 確認結果 |
|---|---|
| authentication.md 公開インターフェース | `verifyAuth(turnstileToken, edgeToken, ipHash)` に統合済み。旧 `verifyAuthCode` は削除されており、openapi.yaml の `VerifyAuthRequest` (turnstileToken のみ) と整合 |
| authentication.md 依存関係 | AuthCodeRepository の依存説明から「findByCode」が削除済み。「verified, write_token, write_token_expires_at」の管理に限定されており、新フローと整合 |
| authentication.md 統一認証フロー (§6) | 6桁コードへの言及なし。「Turnstile通過 → is_verified=true + write_token発行」の記述が計画書と整合 |
| user-registration.md 認証状態遷移 (§4.2) | 「edge-token発行済み → Turnstile検証成功 → 認証済み」の遷移で6桁コードへの言及なし。新フローと整合 |
| user-registration.md 認証判定フロー (§6) | write_token / PAT の判定フローに6桁コードの痕跡なし |
| architecture.md TDR-001 | 「6桁コード廃止」の経緯・理由が記載済み（L1044-1046）。計画書と整合 |
| architecture.md §5.1 認証フロー図 | Turnstile のみの3ステップフロー。6桁コードへの言及なし |
| architecture.md §5.1 認証要素説明 | edge-token, is_verified, Turnstile, write_token の4要素。認証コードへの言及なし |
| user_state_transitions.yaml | token_issued → authenticated の遷移が「Turnstile検証成功」のみ。認証コード言及なし |
| openapi.yaml AuthRequiredResponse | `message` + `authUrl` のみ。`authCode` フィールドなし |
| openapi.yaml VerifyAuthRequest | `turnstileToken` のみ。`code` フィールドなし |
| auth-code.yaml (画面要素定義) | Turnstile ウィジェット + 認証ボタンのみ。コード入力フィールドなし |
| bdd_test_strategy.md E2E認証テスト | 「Turnstile認証」の記述のみ。6桁コード言及なし |
| bdd_test_strategy.md Turnstile テスト対応 (§12.1) | InMemory モック / テスト用サイトキーの方針に変更不要 |
