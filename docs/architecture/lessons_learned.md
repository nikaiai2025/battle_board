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
