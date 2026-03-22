#!/bin/bash
# .claude/hooks/block-manual-deploy.sh
#
# 手動デプロイ・本番ビルドコマンドをブロックする。
#
# デプロイは git push → 自動デプロイ（Vercel/Cloudflare）のみ許可。

COMMAND=$(jq -r '.tool_input.command')

# コマンドの先頭行のみを判定対象とする（コミットメッセージ等の誤検知防止）
FIRST_LINE=$(echo "$COMMAND" | head -1)

# wrangler deploy（手動デプロイ）
if echo "$FIRST_LINE" | grep -qE '(npx\s+)?wrangler\s+deploy(\s|$)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "手動デプロイは禁止。デプロイは git push による自動デプロイのみ許可。"
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
