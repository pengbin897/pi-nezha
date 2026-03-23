# Nezha

基于 [pi-coding-agent](https://github.com/badlogic/pi-mono/tree/main/pi-coding-agent) 的定制化 AI 编程助手。

## 特性

- 🔌 **动态 Gateway 加载** - 运行时根据配置动态加载 Gateway，无需修改代码
- 📝 **纯配置驱动** - 所有配置统一在配置文件中，不依赖环境变量
- 🌐 **多渠道支持** - HTTP API、钉钉、飞书、企业微信等多渠道接入
- 🚀 **极易扩展** - 添加新 Gateway 只需创建模块和配置，无需修改核心代码
- 🔒 **统一管理** - GatewayManager 统一管理所有 Gateway 的生命周期

## 快速开始

### 安装

```bash
npm install
npm run build
```

### 配置

在 Agent 配置目录（通常是 `~/.nezha/`）创建 `nezha.json` 或 `nezha.yml` 配置文件。

**最小配置示例：**

```json
{
  "gateways": [
    {
      "type": "http",
      "handler": "http/handler.js",
      "config": {
        "port": 3000
      }
    }
  ]
}
```

**完整配置示例：**

参见 [nezha.example.json](./nezha.example.json) 或 [nezha.example.yml](./nezha.example.yml)

详细配置说明请查看 [CONFIG.md](./CONFIG.md)

### 运行

```bash
# 设置 API Key（通过 pi-coding-agent 的标准方式）
export ANTHROPIC_API_KEY=sk-ant-xxx

# 运行 Nezha
npm start
```

## 核心概念

### 动态 Gateway 加载

Nezha 的核心特性是**动态 Gateway 加载机制**：

```json
{
  "gateways": [
    {
      "type": "gateway类型",
      "handler": "模块路径",
      "config": { /* 配置 */ }
    }
  ]
}
```

- `type` - Gateway 类型标识（用于日志）
- `handler` - Handler 模块路径（相对于 `src/gateway/`）
- `config` - Gateway 特定配置

### Gateway Handler 接口

所有 Gateway Handler 必须：
1. 实现 `GatewayHandler` 接口
2. 导出 `create` 函数

```typescript
export async function create(
  session: AgentSession,
  config: Record<string, unknown>,
): Promise<GatewayHandler> {
  // 返回 Handler 实例
}
```

## 内置 Gateway

### HTTP Gateway

提供 REST API 接口：

```json
{
  "type": "http",
  "handler": "http/handler.js",
  "config": {
    "port": 3000,
    "host": "127.0.0.1"
  }
}
```

**API 端点：**
- `POST /v1/prompt` - 流式响应（SSE）
- `POST /v1/prompt/sync` - 同步响应（JSON）
- `GET /v1/status` - Agent 状态
- `GET /health` - 健康检查

### 钉钉 Gateway

连接钉钉机器人：

```json
{
  "type": "dingtalk",
  "handler": "channels/dingtalk/handler.js",
  "config": {
    "clientId": "your-client-id",
    "clientSecret": "your-client-secret"
  }
}
```

## 添加自定义 Gateway

### 1. 创建 Handler 模块

在 `src/gateway/` 下创建 Handler：

```typescript
// src/gateway/custom/my-gateway/handler.ts
import type { AgentSession } from "@mariozechner/pi-coding-agent";
import type { GatewayHandler } from "../../handler.js";

class MyGatewayHandler implements GatewayHandler {
  readonly name = "my-gateway";

  constructor(
    private readonly session: AgentSession,
    private readonly config: Record<string, unknown>,
  ) {}

  async startup(): Promise<void> {
    console.log("My Gateway started");
  }

  async shutdown(): Promise<void> {
    console.log("My Gateway stopped");
  }
}

export async function create(
  session: AgentSession,
  config: Record<string, unknown>,
): Promise<GatewayHandler> {
  return new MyGatewayHandler(session, config);
}
```

### 2. 添加配置

```json
{
  "gateways": [
    {
      "type": "my-gateway",
      "handler": "custom/my-gateway/handler.js",
      "config": {
        "myOption": "value"
      }
    }
  ]
}
```

### 3. 运行

无需修改任何核心代码，直接运行即可！

## 架构设计

### 核心组件

1. **配置加载器** (`src/config.ts`)
   - 支持 JSON 和 YAML 格式
   - 纯配置驱动，不读取环境变量
   - 动态 Gateway 配置数组

2. **Gateway Factory** (`src/gateway/factory.ts`)
   - 动态加载 Handler 模块
   - 调用 `create` 函数创建实例
   - 错误处理和日志

3. **GatewayManager** (`src/gateway/handler.ts`)
   - 统一管理所有 Gateway 的生命周期
   - 按顺序启动，按相反顺序停止
   - 启动失败自动回滚

### 工作流程

```
加载配置 → 动态导入模块 → 调用 create → 注册到 Manager → 统一管理生命周期
```

### 优势

**相比硬编码方式：**
- ✅ 无需在代码中注册 Gateway 类型
- ✅ 配置文件完全控制 Gateway 加载
- ✅ 支持加载第三方 Gateway 包
- ✅ 配置变更无需重新编译

**相比环境变量：**
- ✅ 所有配置集中管理
- ✅ 支持复杂配置结构
- ✅ 更易于版本控制
- ✅ 更好的类型安全

## 开发

```bash
# 开发模式（使用 tsx）
npm run dev

# 编译
npm run build

# 清理编译产物
npm run clean
```

## 配置参考

详细的配置说明请查看 [CONFIG.md](./CONFIG.md)

示例配置：
- [nezha.example.json](./nezha.example.json) - JSON 格式
- [nezha.example.yml](./nezha.example.yml) - YAML 格式

## API 文档

### HTTP Gateway API

#### POST /v1/prompt

流式响应（SSE）

**请求：**
```json
{
  "text": "你的问题",
  "images": [],
  "expandPromptTemplates": true
}
```

**响应：** Server-Sent Events 流

#### POST /v1/prompt/sync

同步响应（JSON）

**请求：**
```json
{
  "text": "你的问题"
}
```

**响应：**
```json
{
  "text": "回答内容",
  "toolCalls": []
}
```

## 常见问题

### Q: 如何禁用某个 Gateway？

A: 直接从配置数组中删除对应的 Gateway 配置即可。

### Q: 可以同时运行多个相同类型的 Gateway 吗？

A: 可以！只要配置不冲突（如端口不重复）即可。

```json
{
  "gateways": [
    {
      "type": "http-public",
      "handler": "http/handler.js",
      "config": { "port": 3000, "host": "0.0.0.0" }
    },
    {
      "type": "http-local",
      "handler": "http/handler.js",
      "config": { "port": 3001, "host": "127.0.0.1" }
    }
  ]
}
```

### Q: Handler 模块加载失败怎么办？

A: 检查：
1. `handler` 路径是否正确（相对于 `src/gateway/`）
2. 模块是否导出 `create` 函数
3. 编译后的 `dist/gateway/` 目录是否存在对应文件

### Q: 如何调试 Gateway？

A: 在 Handler 的 `startup()` 和 `shutdown()` 方法中添加 `console.log`，Nezha 会在控制台输出所有日志。

## 许可证

MIT

## 致谢

本项目基于 [@mariozechner/pi-coding-agent](https://github.com/badlogic/pi-mono/tree/main/pi-coding-agent) 开发。
