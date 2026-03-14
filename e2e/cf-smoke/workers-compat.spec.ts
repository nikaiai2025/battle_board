/**
 * CF Smokeテスト: Cloudflare Workers Runtime 互換性スモークテスト
 *
 * wrangler dev (localhost:8788) に対して実行し、nodejs_compat 経由の
 * Node.js API互換性を回帰検知する。ビジネスロジックの検証は行わない。
 *
 * 検証対象:
 *   1. GET /battleboard/subject.txt  — Shift_JIS レスポンス（iconv-lite）
 *   2. GET /battleboard/dat/{key}.dat — rewrite ルール動作
 *   3. GET /bbsmenu.html              — Shift_JIS レスポンス（iconv-lite）
 *   4. GET /bbsmenu.json              — JSON API 基本動作
 *   5. GET /battleboard/SETTING.TXT   — Shift_JIS レスポンス（iconv-lite）
 *   6. POST /test/bbs.cgi             — Shift_JIS デコード（Buffer.from + iconv-lite）
 *   7. GET /                          — SSR 基本動作（crypto 等）
 *
 * See: docs/architecture/bdd_test_strategy.md S13 CF Smoketesutesu方針
 */

import { test, expect } from "@playwright/test";
import * as iconv from "iconv-lite";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const BOARD_ID = "battleboard";

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

test.describe("CF Smoke: Workers Runtime 互換性", () => {
  // -------------------------------------------------------------------------
  // 1. subject.txt Shift_JIS
  // -------------------------------------------------------------------------

  /**
   * subject.txt が Shift_JIS Content-Type で応答し、500 エラーにならないことを確認する。
   * iconv-lite の Buffer 操作が Workers Runtime で動作するかの検証。
   *
   * See: docs/architecture/bdd_test_strategy.md S13.2
   */
  test("GET /battleboard/subject.txt -- Shift_JIS Content-Type で応答する（500 でない）", async ({
    request,
  }) => {
    const response = await request.get(`/${BOARD_ID}/subject.txt`);

    // Workers Runtime で iconv-lite が動作すれば 200（データなしでも空レスポンス）
    // データベース未接続等で 500 にならないことがポイント
    expect(response.status()).not.toBe(500);

    const contentType = response.headers()["content-type"] ?? "";
    // Shift_JIS エンコーディングが指定されている
    expect(contentType.toLowerCase()).toContain("shift_jis");
  });

  // -------------------------------------------------------------------------
  // 2. DAT ファイル rewrite
  // -------------------------------------------------------------------------

  /**
   * .dat 拡張子付き URL の rewrite ルールが Workers Runtime で動作することを確認する。
   * 存在しない threadKey でも rewrite 自体は機能し、404 を返す（500 ではない）。
   *
   * See: docs/architecture/bdd_test_strategy.md S13.2
   */
  test("GET /battleboard/dat/{key}.dat -- rewrite が動作する（500 でない）", async ({
    request,
  }) => {
    const response = await request.get(
      `/${BOARD_ID}/dat/9999999999.dat`
    );

    // rewrite が動作していれば 404（スレッド未存在）を返す。500 は rewrite 失敗を示す
    expect(response.status()).not.toBe(500);
    // 200 または 404 のいずれか
    expect([200, 404]).toContain(response.status());
  });

  // -------------------------------------------------------------------------
  // 3. bbsmenu.html Shift_JIS
  // -------------------------------------------------------------------------

  /**
   * bbsmenu.html が Shift_JIS でエンコードされた HTML を返すことを確認する。
   * iconv-lite による Shift_JIS エンコードが Workers Runtime で動作するかの検証。
   *
   * See: docs/architecture/bdd_test_strategy.md S13.2
   */
  test("GET /bbsmenu.html -- 200 + Shift_JIS レスポンス", async ({
    request,
  }) => {
    const response = await request.get("/bbsmenu.html");

    expect(response.status()).toBe(200);

    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType.toLowerCase()).toContain("shift_jis");

    // レスポンスボディが Shift_JIS としてデコード可能であること
    const bodyBytes = Buffer.from(await response.body());
    const decoded = iconv.decode(bodyBytes, "Shift_JIS");
    expect(decoded.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // 4. bbsmenu.json JSON
  // -------------------------------------------------------------------------

  /**
   * bbsmenu.json が application/json Content-Type で有効な JSON を返すことを確認する。
   *
   * See: docs/architecture/bdd_test_strategy.md S13.2
   */
  test("GET /bbsmenu.json -- 200 + application/json + JSON parse 成功", async ({
    request,
  }) => {
    const response = await request.get("/bbsmenu.json");

    expect(response.status()).toBe(200);

    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType).toContain("application/json");

    // JSON として parse 可能であること
    const body = await response.json();
    expect(body).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // 5. SETTING.TXT Shift_JIS
  // -------------------------------------------------------------------------

  /**
   * SETTING.TXT が Shift_JIS でエンコードされた設定情報を返すことを確認する。
   * iconv-lite による Shift_JIS エンコードが Workers Runtime で動作するかの検証。
   *
   * See: docs/architecture/bdd_test_strategy.md S13.2
   */
  test("GET /battleboard/SETTING.TXT -- 200 + Shift_JIS レスポンス", async ({
    request,
  }) => {
    const response = await request.get(`/${BOARD_ID}/SETTING.TXT`);

    expect(response.status()).toBe(200);

    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType.toLowerCase()).toContain("shift_jis");

    // レスポンスボディが Shift_JIS としてデコード可能であること
    const bodyBytes = Buffer.from(await response.body());
    const decoded = iconv.decode(bodyBytes, "Shift_JIS");
    expect(decoded.length).toBeGreaterThan(0);
    // BBS_TITLE= が含まれること（設定ファイルの基本構造）
    expect(decoded).toContain("BBS_TITLE=");
  });

  // -------------------------------------------------------------------------
  // 6. bbs.cgi POST
  // -------------------------------------------------------------------------

  /**
   * bbs.cgi が Shift_JIS エンコードされた POST ボディを受け付けて応答することを確認する。
   * Buffer.from + iconv-lite による Shift_JIS デコードが Workers Runtime で動作するかの検証。
   * 認証なしのため書き込みは失敗するが、500 にならず Shift_JIS HTML が返ればよい。
   *
   * See: docs/architecture/bdd_test_strategy.md S13.2
   */
  test("POST /test/bbs.cgi -- Shift_JIS POST を受け付けて応答する（500 でない）", async ({
    request,
  }) => {
    // Shift_JIS エンコードされた form-urlencoded ボディを構築
    const params = new URLSearchParams({
      bbs: BOARD_ID,
      subject: "CF Smoke Test",
      MESSAGE: "Workers Runtime compatibility test",
      FROM: "",
      mail: "",
    });
    const sjisBody = iconv.encode(params.toString(), "Shift_JIS");

    const response = await request.post("/test/bbs.cgi", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: sjisBody,
    });

    // Buffer.from + iconv-lite のデコードが動作していれば 500 にならない
    expect(response.status()).not.toBe(500);

    // レスポンスが返ること（認証エラーでも 200 + HTML が返る仕様）
    expect(response.status()).toBe(200);

    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType.toLowerCase()).toContain("shift_jis");
  });

  // -------------------------------------------------------------------------
  // 7. Web UI SSR
  // -------------------------------------------------------------------------

  /**
   * トップページ（/）が SSR で HTML を返すことを確認する。
   * crypto (createHash) 等の Node.js API が Workers Runtime で動作するかの検証。
   *
   * See: docs/architecture/bdd_test_strategy.md S13.2
   */
  test("GET / -- 200 + HTML レスポンス（SSR 動作確認）", async ({
    request,
  }) => {
    const response = await request.get("/");

    expect(response.status()).toBe(200);

    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType).toContain("text/html");

    // HTML コンテンツが含まれること
    const body = await response.text();
    expect(body).toContain("<html");
    expect(body.length).toBeGreaterThan(0);
  });
});
