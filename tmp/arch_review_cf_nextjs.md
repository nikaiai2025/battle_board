# アーキテクチャ批判的レビュー: Next.js on Cloudflare Workers

> 作成日: 2026-03-22
> 作成者: bdd-architect
> 対象: D-07 §2 インフラストラクチャ構成

---

## 1. 問題の要約

**Cloudflare Workers 上で Next.js を @opennextjs/cloudflare 経由で動かす現行構成は、構造的に脆弱であり、保守コストに見合っていない。**

Next.js は Node.js ランタイムを前提に設計されている。Cloudflare Workers は V8 isolate であり Node.js ではない。この根本的な不一致を @opennextjs/cloudflare が互換レイヤー（モンキーパッチ）で埋めているが、Next.js のマイナーバージョンアップで互換レイヤーが破綻するリスクを常に抱えている。

一方、Vercel は Next.js のネイティブ実行環境であり、設定ファイルすら不要で同一アプリが安定稼働している。

---

## 2. 根拠

### 2.1 発生済みインシデント

**INCIDENT-CF1101（2026-03-19）: Next.js 16.1.6 → 16.2.0 で Cloudflare 全死**

- Next.js 16.2.0 で追加された `prefetch-hints.json` マニフェストを @opennextjs/cloudflare 1.17.1 のパッチが認識できず、Worker 起動時に即座に例外
- 全ページ・全APIエンドポイントが 500 エラー
- 対処: Next.js を 16.1.6 にダウングレードして復旧

このインシデントは偶発的なバグではなく、互換レイヤー方式の**構造的リスクが顕在化したもの**。Next.js の内部実装に対するモンキーパッチである以上、同種の障害は今後も発生しうる。

### 2.2 ビルドスクリプトの異常な複雑さ

`scripts/build-cf.mjs`（223行）は以下の4つのワークアラウンドで構成されている:

| ワークアラウンド | 内容 | 回避している問題 |
|---|---|---|
| `fs.cpSync` モンキーパッチ | 再帰コピー関数を自前実装し Node.js の fs.cpSync を差し替え | Windows + Node.js 24 での cpSync バグ |
| `next-env.mjs` 重複エクスポート除去 | ビルド後に同一 export 行を除去 | @opennextjs/cloudflare が Windows で export を二重追記するバグ |
| SSR チャンク手動コピー | `.next/server/chunks/ssr/` を `.open-next/` にコピー | @opennextjs/cloudflare がチャンクをコピーし損ねる問題 |
| カスタム worker.js 生成 | 元の worker.js をリネームし、scheduled ハンドラを追加したラッパーを生成 | @opennextjs/cloudflare が scheduled ハンドラをサポートしない |

さらに `open-next.config.ts` で Turbopack を無効化し Webpack ビルドを強制している（@opennextjs/cloudflare が Turbopack のチャンクロードランタイムを正しくバンドルできないため）。

**比較: Vercel 側のビルド設定 → ゼロ。`vercel.json` すら存在しない。**

### 2.3 設計上の正副と実態の乖離

D-07 §2.2 では Cloudflare Workers を「メイン」、Vercel を「サブ」と定義しているが、実態は逆転している:

| 観点 | Cloudflare Workers | Vercel |
|---|---|---|
| ビルド安定性 | 223行のワークアラウンド必要 | **設定不要** |
| Next.js アップグレード耐性 | **壊れうる（実績あり）** | 常に互換 |
| Bot 実行（GitHub Actions） | 向いていない | **DEPLOY_URL の向き先** |
| 環境変数管理 | Cloudflare ダッシュボード | Vercel ダッシュボード |
| デプロイ頻度 | 手動 (`npm run deploy:cf`) | **git push で自動** |

GitHub Actions の bot-scheduler は `DEPLOY_URL` を Vercel に向けている（TDR-010）。Bot 実行という本番ワークロードが実質的に Vercel に依存しており、Cloudflare が「メイン」であるという設計書の記述と矛盾する。

---

## 3. Cloudflare Workers を選択した理由の再評価

D-07 §2.2 に記載された選択理由:

> 専ブラ対応可能（HTTP:80直接接続）かつ無料で商用利用可能なため主系

この判断を分解する:

| 理由 | 評価 |
|---|---|
| HTTP:80 直接接続 | **妥当な要件**。一部の専ブラは HTTP:80 を前提とする。ただしこの要件を満たすために Next.js を Workers で動かす必要はない（後述） |
| 無料で商用利用可能 | Vercel の Hobby プランも個人プロジェクトでは無料。商用化時点での料金比較が必要だが、MVP段階ではどちらも実質無料 |

**HTTP:80 要件は Cloudflare Workers で Next.js を動かす理由にならない。** Cloudflare は CDN / リバースプロキシとして HTTP:80 を受け、裏で Vercel に HTTPS 転送できる。これは Cloudflare の標準機能であり、Workers も @opennextjs/cloudflare も不要。

---

## 4. 提案する構成

### 4.1 役割の再定義

```
Vercel (正系)
  └─ Next.js App Router
     ├─ Web UI (SSR)
     ├─ Web API Routes
     ├─ 専ブラ互換 API
     └─ Bot 実行 API

Cloudflare (補助)
  ├─ リバースプロキシ（専ブラ HTTP:80 入口 → Vercel に HTTPS 転送）
  ├─ CDN キャッシュ（静的アセット）
  └─ Cron Triggers（5分間隔 → Vercel の Bot API を HTTP 呼び出し）

GitHub Actions
  └─ AI API BOT（長時間実行ジョブ。Phase 3〜）
  └─ daily-maintenance
```

### 4.2 Cloudflare Workers の実装

Next.js 丸ごとではなく、10行程度の軽量プロキシ:

```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    url.hostname = "battle-board.vercel.app";
    url.protocol = "https:";
    return fetch(url.toString(), request);
  },
  async scheduled(event, env, ctx) {
    await fetch("https://battle-board.vercel.app/api/internal/bot/execute", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.BOT_API_KEY },
    });
  },
};
```

### 4.3 削除されるもの

| ファイル | 行数 | 内容 |
|---|---|---|
| `scripts/build-cf.mjs` | 223行 | ワークアラウンド集 |
| `open-next.config.ts` | 18行 | Turbopack 無効化設定 |
| `@opennextjs/cloudflare` (依存) | — | npm 依存パッケージ |

### 4.4 専ブラユーザーへの影響

**なし。** リバースプロキシはクライアントから透過的。専ブラは Cloudflare のドメインと通信し、Vercel の存在を知らない。

ただし以下の検証は必要:
- アプリが返す 302 `Location` ヘッダのドメインが Vercel のドメインになっていないこと（`Host` ヘッダの転送設定で制御可能）
- カスタムドメイン使用時は Vercel 側にもドメイン登録が必要

### 4.5 方式の選択肢

| 方式 | カスタムドメイン | Workers コード | 難易度 |
|---|---|---|---|
| A. Cloudflare DNS プロキシ | 必要（新規取得） | 不要 | 低 |
| B. Cloudflare Workers プロキシ | 不要（現ドメイン維持） | 10行 | 低 |

最小手順（方式B）:
1. Vercel デプロイが正常稼働していることを確認（現状で確認済み）
2. CF Workers を 10行のプロキシに差し替え
3. CF Cron → Vercel API に向き先変更
4. `build-cf.mjs`, `open-next.config.ts`, `@opennextjs/cloudflare` を削除
5. 専ブラ実機で動作確認

---

## 5. リスクと注意点

| リスク | 対策 |
|---|---|
| Vercel の単一障害点化 | 現状の CF Workers デプロイも Vercel と同じ DB (Supabase) に依存しており、DB障害時はどちらも止まる。Vercel 自体の障害頻度は低く、MVP段階では許容範囲 |
| Vercel Hobby プランの制約 | 商用化時点で Pro プラン ($20/月) への移行が必要。ただし CF Workers の Paid プラン ($5/月〜) と比較しても大きな差ではない |
| リバースプロキシ経由のレイテンシ増加 | CF → Vercel の転送で数ms〜数十ms のオーバーヘッド。掲示板の用途では無視できる |
| 302 Location ヘッダのドメイン不一致 | Workers プロキシでレスポンスの Location ヘッダを書き換えるか、アプリ側で相対パスを使用する |

---

## 6. より根本的な問題: Next.js 自体の適合性

§1〜5 では「Cloudflare Workers で Next.js を動かすこと」の問題を論じたが、
一歩引いて見ると**このプロジェクトに Next.js（React）が必要だったか**という問題がある。

### 6.1 このプロジェクトのUI要件

**注意: 以下の初期分析は開発連絡板（/dev/）の実態を本番UIに誤って一般化したもの。§6.1.1 で修正する。**

| 画面 | 実態 |
|---|---|
| スレッド一覧 | HTMLテーブル |
| レス表示 | テキスト列挙 |
| 書き込み | `<form method="POST">` |
| マイページ | ステータス表示 |
| 専ブラ互換API | JSON/DAT/Shift_JIS のHTTPレスポンス |
| 開発連絡板 | Client Component ゼロ、JS 不要で CGI 掲示板風 |

#### 6.1.1 修正: 本番UIの実態

CGI掲示板風UIは開発連絡板（/dev/）のみ。本番UIは以下の通り React を活用している:

- `src/app/(web)/` 配下に Client Component（`"use client"`）が **23ファイル**
- PostListLiveWrapper（リアルタイムポーリング）、AnchorPopup（アンカーポップアップ）、AuthModal（認証モーダル）、PostForm（書き込みフォーム）、EliminatedBotToggle（撃破済みBOT表示切替）等
- shadcn/ui + Tailwind CSS によるモダンUI
- 将来構想にスキン課金（UIカスタマイズの有料提供）が含まれる

この規模のインタラクティブUIとスキン課金を Hono の hono/jsx + vanilla JS で構築するのは現実的でない。**本番UIに関しては React/Next.js の採用は妥当。**

### 6.2 ゼロベースでの技術選択比較

| 観点 | Next.js on Vercel | Hono on CF Workers |
|---|---|---|
| 専ブラ HTTP:80 | 不可。CF プロキシ別途必要 | **ネイティブ対応** |
| UI の複雑さ | React は過剰 | **hono/jsx で十分** |
| 月額コスト（商用化時） | Pro $20 | **Paid $5** |
| fs 問題 | 起きない | 起きない（設計上使わない） |
| 構成のシンプルさ | Vercel + CF プロキシの2層 | **CF 1層で完結** |
| AI エージェントの実装精度 | **高い（学習データ豊富）** | やや低い（Hono は比較的新しい） |
| エコシステム | **巨大** | 小さい |

API・専ブラ互換APIだけなら Hono が上回る。

ただし §6.1.1 の通り、本番UIは Client Component 23ファイル + shadcn/ui + Tailwind で構築されており、
将来はスキン課金も構想に入っている。この規模のインタラクティブUIを hono/jsx + vanilla JS で
実現するのは非現実的であり、**UIを含めた総合評価では Next.js の採用は妥当**。

### 6.3 Next.js をあえて使うメリット

現行の Next.js 採用に合理性がある点も記録する:

- **AIエージェント開発体制との親和性**: Next.js は AI の学習データが圧倒的に豊富。AI にコーディングを委任する開発体制では、AI が正確にコードを生成できるかがスループットに直結する。Hono は API がシンプルなため間違える余地は小さいが、エッジケースの知見は Next.js に劣る
- **将来の UI 高度化への余地**: MVP では CGI 掲示板風 UI だが、将来的にリッチなインタラクション（リアルタイム通知、ダッシュボード、管理画面）を追加する場合、React エコシステムが活きる可能性がある
- **サンクコスト**: 現時点で動作するコードベースが存在する。書き直しコスト（数週間）と、その間の機能開発停止を正当化する明確な障害がなければ、移行は合理的でない
- **採用・引き継ぎ**: Next.js/React を書ける開発者の母数は Hono を書ける開発者より桁違いに多い

### 6.4 循環論法への注意

§6.1.1 で「Client Component が23ファイルある → React が必要」と結論づけたが、これは循環論法のリスクがある。**React を選んだから Client Component で書いた**のであり、React がなければ実現できない機能かは別問題。

| 機能 | React での現行実装 | React なしでの代替 |
|---|---|---|
| リアルタイムポーリング | PostListLiveWrapper (useState + useEffect) | `setInterval` + `fetch` + DOM操作 |
| アンカーポップアップ | AnchorPopup (Context + state) | vanilla JS + イベント委譲 |
| 認証モーダル | AuthModal (useState) | `<dialog>` + 少量のJS |
| 書き込みフォーム | PostForm (Client Component) | `<form method="POST">` + 少量のJS |
| BOT表示トグル | EliminatedBotToggle (Context) | CSS class 切替 + vanilla JS |

これらは全て vanilla JS や htmx + Alpine.js で実現可能。5ch 本家もポップアップやリアルタイム更新を JS でやっているが React は使っていない。

スキン課金についても、CSS テーマ切り替え（色・フォント・レイアウト）なら CSS 変数 + サーバーサイドでのクラス注入で足りる。React Component の差し替えまでやるなら React が便利だが、「スキン」の粒度次第。

### 6.5 ゼロベースでの正直な評価

| 構成 | 適合度 | 理由 |
|---|---|---|
| Next.js on Vercel | 良 | UIの将来拡張に余裕がある。AI開発体制に最適。ただし専ブラにCFプロキシ必要 |
| Hono + htmx/Alpine.js on CF | 良 | 要件にジャストサイズ。CF1層で完結。ただしリッチUI化で苦しくなる可能性 |
| Remix on CF | 良 | React + CF ネイティブの両立。ただしエコシステムがNext.jsより小さい |

**どれも合理的であり、明確な一強がない。**

Next.js を選ぶ最大の合理性は技術的適合度ではなく**AI開発体制との親和性**。AI にコードを書かせる前提で、AI が最も正確に書けるフレームワークを選ぶのは合理的。掲示板の技術要件だけ見れば Hono で十分だが、「誰が（何が）書くか」まで含めると Next.js の合理性がある。

### 6.6 反論検討: 「保守コストは AI でカバーできるのでは？」

本レポートの中核的主張は「@opennextjs/cloudflare の保守コストが高い」だが、
このプロジェクトではオーケストレーターAIがバグの原因調査・タスク発行・修正・再検証を自動処理しており、
人間にとっての実質的な保守コストは低減されている。これを踏まえた再評価:

**AIが保守をカバーしている実績:**

| インシデント | 検出 | 原因分析 | 修正 |
|---|---|---|---|
| INCIDENT-CF1101 | 人間 | AI | AI（ダウングレード） |
| fs.readFileSync 全コマンド死亡 | 人間 | AI | AI（TS定数化） |
| build-cf.mjs ワークアラウンド群 | — | AI | AI（223行） |

**この反論は部分的に妥当。** ただし以下の限界がある:

1. **検出の自動化は進行中だが完全ではない**: インシデント記録上は「人間が発見」と記載されているケースの一部は、実際にはAIエージェントがログから検出し報告書を作成したもの。ただし常時監視（24時間オーケストレーター稼働）には webhook や常設サーバー等の追加インフラが必要であり、MVP 段階では未達。GitHub Actions のデプロイ失敗時の Issue 自動起票は整備済み

2. **機会コスト**: AI のリソースは有限。AI を互換レイヤーの保守に費やすことは、その分の機能開発リソースを失うことと等価。存在しない問題を直す必要はなく、Vercel 正系なら fs 問題も互換レイヤー破損もそもそも発生しない

3. **複雑性の単調増加**: AI がワークアラウンドを積み重ねた結果が 223行の build-cf.mjs。Next.js バージョンアップのたびに膨張し、ワークアラウンド同士の干渉リスクも増える。いずれ AI でも即座に修正できない複雑さに到達しうる

**補足:** 検出の自動化は CF 互換レイヤーの有無に関わらず必要な課題であり、本レポートの「Vercel 正系への移行」提案とは独立して改善すべき事項。

### 6.7 判断

問題は Next.js を選んだことではなく、**Next.js を Cloudflare Workers で動かしたこと**に集約される。Next.js on Vercel であれば、本レポート §2 で挙げた問題のほぼ全てが発生しなかった。

---

## 7. 結論

### 短期（即時対応可能）

Cloudflare Workers で Next.js を動かす構成は、専ブラ HTTP:80 という正当な要件に対する**過剰な解決策**だった。同じ要件は Cloudflare のプロキシ機能で達成できる。

提案する構成変更は後方互換であり、専ブラユーザーへの影響はない。得られるものは:
- Next.js アップグレードの安全性（互換レイヤー障害リスクの除去）
- ビルドパイプラインの簡素化（223行のワークアラウンド削除）
- 設計書と実態の一致（Vercel が正系であることの明文化）

### 長期（将来の選択肢）

Next.js の採用自体は本番UIの要件に対して妥当。ゼロベースでも、スキン課金やリッチUIの将来構想を含めれば Next.js を選ぶ合理性がある。

問題は実行環境の選択（CF Workers）に限定されており、フレームワーク移行（Hono等）は不要。
