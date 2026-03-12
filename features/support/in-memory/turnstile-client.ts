/**
 * インメモリ TurnstileClient スタブ
 *
 * BDD テスト用の Cloudflare Turnstile 非依存実装。
 * ステップ定義から検証結果（成功/失敗）を制御できるようにする。
 *
 * See: features/phase1/authentication.feature
 * See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
 * See: tmp/orchestrator/sprint_8_bdd_guide.md §4 authentication.feature > Turnstileのスタブ制御
 */

// ---------------------------------------------------------------------------
// スタブ状態
// ---------------------------------------------------------------------------

/** Turnstile 検証結果（true: 成功, false: 失敗） */
let stubResult = true

/**
 * スタブ状態を初期化する（Beforeフックから呼び出す）。
 * デフォルトは成功（true）。
 */
export function reset(): void {
  stubResult = true
}

/**
 * Turnstile 検証結果を設定する。
 * ステップ定義から「Turnstile検証に失敗している」条件を実現するために使用する。
 *
 * @param result - true: 検証成功, false: 検証失敗
 */
export function setStubResult(result: boolean): void {
  stubResult = result
}

// ---------------------------------------------------------------------------
// スタブ関数（本番実装と同一シグネチャ）
// ---------------------------------------------------------------------------

/**
 * Turnstile トークンを検証する（スタブ）。
 * setStubResult で設定された値を返す。
 *
 * See: src/lib/infrastructure/external/turnstile-client.ts
 */
export async function verifyTurnstileToken(
  _token: string,
  _remoteIp?: string
): Promise<boolean> {
  return stubResult
}
