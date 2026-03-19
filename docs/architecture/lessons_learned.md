# Lessons Learned — アーキテクチャ上の教訓

プロジェクト進行中に得られた設計上の教訓を記録する。
同じ失敗を繰り返さないための参照資料であり、新規プロジェクト開始時のチェックリストとしても使用する。

---

## LL-001: リポジトリのID引数を `string` にしない

- **発見日:** 2026-03-18
- **発見契機:** E2Eテスト中にコマンド `!w >>1` のターゲット解決がサイレント失敗

### 事象

command-parserが `>>1` を正しく抽出した後、GrassHandler/TellHandlerが `PostRepository.findById(">>1")` を呼んでいた。`">>1"` はUUIDではないため対象レスが見つからずサイレント失敗。BDDテストはInMemoryモックで通過していたため発見が遅れた。

### 根本原因

`findById(id: string)` の型が広すぎた。`string` はUUIDも `">>1"` も受け入れるため、コンパイラが誤りを検出できなかった。加えて、投稿番号からUUIDへの変換責務がどのコンポーネントにも割り当てられていなかった。

### 教訓

**リポジトリのID引数は `string` ではなくブランド型 `UUID` にする。** プロジェクト初日に決める設計判断であり、後から変更するコストは極めて高い。

```typescript
// プロジェクト初日に定義する
type UUID = string & { readonly __brand: 'UUID' }

function toUUID(s: string): UUID {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s))
    throw new Error(`Invalid UUID: ${s}`)
  return s as UUID
}

// リポジトリ署名
findById(id: UUID): Promise<Post | null>
```

全IDにブランド型を適用する必要はない。**外部入力が混ざる境界のID**（ユーザー入力由来の文字列がリポジトリまで到達するパス）に型の壁があれば、この種のバグは防げる。

### 本プロジェクトでの対処

ブランド型の全面導入は既存コードへの影響が大きすぎるため見送り。代替策としてInMemoryリポジトリにUUID形式バリデーションを追加し、BDDテスト時に不正なIDを検出できるようにする。

See: bdd_test_strategy.md §2 — 「InMemoryリポジトリはID形式のバリデーションを行い、不正な形式はエラーとする」

---

## LL-002: InMemoryリポジトリは実DBの制約を再現する

- **発見日:** 2026-03-18
- **発見契機:** LL-001 と同一

### 事象

InMemoryリポジトリの `findById` が不正なID形式（`">>1"`）を黙って受け入れ `null` を返した。実DBであればPostgreSQLが `invalid input syntax for type uuid` で即座にエラーを返す。InMemoryの寛容さがバグを隠蔽した。

### 教訓

**InMemoryリポジトリは「何でも受け入れる簡易実装」ではなく、実DBの制約を模倣するテストダブルである。** 最低限、以下の制約を再現すべき:

- ID形式のバリデーション（UUID形式でなければエラー）
- NOT NULL制約（必須フィールドの欠落検出）
- ユニーク制約（重複キーの検出）

BDDテスト戦略書 §2 の方針「DB固有動作はインメモリ実装内で同等のロジックを再現する」の適用範囲を、クエリ動作だけでなく入力バリデーションにも拡大する。

---

## LL-003: バグの原因は「テスト層の不足」ではなく「テストケースの不足」

- **発見日:** 2026-03-18
- **発見契機:** 固定スレッド永久304バグ（TASK-146）の再発防止分析

### 事象

固定スレッド（`lastPostAt = 2099-01-01`）と通常スレッドが混在する環境で、subject.txt の304判定が永遠に304を返すバグが発見された。再発防止策の検討において「専ブラ専用のテスト層を新設すべきか」という議論が発生した。

### 分析

過去の専ブラ関連バグ5件（senbra_compat_guide.md 参照）を精査した結果、全てのバグは既存のテスト層にテストケースを追加すれば検出可能だったことが判明した。

| 事象 | 検出可能だった既存テスト層 | 不足していたもの |
|------|--------------------------|----------------|
| 永久304（本件） | Route handler テスト | 固定スレッド混在データでの304判定ケース |
| 絵文字消失 | ShiftJisEncoder 単体テスト | CP932非対応文字のフォールバック処理ケース |
| 異体字セレクタ文字化け | ShiftJisEncoder 単体テスト | U+FE0F/U+FE0E の除去ケース |
| 専ブラ絵文字書き込み化け | bbs.cgi route テスト | HTML数値参照→UTF-8逆変換ケース |
| Cookie Secure属性 | bbs.cgi route テスト | Set-Cookie属性の検証ケース |

**いずれもテスト層は既に存在していた。不足していたのはテストケース（特に機能横断的なデータの組み合わせ）だった。**

### 教訓

**バグの再発防止策として「新しいテスト層・テストアーキテクチャの導入」を安易に提案しない。** まず既存のテスト層で検出可能だったかを検証し、不足しているのが「層」なのか「ケース」なのかを正確に区別する。

テスト層の新設は保守コスト（テストインフラの維持、CI時間の増加、テスト間の重複管理）を伴う。既存層へのケース追加で済む問題に新しい層を導入するのは過剰設計（Golden Hammer）である。

### 具体的な対策指針

1. **Route handler テスト:** 機能横断的なデータ組み合わせ（固定スレッド + 304判定、Cookie属性 + 認証状態等）を意識してケースを設計する
2. **エンコーディング単体テスト:** エッジケース文字（絵文字、異体字セレクタ、ZWJ等）を網羅する
3. **D-10 §9 APIテスト:** 実装時にShift_JISラウンドトリップ検証を含める（既に戦略として定義済み）

See: `docs/operations/incidents/2026-03-18_pinned_thread_permanent_304.md`

---

## LL-004: setter DI はテストと本番のDI配線を乖離させる

- **発見日:** 2026-03-18
- **発見契機:** 本番環境でコマンド（!w, !tell）が動作しないことを人間が手動確認で発見

### 事象

`PostService.setCommandService()` によるsetter DI パターンで CommandService を注入する設計だった。テストコード（`command_system.steps.ts`）は `setCommandService(mock)` を呼んで正常動作していたが、本番のAPIルート（2ファイル）には `setCommandService()` を呼ぶコードが**一行も存在しなかった**。結果、コマンドシステムが本番で完全に無効の状態で稼働していた。

### 根本原因

1. **setter DI の構造的欠陥**: `commandServiceInstance` のデフォルト値が `null` であり、setter が呼ばれない限り永久に `null`。コンパイラもテストもこの欠落を検出できない
2. **BDDサービス層テストの原理的限界**: D-10 §1「APIルートは経由しない」方針により、本番のDI配線はテスト対象外。テスト環境では手動注入が成功するため問題が隠蔽された

### 教訓

**初期化が必要な依存は、setter DI ではなく lazy 初期化（getter化）にする。** デフォルト状態で動作可能な構造にし、「setter を呼び忘れる」失敗モードを排除する。

```typescript
// NG: setter DI（呼び忘れると null のまま）
let instance: Service | null = null;
export function setService(s: Service | null) { instance = s; }

// OK: lazy 初期化（デフォルトで本番用インスタンスが生成される）
function getService(): Service | null {
  if (!initDone && instance === null) {
    instance = new Service(/* 本番依存 */);
    initDone = true;
  }
  return instance;
}
// テスト用のオーバーライドは setService() で可能（lazy初期化をバイパス）
```

### 適用範囲

サービス層のシングルトンDIパターン全般。特に「テストでは手動注入、本番ではアプリ起動時に自動注入」が期待される依存に注意。

See: `docs/operations/incidents/2026-03-18_command_service_not_initialized.md`

---

## LL-005: `useState(prop)` は router.refresh() で同期されない

- **発見日:** 2026-03-18
- **発見契機:** 本番環境でレスの二重表示を人間が目視で発見

### 事象

`PostListLiveWrapper` が `useState(initialLastPostNumber)` で SSR から渡された prop を state に保持していた。`PostForm` が書き込み成功後に `router.refresh()` を呼ぶと、Server Component（PostList）は新しいレスを含んで再描画されるが、Client Component の state は保持される（Next.js App Router の仕様）。結果、SSR 側と Client 側で同じレスが二重に表示された。

### 根本原因

React の `useState(initialValue)` は初回マウント時にしか初期値を使わない。Next.js App Router の `router.refresh()` は Server Component を再SSRするが Client Component を再マウントしない。この2つの仕様の組み合わせにより、SSR の props 更新が Client state に反映されなかった。

### 教訓

**`useState(prop)` を使う場合は、prop 変化時の state 同期を必ず実装する。** React 公式ドキュメントでも注意喚起されている well-known pitfall である。

```typescript
// NG: prop が変わっても state は初回値のまま
const [value, setValue] = useState(initialProp);

// OK: useEffect で prop 変化を検知して state を同期
const [value, setValue] = useState(initialProp);
useEffect(() => {
  setValue(prev => Math.max(prev, initialProp));
}, [initialProp]);
```

特に Next.js App Router では `router.refresh()` が頻出するため、Server Component → Client Component の prop 受け渡しで `useState(prop)` を使うケースは全て同期 useEffect の要否を検討すべきである。

### 検出方法

Client Component の単体テストで `rerender(<Component newProp={...} />)` を呼び、prop 変化後の表示が正しいことを検証する。今回のケースでは PostListLiveWrapper の単体テストが0件だったことが発見遅延の直接原因。

See: `docs/operations/incidents/2026-03-18_post_list_duplicate_display.md`

---

## LL-006: workerd 非互換 API の修正は依存チェーン全体を横展開する

- **発見日:** 2026-03-18
- **発見契機:** 本番で全コマンドが無効化されていることを人間が手動テストで発見

### 事象

commit `68fe555` で `commands.yaml` の `fs.readFileSync` 依存を TS定数化で除去した。しかし、同じ `fs.readFileSync` パターンを持つ `bot_profiles.yaml`（`BotService` 内）を見落とした。`CommandService` → `AttackHandler` → `BotService` → `fs.readFileSync` という間接依存チェーンのため、`CommandService` のlazy初期化が例外で失敗し、全コマンドが無効化された。

### 根本原因

修正スコープが「直接的な fs 依存」に限定され、`require()` 経由の **間接依存** が調査対象に含まれなかった。Node.js環境のテストでは `fs` が正常動作するため、本番デプロイまで問題が顕在化しなかった。

### 教訓

**workerd 非互換 API（`fs`, `path`, `child_process` 等）の修正時は、直接依存だけでなく `require()` / `import` チェーンの先にある間接依存も含めてコードベース全体を grep し、同じパターンを一括で修正する。**

```bash
# 修正時の横展開チェックコマンド例
grep -r "import.*fs\b\|require.*['\"]fs['\"]\|readFileSync\|readSync" src/lib/
```

### 検出方法

- **防止:** ESLint `no-restricted-imports` で `src/lib/` 配下の `fs` import を禁止する
- **検出:** デプロイ後のスモークテスト（最低1コマンドの実行確認）をCI/CDに組み込む

See: `docs/operations/incidents/2026-03-18_bot_profiles_yaml_fs_dependency.md`

---

## LL-007: BDDステップの「Phase N 実装予定」コメントはテストの空洞化を招く

- **発見日:** 2026-03-19
- **発見契機:** 本番で `!attack` 撃破時のシステムレスが未投稿であることを人間が手動テストで発見

### 事象

`bot_system.steps.ts` のステップ定義に `// ★システム名義の独立レス登録は PostService が担当（Phase 3 実装予定）。` というコメントがあり、本来「★システム」名義の独立レスがDBに存在するかを検証すべきところが、`systemMessage` に「撃破」という文字列が含まれるかだけを確認するスタブ実装になっていた。テストは全件PASSしていたが、仕様は満たされていなかった。

### 根本原因

BDDステップ定義内のTODOコメントは、テストフレームワークに対して不可視である。`npx cucumber-js` の実行結果は「PASS」と表示され、未実装の検証ロジックがあることは一切報告されない。人間がコードレビューでコメントを読まない限り検出不可能。

### 教訓

**BDDステップの検証ロジックを「Phase N で実装予定」として先送りする場合、コメントではなく Cucumber の `pending()` を使用する。**

```typescript
// NG: コメントで先送り（テスト結果に表示されない）
// Phase 3 実装予定
assert(msg.includes("撃破"));

// OK: pending() で先送り（テスト結果に PENDING として表示される）
return 'pending';  // Phase 3: 独立レスのDB存在確認を実装する
```

`pending()` を使えば、テスト実行結果のサマリに PENDING 件数が表示され、未実装の検証が可視化される。CI でも PENDING 件数を監視可能。

### 適用範囲

BDDステップ定義全般。特に「ハンドラの戻り値だけ検証し、副作用（DB書き込み、外部呼び出し）の検証を先送りする」パターンに注意。

See: `docs/operations/incidents/2026-03-19_attack_elimination_no_system_post.md`

---

## LL-008: テスト実行枠組みの変更時はトレーサビリティを全件検証する

- **発見日:** 2026-03-20
- **発見契機:** D-10 §10-§11 再設計（スモークテスト自動化）に伴うPlaywright設定見直し

### 事象

テスト戦略の再設計で、Playwright設定を変更した（cf-smokeプロジェクト除去、prod用テスト追加）。変更後にテストファイルと実行枠組みの全件トレーサビリティ検証を行ったところ、2件の問題を発見した:

1. **`e2e/prod/smoke.spec.ts` がローカルの `e2e` プロジェクトに漏れていた** — `testIgnore` に `**/prod/**` が未設定で、本番専用テストが `localhost:3000` に対して実行される状態だった
2. **`cf-smoke` プロジェクトが `npx playwright test` の全実行に含まれていた** — D-10で「常設層ではなく技術検証」と位置づけていたが、設定上は常設プロジェクトに残っており、`wrangler dev` 未起動時に全件失敗する

いずれもテスト実行結果（PASS/FAIL）からは発見困難で、「どのファイルがどのコマンドで実行されるか」を設定ファイルから静的にトレースしなければ気づけなかった。

### 教訓

**テスト実行枠組み（config、プロジェクト定義、プロファイル）を変更した場合は、全テストファイルが意図通りの実行パスに割り当てられていることを静的に検証する。** テストの PASS/FAIL だけでは「実行されていないテスト」を検出できない。

検証手順:
1. 全テストファイルを列挙する（`glob e2e/**/*.spec.ts`, `glob features/**/*.feature`, `glob src/**/*.test.ts`）
2. 各設定ファイル（`playwright.config.ts`, `cucumber.js`, `vitest.config.ts`）の `testDir` / `testIgnore` / `paths` / `include` を照合する
3. 各ファイルが正確に1つの実行パスに所属し、意図しない重複・漏れがないことを確認する

### 適用範囲

Playwright のプロジェクト追加・削除、Cucumber のプロファイル変更、テストディレクトリ構造の変更など、テスト実行の「枠組み」に影響する変更全般。テストコード自体の変更（ケース追加等）には不要。

---

## LL-009: 読み取り専用テストでは書き込みパスのバグを検出できない

- **発見日:** 2026-03-20
- **発見契機:** インシデント記録（`docs/operations/incidents/`）の横断分析 — 10件中8件が人間の手動確認で発見

### 事象

BDDサービス層テスト（InMemory）と本番スモークテスト（GETのみ）は全件PASSしていたが、本番環境では書き込み系の機能が複数壊れていた。インシデント記録を横断分析したところ、本番で発見されたバグの大半が書き込みパスに集中していた:

| インシデント | 根本原因 | 読み取り専用テストで検出可能か |
|---|---|---|
| マイグレーション未適用 | DB スキーマ不整合 | 不可能（GETは既存データを返すだけ） |
| CommandService 未初期化 | setter DI 呼び忘れ（LL-004） | 不可能（コマンドはPOSTで発火） |
| fs.readFileSync 依存（LL-006） | workerd 非互換 | 不可能（ファイル読み込みはPOST処理中） |

BDDサービス層テストはビジネスロジックの正しさを検証するが、本番のランタイム環境・DI配線・マイグレーション適用状態は検証対象外である。読み取り専用のスモークテストはページの存在を確認するが、書き込みAPIの動作は原理的に検証できない。この2層の間にある「本番環境での書き込みパス」が構造的な死角だった。

### 対策: 本番書き込みテストの自動化

死角を塞ぐために、本番環境に対する書き込みテスト（Phase B）を新設した。最大の障壁はTurnstile（CAPTCHA）であり、以下の3案を検討した:

| 案 | 方式 | 採否 | 理由 |
|---|---|---|---|
| A | 本番コードにテスト用バイパスを追加 | **却下** | セキュリティリスク（攻撃者もバイパス可能） |
| B | 事前シード edge-token | **採用** | Turnstile不介在の認証経路を利用。本番コード変更ゼロ |
| C | Turnstileテスト用サイトキーを本番に適用 | **却下** | 本番のセキュリティレベルを恒常的に下げる |

**方式Bの仕組み:** DBマイグレーションで smoke 専用ユーザー（`users` + `edge_tokens`）を事前INSERT。トークンは `gen_random_uuid()` でDB内部生成し、gitに含まれない。テストはこのトークンをCookieに設定して書き込みAPIを呼ぶ。管理者アカウント（email+password認証、Turnstile不介在）でテストデータを削除する。

### 副次的な設計判断

1. **エージェント分離:** テスト実行（自動・オーケストレーター連携）と障害調査（対話的・人間介在）を別エージェントに分離した。テスト実行の自動化と、障害時の人間判断を両立する構造
2. **デプロイ後検証のタイミング:** コード正当性の検証（bdd-gate）はPhase 5でまとめて実行。デプロイ正当性の検証（bdd-smoke）は毎デプロイ後に実行。検出対象のライフサイクルが異なるため、頻度も異なる

### 教訓

**テスト戦略を設計する際は「何をテストしているか」だけでなく「何がテストされていないか」を明示的に分析する。** 特に、テスト環境と本番環境の差異（ランタイム、DI配線、DB状態）から生じる死角は、個別テストの追加ではなく、テスト戦略レベルでの構造変更（新しいテスト層の追加、認証回避方式の設計）で対処する必要がある。

### うまく機能したこと

今回の対策は「最初から完璧なテスト戦略を設計できた」のではなく、**インシデント記録の蓄積→横断分析→真因特定→構造的対策**というサイクルが回った結果である。

- **インシデントを都度記録していた**（`docs/operations/incidents/`）ことで、後から「10件中8件が人間の目検で発見」という定量的なパターン分析が可能になった
- LL-001〜007の個別教訓が蓄積されていたことで、「書き込みパスに集中」「本番固有の環境差異が原因」という共通パターンの抽出に至った
- 個別バグの修正で終わらず、テスト戦略レベルの構造的欠陥として認識できたのは、記録の蓄積があったからこそ

**最初から完璧である必要はない。壊れたときに記録し、記録からパターンを見つけ、構造で塞ぐ。このサイクルを回せる体制（記録の習慣とフォーマット）を最初に整えておくことが重要。**

See: `docs/architecture/bdd_test_strategy.md` §10-§11

---

## LL-010: 派生カウンタは書き込み経路上の単体テストで保護する

- **発見日:** 2026-03-20
- **発見契機:** BOTヘルスチェック（C8）で `bots.total_posts = 0` と `bot_posts` 実件数 = 4 の乖離を検出

### 事象

`BotService.executeBotPost()` で投稿成功後に `incrementTotalPosts` を呼び出すコードが実装されていなかった。インフラ層（`BotRepository.incrementTotalPosts`、DB RPC）は準備完了していたが、サービス層のインターフェース定義（`IBotRepository`）とビジネスロジックの双方で呼び出しが欠落していた。

同じパターンで `accused_count`（被告発回数）も `AccusationService.accuse()` から `incrementAccusedCount` の呼び出しが欠落していることが判明した。

4種のカウンタのうち、`times_attacked` と `survival_days` は正しく実装され、`total_posts` と `accused_count` が欠落していた。

### 根本原因

1. **チェック漏れ**: カウンタ4種の実装を横断的に確認する手順がなかった。2種の実装に成功したことで残り2種の存在を見落とした
2. **BDDシナリオの性質上の限界**: BDDシナリオはユーザー視点の振る舞いを検証する。「投稿のたびにカウンタがインクリメントされる」という内部動作はユーザーから直接観測できないため、BDDシナリオとしては定義しにくい。撃破シナリオでは `totalPosts: 42` を Given として直接セットしており、インクリメント処理自体はテスト経路を通過しない
3. **リポジトリ層テストの限界**: `BotRepository.incrementTotalPosts` の単体テストは「RPCが正しく呼ばれるか」を検証するが、「サービス層から呼ばれているか」は検証範囲外

### 教訓

**派生カウンタ（他テーブルの操作に連動してインクリメントされる値）は、その書き込み操作の単体テストで「カウンタが呼ばれたこと」を必ず検証する。** BDDシナリオや結合テストでカバーするには粒度が細かすぎるため、単体テストが唯一の防御線になる。

```typescript
// accuse() のテストで incrementAccusedCount の呼び出しを検証する
it("告発成功時に incrementAccusedCount が1回呼ばれる", async () => {
    await service.accuse(input);
    expect(botRepo.incrementAccusedCount).toHaveBeenCalledTimes(1);
});
```

### 具体的な対策指針

1. **新しいカウンタを追加する際のチェックリスト**:
   - [ ] DBカラムが定義されている（マイグレーション）
   - [ ] ドメインモデルに型定義がある
   - [ ] リポジトリ層にインクリメント関数がある
   - [ ] サービス層のインターフェース（I*Repository）にメソッドが定義されている
   - [ ] ビジネスロジックの書き込み経路上で呼び出されている
   - [ ] 単体テストで「呼び出されたこと」が検証されている

2. **既存カウンタの横展開確認**: 新しいカウンタを追加した際は、同種のカウンタが他のビジネスロジック経路で正しくインクリメントされているかを必ず横展開確認する

3. **BOTヘルスチェック C8 の有効性**: 今回のバグは C8（total_posts 整合性チェック）で検出された。同様の整合性チェックを `accused_count` にも追加することを推奨する（`bots.accused_count` と `accusations` テーブルの `result = 'hit'` 件数の突合）

### LL-003 との関係

LL-003「バグの原因はテスト層の不足ではなくテストケースの不足」が本件にも当てはまる。新しいテスト層は不要であり、既存の単体テスト層（Vitest）にテストケースを追加すれば検出できた。ただし LL-003 が「既存層にケースを追加すれば十分」と結論づけたのに対し、本件は「どのケースを追加すべきかを実装時に認識できなかった」点が異なる。上記チェックリストはこの認識の欠落を防ぐためのものである。

See: `docs/operations/incidents/2026-03-20_bot_total_posts_increment_missing.md`
