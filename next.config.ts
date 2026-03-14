/**
 * Next.js 設定
 *
 * rewrites により、拡張子付きURL（.dat）をApp Routerのルートハンドラに転送する。
 * Next.jsは拡張子付きURLを静的ファイルリクエストとして処理するため、
 * ルートハンドラに到達しない問題をrewritesで解決する。
 *
 * See: features/constraints/specialist_browser_compat.feature @DATファイルが所定のフォーマットで返される
 */

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  rewrites: async () => [
    // DATファイル: /{boardId}/dat/{threadKey}.dat → /{boardId}/dat/{threadKey}
    // 専ブラは /{boardId}/dat/{threadKey}.dat でDATを取得するが、
    // Next.jsが .dat を静的ファイルリクエストとして処理してしまうため、
    // 拡張子なしの内部ルートにリライトする。
    {
      source: "/:boardId/dat/:threadKey.dat",
      destination: "/:boardId/dat/:threadKey",
    },
    // kako形式（専ブラの過去ログ探索）→ dat/形式にリライト
    // 専ブラは過去ログを /kako/{x}/{y}/{threadKey}.dat で探索することがある。
    {
      source: "/:boardId/kako/:x/:y/:threadKey.dat",
      destination: "/:boardId/dat/:threadKey",
    },
  ],
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
