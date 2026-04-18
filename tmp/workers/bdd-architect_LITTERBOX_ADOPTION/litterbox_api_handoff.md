# Litterbox API 引き継ぎメモ（yomiage 実装者向け）

- **作成日**: 2026-04-18
- **作成者**: bdd-architect
- **対象**: `!yomiage` コマンド実装者（yomiage 本体実装タスク担当コーディングAI）
- **関連**: `tmp/escalations/escalation_LITTERBOX_ADOPTION.md`、TDR-018、`docs/architecture/components/yomiage.md §5.5 IAudioStorageAdapter`
- **PoC実施状況**: **Gemini TTS のみ実施済み。Litterbox は未実施**（本メモは公開ドキュメント + WebFetch 調査のみに基づく）

---

## 1. Litterbox API エンドポイント仕様

調査元: https://litterbox.catbox.moe/tools.php（WebFetch 2026-04-18）

| 項目 | 値 |
|---|---|
| エンドポイント | `https://litterbox.catbox.moe/resources/internals/api.php` |
| メソッド | `POST` |
| Content-Type | `multipart/form-data` |
| 認証 | 不要（匿名アップロード） |
| 最大ファイルサイズ | 1GB（公式） |
| レート制限 | 公式ドキュメント上明記なし（**要実装時PoC**） |
| 保持期間 | 1h / 12h / 24h / 72h から選択（固定値） |

### 1.1 リクエストパラメータ

| パラメータ | 必須 | 型 | 値 |
|---|---|---|---|
| `reqtype` | ✅ | string | `fileupload` 固定 |
| `time` | ✅ | string | `1h` / `12h` / `24h` / `72h` のいずれか |
| `fileToUpload` | ✅ | binary | アップロード対象ファイル（WAV バイナリ） |

### 1.2 レスポンス

- **成功時**: `text/plain` で URL 文字列を返す
  - 例: `https://litter.catbox.moe/abc123.wav`
  - HTTP 200
- **失敗時**: エラーパターンは公式未公開（**要実装時PoC**）
  - 経験則: 4xx/5xx でエラーメッセージ文字列を返す可能性が高い
  - 実装では「HTTP 200 かつ `https://` で始まる文字列か」で成否を判定するのが安全

### 1.3 curl 等価例

```bash
curl -X POST https://litterbox.catbox.moe/resources/internals/api.php \
  -F "reqtype=fileupload" \
  -F "time=1h" \
  -F "fileToUpload=@out.wav"
# → https://litter.catbox.moe/xxxxx.wav
```

### 1.4 Node.js 実装雛形（参考）

```typescript
// src/lib/services/adapters/litterbox-adapter.ts （実装時のサンプル）
import { IAudioStorageAdapter } from "./audio-storage-adapter";

const LITTERBOX_ENDPOINT =
  "https://litterbox.catbox.moe/resources/internals/api.php";

export class LitterboxAdapter implements IAudioStorageAdapter {
  async upload(
    audioBuffer: Buffer,
    options: { retentionHours: 1 | 12 | 24 | 72; filename: string },
  ): Promise<string> {
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("time", `${options.retentionHours}h`);
    // Node.js 18+ の undici FormData は Blob を要求する
    form.append(
      "fileToUpload",
      new Blob([audioBuffer], { type: "audio/wav" }),
      options.filename,
    );

    const res = await fetch(LITTERBOX_ENDPOINT, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      throw new Error(`Litterbox upload failed: HTTP ${res.status}`);
    }

    const text = (await res.text()).trim();
    if (!text.startsWith("https://")) {
      // エラーメッセージが本文に返る想定（要PoC）
      throw new Error(`Litterbox upload rejected: ${text}`);
    }
    return text;
  }
}
```

### 1.5 リトライ方針（推奨）

`GoogleAiAdapter` と同ポリシーを推奨:

- 最大試行回数: 3
- バックオフ: 指数（1s, 2s, 4s）
- リトライ対象: ネットワークエラー、HTTP 5xx
- リトライ非対象: HTTP 4xx（契約違反）、レスポンス本文が `https://` で始まらない（明示的な拒否）

---

## 2. WAV サンプル検証結果

PoC出力 `C:\Users\user\Documents\PGM連携\pys\out.wav` を解析した結果（2026-04-18）:

| 項目 | 値 | yomiage.md 設計との一致 |
|---|---|---|
| ファイルサイズ | 1,221,164 B (≈1.17 MB) | — |
| フォーマット | RIFF/WAVE（完全なヘッダあり） | ✅ |
| audioFormat | 1 (PCM) | ✅ |
| numChannels | 1 (mono) | ✅ |
| sampleRate | 24,000 Hz | ✅（§4.1 想定通り） |
| bitsPerSample | 16 | ✅ |
| byteRate | 48,000 B/s | ✅（= 48 KB/sec） |
| 再生時間 | 約 25.44 秒 | — |

### 2.1 重要な観察

**PoC 出力は既に完全な WAV ヘッダを持っている。** `docs/architecture/components/yomiage.md §5.4 wrapPcmAsWav` は、以下いずれかに該当する場合のみ必要:

- Gemini TTS API が raw PCM（ヘッダなし）を返すとき
- 実装上、PCM 結合 → ヘッダ後付け の順で処理するとき

PoC が「Gemini 出力そのまま保存」なのか「自前で RIFF ヘッダを付けた」のか不明確のため、**実装時に Gemini レスポンスの生データを 1 度ダンプして確認**すること。

- Gemini 側がヘッダ付き WAV を返すなら → `wrapPcmAsWav` は no-op でよい
- raw PCM を返すなら → `wrapPcmAsWav` で RIFF/WAVE ヘッダを付与する必要あり

### 2.2 ファイルサイズ見積り（設計整合確認）

- 48 KB/sec × 読み上げ上限秒数（yomiage.md §4 で定義する想定）
- 例: 60 秒読み上げ → 2.88 MB → 1GB 上限に対し余裕
- 1日の総容量試算（TDR-018 移行判断材料）:
  - 100 音声/日 × 60秒 = 288 MB/日（アップロード側）
  - 保持 1h 設定なら Litterbox 側に常時存在するのは直近1h分のみ

---

## 3. 設計整合性チェックリスト

yomiage 実装者は以下を満たすこと:

- [ ] `IAudioStorageAdapter` インターフェース経由でのみ Litterbox を呼び出す（直接 fetch しない）
- [ ] `LitterboxAdapter` 実装ファイルは `src/lib/services/adapters/` 配下に配置
- [ ] Adapter 切替は env var / DI で行い、feature / service 層に「litterbox」の文字列を漏らさない（TDR-018 移行容易性要件）
- [ ] DB (`pending_async_commands.result_url` 等) に保存する URL は不透明文字列として扱う。`litter.catbox.moe` 等のドメイン検証をしない
- [ ] API 契約（OpenAPI）に URL 構造仕様を書かない
- [ ] 切替コスト（TDR-018）: `scripts/yomiage-worker.ts` + GitHub Actions env vars + GH Secrets に閉じること

---

## 4. 未検証事項（実装時PoC必要）

以下は公式ドキュメント未記載または未検証のため、**実装タスクの最初に手動 PoC** を推奨:

| 項目 | PoC手順 | 必要性 |
|---|---|---|
| レート制限の実態 | 1分間に10回連続アップロードしてブロックされるか確認 | 中（バースト時の挙動把握） |
| UTF-8 ファイル名の扱い | `fileToUpload` のファイル名に日本語を含めてURL側表示を確認 | 低（ランダム英数字名推奨でリスク回避可） |
| MIME type の扱い | `audio/wav` 指定の要否確認 | 低（デフォルトで問題ない想定） |
| エラーレスポンス形式 | 意図的に壊れたファイルを送信してエラー応答を観察 | 高（エラーハンドリング実装の根拠） |
| HTTPS URL の形式一貫性 | 10回アップロードして `https://litter.catbox.moe/{hash}.wav` 形式が常に返るか確認 | 中（パース前提の安定性） |

### 4.1 推奨PoC最小セット

```bash
# 1. 基本アップロード
curl -X POST https://litterbox.catbox.moe/resources/internals/api.php \
  -F "reqtype=fileupload" -F "time=1h" \
  -F "fileToUpload=@out.wav"

# 2. 返却URLから再ダウンロードして整合性確認
curl -o roundtrip.wav "<返却URL>"
diff out.wav roundtrip.wav  # バイナリ一致を期待

# 3. 連続10回アップロードして 429 等が出ないか観察
for i in 1..10; do curl -X POST ...; done
```

---

## 5. 運用上の留意点

### 5.1 Litterbox の性質

- **コミュニティ運営の無料サービス**。SLA/稼働率保証なし
- `catbox.moe`（永続版）の一時版という位置付け
- 運営方針変更・停止のリスクは常時存在 → TDR-018 移行条件①②③の発動トリガとなる

### 5.2 監視の必要性

`tmp/escalations/escalation_LITTERBOX_ADOPTION.md` 後続タスクに記載:

- [ ] 運用ランブック: Litterbox 応答監視手順の整備（実装完了前に作成）

以下を監視対象とすること:

1. アップロード成功率（日次集計）— 閾値 95% 下回りで警告
2. 応答時間（p95）— 10s 超で警告
3. 非200応答のパターン（手動レビュー用にログ保持）

### 5.3 将来の R2 移行（TDR-018）

`IAudioStorageAdapter` 差し替えにより以下5点のみの変更で移行完了する想定:

1. `CloudflareR2Adapter` 実装追加
2. DI / env var の切替
3. GitHub Secrets（R2 credentials）追加
4. `scripts/yomiage-worker.ts` の adapter 組み立て修正
5. 古い Litterbox URL の失効を待つ（保持期間を過ぎれば自動消失）

feature / CommandHandler / pending_async_commands スキーマは**変更不要**。

---

## 6. 参考リンク

- Litterbox tools: https://litterbox.catbox.moe/tools.php
- Catbox (永続版): https://catbox.moe/
- yomiage 設計書: `docs/architecture/components/yomiage.md`
- TDR-018: `docs/architecture/architecture.md §13`
- 採用経緯: `tmp/escalations/escalation_LITTERBOX_ADOPTION.md`

---

## 変更履歴

| 日付 | 変更者 | 内容 |
|---|---|---|
| 2026-04-18 | bdd-architect | 初版作成（Gemini PoC 出力WAV解析結果 + Litterbox API調査結果を統合） |
