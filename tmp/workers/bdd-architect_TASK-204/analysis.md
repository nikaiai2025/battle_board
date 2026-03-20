# TASK-204: React Hydration Mismatch #418 原因分析

> 作成日: 2026-03-20
> ステータス: 完了

## 1. 原因

PostItem.tsx の `formatDateTime` 関数がタイムゾーン依存の Date メソッド（`getFullYear()`, `getMonth()`, `getDate()`, `getDay()`, `getHours()` 等）を使用していることが原因。

PostItem は `"use client"` 指定の Client Component だが、親の PostList を通じて Server Component（page.tsx）から props を受け取るため、SSR 段階でもサーバー上でレンダリングされる。このとき `formatDateTime` がサーバーのタイムゾーンで日時文字列を生成する。

**タイムゾーンの不一致:**
- サーバー（Cloudflare Workers）: UTC（+0:00）
- クライアント（ブラウザ）: JST（+9:00）

**実データでの再現:**

入力: `createdAt = "2026-03-19T23:45:58.719Z"`

| 環境 | formatDateTime 出力 |
|---|---|
| SSR（Cloudflare Workers, UTC） | `2026/03/19(木) 23:45:58` |
| Client（ブラウザ, JST） | `2026/03/20(金) 08:45:58` |

日付・曜日・時刻のすべてが不一致となり、React が hydration mismatch #418 を検出する。

### 該当コード

```typescript
// src/app/(web)/_components/PostItem.tsx L61-73
export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();        // TZ依存
  const month = String(date.getMonth() + 1).padStart(2, "0");  // TZ依存
  const day = String(date.getDate()).padStart(2, "0");          // TZ依存
  const dayName = DAY_NAMES[date.getDay()];                    // TZ依存
  const hours = String(date.getHours()).padStart(2, "0");       // TZ依存
  const minutes = String(date.getMinutes()).padStart(2, "0");   // TZ依存
  const seconds = String(date.getSeconds()).padStart(2, "0");   // TZ依存
  return `${year}/${month}/${day}(${dayName}) ${hours}:${minutes}:${seconds}`;
}
```

呼び出し元（PostItem.tsx L196-198）:
```tsx
<time className="text-gray-500 text-xs" dateTime={post.createdAt}>
  {formatDateTime(post.createdAt)}
</time>
```

## 2. ローカルで発生しない理由

ローカル開発環境（`npm run dev`）では Node.js サーバーもブラウザもJSTで動作するため、サーバーとクライアントの `formatDateTime` 出力が一致し、mismatch が発生しない。

## 3. 影響範囲

### 確定している影響箇所
- `src/app/(web)/_components/PostItem.tsx` の `formatDateTime`
  - PostList（SSR）経由で表示される全レスの日時表示

### 潜在的な同パターン（現時点では未発症）

| ファイル | 関数/呼出 | Client Component? | SSRデータ? | 発症リスク |
|---|---|---|---|---|
| `ThreadCard.tsx` の `formatRelativeTime` | `Date.now()` との差分計算 | No (Server Component) | Server only | なし（SSR完結） |
| `mypage/page.tsx` の `toLocaleString("ja-JP")` | L734 | Yes | No（useEffect+fetch） | なし（CSR完結） |
| `admin/users/[userId]/page.tsx` の `toLocaleString` | L380, L593 | Yes | No（useEffect+fetch） | なし（CSR完結） |
| `admin/ip-bans/page.tsx` の `toLocaleString` | L204, L209 | Yes | No（useEffect+fetch） | なし（CSR完結） |
| `domain/rules/mypage-display-rules.ts` の `toLocaleString` | L122 | N/A（domain層） | N/A | なし（CSR文脈で呼出） |

## 4. 修正方針

### 方針: formatDateTime を JST 固定に変更

`formatDateTime` 関数のすべての Date メソッドを UTC 基準で取得し、+9時間のオフセットを加算することで、サーバー・クライアント問わず JST で統一的に出力する。

#### 具体的な修正案

```typescript
export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  // JST = UTC + 9時間。サーバー（UTC）でもクライアント（任意TZ）でも
  // 同一の JST 日時文字列を出力し、hydration mismatch を防ぐ。
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);

  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  const dayName = DAY_NAMES[jst.getUTCDay()];
  const hours = String(jst.getUTCHours()).padStart(2, "0");
  const minutes = String(jst.getUTCMinutes()).padStart(2, "0");
  const seconds = String(jst.getUTCSeconds()).padStart(2, "0");

  return `${year}/${month}/${day}(${dayName}) ${hours}:${minutes}:${seconds}`;
}
```

### 方針の根拠

1. **5ch互換性**: 5chの日時表示はJST固定。ユーザーのタイムゾーンに関わらずJSTで表示するのが掲示板UIとしての正しい仕様
2. **確実性**: UTC メソッドは環境非依存。サーバーが UTC でもJST でもブラウザがどのTZでも同一出力を保証
3. **最小変更**: 1関数の内部実装のみの修正で済む。API契約（入力: ISO文字列、出力: JST文字列）は不変
4. **テスト容易**: 既存の単体テスト（存在する場合）の期待値はJST基準のため影響なし

### 代替案（不採用）

| 代替案 | 不採用理由 |
|---|---|
| `suppressHydrationWarning` 属性追加 | 根本解決にならない。ユーザーにUTC表示が一瞬見えるフラッシュが残る |
| クライアントサイドでのみ日時レンダリング（useEffect） | SSR のSEO/初期表示メリットが失われる。不必要に複雑 |
| Intl.DateTimeFormat + timeZone: "Asia/Tokyo" | 正しい手法だが、Cloudflare Workers の Intl サポートが不完全な可能性がある。UTC+9の手動オフセットの方が確実 |
| サーバー側で環境変数 TZ=Asia/Tokyo を設定 | Cloudflare Workers は TZ 環境変数をサポートしていない |

## 5. 修正対象ファイル

| ファイル | 修正内容 |
|---|---|
| `src/app/(web)/_components/PostItem.tsx` | `formatDateTime` 関数を JST 固定に変更（L61-73） |

## 6. テスト確認事項

- [ ] `npx vitest run` -- 既存テスト回帰なし
- [ ] `npx playwright test --config=playwright.prod.config.ts` の navigation スレッドページ 2件 + 旧URL 1件 が PASS
- [ ] ローカル `npx playwright test` の navigation テスト 19件 が PASS

## 7. スクリーンショットで確認した事実

スクリーンショットに表示されている時刻 `2026/03/20(金) 08:45:58` および `2026/03/20(金) 08:46:33` は、hydration 完了後のクライアント側レンダリング結果（JST）。SSR HTML上では UTC 表示（`2026/03/19(木) 23:45:58` / `2026/03/19(木) 23:46:33`）だったが、React がクライアントで再レンダリングした際にJST に置換された。React はこの不一致を検知し #418 エラーを発行した。
