#!/bin/bash
# .claude/hooks/block-manual-deploy.sh
#
# 手動デプロイ・本番ビルドコマンドをブロックする。
# ローカル環境変数が本番ビルドに混入する事故を防止する。
#
# デプロイは git push → 自動デプロイ（Vercel/Cloudflare）のみ許可。

COMMAND=$(jq -r '.tool_input.command')

# コマンドの先頭行のみを判定対象とする（コミットメッセージ等の誤検知防止）
FIRST_LINE=$(echo "$COMMAND" | head -1)

# wrangler deploy（手動デプロイ）
if echo "$FIRST_LINE" | grep -qE '(npx\s+)?wrangler\s+deploy'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "手動デプロイは禁止。デプロイは git push による自動デプロイのみ許可。ローカル環境変数が本番に混入するリスクがある。"
    }
  }'
  exit 0
fi

# build:cf（Cloudflare用ビルド。ローカルの wrangler.toml [vars] が焼き込まれる）
if echo "$FIRST_LINE" | grep -qE 'build:cf|build-cf'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Cloudflare用ビルド(build:cf)はローカル実行禁止。wrangler.toml の NEXT_PUBLIC_BASE_URL=localhost が本番ビルドに混入する。デプロイは git push → Cloudflare自動ビルドで行う。"
    }
  }'
  exit 0
fi

# vercel deploy（手動デプロイ）
if echo "$FIRST_LINE" | grep -qE '(npx\s+)?vercel\s+deploy'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "手動デプロイは禁止。デプロイは git push による自動デプロイのみ許可。"
    }
  }'
  exit 0
fi

exit 0
