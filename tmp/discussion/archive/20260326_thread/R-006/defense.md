# DEF-006 — Blue Team 抗弁

---

## ATK-006-1

**問題ID**: ATK-006-1
**判定**: ACCEPT（限定的同意）
**根拠**:

バグ自体は存在する。ただし重大度を CRITICAL から HIGH に引き下げることを主張する。

### バグの存在確認

攻撃の技術的分析は正確である。

- `AnchorLink.tsx:51-60` の `handleClick` は `e.stopPropagation()` を呼んでいない
- `AnchorPopup.tsx:96-100` の `stopPropagation` はポップアップ内部の div に対してのみ作用し、ポップアップ外の `AnchorLink`（通常の PostItem 上）には無効
- React の合成イベント（`openPopup` 呼び出し）→ ネイティブ document クリックリスナー（`closeTopPopup` 呼び出し）の順に実行されるため、`popupStack.length` が変化しないケースでは同一バッチ内で開閉が打ち消される

### 重大度の限定（CRITICAL → HIGH）

CRITICAL 判定には「データ損失・セキュリティ侵害・サービス停止」のいずれかが必要だが、本バグが引き起こすのは **UI表示の即時閉鎖** という機能不全であり、データやサービスへの影響はない。

また再現には「既存ポップアップが1件以上開いている状態で、ポップアップ外の AnchorLink をクリックする」という具体的な操作シーケンスが必要であり、初回クリック（`popupStack.length` が 0 → 1 に変わる）では発生しない。

### 既存テストとの関係

`AnchorPopup.test.tsx` の「ポップアップ内部のクリックでは closeTopPopup が呼ばれない」テストは `stopPropagation` が機能することを検証しているが、**ポップアップ外の AnchorLink クリック時の挙動は一切テストしていない**。よって本バグはテストで検出できていない。

修正方針としては `AnchorLink.tsx:51` の `handleClick` 先頭に `e.stopPropagation()` を追加し、対応する単体テストを追加することで解消できる。

---

## ATK-006-2

**問題ID**: ATK-006-2
**判定**: ACCEPT（限定的同意）
**根拠**:

指摘の核心（@fab の2シナリオがステップ定義未実装）は事実だが、重大度評価と一部の前提に異議を唱える。

### ステップ定義未実装の確認

`features/step_definitions/` ディレクトリに @fab シナリオ用のステップ定義が存在しないことは、ファイル全体のグレップで確認済み。これは D-10 §7.3.1 の pending 運用ルール（`return "pending"` を明示的に定義する）に違反している状態である。

### 「外側タップで閉じない」という機能不全の確認

`FloatingActionMenu.tsx` の書き込みパネルは CSS `translate-y` の `<div>` 実装であり、shadcn/ui の `<Sheet>` （`onOpenChange` 経由の backdrop クリック）を使っていない（L120-146）。X ボタン（L137-144）以外に書き込みパネルを閉じる手段が存在しないため、「ボトムシートの外側をタップするとフォームが閉じる」という受け入れ基準は実装されていない。

### 重大度の限定（CRITICAL → HIGH）

CRITICAL 判定の根拠として挙げられた「`failOnUndefinedSteps` 設定次第では0 failures でパスする」について、`cucumber.js` を確認すると `strict` も `failOnUndefinedSteps` も設定されていないため、デフォルト動作（`undefined` ステップはスキップ、失敗扱いにならない）となる。この点の指摘は正確である。

ただし問題は2層に分離できる:

1. **機能不全**（ボトムシート外タップで閉じない）: UXに直接影響するが、代替閉じ手段（X ボタン）が存在し、サービス停止・データ損失には至らない。HIGH 相当。
2. **テスト形骸化**（`undefined` シナリオがパス扱い）: D-10 §7.3.4 のpendingシナリオ管理方針に基づけば、`return "pending"` の明示実装を追加することで即座に対処できる。

検索・画像・設定の各パネルは `<Sheet>` コンポーネントを使用しており（L149-236）、`onOpenChange` 経由で外側クリック閉鎖が実装済みである。書き込みパネルのみがこの設計と乖離しているのは、PostForm の常時マウント要件（L87-92 コメント参照）によるアーキテクチャ上の意図的選択である。この選択自体の妥当性は BDD シナリオの範疇（`@fab` 追加シナリオ）で議論すべき問題であり、本 review の判定範囲を超えている。

---

## ATK-006-3

**問題ID**: ATK-006-3
**判定**: ACCEPT（限定的同意）
**根拠**:

テストが `<a>` レンダリングを検証していないという指摘は正しいが、重大度評価と「欺瞞テスト」という性格付けには部分的に異議を唱える。

### テストギャップの確認

`thread.steps.ts:2262-2279` の `Then "URLはリンクとして表示される"` は `detectUrls()` の戻り値のみを検証し、`PostItem.tsx` の `parsePostBody()` が実際に `<a>` タグを出力することを一切確認していない。

攻撃が主張する「`parsePostBody()` の非画像URLパスを壊してもこのテストはパスし続ける」は正確である。

### 「欺瞞テスト」判定への部分的異議

ただし、このテスト設計は D-10 §7.3.1 の方針に沿っている。表 §7.3.1 の分類ルールに従えば「DOM/CSS表示（画像URLのサムネイル展開・リンク化）」はサービス層で検証不可であり、`return "pending"` が正規の対応となる。

現状実装は「純粋関数 `detectUrls` の正確性まで」をサービス層で検証し、`PostItem.tsx` の `parsePostBody()` によるレンダリングは Vitest で検証する設計意図（context.md「サービス層代替検証（実装済み・パス）」の記述）に基づいている。

しかし `AnchorPopup.test.tsx` と異なり、`PostItem.tsx:115-165` の `parsePostBody()` に対応する Vitest テストは確認できない。`src/__tests__/app/(web)/_components/PostFormInsertText.test.tsx` は `PostForm` に関するテストであり、`parsePostBody` は対象外である。

つまり問題の本質は「detectUrls を検証する BDD テストは D-10 の方針上は許容範囲だが、`parsePostBody` の `<a>` タグ出力を検証する Vitest テストが存在しない」ことにある。重大度は HIGH ではなく **MEDIUM** が妥当と判断する（実装は正しく `<a>` タグを出力しているが、その保証がテストとして存在しない）。
