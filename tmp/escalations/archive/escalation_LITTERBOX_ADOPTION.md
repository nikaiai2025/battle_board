# エスカレーション: Litterbox の外部サービス追加承認

- **エスカレーションID**: LITTERBOX_ADOPTION
- **起票日**: 2026-04-18
- **起票者**: bdd-architect
- **ステータス**: 承認済み（人間による即時承認）
- **関連TDR**: TDR-018（`docs/architecture/architecture.md` §13）
- **関連feature**: `features/ドラフト_実装禁止/command_yomiage.feature`

---

## エスカレーション理由

CLAUDE.md 横断的制約に抵触するため、人間の承認が必要：

> インフラは Vercel / Cloudflare + Supabase + GitHub Actions、AI API は Google Gemini を使用する。**新たに外部サービスを追加する場合はエスカレーション必須**

!yomiage コマンド実装のために、音声ファイル配信用の外部ストレージサービスとして **Litterbox (`litterbox.catbox.moe`)** を追加する。

---

## 事前検討

### 比較した選択肢

| 項目 | Litterbox | Supabase Storage | Cloudflare R2 |
|---|---|---|---|
| 外部サービス追加 | ❌ 必要 | ✅ 既存 | ✅ 既存 |
| 費用 | 無料 | Free 5GB / Pro $25 (250GB) | $0.015/GB ストレージ、Egress 無料 |
| クレジットカード登録 | 不要 | Free tier は不要 | **必要** |
| バズ時の影響 | サービス依存 | 掲示板本体と帯域共有、従量課金リスク | CDN同等、本体と完全分離 |
| 保持期間 | 1h/12h/24h/72h 固定 | 任意 | 任意 |
| 技術的妥当性 | 中（非公式・小規模） | 中（帯域リスク） | 高（最適） |

### Supabase Storage を不採用とした理由

- 音声 Egress が DB 読み取り帯域（レス取得・subject.txt 等）と共用で、掲示板本体のレスポンス劣化リスク
- 中規模バズ（500 DL × 100音声/日、WAV 480KB）で月 720GB に到達しうる
- Pro プラン超過後の従量課金（$0.09/GB）で月額コストが予測困難

### Cloudflare R2 を暫定不採用とした理由

- 技術的には最適（Egress 完全無料・既存インフラ範囲内）
- しかし **有効化にクレジットカード登録が必要** であり、本プロジェクトの「完全無料縛り」運用方針に抵触
- R2 への移行は将来の経営判断タイミングで実施する

---

## 承認内容

**承認日**: 2026-04-18
**承認者**: 人間（プロジェクトオーナー）
**承認形態**: セッション内での直接承認

### 承認された事項

1. **外部サービス Litterbox の追加**（暫定）
2. **CLAUDE.md 横断的制約の更新**（プロジェクトオーナーが直接編集）
   - 変更後: 「インフラは Vercel / Cloudflare + Supabase + GitHub Actions + Litterbox(将来的にCloudflare R2へ移行予定)、AI API は Google Gemini を使用する」
3. **TDR-018 の策定**（暫定決定・移行前提）

---

## 移行条件（TDR-018 と同期）

以下のいずれかを満たした時点で Cloudflare R2 へ移行する：

1. プロジェクトのクレジットカード登録ポリシーが変更されたとき
2. Litterbox がサービス停止・レート制限強化により運用継続困難になったとき
3. 有料代替サービスを許容する判断が下されたとき

---

## 移行容易性の担保（設計要件）

TDR-018 に記載した通り、以下の5点を守って実装する：

1. **アダプタ抽象化**: `IAudioStorageAdapter` インターフェースで実装層を抽象化
2. **feature のベンダー中立化**: BDD シナリオから「litterbox」の直接記述を排除
3. **DB スキーマはベンダー非依存**: URL を不透明文字列として保存
4. **API 契約のベンダー非依存**: URL 構造を検証・パースしない
5. **切替時の影響範囲を GH Actions 側に閉じる**: 移行コストを `scripts/yomiage-worker.ts` + ワークフロー env vars + GH Secrets のみに抑える

---

## 後続タスク

- [x] `features/ドラフト_実装禁止/command_yomiage.feature` のベンダー中立化修正（v2）
- [x] D-08 yomiage コンポーネント設計書の作成（`docs/architecture/components/yomiage.md`。アダプタ抽象 `IAudioStorageAdapter` / `IGeminiTtsAdapter` を含む）
- [x] D-07 §12.2 非同期処理トポロジへの yomiage 行追加（反映済み）
- [x] D-07 §2.2 外部サービス表への Litterbox 行追加（反映済み）
- [ ] 運用ランブック: Litterbox 応答監視手順の整備（実装完了前に作成）
- [x] yomiage feature / !hiroyuki feature の「通貨は消費されない」記述と実装の乖離 — **対応方針決定（2026-04-18 人間承認）**: 選択肢B（`preValidate` フック導入）を採用。設計書 `command.md §5` / `yomiage.md §4` 改訂済み。実装タスクは `tmp/tasks/task_PRE_VALIDATE_HOOK.md` として別途起票
- [x] Litterbox API 引き継ぎメモ作成（2026-04-18 bdd-architect）: `tmp/workers/bdd-architect_LITTERBOX_ADOPTION/litterbox_api_handoff.md`。エンドポイント仕様・WAV サンプル検証・未検証項目（実装時PoC必要）を記載
