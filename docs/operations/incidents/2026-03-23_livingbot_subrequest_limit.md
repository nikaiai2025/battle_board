# 2026-03-23: !livingbot CF Workers サブリクエスト上限 + PostgREST 型不整合

## 概要

| 項目 | 内容 |
|---|---|
| 発生日 | 2026-03-23 |
| 重大度 | High（コマンド機能完全停止） |
| 種別 | N+1クエリパターン → 修正時の型不整合（連鎖障害） |
| 影響コマンド | `!livingbot` |
| ステータス | 修正済み（Sprint-102 + Sprint-103） |

本障害は2段階で発生した。最初の障害（500エラー）の修正が第二の障害（無反応）を引き起こした連鎖障害である。

---

## インシデント1: CF Workers サブリクエスト上限エラー（500）

### 症状

`!livingbot` を含む書き込みで HTTP 500 エラーが返される。

```json
{"error":"INTERNAL_ERROR","message":"サーバー内部エラーが発生しました"}
```

CF Workers のログ（`wrangler tail`）に以下が出力:

```
Error: Too many subrequests by single Worker invocation.
```

### 直接原因

`countLivingBots()` の区分B（スレッド固定BOT: tutorial, aori）が、BOT 1体ごとに bot_posts → posts → threads の3クエリを発行する N+1 パターンであった。

クエリ数: `1 + 3N`（N = スレッド固定BOT数）

これが書き込みフロー全体の他のクエリ（edge-token検証、通貨チェック、コマンド実行、投稿INSERT等）と合算され、CF Workers の 1000 サブリクエスト上限を超過した。

### 根本原因

`countLivingBots()` の初回実装（Sprint-101, コミット `5f0df18`）時、区分Bの実装でスレッド固定BOTごとにループ内で3クエリを発行する設計を採用した。開発環境ではBOT数が少なく問題にならなかったが、CF Workers 環境固有のサブリクエスト上限を考慮していなかった。

### 修正内容（Sprint-102, コミット `a880754`）

N+1ループを Supabase ネストselect 1クエリに最適化:

```typescript
// 変更前: BOT1体ごとに3クエリ × N体 = 3Nクエリ
// 変更後: 1クエリ（ネストselect）
supabaseAdmin.from("bots")
  .select("id, bot_posts(post_id, posts(thread_id, threads(is_dormant)))")
  .eq("is_active", true)
  .in("bot_profile_key", ["tutorial", "aori"])
```

---

## インシデント2: PostgREST many-to-one 型不整合による無反応

### 症状

Sprint-102 デプロイ後、`!livingbot` の 500 エラーは解消したが、コマンド応答が返らない「無反応」状態になった。エラーログも出力されない。

### 直接原因

Sprint-102 で導入したネストselect の戻り値で、PostgREST の many-to-one FK 関係（`bot_posts→posts`, `posts→threads`）が**単一オブジェクト**を返すのに対し、`ThreadFixedBotRow` 型が**配列**として定義されていた。

配列前提のコード（`.some()`）が単一オブジェクトに対して実行され、TypeError が発生。このエラーは `PostService` の try-catch（line 471-475）で黙殺され、ユーザーには「無反応」として見えた。

```typescript
// PostService line 471-475（エラー黙殺パターン）
} catch (err) {
    console.error("[PostService] CommandService.executeCommand failed:", err);
    // → 書き込み自体は成功するが、コマンド結果（システムメッセージ）が生成されない
}
```

### 根本原因

PostgREST のネストselect における FK カーディナリティと戻り値の型の対応関係が、実装者に正しく認識されていなかった。

| FK関係 | PostgREST 戻り値 | コードの前提 | 結果 |
|---|---|---|---|
| one-to-many (`bots→bot_posts`) | 配列 | 配列 | 正常 |
| many-to-one (`bot_posts→posts`) | **単一オブジェクト** | **配列** | TypeError |
| many-to-one (`posts→threads`) | **単一オブジェクト** | **配列** | TypeError |

### 修正内容（Sprint-103, コミット `0a0962d`）

ネストselect（1クエリ）を2クエリに分離し、many-to-one の型不安定性を回避:

- クエリ1: `bots` + `bot_posts(post_id)` — one-to-many のみ（安全）
- クエリ2: `posts` + `threads(is_dormant)` — many-to-one だが `Array.isArray()` で両対応

合計クエリ数: 区分A(1) + 区分B(最大2) = 3クエリ以内（CF Workers 制約充足）。

---

## 影響範囲

### 直接影響

- `!livingbot` コマンドが完全に機能停止（インシデント1: 500エラー → インシデント2: 無反応）
- `!livingbot` を含む書き込み自体は（インシデント2では）DBに保存されるが、システムメッセージが生成されない

### 間接影響

- `!livingbot` 以外のコマンド（`!attack`, `!tell`, `!omikuji` 等）には影響なし — `countLivingBots()` は `!livingbot` ハンドラ専用
- BOTの自動書き込みには影響なし — `countLivingBots()` は BOT 書き込みフローから呼ばれない
- インシデント1（500エラー）時は書き込み全体が失敗するため、`!livingbot` と同時に他のコマンドを発行するケースでも書き込み自体が保存されない

### ビジネスインパクト

**中程度。** `!livingbot` はゲーム進行に必須ではないが、BOTの生存状況を確認する唯一の手段であり、ゲーム体験の中核に近い機能である。通貨・報酬・BOTのHP等のゲームバランスへの影響はない。

---

## タイムライン

| 時刻 | イベント |
|---|---|
| Sprint-101 | `!livingbot` 初回実装（N+1クエリパターンを内包） |
| 2026-03-23 | 本番で `!livingbot` を含む書き込みが 500 エラー。`wrangler tail` で `Too many subrequests` を確認 |
| 2026-03-23 (Sprint-102) | TASK-279: N+1クエリを Supabase ネストselect に最適化。デプロイ |
| 2026-03-23 (Sprint-102 デプロイ直後) | 500 エラーは解消したが「無反応」発生。PostgREST many-to-one 型不整合を特定 |
| 2026-03-23 (Sprint-103) | TASK-280: ネストselect を2クエリに分離 + `Array.isArray()` 安全ハンドリング。デプロイ |
| 2026-03-23 (Sprint-103 デプロイ後) | `!livingbot` 正常動作確認。BDD 14シナリオ全 PASS |

---

## なぜ開発・テスト段階で検出できなかったか

### インシデント1（N+1クエリ）

1. **CF Workers 固有の制約がテスト環境で再現しない**: BDD テスト（Cucumber）はインメモリ実装で動作し、Vitest 単体テストもモックを使用する。いずれも実際の Supabase へのリクエスト数を計測しない。CF Workers のサブリクエスト上限はデプロイ後にしか検証できない
2. **BOT数が少ない開発段階では閾値に到達しない**: N+1 クエリのN（スレッド固定BOT数）が少ないうちは合計クエリ数が1000を下回る。BOT数の増加に伴い顕在化する時限式の問題であった

### インシデント2（PostgREST 型不整合）

1. **Supabase SDK の型推論が実行時の挙動と乖離**: TypeScript の型定義上はエラーにならないが、PostgREST の実行時レスポンスが型定義と異なる。静的型チェックでは検出不可能
2. **BDD テストがインメモリ実装で動作**: `countLivingBots()` のインメモリ実装はストアベースの単純カウントであり、PostgREST のネストselect の戻り値構造を再現しない
3. **PostService の try-catch によるエラー黙殺**: コマンド実行失敗時に例外を握りつぶし、書き込み自体は成功させる設計。この設計はユーザー体験上は合理的（書き込みが消えない）だが、障害検知を遅らせる

---

## 再発防止策

### 短期（実施済み）

| # | 対策 | 状態 |
|---|---|---|
| 1 | `countLivingBots()` を N+1 から 3クエリ以内に最適化 | Sprint-102 で実施 |
| 2 | PostgREST many-to-one の戻り値を `Array.isArray()` で安全にハンドリング | Sprint-103 で実施 |
| 3 | `PostWithThread` 型定義にユニオン型（`object \| Array \| null`）を採用し、ドキュメントコメントで PostgREST の挙動を注記 | Sprint-103 で実施 |

### 中期（提案）

| # | 対策 | 対象ドキュメント |
|---|---|---|
| 4 | **CF Workers サブリクエスト上限に関するアーキテクチャガードレール追加**: 書き込みフロー内の総クエリ数の目安上限を D-07 に明記する。新機能追加時にクエリ数の増加を意識させる | D-07 |
| 5 | **PostgREST ネストselect 使用ガイドライン**: many-to-one FK の戻り値が単一オブジェクトになる挙動を D-08 bot.md またはコーディング規約に記載する。ネストselect 使用時は必ず `Array.isArray()` ガードを入れるルールとする | D-08 |
| 6 | **コマンド実行エラーのログレベル強化**: `PostService` の try-catch で黙殺しているエラーに、構造化ログ（エラー種別、コマンド名、スレッドID）を追加し、CF Workers のログで障害検知しやすくする | posting.md |

### 長期（検討）

| # | 対策 | 備考 |
|---|---|---|
| 7 | **クエリカウンターの導入**: 1リクエスト内の Supabase クエリ発行数をカウントし、閾値超過時に警告ログを出力する仕組み。本番障害を未然に防ぐ | CF Workers 環境ではミドルウェアでの計測が現実的 |
| 8 | **E2Eスモークテストの導入**: 本番デプロイ後に主要コマンドの動作確認を自動実行する。インメモリテストでは検出できない環境依存の障害を早期検知する | GitHub Actions から CF Workers エンドポイントを叩く構成 |

---

## 教訓

### CF Workers 環境固有の制約

CF Workers には 1 リクエストあたり 1000 サブリクエストの上限がある。Supabase への各クエリが 1 サブリクエストとしてカウントされるため、N+1 クエリパターンは CF Workers 環境では致命的になりうる。書き込みフロー全体で数十クエリを使用する本システムでは、個別機能のクエリ数を 3 以内に抑える意識が必要である。

### PostgREST ネストselect の型安全性

Supabase のネストselect は便利だが、FK のカーディナリティ（one-to-many vs many-to-one）によって戻り値の構造が変わる。TypeScript の型定義だけでは実行時の挙動を保証できないため、ネストselect よりも明示的な複数クエリへの分離が安全である。やむを得ずネストselect を使う場合は `Array.isArray()` ガードを必須とする。

### エラー黙殺パターンの二面性

`PostService` の try-catch によるエラー黙殺は「書き込みを失わない」というユーザー体験上の利点がある一方、障害の検知を遅らせる。ログの構造化・監視強化とセットで運用する必要がある。

---

## 関連ファイル

- `src/lib/infrastructure/repositories/bot-repository.ts` — `countLivingBots()` 本体
- `src/lib/services/post-service.ts` L458-475 — コマンド実行の try-catch
- `features/command_livingbot.feature` — BDD シナリオ（14シナリオ）

## 関連コミット

- `5f0df18` — Sprint-101: `!livingbot` 初回実装（N+1クエリを内包）
- `a880754` — Sprint-102: N+1クエリ最適化（ネストselect導入 → インシデント2を誘発）
- `0a0962d` — Sprint-103: ネストselect型不整合修正（2クエリ分離 + Array.isArray）
