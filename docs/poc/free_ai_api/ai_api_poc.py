import argparse
import concurrent.futures
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

def get_prompt() -> str:
    return os.getenv("AI_API_POC_PROMPT", "Return exactly: HelloWorld")

def get_timeout_seconds() -> float:
    return float(os.getenv("AI_API_POC_TIMEOUT_SECONDS", "30"))


def load_dotenv(path: str = ".env.local") -> None:
    target_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), path)
    if not os.path.exists(target_path):
        return

    with open(target_path, "r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


def first_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        for item in value:
            text = first_text(item)
            if text:
                return text
        return ""
    if isinstance(value, dict):
        for key in ("text", "content", "output_text"):
            text = first_text(value.get(key))
            if text:
                return text
        return ""
    return str(value).strip()


def classify_error(status_code: Optional[int], detail: str) -> str:
    detail_lc = detail.lower()
    if status_code in (401, 403) or "auth" in detail_lc or "api key" in detail_lc:
        return "auth"
    if status_code == 429 or "quota" in detail_lc or "rate limit" in detail_lc:
        return "quota"
    if status_code == 404 or "model" in detail_lc:
        return "model"
    if status_code is None:
        return "network"
    return "other"


def parse_openai_compatible(payload: Dict[str, Any]) -> str:
    choices = payload.get("choices") or []
    for choice in choices:
        message = choice.get("message") or {}
        text = first_text(message.get("content"))
        if text:
            return text
        text = first_text(choice.get("text"))
        if text:
            return text
    return ""


def parse_gemini(payload: Dict[str, Any]) -> str:
    candidates = payload.get("candidates") or []
    for candidate in candidates:
        content = candidate.get("content") or {}
        text = first_text((content.get("parts") or [{}])[0].get("text"))
        if text:
            return text
    return ""


def parse_cohere(payload: Dict[str, Any]) -> str:
    message = payload.get("message") or {}
    content = message.get("content") or []
    text = first_text(content)
    if text:
        return text
    return first_text(payload.get("text"))


def http_post_json(
    url: str,
    payload: Dict[str, Any],
    headers: Dict[str, str],
    timeout_seconds: float,
) -> Dict[str, Any]:
    request_headers = {"User-Agent": "ai-api-poc/1.0"}
    request_headers.update(headers)
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url=url, data=body, headers=request_headers, method="POST")

    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            raw = response.read().decode("utf-8")
            return {
                "status_code": response.status,
                "payload": json.loads(raw) if raw else {},
            }
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        detail = raw
        try:
            parsed = json.loads(raw)
            detail = json.dumps(parsed, ensure_ascii=False)
        except json.JSONDecodeError:
            pass
        return {
            "status_code": exc.code,
            "error": detail,
        }
    except urllib.error.URLError as exc:
        return {
            "status_code": None,
            "error": str(exc.reason),
        }


def build_openai_headers(config: Dict[str, Any], api_key: str) -> Dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    extra_headers = config.get("extra_headers") or {}
    for header_name, env_name in extra_headers.items():
        env_value = os.getenv(env_name)
        if env_value:
            headers[header_name] = env_value
    return headers


def call_openai_compatible(config: Dict[str, Any], api_key: str, model: str) -> Dict[str, Any]:
    endpoint = os.getenv(config["endpoint_env"], config["default_endpoint"])
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": get_prompt()}],
        "temperature": 0,
    }
    result = http_post_json(endpoint, payload, build_openai_headers(config, api_key), get_timeout_seconds())
    if "error" in result:
        return result
    result["output"] = parse_openai_compatible(result["payload"])
    return result


def call_gemini(config: Dict[str, Any], api_key: str, model: str) -> Dict[str, Any]:
    endpoint = os.getenv(
        config["endpoint_env"],
        config["default_endpoint"].format(model=model, api_key=urllib.parse.quote(api_key, safe="")),
    )
    payload = {
        "contents": [{"parts": [{"text": get_prompt()}]}],
        "generationConfig": {"temperature": 0},
    }
    headers = {"Content-Type": "application/json"}
    result = http_post_json(endpoint, payload, headers, get_timeout_seconds())
    if "error" in result:
        return result
    result["output"] = parse_gemini(result["payload"])
    return result


def call_cohere(config: Dict[str, Any], api_key: str, model: str) -> Dict[str, Any]:
    endpoint = os.getenv(config["endpoint_env"], config["default_endpoint"])
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": get_prompt()}],
        "temperature": 0,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    result = http_post_json(endpoint, payload, headers, get_timeout_seconds())
    if "error" in result:
        return result
    result["output"] = parse_cohere(result["payload"])
    return result


def get_models(config: Dict[str, Any]) -> List[str]:
    models_env_name = config["models_env"]
    raw_models = os.getenv(models_env_name, "").strip()
    if raw_models:
        models = [item.strip() for item in raw_models.split(",") if item.strip()]
        if models:
            return models

    single_model = os.getenv(config["model_env"], config["default_model"]).strip()
    if single_model:
        return [single_model]
    return [config["default_model"]]


def get_api_keys(config: Dict[str, Any]) -> List[str]:
    keys_env_name = config["keys_env"]
    raw_keys = os.getenv(keys_env_name, "").strip()
    if raw_keys:
        keys = [item.strip() for item in raw_keys.split(",") if item.strip()]
        if keys:
            return keys

    single_key = os.getenv(config["key_env"], "").strip()
    if single_key:
        return [single_key]
    return []


PROVIDERS: List[Dict[str, Any]] = [
    {
        "name": "gemini",
        "kind": "gemini",
        "key_env": "GOOGLE_GENERATIVE_AI_API_KEY",
        "keys_env": "GOOGLE_GENERATIVE_AI_API_KEYS",
        "model_env": "GEMINI_MODEL",
        "models_env": "GEMINI_MODELS",
        "default_model": "gemini-2.0-flash",
        "endpoint_env": "GEMINI_ENDPOINT",
        "default_endpoint": "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
    },
    {
        "name": "groq",
        "kind": "openai",
        "key_env": "GROQ_API_KEY",
        "keys_env": "GROQ_API_KEYS",
        "model_env": "GROQ_MODEL",
        "models_env": "GROQ_MODELS",
        "default_model": "llama-3.1-8b-instant",
        "endpoint_env": "GROQ_ENDPOINT",
        "default_endpoint": "https://api.groq.com/openai/v1/chat/completions",
    },
    {
        "name": "openrouter",
        "kind": "openai",
        "key_env": "OPENROUTER_API_KEY",
        "keys_env": "OPENROUTER_API_KEYS",
        "model_env": "OPENROUTER_MODEL",
        "models_env": "OPENROUTER_MODELS",
        "default_model": "openrouter/auto",
        "endpoint_env": "OPENROUTER_ENDPOINT",
        "default_endpoint": "https://openrouter.ai/api/v1/chat/completions",
        "extra_headers": {
            "HTTP-Referer": "OPENROUTER_SITE_URL",
            "X-Title": "OPENROUTER_APP_NAME",
        },
    },
    {
        "name": "mistral",
        "kind": "openai",
        "key_env": "MISTRAL_API_KEY",
        "keys_env": "MISTRAL_API_KEYS",
        "model_env": "MISTRAL_MODEL",
        "models_env": "MISTRAL_MODELS",
        "default_model": "mistral-small-latest",
        "endpoint_env": "MISTRAL_ENDPOINT",
        "default_endpoint": "https://api.mistral.ai/v1/chat/completions",
    },
    {
        "name": "cohere",
        "kind": "cohere",
        "key_env": "COHERE_API_KEY",
        "keys_env": "COHERE_API_KEYS",
        "model_env": "COHERE_MODEL",
        "models_env": "COHERE_MODELS",
        "default_model": "command-a-03-2025",
        "endpoint_env": "COHERE_ENDPOINT",
        "default_endpoint": "https://api.cohere.com/v2/chat",
    },
    {
        "name": "hf",
        "kind": "openai",
        "key_env": "HF_TOKEN",
        "keys_env": "HF_TOKENS",
        "model_env": "HF_MODEL",
        "models_env": "HF_MODELS",
        "default_model": "openai/gpt-oss-120b",
        "endpoint_env": "HF_ENDPOINT",
        "default_endpoint": "https://router.huggingface.co/v1/chat/completions",
    },
    {
        "name": "github_models",
        "kind": "openai",
        "key_env": "GITHUB_MODELS_TOKEN",
        "keys_env": "GITHUB_MODELS_TOKENS",
        "model_env": "GITHUB_MODELS_MODEL",
        "models_env": "GITHUB_MODELS_MODELS",
        "default_model": "openai/gpt-4o-mini",
        "endpoint_env": "GITHUB_MODELS_ENDPOINT",
        "default_endpoint": "https://models.inference.ai.azure.com/chat/completions",
    },
    {
        "name": "cerebras",
        "kind": "openai",
        "key_env": "CEREBRAS_API_KEY",
        "keys_env": "CEREBRAS_API_KEYS",
        "model_env": "CEREBRAS_MODEL",
        "models_env": "CEREBRAS_MODELS",
        "default_model": "llama3.1-8b",
        "endpoint_env": "CEREBRAS_ENDPOINT",
        "default_endpoint": "https://api.cerebras.ai/v1/chat/completions",
    },
    {
        "name": "sambanova",
        "kind": "openai",
        "key_env": "SAMBANOVA_API_KEY",
        "keys_env": "SAMBANOVA_API_KEYS",
        "model_env": "SAMBANOVA_MODEL",
        "models_env": "SAMBANOVA_MODELS",
        "default_model": "Meta-Llama-3.3-70B-Instruct",
        "endpoint_env": "SAMBANOVA_ENDPOINT",
        "default_endpoint": "https://api.sambanova.ai/v1/chat/completions",
    },
    {
        "name": "fireworks",
        "kind": "openai",
        "key_env": "FIREWORKS_API_KEY",
        "keys_env": "FIREWORKS_API_KEYS",
        "model_env": "FIREWORKS_MODEL",
        "models_env": "FIREWORKS_MODELS",
        "default_model": "accounts/fireworks/models/llama-v3p1-8b-instruct",
        "endpoint_env": "FIREWORKS_ENDPOINT",
        "default_endpoint": "https://api.fireworks.ai/inference/v1/chat/completions",
    },
]


def run_model_once(config: Dict[str, Any], model: str, api_key: str) -> Dict[str, Any]:
    base_result: Dict[str, Any] = {
        "provider": config["name"],
        "model": model,
        "ok": False,
        "output": "",
        "error": "",
    }

    if config["kind"] == "gemini":
        result = call_gemini(config, api_key, model)
    elif config["kind"] == "cohere":
        result = call_cohere(config, api_key, model)
    else:
        result = call_openai_compatible(config, api_key, model)

    status_code = result.get("status_code")
    if "error" in result:
        base_result["error"] = f"{classify_error(status_code, result['error'])}:{result['error']}"
        return base_result

    output = first_text(result.get("output"))
    base_result["output"] = output
    base_result["ok"] = bool(output)
    if not base_result["ok"]:
        base_result["error"] = "empty_response"
    return base_result


def run_model(config: Dict[str, Any], model: str) -> Dict[str, Any]:
    api_keys = get_api_keys(config)
    base_result: Dict[str, Any] = {
        "provider": config["name"],
        "model": model,
        "ok": False,
        "output": "",
        "error": "",
        "attempts": [],
    }

    if not api_keys:
        base_result["error"] = f"missing_env:{config['key_env']} or {config['keys_env']}"
        return base_result

    for index, api_key in enumerate(api_keys, start=1):
        result = run_model_once(config, model, api_key)
        attempt = {
            "key_index": index,
            "ok": result["ok"],
            "output": result["output"],
            "error": result["error"],
        }
        base_result["attempts"].append(attempt)
        if result["ok"]:
            base_result["ok"] = True
            base_result["output"] = result["output"]
            base_result["error"] = ""
            return base_result

        if index < len(api_keys):
            continue

        base_result["error"] = result["error"]
        if result["output"]:
            base_result["output"] = result["output"]

    return base_result


def run_provider_queue(config: Dict[str, Any], sleep_seconds: float) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    for index, model in enumerate(get_models(config)):
        results.append(run_model(config, model))
        if sleep_seconds > 0 and index < len(get_models(config)) - 1:
            time.sleep(sleep_seconds)
    return results


def print_result(result: Dict[str, Any]) -> None:
    prefix = f"[{result['provider']}] model={result['model']}"
    if result["ok"]:
        print(f"{prefix} ok=True")
        return

    print(f"{prefix} ok=False")


def print_summary(results: List[Dict[str, Any]]) -> None:
    print("=== Summary ===")
    total = len(results)
    success_count = sum(1 for result in results if result["ok"])
    error_count = sum(1 for result in results if result["error"])
    print(f"total={total} success={success_count} failed={total - success_count} errors={error_count}")
    print()

    for result in results:
        print_result(result)


def build_log_text(results: List[Dict[str, Any]]) -> str:
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    total = len(results)
    success_count = sum(1 for result in results if result["ok"])
    failed_count = total - success_count

    lines = [
        "# AI API PoC Result",
        "",
        f"- **timestamp**: {timestamp}",
        f"- **total**: {total}",
        f"- **success**: {success_count}",
        f"- **failed**: {failed_count}",
        "",
        "## Prompt",
        "```text",
    ]
    lines.extend(str(get_prompt()).splitlines())
    lines.extend([
        "```",
        "",
    ])

    current_provider = None
    for result in results:
        provider = result["provider"]
        if provider != current_provider:
            lines.append(f"## Provider: {provider}")
            lines.append("")
            current_provider = provider

        status = "OK" if result["ok"] else "FAILED"
        lines.append(f"### Model: {result['model']}")
        lines.append(f"- **status**: {status}")
        for attempt in result.get("attempts", []):
            attempt_status = "OK" if attempt["ok"] else "FAILED"
            lines.append(f"- **attempt[{attempt['key_index']}]**: {attempt_status}")
            if attempt["output"]:
                lines.append("  - **output**:")
                lines.append("    ```text")
                for line in str(attempt["output"]).splitlines():
                    lines.append(f"    {line}")
                lines.append("    ```")
            if attempt["error"]:
                lines.append("  - **error**:")
                lines.append("    ```text")
                for line in str(attempt["error"]).splitlines():
                    lines.append(f"    {line}")
                lines.append("    ```")
        if result["output"]:
            # Only print output if not already printed in the final attempt
            final_attempt_output = result.get("attempts", [])[-1].get("output") if result.get("attempts") else None
            if final_attempt_output != result["output"]:
                lines.append("- **output**:")
                lines.append("  ```text")
                for line in str(result["output"]).splitlines():
                    lines.append(f"  {line}")
                lines.append("  ```")
        if result["error"]:
            # Only print error if not already printed in the final attempt
            final_attempt_error = result.get("attempts", [])[-1].get("error") if result.get("attempts") else None
            if final_attempt_error != result["error"]:
                lines.append("- **error**:")
                lines.append("  ```text")
                for line in str(result["error"]).splitlines():
                    lines.append(f"  {line}")
                lines.append("  ```")
        lines.append("")

    return "\n".join(lines) + "\n"


def write_log_file(results: List[Dict[str, Any]]) -> str:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    log_dir = os.path.join(base_dir, "logs")
    os.makedirs(log_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    log_path = os.path.join(log_dir, f"ai_api_poc_{timestamp}.md")
    log_text = build_log_text(results)
    with open(log_path, "w", encoding="utf-8") as handle:
        handle.write(log_text)
    return log_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Minimal connectivity test for multiple AI APIs.")
    parser.add_argument(
        "--providers",
        default="all",
        help="Comma-separated provider names. Default: all",
    )
    parser.add_argument(
        "--sleep-seconds",
        type=float,
        default=0.0,
        help="Optional delay between model calls within the same provider.",
    )
    return parser.parse_args()


def main() -> int:
    load_dotenv()
    args = parse_args()

    selected: Optional[Set[str]] = None
    if args.providers != "all":
        selected = {name.strip() for name in args.providers.split(",") if name.strip()}

    target_configs = [
        config for config in PROVIDERS
        if selected is None or config["name"] in selected
    ]

    all_results: List[Dict[str, Any]] = []
    if target_configs:
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(target_configs)) as executor:
            future_map = {
                executor.submit(run_provider_queue, config, args.sleep_seconds): config["name"]
                for config in target_configs
            }
            provider_results: Dict[str, List[Dict[str, Any]]] = {}
            for future in concurrent.futures.as_completed(future_map):
                provider_name = future_map[future]
                provider_results[provider_name] = future.result()

        for config in target_configs:
            all_results.extend(provider_results.get(config["name"], []))

    exit_code = 0
    print_summary(all_results)
    log_path = write_log_file(all_results)
    print()
    print(f"log_file={log_path}")
    for result in all_results:
        if result["ok"] is False and result["error"]:
            exit_code = 1

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
