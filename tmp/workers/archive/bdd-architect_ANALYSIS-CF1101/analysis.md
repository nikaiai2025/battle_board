# CF Error 1101 影響分析: Next.js 16.2.0 と @opennextjs/cloudflare 1.17.1 の非互換

> 作成日: 2026-03-20
> タスク: ANALYSIS-CF1101
> ステータス: 完了

---

## 1. 根本原因

### 1.1 エラーの再現経路

Next.js 16.2.0 は新たに `prefetch-hints.json` マニフェストを導入した（`next/dist/shared/lib/constants.d.ts` で `PREFETCH_HINTS = "prefetch-hints.json"` として定義）。`NextNodeServer` の起動時に `getPrefetchHints()` がこのマニフェストを `loadManifest()` 経由で読み込む。

`@opennextjs/cloudflare 1.17.1` の `load-manifest.js` プラグイン（32行目）は、ビルド時にマニフェストファイルを発見してインライン化するために以下のglob パターンを使用する:

```
**/{*-manifest,required-server-files}.json
```

`prefetch-hints.json` はこのパターンにマッチしない（`*-manifest.json` でも `required-server-files.json` でもない）。結果として、ランタイムの `loadManifest()` 内の switch 文にマッチするケースが存在せず、53行目の `throw new Error("Unexpected loadManifest(${$PATH}) call!")` が実行される。

### 1.2 影響範囲

- Cloudflare Workers 上のアプリケーション全体が起動不能（Error 1101）
- Vercel 側は影響なし（`loadManifest` はファイルシステム読み取りで動作するため）

### 1.3 既知の issue

GitHub issue [opennextjs/opennextjs-cloudflare#1157](https://github.com/opennextjs/opennextjs-cloudflare/issues/1157) として 2026-03-18（Next.js 16.2.0 リリース当日）に報告済み。2026-03-20 時点で修正PRは未提出、ステータスは `open`（triage ラベル付き）。

---

## 2. Next.js 16.2.0 の変更点と本プロジェクトへの影響

### 2.1 主要な改善点（16.1.6 → 16.2.0）

| 改善点 | 内容 | 本プロジェクトへの恩恵 |
|---|---|---|
| dev 起動高速化 | `next dev` 起動が 16.1 比で約87%高速化 | 開発体験の改善（DXのみ。本番無関係） |
| SSR レンダリング高速化 | RSC ペイロードの逆シリアライズが最大350%高速化。実アプリで25-60%のSSR高速化 | スレッド閲覧ページ等のSSR応答が高速化。ただしDBクエリがボトルネックの場合は効果限定的 |
| ImageResponse 高速化 | 基本画像で2倍、複雑画像で最大20倍 | OGP画像生成等で利用する場合に恩恵。現時点では未使用 |
| エラーページ刷新 | 500ページのデザイン改善 | 軽微。カスタムエラーページ未実装のため一定の恩恵あり |
| Server Function ログ | dev ターミナルに Server Function 実行ログ表示 | DXのみ。本番無関係 |
| Hydration Diff | ハイドレーション不一致の差分表示改善 | DXのみ |
| `--inspect` for `next start` | プロダクションサーバーにデバッガ接続可能 | CF Workers では未使用。Vercel でも限定的 |
| Adapters 安定化 | `adapterPath` がトップレベルオプションに昇格 | @opennextjs/cloudflare が将来的に活用する可能性 |
| `transitionTypes` prop | `<Link>` に View Transition タイプ指定 | 未使用 |
| Turbopack 200+ 修正 | ビルドの安定性・速度向上 | dev/build の安定性向上 |

### 2.2 本プロジェクトでの 16.2.0 固有機能の使用状況

**使用箇所: なし。**

`src/` ディレクトリ全体を検索した結果、以下の 16.2.0 新機能は一切使用されていない:
- `prefetchInlining`
- `cachedNavigations`
- `transitionTypes`
- `unstable_catchError`
- `unstable_retry`
- `adapterPath`
- `use cache`

### 2.3 TD-ARCH-001 で挙げられたアップグレード理由の検証

`tmp/arch_review_tech_debt.md` の TD-ARCH-001 では以下がメリットとして記載されている:

| 記載メリット | 検証結果 |
|---|---|
| dev起動 ~400%高速化 | DX改善のみ。本番に影響なし。ダウングレードしても本番UXは変わらない |
| レンダリング ~50%高速化 | SSR応答時間の改善だが、本プロジェクトの現段階（ユーザー数極少）では体感差は微小 |

---

## 3. 方針別 Pro/Con 分析

### 方針A: Next.js 16.1.6 にダウングレード

| 項目 | 評価 |
|---|---|
| **実施内容** | `package.json` の `"next"` を `"^16.1.6"` に変更、`eslint-config-next` は既に `16.1.6` のため変更不要、`npm install` 実行 |
| **作業時間** | 15-30分（変更 + ビルド確認 + CF デプロイ） |
| **リスク** | 極低。16.1.6 は直前まで動作していた実績あり |

**Pros:**
- 即座にCF側を復旧できる
- 動作実績のある構成に戻るため、新たな不具合リスクが最小
- 16.2.0 固有の機能を使っていないため、機能喪失なし
- `eslint-config-next` が元々 16.1.6 で固定されており、バージョン齟齬が解消される

**Cons:**
- dev起動高速化とSSRレンダリング改善を一時的に失う（体感への影響は現段階では微小）
- 将来 16.2.0 に再アップグレードする際に再度同じ問題に直面する可能性（@opennextjs/cloudflare 側の修正待ち）
- アップグレード→ダウングレードの作業が技術負債レビューの工数として発生

---

### 方針B: @opennextjs/cloudflare の glob パターンを patch-package 等でローカル修正

| 項目 | 評価 |
|---|---|
| **実施内容** | `node_modules/@opennextjs/cloudflare/dist/cli/build/patches/plugins/load-manifest.js` の32行目のglob パターンを修正し、patch-package で永続化 |
| **修正内容** | `**/{*-manifest,required-server-files}.json` → `**/{*-manifest,required-server-files,prefetch-hints}.json` |
| **作業時間** | 1-2時間（patch作成 + テスト + CFデプロイ確認） |
| **リスク** | 中 |

**Pros:**
- Next.js 16.2.0 を維持できるため、パフォーマンス改善を享受できる
- 修正箇所が1行（glob パターンの拡張）で明確
- 根本原因に直接対処するアプローチ

**Cons:**
- `@opennextjs/cloudflare` のアップデート時にパッチの競合が発生しうる
- glob パターンの修正だけでは不十分な可能性がある（`prefetch-hints.json` がインライン化されても、`getPrefetchHints()` の期待するデータ構造と一致するか未検証）
- `@opennextjs/cloudflare` の内部実装に依存するため、メジャーバージョンアップで構造が変わるリスク
- patch-package を devDependencies に追加する必要がある（現在未使用）
- 公式修正がリリースされた際にパッチの除去を忘れるリスク

---

### 方針C: @opennextjs/cloudflare の新バージョンを待つ（CF側ダウン許容）

| 項目 | 評価 |
|---|---|
| **実施内容** | issue #1157 の修正を待ち、CF側は一時ダウンとする |
| **修正見込み** | 不確定。issue は triage 段階、PRなし（2026-03-20 時点） |
| **リスク** | CF側のダウンタイムが長期化する可能性 |

**Pros:**
- 自プロジェクトでのワークアラウンド作業が不要
- 公式修正のため品質が保証される
- Next.js 16.2.0 を維持できる

**Cons:**
- CF側のダウンタイムが不確定期間続く（issue は報告から2日経過、修正PRなし）
- Vercel がサブ系（TDR-010: BOT cronの向き先）であるため、Vercel単体での本番運用には問題ないが、CF主系の設計方針（D-07 §2.2）からの逸脱
- 専ブラからの HTTP:80 直接接続は CF 経由が前提（D-07 §2.2 備考）のため、専ブラユーザーが完全に利用不能
- issue の修正が「glob パターン修正」で済むか、「アーキテクチャ変更」が必要かによって、リリースまでの期間が大きく変動する

---

### 方針D: Next.js 16.1.6 にダウングレード + @opennextjs/cloudflare のバージョンピン戦略

方針A の変形。ダウングレードに加えて、再発防止のためのバージョン管理戦略を明確化する。

| 項目 | 評価 |
|---|---|
| **実施内容** | 方針A + `package.json` で `"next": "~16.1.6"` (チルダ: パッチのみ許容) に変更し、マイナーバージョンの自動アップデートを防止。`@opennextjs/cloudflare` のアップデート通知を監視対象に追加 |
| **作業時間** | 15-30分（方針Aと同等） |
| **リスク** | 極低 |

**Pros:**
- 方針A の全メリットに加え、同種の問題の再発を防止
- CF/Next.js のバージョン互換性を意識的に管理する運用フローを確立
- issue #1157 の修正リリース後に `~16.2.x` に切り替えるマイルストーンが明確

**Cons:**
- チルダ固定により、Next.js のセキュリティパッチが自動適用されなくなる（ただし `^` でもマイナーバージョン上げは手動で行う運用が望ましい）
- 方針A と同様に dev/SSR の改善を一時的に失う

---

## 4. 推奨案

### 結論: 方針D（ダウングレード + バージョンピン）を推奨

**理由:**

1. **即時復旧が最優先**: CF側は専ブラの主系エンドポイントであり、ダウンタイムの長期化は許容できない。方針A/Dは15-30分で復旧可能

2. **失うものが実質的にない**: 本プロジェクトは 16.2.0 固有の機能を一切使用しておらず、SSRレンダリング高速化の恩恵もユーザー数が極少の現段階では体感差がない

3. **パッチ修正（方針B）はリスクに見合わない**: glob パターンの修正は一見単純だが、`prefetch-hints.json` のインライン化だけで `getPrefetchHints()` が正しく動作するかの検証が必要であり、@opennextjs/cloudflare の内部構造への深い理解が求められる。公式修正を待つ方が確実

4. **方針D の付加価値**: 単なるダウングレード（方針A）に対し、バージョンピン + 監視の運用フローを加えることで、今後の Next.js マイナーバージョンアップ時に「CF互換性を事前確認してからアップグレードする」プロセスが定着する

### 具体的な実施手順

```
1. package.json を編集:
   - "next": "^16.2.0" → "next": "~16.1.6"

2. npm install を実行

3. ローカルで動作確認:
   - npm run dev（Web UI 正常表示）
   - npm run build（ビルド成功）
   - npx vitest run（ユニットテスト通過）

4. Cloudflare ビルド確認:
   - npm run build:cf（OpenNext ビルド成功）
   - npm run preview:cf（ローカルプレビュー正常）

5. デプロイ:
   - npm run deploy:cf（CF Workers にデプロイ）
   - CF上で主要ページ（スレッド一覧・スレッド閲覧・専ブラAPI）の疎通確認

6. ウォッチリスト更新:
   - tmp/arch_review_tech_debt.md に「issue #1157 の修正待ち」を追記
```

### 再アップグレードの条件

以下の全てが満たされた時に 16.2.x へのアップグレードを実施する:

1. issue [#1157](https://github.com/opennextjs/opennextjs-cloudflare/issues/1157) が closed になる
2. 修正を含む `@opennextjs/cloudflare` の新バージョンがリリースされる
3. ローカルで `build:cf` + `preview:cf` が正常動作することを確認する

---

## 5. 補足: 依存関係の不整合メモ

調査中に発見した軽微な不整合:

| 項目 | 現状 | 備考 |
|---|---|---|
| `eslint-config-next` | `16.1.6` で固定 | `next` が 16.2.0 だった時にバージョン不一致。ダウングレードで解消 |
| `@opennextjs/cloudflare` | `^1.17.1` (最新) | 1.17.1 が npm 上の最新リリース。プレリリース版は未確認 |

---

## 参考リンク

- [opennextjs/opennextjs-cloudflare#1157 - BUG: prefetch-hints.json](https://github.com/opennextjs/opennextjs-cloudflare/issues/1157)
- [opennextjs/opennextjs-cloudflare#1090 - routes-manifest.json (類似issue)](https://github.com/opennextjs/opennextjs-cloudflare/issues/1090)
- [Next.js 16.2 リリースブログ](https://nextjs.org/blog/next-16-2)
- [Next.js 16.1 リリースブログ](https://nextjs.org/blog/next-16-1)
- [@opennextjs/cloudflare Releases](https://github.com/opennextjs/opennextjs-cloudflare/releases)
- [Cloudflare Workers Next.js ドキュメント](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
