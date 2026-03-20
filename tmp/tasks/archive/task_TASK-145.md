---
task_id: TASK-145
sprint_id: Sprint-51
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-18T12:30:00+09:00
updated_at: 2026-03-18T12:30:00+09:00
locked_files:
  - "src/app/(senbra)/[boardId]/subject.txt/route.ts"
  - "src/app/(senbra)/[boardId]/dat/[threadKey]/route.ts"
  - "src/__tests__/app/(senbra)/[boardId]/subject.txt/route.test.ts"
---

## タスク概要

専ブラ互換ルート（subject.txt / DAT）のレスポンスに `Cache-Control` ヘッダが未設定のため、専ブラがHTTPヒューリスティックキャッシュを適用し、サーバーに問い合わせずにローカルキャッシュを返してしまう。これにより新規スレッド作成後も専ブラのスレッド一覧が更新されない。

`Cache-Control: no-cache` を追加し、専ブラが毎回If-Modified-Since付きの条件付きリクエストを送るよう強制する。

## 対象BDDシナリオ

- 既存BDDシナリオの変更は不要（HTTPヘッダの追加のみ）

## 必読ドキュメント（優先度順）

1. [必須] `src/app/(senbra)/[boardId]/subject.txt/route.ts` — subject.txt route
2. [必須] `src/app/(senbra)/[boardId]/dat/[threadKey]/route.ts` — DAT route
3. [参考] RFC 7234 §4.2.2 — ヒューリスティックキャッシュの規定

## 出力（生成すべきファイル）

- `src/app/(senbra)/[boardId]/subject.txt/route.ts` — Cache-Control追加
- `src/app/(senbra)/[boardId]/dat/[threadKey]/route.ts` — Cache-Control追加
- テストファイル — Cache-Controlヘッダの検証追加

## 完了条件

- [ ] subject.txt の全レスポンス（200/304）に `Cache-Control: no-cache` を付与
- [ ] DAT route の全レスポンス（200/206/304）に `Cache-Control: no-cache` を付与
- [ ] 既存テスト全PASS（`npx vitest run`）
- [ ] Cache-Controlヘッダの存在を検証するテスト追加

## 修正方針

### 背景: HTTPヒューリスティックキャッシュ問題

RFC 7234 §4.2.2 によると、Cache-Controlが未指定かつLast-Modifiedが存在する場合、クライアントは以下のヒューリスティックを適用してよい:

```
freshness_lifetime = (現在時刻 - Last-Modified) × 係数（通常10%）
```

例: Last-Modifiedが10時間前 → キャッシュ有効期間 = 1時間
→ その間、専ブラはサーバーにリクエストすら送らない
→ 新規スレッドが作成されても一覧が更新されない

### 修正内容

#### 1. subject.txt route

200レスポンスのヘッダに追加:
```typescript
headers: {
    "Content-Type": "text/plain; charset=Shift_JIS",
    "Content-Length": String(sjisBuffer.length),
    "Last-Modified": lastModified,
    "Cache-Control": "no-cache",  // ← 追加
},
```

304レスポンスにも追加:
```typescript
return new Response(null, {
    status: 304,
    headers: { "Cache-Control": "no-cache" },  // ← 追加
});
```

#### 2. DAT route

200/206/304 の全レスポンスに同様に `Cache-Control: no-cache` を追加。

### `no-cache` の意味（注意）

- `no-cache` ≠ キャッシュ禁止
- `no-cache` = 「キャッシュの格納はOKだが、使用前に必ず条件付きリクエスト（If-Modified-Since）で再検証すること」
- これにより、専ブラは毎回サーバーに確認し、更新がなければ304（高速）、更新があれば200（新データ）を受け取る
- `no-store`（キャッシュ完全禁止）よりも効率的

## スコープ外

- bbs.cgiの書き込みレスポンスの変更
- 304判定ロジックの変更（TASK-144で修正済み）
- BDDシナリオの追加・変更

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全完了条件を達成
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. subject.txt route (`src/app/(senbra)/[boardId]/subject.txt/route.ts`) に Cache-Control: no-cache を追加
   - 200レスポンスのheadersに追加
   - 304レスポンスのheadersに追加
2. DAT route (`src/app/(senbra)/[boardId]/dat/[threadKey]/route.ts`) に Cache-Control: no-cache を追加
   - 200レスポンス（handleFullRequest）に追加
   - 206レスポンス・差分あり（handleRangeRequest）に追加
   - 206レスポンス・更新なし（handleRangeRequest）に追加
   - 304レスポンスに追加
3. subject.txt テスト (`src/__tests__/app/(senbra)/[boardId]/subject.txt/route.test.ts`) にCache-Controlヘッダ検証を追加
   - 200（スレッドあり）に no-cache が含まれることを検証
   - 200（スレッドなし）に no-cache が含まれることを検証
   - 304 に no-cache が含まれることを検証
4. DAT route テスト (`src/__tests__/app/(senbra)/[boardId]/dat/[threadKey]/route.test.ts`) を新規作成
   - 200レスポンスのCache-Control検証
   - 304レスポンスのCache-Control検証
   - 206（差分あり）レスポンスのCache-Control検証
   - 206（更新なし）レスポンスのCache-Control検証
   - その他 Content-Type / Last-Modified / Content-Length 等の基本ヘッダ検証

### テスト結果サマリー

- 実行コマンド: `npx vitest run`
- テストファイル数: 47 passed (46 → +1 新規追加)
- テストケース数: 1186 passed (1174 → +12 新規追加)
- 失敗件数: 0
- 全テストPASS確認済み
