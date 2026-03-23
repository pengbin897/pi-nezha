# 钉钉 Gateway 集成

这个模块实现了钉钉机器人与 AgentSession 的集成，允许通过钉钉聊天界面与 coding agent 交互。

## 功能特性

- **WebSocket 长连接**: 使用钉钉的 Stream 模式，通过 WebSocket 接收实时消息
- **自动重连**: 支持断线自动重连，保证服务稳定性
- **Agent 集成**: 自动将用户消息转发到 AgentSession 处理
- **响应回传**: 将 Agent 的响应文本发送回钉钉会话

## 使用方法

### 1. 基本设置

```typescript
import { DWClient } from './gateway/channels/dingtalk/client.js';
import { createAgentSession } from './core/sdk.js';

// 创建 AgentSession
const session = await createAgentSession({
  // ... session 配置
});

// 创建钉钉客户端
const dingtalkClient = new DWClient({
  clientId: process.env.DINGTALK_CLIENT_ID!,
  clientSecret: process.env.DINGTALK_CLIENT_SECRET!,
  debug: true, // 开启调试日志
  keepAlive: true, // 启用心跳保活
  autoReconnect: true, // 启用自动重连
});

// 注册 AgentSession 到钉钉客户端
dingtalkClient.registerAgentSession(session);

// 连接到钉钉 Stream 服务
await dingtalkClient.connect();

console.log('钉钉机器人已启动，等待消息...');
```

### 2. 环境变量配置

需要在环境变量中配置钉钉应用凭证：

```bash
export DINGTALK_CLIENT_ID="your_client_id"
export DINGTALK_CLIENT_SECRET="your_client_secret"
```

### 3. 钉钉应用配置

1. 在钉钉开发者后台创建企业内部应用
2. 开通机器人能力
3. 订阅机器人消息事件：`/v1.0/im/bot/messages/get`
4. 启用 Stream 推送模式
5. 获取 `clientId` 和 `clientSecret`

## 工作流程

```
用户在钉钉发送消息
    ↓
钉钉 WebSocket 推送事件
    ↓
DWClient 接收并解析消息
    ↓
调用 AgentSession.prompt() 处理
    ↓
收集 Agent 响应文本
    ↓
通过 sessionWebhook 发送回钉钉
    ↓
用户在钉钉看到回复
```

## API 参考

### `DWClient.registerAgentSession(session: AgentSession)`

注册 AgentSession 实例，启用自动消息处理。

**参数:**
- `session`: AgentSession 实例

**功能:**
- 自动订阅 `TOPIC_ROBOT` 事件
- 处理用户文本消息
- 将消息转发到 `session.prompt()`
- 收集流式响应并发送回钉钉

### `DWClient.unregisterAgentSession()`

取消 AgentSession 注册，停止处理钉钉消息。

**功能:**
- 清理所有活跃会话
- 取消事件订阅
- 释放资源

## 完整示例

```typescript
import { DWClient } from './gateway/channels/dingtalk/client.js';
import { createAgentSession } from './core/sdk.js';
import { ModelRegistry } from './core/model-registry.js';
import { AuthStorage } from './core/auth-storage.js';

async function startDingtalkBot() {
  // 初始化 model registry 和 auth storage
  const authStorage = AuthStorage.create();
  const modelRegistry = new ModelRegistry(authStorage);

  // 创建 agent session
  const session = await createAgentSession({
    authStorage,
    modelRegistry,
    model: modelRegistry.find('anthropic', 'claude-3-5-sonnet-20241022'),
  });

  // 创建钉钉客户端
  const client = new DWClient({
    clientId: process.env.DINGTALK_CLIENT_ID!,
    clientSecret: process.env.DINGTALK_CLIENT_SECRET!,
    debug: process.env.DEBUG === 'true',
    keepAlive: true,
    autoReconnect: true,
  });

  // 注册 agent session
  client.registerAgentSession(session);

  // 连接
  await client.connect();
  console.log('✓ 钉钉机器人已连接');

  // 优雅退出
  process.on('SIGINT', () => {
    console.log('\n正在关闭...');
    client.unregisterAgentSession();
    client.disconnect();
    process.exit(0);
  });
}

startDingtalkBot().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
```

## 错误处理

客户端会自动处理以下情况：

- **重复消息**: 使用 `msgId` 去重，避免重复处理同一条消息
- **连接断开**: 自动重连（如果启用 `autoReconnect`）
- **消息类型不支持**: 仅处理文本消息，其他类型会被忽略
- **Agent 处理失败**: 捕获异常并记录日志，不影响后续消息处理
- **超时保护**: 钉钉 sessionWebhook 有效期为 60 秒，超时后响应发送会失败

### 错误场景处理

```typescript
// 场景1: Agent 处理超时
// 钉钉会在未收到响应时重发消息，客户端通过 msgId 去重防止重复处理

// 场景2: 连接中断
// autoReconnect 会自动重连，activeMessageSessions 中的未完成会话会被清理

// 场景3: 发送响应失败
try {
  await this.sendTextMessage(webhook, text);
} catch (err) {
  // 记录错误但不中断后续消息处理
  console.error('发送消息失败:', err);
}
```

## 调试

启用 `debug: true` 可以看到详细日志：

```typescript
const client = new DWClient({
  // ...
  debug: true,
});
```

日志会输出：
- WebSocket 连接状态
- 收到的消息内容
- Agent 处理过程
- 响应发送结果

## 注意事项

1. **单实例**: 一个 `DWClient` 实例只能注册一个 `AgentSession`
2. **消息去重**: 钉钉可能在超时时重发消息，客户端会自动去重
3. **响应时效**: 钉钉 sessionWebhook 有效期约 60 秒，超时后无法发送响应
4. **并发控制**: 当前实现串行处理消息，每次只处理一条消息
5. **内存管理**: 活跃会话存储在 `activeMessageSessions` Map 中
6. **错误隔离**: 单条消息处理失败不影响后续消息

### 生产环境建议

1. **监控告警**: 监控连接状态和消息处理失败率
2. **日志记录**: 启用 `debug: true` 并配置日志聚合服务
3. **重启策略**: 使用 PM2 或 Docker 确保进程崩溃后自动重启
4. **限流保护**: 考虑添加用户级别的消息频率限制
5. **Session 管理**: 定期清理长时间未完成的会话，防止内存泄漏

```typescript
// 添加会话超时清理
setInterval(() => {
  const now = Date.now();
  for (const [msgId, session] of client.activeMessageSessions) {
    if (now - session.startTime > 120000) { // 2分钟超时
      session.unsubscribe?.();
      client.activeMessageSessions.delete(msgId);
    }
  }
}, 60000); // 每分钟检查一次
```

## 扩展

如果需要支持更多消息类型（图片、卡片等），可以扩展 `handleRobotMessage` 方法：

```typescript
private async handleRobotMessage(downstream: DWClientDownStream): Promise<void> {
  const robotMessage = JSON.parse(downstream.data);
  
  switch (robotMessage.msgtype) {
    case 'text':
      // 现有文本处理逻辑
      break;
    case 'picture':
      // 处理图片消息
      break;
    case 'file':
      // 处理文件消息
      break;
    // ...
  }
}
```
