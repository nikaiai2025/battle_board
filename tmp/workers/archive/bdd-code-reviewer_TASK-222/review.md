# コードレビューレポート: Sprint 75-79 (TASK-222)

レビュー日: 2026-03-21
レビュアー: bdd-code-reviewer
対象: Sprint-75 ~ Sprint-79 の変更ファイル全量

---

## 指摘事項

### [HIGH-001] HissiHandler: 同一データに対する冗長な2回のDBクエリ

ファイル: `src/lib/services/handlers/hissi-handler.ts:158-171`

問題点: `findByAuthorIdAndDate` を同一の `authorId` と `today` に対して2回呼び出している。1回目は全件取得（件数カウント用）、2回目は limit=3 で最新3件取得。1回目で全件をメモリにロードしているため、2回目のクエリは不要であり `allPosts.slice(0, 3)` で代替できる。ユーザーが大量に書き込みしている場合、不要なDBラウンドトリップが発生する。

```typescript
// 現状: 2回DBクエリを発行
const allPosts = await this.postRepository.findByAuthorIdAndDate(authorId, today);
const totalCount = allPosts.length;
const displayPosts = await this.postRepository.findByAuthorIdAndDate(
    authorId, today, { limit: 3 });

// 改善案: 1回のクエリで済ませる
const allPosts = await this.postRepository.findByAuthorIdAndDate(authorId, today);
const totalCount = allPosts.length;
const displayPosts = allPosts.slice(0, 3); // created_at DESC ソート済み
```

---

### [HIGH-002] AttackHandler: 賠償金付与の CreditReason が不正確

ファイル: `src/lib/services/handlers/attack-handler.ts:391-395`

問題点: フローC（対象が人間の場合）の賠償金付与で `CreditReason` に `"bot_elimination"` を使用している。実態は人間への誤攻撃による賠償金であり、ボット撃破報酬ではない。通貨の監査ログ上で賠償金と撃破報酬が区別できなくなる。

```typescript
// 現状: bot_elimination はボット撃破報酬の理由だが、賠償金に流用されている
await this.currencyService.credit(
  targetUserId,
  actualCompensation,
  "bot_elimination",  // 不正確
);
```

修正案: `CreditReason` 型 (`src/lib/domain/models/currency.ts`) に `"compensation"` を追加し、賠償金と撃破報酬を区別する。ドメインモデルの変更を伴うため影響範囲の確認が必要。

---

### [MEDIUM-001] ImageThumbnail: コンポーネント単体でのプロトコル検証が不在

ファイル: `src/app/(web)/_components/ImageThumbnail.tsx:56-63`

問題点: `url` prop を `<a href>` と `<img src>` にそのまま渡している。呼び出し元の `detectUrls` が `https?://` で始まるURLのみ検出するため、`javascript:` や `data:` URIが混入するリスクは現状では低い。ただし、コンポーネント自体は入力を検証しておらず、将来別のコンテキストから呼ばれた場合の防御層がない。

React の JSX 自動エスケープは `<a href>` の `javascript:` URI には効かないため、防御的プログラミングとしてコンポーネント側でのプロトコル検証を推奨する。

```typescript
// 推奨: コンポーネント側の防御的チェック
export default function ImageThumbnail({ url }: ImageThumbnailProps) {
  if (!/^https?:\/\//i.test(url)) return null;
  // ...
}
```

---

### [MEDIUM-002] HissiHandler/KinouHandler: UTC基準の日付計算とJST基準の日次IDの不一致

ファイル: `src/lib/services/handlers/hissi-handler.ts:154-156`, `src/lib/services/handlers/kinou-handler.ts:142-147`

問題点: `HissiHandler` は「今日」を UTC で計算しているが、日次リセットID は JST 基準で生成される（PostService の `getTodayJst()`）。JST 0:00 ~ 8:59（= UTC 前日 15:00 ~ 23:59）の間に書き込みが行われた場合、UTC と JST で「今日」が異なり、検索結果にずれが生じる。

`findByAuthorIdAndDate` が UTC の `created_at` で絞り込む設計であるためコード内部の整合性はとれているが、ユーザーの期待（日本時間で「今日」「昨日」）との乖離が存在する。コメントに意図が記載されているため設計判断として許容可能だが、ユーザー向けの説明や BDD シナリオでの明示が望ましい。

---

### [MEDIUM-003] EliminatedBotToggleContext: Context value の参照安定性

ファイル: `src/app/(web)/_components/EliminatedBotToggleContext.tsx:57-59`

問題点: `EliminatedBotToggleProvider` の `value` プロパティが毎レンダー時に新しいオブジェクトリテラルとして生成される。`toggle` 関数も毎回新しい参照が作られるため、Context を参照する全子コンポーネントが不要に再レンダーされる。

```typescript
// 現状: 毎レンダーで新規オブジェクト生成
<EliminatedBotToggleContext.Provider
  value={{ showEliminatedBotPosts: show, toggle: () => setShow((v) => !v) }}
>

// 改善案: useMemo + useCallback で参照安定化
const toggle = useCallback(() => setShow((v) => !v), []);
const value = useMemo(
  () => ({ showEliminatedBotPosts: show, toggle }),
  [show, toggle],
);
```

現状のスレッドページ規模では実害は限定的だが、React Context のベストプラクティスとして修正が望ましい。

---

### [MEDIUM-004] HissiHandler: N+1問題 -- ループ内でスレッド名を個別取得

ファイル: `src/lib/services/handlers/hissi-handler.ts:197-201`

問題点: 表示用レス（最大3件）に対し、各レスの `threadId` で `threadRepository.findById()` を個別呼び出ししている。最大3回のDBクエリが直列で発行される。

```typescript
for (const post of sortedPosts) {
  const thread = await this.threadRepository.findById(post.threadId);
  // ...
}
```

件数が最大3件に制限されているため実害は限定的だが、一括取得メソッド（`findByIds` 等）があれば1回のクエリで済む。既存の `BotRepository.findByIds` と同パターン。

---

### [LOW-001] url-detector: ReDoS 耐性は十分（問題なし）

ファイル: `src/lib/domain/rules/url-detector.ts:46`

確認結果: `URL_PATTERN = /https?:\/\/[^\s<>"']+/g` は否定文字クラスのみの繰り返しであり、バックトラッキングが発生するネスト量指定子を含まない。ReDoS に対して安全。

---

### [LOW-002] PostService.getPostListWithBotMark: セキュリティ設計は適切（問題なし）

ファイル: `src/lib/services/post-service.ts:910-963`

確認結果: 活動中BOT（`is_active=true`）の情報漏洩防止ロジックが正しく実装されている。
- Step 6: `bots.filter((b) => !b.isActive)` で撃破済みBOTのみを抽出
- Step 7: 撃破済みBOTの書き込みのみが `botPostMap` に登録される
- 活動中BOTの書き込みは `botMark=null` として返却される

単体テストにも活動中BOTおよび暴露済み活動中BOTに対するセキュリティテストが存在し、検証済み。

---

### [LOW-003] bot-post-repository: RLS保護テーブルへのアクセスは適切（問題なし）

ファイル: `src/lib/infrastructure/repositories/bot-post-repository.ts:16, 92-112`

確認結果: `findByPostIds` は `supabaseAdmin`（service_role キー）を使用してRLSをバイパスしている。これは設計上意図的であり、JSDoc に「RLS により anon/authenticated ロールからの全操作を全拒否」と明記されている。`supabaseAdmin` がクライアントサイドコードから import されていないことも確認済み。

---

### [LOW-004] attack-repository: post_id nullable 化対応は適切（問題なし）

ファイル: `src/lib/infrastructure/repositories/attack-repository.ts:51, 69, 99`

確認結果: `AttackRow.post_id` が `string | null` に対応済み。`rowToAttack` で `row.post_id ?? null` の null セーフ処理あり。`AttackHandler` 側でも `ctx.postId || null` で空文字列を null に変換。

---

## レビューサマリー

| 重要度   | 件数  | ステータス |
|----------|-------|-----------|
| CRITICAL | 0     | pass      |
| HIGH     | 2     | warn      |
| MEDIUM   | 4     | info      |
| LOW      | 4     | note      |

### HIGH 指摘

| ID | ファイル | 概要 |
|----|---------|------|
| HIGH-001 | hissi-handler.ts | 同一データへの冗長な2回DBクエリ |
| HIGH-002 | attack-handler.ts | 賠償金の CreditReason に bot_elimination を誤用 |

### 判定: WARNING

マージはブロックしない。HIGH 2件は次スプリントでの改善を推奨する。

- HIGH-001: 単純な最適化で修正可能（DBクエリ1回に統合し `.slice(0, 3)` で代替）
- HIGH-002: `CreditReason` ドメインモデルの拡張が必要。機能的な動作に支障はないが、監査ログの正確性に影響する

### セキュリティ重点レビュー結果

| 対象 | 結果 | 備考 |
|------|------|------|
| PostService.getPostListWithBotMark 活動中BOT情報漏洩 | **PASS** | is_active=true のBOTは botMark に含まれない。テストあり |
| bot-post-repository RLS保護テーブルアクセス | **PASS** | supabaseAdmin 使用、クライアント側から未import |
| ImageThumbnail XSS/SSRF対策 | **PASS (条件付き)** | detectUrls が https?:// に限定するため現状安全。コンポーネント側の防御は推奨 (MEDIUM-001) |
| url-detector ReDoS耐性 | **PASS** | 否定文字クラスのみ、ネスト量指定子なし |
