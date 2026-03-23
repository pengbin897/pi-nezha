# Gateway 架构

Gateway 是 coding-agent 的统一消息入口层，将 HTTP API 和各类消息渠道（钉钉/飞书/企微等）统一抽象，所有 gateway 都通过 `AgentSession.prompt()` 处理用户请求。

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                        main.ts                               │
│                                                              │
│   ┌──────────────────────────────────────────────────────┐  │
│   │  startGateway({ session, mode, parsed })             │  │
│   │  - 解析 PI_GATEWAY 环境变量                         │  │
│   │  - 启动配置的 gateway（http、dingtalk 等）          │  │
│   │  - 统一的生命周期管理（startup、shutdown）          │  │
│   │  - 进入常驻模式，持续接收外部请求                   │  │
│   └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   gateway/index.ts                           │
│                                                              │
│  ┌────────────────┐     ┌────────────────────────────┐      │
│  │ HTTP Gateway   │     │ Channels Gateway           │      │
│  │ (startHttp)    │     │ (startGatewayChannels)     │      │
│  └────────────────┘     └────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌──────────────────┐      ┌──────────────────────────────────┐
│ http/adapter.ts  │      │  channels/bootstrap.ts           │
│                  │      │                                  │
│ - HTTP server    │      │  - DingTalk (dingtalk/adapter)  │
│ - REST API       │      │  - Feishu (待接入)              │
│ - SSE 流式响应   │      │  - 企微 (待接入)                │
└──────────────────┘      └──────────────────────────────────┘
         │                              │
         └──────────────┬───────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │  AgentSession    │
              │  .prompt()       │
              └──────────────────┘
```

## 核心概念

### 1. 统一的 Gateway 抽象

所有 gateway 都实现 `GatewayChannelBootstrapper` 接口：

```typescript
export type GatewayChannelBootstrapper = (
  context: GatewayBootstrapContext
) => Promise<StartedGatewayChannel | null>;

export interface StartedGatewayChannel {
  name: string;
  stop: () => Promise<void>;
}
```

这个接口定义了：
- **启动逻辑**: 返回已启动的 gateway 实例，或 null（未启用）
- **停止逻辑**: 提供 `stop()` 方法用于 graceful shutdown
- **名称标识**: 通过 `name` 字段标识 gateway 类型

### 2. Gateway 启动流程

1. **解析配置**: 从 `PI_GATEWAY` 环境变量解析启用的 gateway 列表
2. **验证前置条件**: 检查模式兼容性、模型可用性等
3. **并行启动**: 依次调用各 gateway 的 bootstrapper，收集已启动实例
4. **注册 shutdown**: 统一处理 SIGINT/SIGTERM 信号，确保所有 gateway 优雅关闭
5. **常驻运行**: 进入无限等待状态，持续接收外部请求

### 3. 错误处理与回滚

- **启动失败回滚**: 任一 gateway 启动失败时，自动停止已启动的其他 gateway
- **部分成功保护**: 避免因一个 gateway 故障导致整体不可用
- **统一错误日志**: 所有启动/停止错误都有清晰的日志输出

## 使用方式

### 启用 Gateway

通过 `PI_GATEWAY` 环境变量指定要启用的 gateway（逗号分隔）：

```bash
# 启用 HTTP gateway
PI_GATEWAY=http npm start

# 启用钉钉 gateway
PI_GATEWAY=dingtalk \
  PI_DINGTALK_CLIENT_ID=xxx \
  PI_DINGTALK_CLIENT_SECRET=xxx \
  npm start

# 同时启用多个 gateway
PI_GATEWAY=http,dingtalk \
  PI_HTTP_PORT=3000 \
  PI_DINGTALK_CLIENT_ID=xxx \
  PI_DINGTALK_CLIENT_SECRET=xxx \
  npm start
```

### HTTP Gateway 配置

环境变量：
- `PI_HTTP_PORT` - 监听端口（默认 3000）
- `PI_HTTP_HOST` - 监听地址（默认 127.0.0.1）

API 端点：
- `POST /v1/prompt` - 流式响应（SSE）
- `POST /v1/prompt/sync` - 同步响应（JSON）
- `GET /v1/status` - Agent 状态
- `GET /health` - 健康检查

### DingTalk Gateway 配置

环境变量：
- `PI_DINGTALK_CLIENT_ID` - 应用 Client ID
- `PI_DINGTALK_CLIENT_SECRET` - 应用 Client Secret
- `PI_DINGTALK_DEBUG` - 是否开启调试日志（默认 false）
- `PI_DINGTALK_KEEP_ALIVE` - 是否启用心跳保活（默认 true）
- `PI_DINGTALK_AUTO_RECONNECT` - 断线是否自动重连（默认 true）

详细配置参考 `gateway/channels/dingtalk/README.md`

## 添加新的 Gateway

### 1. 创建 Gateway Adapter

在 `gateway/channels/<channel>/adapter.ts` 中实现 `GatewayChannelBootstrapper`：

```typescript
import type { GatewayChannelBootstrapper } from "../types.js";

export const startFeishuGatewayChannel: GatewayChannelBootstrapper = async ({
  session,
  enabledChannels,
}) => {
  // 1. 检查是否启用
  if (!enabledChannels.has("feishu")) {
    return null;
  }

  // 2. 验证配置
  const appId = process.env.PI_FEISHU_APP_ID;
  const appSecret = process.env.PI_FEISHU_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error("Missing Feishu credentials...");
  }

  // 3. 初始化客户端
  const feishuClient = new FeishuClient({ appId, appSecret });

  // 4. 注册 AgentSession
  feishuClient.registerAgentSession(session);

  // 5. 启动服务
  await feishuClient.connect();

  // 6. 返回 gateway 实例
  return {
    name: "feishu",
    stop: async () => {
      feishuClient.unregisterAgentSession();
      feishuClient.disconnect();
    },
  };
};
```

### 2. 注册到 Bootstrap

在 `gateway/channels/bootstrap.ts` 中注册新的 bootstrapper：

```typescript
const bootstrappers: GatewayChannelBootstrapper[] = [
  startDingtalkGatewayChannel,
  startFeishuGatewayChannel, // 新增
];
```

### 3. 使用新 Gateway

```bash
PI_GATEWAY=feishu \
  PI_FEISHU_APP_ID=xxx \
  PI_FEISHU_APP_SECRET=xxx \
  npm start
```

## 目录结构

```
src/gateway/
├── index.ts                      # 统一入口，处理启动逻辑和生命周期
├── README.md                     # 本文件
├── channels/                     # 消息渠道类 gateway
│   ├── types.ts                 # 通用类型定义
│   ├── bootstrap.ts             # 渠道 gateway 启动器
│   └── dingtalk/                # 钉钉 gateway 实现
│       ├── adapter.ts           # 钉钉 bootstrapper
│       ├── client.ts            # DWClient 核心实现
│       ├── constants.ts         # 钉钉常量定义
│       ├── index.ts             # 对外导出
│       ├── README.md            # 钉钉使用文档
│       └── IMPLEMENTATION.md    # 钉钉实现文档
└── http/                        # HTTP gateway 实现
    ├── adapter.ts               # HTTP bootstrapper
    ├── server.ts                # HTTP server 实现
    └── handler.ts               # 请求处理器（prompt/status 等）
```

## 设计原则

1. **最小侵入**: main.ts 只保留一行调用 `startGateway()`，gateway 逻辑封装在独立模块
2. **统一抽象**: 所有 gateway 都实现相同接口，易于管理和扩展
3. **配置驱动**: 通过环境变量灵活控制启用的 gateway，无需修改代码
4. **优雅关闭**: 统一的 signal handling，确保所有资源正确释放
5. **类型安全**: 充分利用 TypeScript 类型系统，避免运行时错误
6. **错误隔离**: 单个 gateway 失败不影响其他 gateway，且自动回滚
7. **关注点分离**: HTTP、消息渠道等不同类型的 gateway 分开组织

## 后续扩展

- [ ] Feishu (飞书) gateway
- [ ] WeChat (企业微信) gateway
- [ ] Slack gateway
- [ ] Discord gateway
- [ ] Telegram gateway
- [ ] WebSocket gateway（实时双向通信）
- [ ] gRPC gateway（高性能 RPC）
