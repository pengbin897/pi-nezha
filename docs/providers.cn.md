# 提供商

Pi 通过 OAuth 支持订阅制提供商，通过环境变量或认证文件支持 API 密钥提供商。对于每个提供商，pi 知道所有可用的模型。列表随每次 pi 发布更新。

## 目录

- [订阅](#订阅)
- [API 密钥](#api-密钥)
- [认证文件](#认证文件)
- [云提供商](#云提供商)
- [自定义提供商](#自定义提供商)
- [解析顺序](#解析顺序)

## 订阅

在交互模式下使用 `/login`，然后选择一个提供商：

- Claude Pro/Max
- ChatGPT Plus/Pro (Codex)
- GitHub Copilot
- Google Gemini CLI
- Google Antigravity

使用 `/logout` 清除凭据。令牌存储在 `~/.pi/agent/auth.json` 中，过期时自动刷新。

### GitHub Copilot

- 按 Enter 键使用 github.com，或输入你的 GitHub Enterprise Server 域
- 如果显示"不支持的模型"，在 VS Code 中启用：Copilot Chat → 模型选择器 → 选择模型 → "启用"

### Google 提供商

- **Gemini CLI**：通过 Cloud Code Assist 的标准 Gemini 模型
- **Antigravity**：包含 Gemini 3、Claude 和 GPT-OSS 模型的沙盒
- 两者都免费使用任何 Google 账户，但有速率限制
- 对于付费 Cloud Code Assist：设置 `GOOGLE_CLOUD_PROJECT` 环境变量

### OpenAI Codex

- 需要 ChatGPT Plus 或 Pro 订阅
- 仅供个人使用；生产环境请使用 OpenAI Platform API

## API 密钥

### 环境变量或认证文件

通过环境变量设置：

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pi
```

| 提供商 | 环境变量 | `auth.json` 密钥 |
|----------|----------------------|------------------|
| Anthropic | `ANTHROPIC_API_KEY` | `anthropic` |
| Azure OpenAI Responses | `AZURE_OPENAI_API_KEY` | `azure-openai-responses` |
| OpenAI | `OPENAI_API_KEY` | `openai` |
| Google Gemini | `GEMINI_API_KEY` | `google` |
| Mistral | `MISTRAL_API_KEY` | `mistral` |
| Groq | `GROQ_API_KEY` | `groq` |
| Cerebras | `CEREBRAS_API_KEY` | `cerebras` |
| xAI | `XAI_API_KEY` | `xai` |
| OpenRouter | `OPENROUTER_API_KEY` | `openrouter` |
| Vercel AI Gateway | `AI_GATEWAY_API_KEY` | `vercel-ai-gateway` |
| ZAI | `ZAI_API_KEY` | `zai` |
| OpenCode Zen | `OPENCODE_API_KEY` | `opencode` |
| Hugging Face | `HF_TOKEN` | `huggingface` |
| Kimi For Coding | `KIMI_API_KEY` | `kimi-coding` |
| MiniMax | `MINIMAX_API_KEY` | `minimax` |
| MiniMax (中国) | `MINIMAX_CN_API_KEY` | `minimax-cn` |

环境变量和 `auth.json` 密钥的参考：[`const envMap`](https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/env-api-keys.ts) 在 [`packages/ai/src/env-api-keys.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/env-api-keys.ts)。

#### 认证文件

将凭据存储在 `~/.pi/agent/auth.json`：

```json
{
  "anthropic": { "type": "api_key", "key": "sk-ant-..." },
  "openai": { "type": "api_key", "key": "sk-..." },
  "google": { "type": "api_key", "key": "..." },
  "opencode": { "type": "api_key", "key": "..." }
}
```

文件使用 `0600` 权限创建（仅用户读写）。认证文件凭据优先于环境变量。

### 密钥解析

`key` 字段支持三种格式：

- **Shell 命令：** `"!command"` 执行并使用 stdout（缓存整个进程生命周期）
  ```json
  { "type": "api_key", "key": "!security find-generic-password -ws 'anthropic'" }
  { "type": "api_key", "key": "!op read 'op://vault/item/credential'" }
  ```
- **环境变量：** 使用命名变量的值
  ```json
  { "type": "api_key", "key": "MY_ANTHROPIC_KEY" }
  ```
- **字面值：** 直接使用
  ```json
  { "type": "api_key", "key": "sk-ant-..." }
  ```

OAuth 凭据在 `/login` 后也存储在此文件中并自动管理。

## 云提供商

### Azure OpenAI

```bash
export AZURE_OPENAI_API_KEY=...
export AZURE_OPENAI_BASE_URL=https://your-resource.openai.azure.com
# 或使用资源名称而不是 base URL
export AZURE_OPENAI_RESOURCE_NAME=your-resource

# 可选
export AZURE_OPENAI_API_VERSION=2024-02-01
export AZURE_OPENAI_DEPLOYMENT_NAME_MAP=gpt-4=my-gpt4,gpt-4o=my-gpt4o
```

### Amazon Bedrock

```bash
# 选项 1：AWS Profile
export AWS_PROFILE=your-profile

# 选项 2：IAM 密钥
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...

# 选项 3：Bearer 令牌
export AWS_BEARER_TOKEN_BEDROCK=...

# 可选区域（默认为 us-east-1）
export AWS_REGION=us-west-2
```

还支持 ECS 任务角色（`AWS_CONTAINER_CREDENTIALS_*`）和 IRSA（`AWS_WEB_IDENTITY_TOKEN_FILE`）。

```bash
pi --provider amazon-bedrock --model us.anthropic.claude-sonnet-4-20250514-v1:0
```

如果你正在连接到 Bedrock API 代理，可以使用以下环境变量：

```bash
# 为 Bedrock 代理设置 URL（标准 AWS SDK 环境变量）
export AWS_ENDPOINT_URL_BEDROCK_RUNTIME=https://my.corp.proxy/bedrock

# 如果你的代理不需要身份验证
export AWS_BEDROCK_SKIP_AUTH=1

# 如果你的代理只支持 HTTP/1.1
export AWS_BEDROCK_FORCE_HTTP1=1
```

### Google Vertex AI

使用应用程序默认凭据：

```bash
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT=your-project
export GOOGLE_CLOUD_LOCATION=us-central1
```

或将 `GOOGLE_APPLICATION_CREDENTIALS` 设置为服务帐户密钥文件。

## 自定义提供商

**通过 models.json：** 添加 Ollama、LM Studio、vLLM 或任何支持 API 的提供商（OpenAI Completions、OpenAI Responses、Anthropic Messages、Google Generative AI）。参见 [models.md](models.md)。

**通过扩展：** 对于需要自定义 API 实现或 OAuth 流程的提供商，创建扩展。参见 [custom-provider.md](custom-provider.md) 和 [examples/extensions/custom-provider-gitlab-duo](../examples/extensions/custom-provider-gitlab-duo/)。

## 解析顺序

解析提供商的凭据时：

1. CLI `--api-key` 标志
2. `auth.json` 条目（API 密钥或 OAuth 令牌）
3. 环境变量
4. `models.json` 中的自定义提供商密钥
