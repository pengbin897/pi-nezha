# SDK

> pi 可以帮助你使用 SDK。让它为你的用例构建一个集成。

SDK 提供对 pi 代理能力的编程访问。将其用于在其他应用程序中嵌入 pi、构建自定义界面或与自动化工作流程集成。

**示例用例：**
- 构建自定义 UI（网页、桌面、移动）
- 将代理能力集成到现有应用程序中
- 创建具有代理推理的自动化管道
- 构建生成子代理的自定义工具
- 以编程方式测试代理行为

参见 [examples/sdk/](../examples/sdk/) 了解从最小到完全控制的工作示例。

## 快速开始

```typescript
import { AuthStorage, createAgentSession, ModelRegistry, SessionManager } from "@mariozechner/pi-coding-agent";

// 设置凭据存储和模型注册表
const authStorage = AuthStorage.create();
const modelRegistry = new ModelRegistry(authStorage);

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage,
  modelRegistry,
});

session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await session.prompt("当前目录中有哪些文件？");
```

## 安装

```bash
npm install @mariozechner/pi-coding-agent
```

SDK 包含在主包中。无需单独安装。

## 核心概念

### createAgentSession()

主要工厂函数。创建具有可配置选项的 `AgentSession`。

`createAgentSession()` 使用 `ResourceLoader` 来提供扩展、技能、提示模板、主题和上下文文件。如果你不提供，它使用具有标准发现的 `DefaultResourceLoader`。

```typescript
import { createAgentSession } from "@mariozechner/pi-coding-agent";

// 最小：使用 DefaultResourceLoader 的默认值
const { session } = await createAgentSession();

// 自定义：覆盖特定选项
const { session } = await createAgentSession({
  model: myModel,
  tools: [readTool, bashTool],
  sessionManager: SessionManager.inMemory(),
});
```

### AgentSession

会话管理代理生命周期、消息历史和事件流。

```typescript
interface AgentSession {
  // 发送提示并等待完成
  // 如果流式传输，需要 streamingBehavior 选项来排队消息
  prompt(text: string, options?: PromptOptions): Promise<void>;
  
  // 流式传输期间排队消息
  steer(text: string): Promise<void>;    // 中断：在当前工具后传递，跳过剩余
  followUp(text: string): Promise<void>; // 等待：仅在代理完成时传递
  
  // 订阅事件（返回取消订阅函数）
  subscribe(listener: (event: AgentSessionEvent) => void): () => void;
  
  // 会话信息
  sessionFile: string | undefined;  // 内存中为 undefined
  sessionId: string;
  
  // 模型控制
  setModel(model: Model): Promise<void>;
  setThinkingLevel(level: ThinkingLevel): void;
  cycleModel(): Promise<ModelCycleResult | undefined>;
  cycleThinkingLevel(): ThinkingLevel | undefined;
  
  // 状态访问
  agent: Agent;
  model: Model | undefined;
  thinkingLevel: ThinkingLevel;
  messages: AgentMessage[];
  isStreaming: boolean;
  
  // 会话管理
  newSession(options?: { parentSession?: string }): Promise<boolean>;  // 如果被钩子取消返回 false
  switchSession(sessionPath: string): Promise<boolean>;
  
  // 分支
  fork(entryId: string): Promise<{ selectedText: string; cancelled: boolean }>;  // 创建新会话文件
  navigateTree(targetId: string, options?: {...}): Promise<{ editorText?: string; cancelled: boolean }>;  // 就地导航
  
  // 钩子消息注入
  sendHookMessage(message: HookMessage, triggerTurn?: boolean): Promise<void>;
  
  // 压缩
  compact(customInstructions?: string): Promise<CompactionResult>;
  abortCompaction(): void;
  
  // 中止当前操作
  abort(): Promise<void>;
  
  // 清理
  dispose(): void;
}
```

### 提示和消息排队

`prompt()` 方法处理提示模板、扩展命令和消息发送：

```typescript
// 基本提示（非流式传输时）
await session.prompt("这里有哪些文件？");

// 带图像
await session.prompt("这张图片里是什么？", {
  images: [{ type: "image", source: { type: "base64", mediaType: "image/png", data: "..." } }]
});

// 流式传输期间：必须指定如何排队消息
await session.prompt("停下来做这个", { streamingBehavior: "steer" });
await session.prompt("完成后也检查 X", { streamingBehavior: "followUp" });
```

## 选项参考

### 目录

```typescript
const { session } = await createAgentSession({
  cwd: process.cwd(), // 默认
  agentDir: "~/.pi/agent", // 默认（展开 ~）
});
```

### 模型

```typescript
import { getModel } from "@mariozechner/pi-ai";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";

const authStorage = AuthStorage.create();
const modelRegistry = new ModelRegistry(authStorage);

// 查找特定内置模型（不检查 API 密钥是否存在）
const opus = getModel("anthropic", "claude-opus-4-5");
if (!opus) throw new Error("模型未找到");

// 查找任何模型（按 provider/id），包括 models.json 中的自定义模型
const customModel = modelRegistry.find("my-provider", "my-model");

// 获取仅配置了有效 API 密钥的模型
const available = await modelRegistry.getAvailable();

const { session } = await createAgentSession({
  model: opus,
  thinkingLevel: "medium", // off, minimal, low, medium, high, xhigh
  authStorage,
  modelRegistry,
});
```

### API 密钥和 OAuth

API 密钥解析优先级（由 AuthStorage 处理）：
1. 运行时覆盖（通过 `setRuntimeApiKey`，不持久化）
2. `auth.json` 中的存储凭据（API 密钥或 OAuth 令牌）
3. 环境变量（`ANTHROPIC_API_KEY`、`OPENAI_API_KEY` 等）
4. 回退解析器（来自 `models.json` 的自定义提供商密钥）

### 工具

```typescript
import {
  codingTools,   // read, bash, edit, write (默认)
  readOnlyTools, // read, grep, find, ls
  readTool, bashTool, editTool, writeTool,
  grepTool, findTool, lsTool,
} from "@mariozechner/pi-coding-agent";

// 使用内置工具集
const { session } = await createAgentSession({
  tools: readOnlyTools,
});

// 选择特定工具
const { session } = await createAgentSession({
  tools: [readTool, bashTool, grepTool],
});
```

#### 带自定义 cwd 的工具

**重要：** 预构建的工具实例（`readTool`、`bashTool` 等）使用 `process.cwd()` 进行路径解析。当你指定自定义 `cwd` **并且**提供显式 `tools` 时，你必须使用工具工厂函数以确保路径正确解析：

```typescript
import {
  createCodingTools,    // 为特定 cwd 创建 [read, bash, edit, write]
  createReadOnlyTools,  // 为特定 cwd 创建 [read, grep, find, ls]
  createReadTool,
  createBashTool,
} from "@mariozechner/pi-coding-agent";

const cwd = "/path/to/project";

// 使用工具集的工厂
const { session } = await createAgentSession({
  cwd,
  tools: createCodingTools(cwd),  // 工具相对于 cwd 解析路径
});
```

### 自定义工具

```typescript
import { Type } from "@sinclair/typebox";
import { createAgentSession, type ToolDefinition } from "@mariozechner/pi-coding-agent";

const myTool: ToolDefinition = {
  name: "my_tool",
  label: "My Tool",
  description: "做一些有用的事情",
  parameters: Type.Object({
    input: Type.String({ description: "输入值" }),
  }),
  execute: async (toolCallId, params, onUpdate, ctx, signal) => ({
    content: [{ type: "text", text: `结果：${params.input}` }],
    details: {},
  }),
};

const { session } = await createAgentSession({
  customTools: [myTool],
});
```

### 扩展

扩展由 `ResourceLoader` 加载。`DefaultResourceLoader` 从 `~/.pi/agent/extensions/`、`.pi/extensions/` 和 settings.json 扩展源发现扩展。

```typescript
import { createAgentSession, DefaultResourceLoader } from "@mariozechner/pi-coding-agent";

const loader = new DefaultResourceLoader({
  additionalExtensionPaths: ["/path/to/my-extension.ts"],
  extensionFactories: [
    (pi) => {
      pi.on("agent_start", () => {
        console.log("[内联扩展] 代理启动");
      });
    },
  ],
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

扩展可以注册工具、订阅事件、添加命令等。参见 [extensions.md](extensions.md) 了解完整 API。

### 技能

```typescript
import {
  createAgentSession,
  DefaultResourceLoader,
  type Skill,
} from "@mariozechner/pi-coding-agent";

const customSkill: Skill = {
  name: "my-skill",
  description: "自定义指令",
  filePath: "/path/to/SKILL.md",
  baseDir: "/path/to",
  source: "custom",
};

const loader = new DefaultResourceLoader({
  skillsOverride: (current) => ({
    skills: [...current.skills, customSkill],
    diagnostics: current.diagnostics,
  }),
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

### 会话管理

会话使用带有 `id`/`parentId` 链接的树结构，支持就地分支。

```typescript
import { createAgentSession, SessionManager } from "@mariozechner/pi-coding-agent";

// 内存中（无持久化）
const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
});

// 新持久化会话
const { session } = await createAgentSession({
  sessionManager: SessionManager.create(process.cwd()),
});

// 继续最近的
const { session, modelFallbackMessage } = await createAgentSession({
  sessionManager: SessionManager.continueRecent(process.cwd()),
});

// 打开特定文件
const { session } = await createAgentSession({
  sessionManager: SessionManager.open("/path/to/session.jsonl"),
});

// 列出可用会话
const sessions = await SessionManager.list(process.cwd());
for (const info of sessions) {
  console.log(`${info.id}: ${info.firstMessage} (${info.messageCount} 消息)`);
}
```

### 设置管理

```typescript
import { createAgentSession, SettingsManager, SessionManager } from "@mariozechner/pi-coding-agent";

// 默认：从文件加载（全局 + 项目合并）
const { session } = await createAgentSession({
  settingsManager: SettingsManager.create(),
});

// 带覆盖
const settingsManager = SettingsManager.create();
settingsManager.applyOverrides({
  compaction: { enabled: false },
  retry: { enabled: true, maxRetries: 5 },
});
const { session } = await createAgentSession({ settingsManager });

// 内存中（无文件 I/O，用于测试）
const { session } = await createAgentSession({
  settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
  sessionManager: SessionManager.inMemory(),
});
```

## 运行模式

SDK 导出运行模式工具以在 `createAgentSession()` 之上构建自定义界面。

### InteractiveMode

具有编辑器、聊天历史和所有内置命令的完整 TUI 交互模式：

```typescript
import { createAgentSession, InteractiveMode } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession({ /* ... */ });

const mode = new InteractiveMode(session, {
  migratedProviders: [],
  modelFallbackMessage: undefined,
  initialMessage: "你好",
  initialImages: [],
  initialMessages: [],
});

await mode.run();  // 阻塞直到退出
```

### runPrintMode

单次模式：发送提示，输出结果，退出：

```typescript
import { createAgentSession, runPrintMode } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession({ /* ... */ });

await runPrintMode(session, {
  mode: "text",              // "text" 最终响应，"json" 所有事件
  initialMessage: "你好",   // 第一条消息（可以包含 @file 内容）
  initialImages: [],         // 带有初始消息的图像
  messages: ["跟进"],       // 附加提示
});
```

### runRpcMode

用于子进程集成的 JSON-RPC 模式：

```typescript
import { createAgentSession, runRpcMode } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession({ /* ... */ });

await runRpcMode(session);  // 从 stdin 读取 JSON 命令，写入 stdout
```

参见 [RPC 文档](rpc.md) 了解 JSON 协议。

## RPC 模式替代

对于不构建 SDK 的基于子进程的集成，请直接使用 CLI：

```bash
pi --mode rpc --no-session
```

参见 [RPC 文档](rpc.md) 了解 JSON 协议。

SDK 更适合：
- 你想要类型安全
- 你在同一 Node.js 进程中
- 你需要直接访问代理状态
- 你想以编程方式自定义工具/扩展

RPC 模式更适合：
- 你从另一种语言集成
- 你想要进程隔离
- 你在构建语言无关的客户端

## 导出

主入口导出：

```typescript
// 工厂
createAgentSession

// 认证和模型
AuthStorage
ModelRegistry

// 资源加载
DefaultResourceLoader
type ResourceLoader
createEventBus

// 助手

// 会话管理
SessionManager
SettingsManager

// 内置工具（使用 process.cwd()）
codingTools
readOnlyTools
readTool, bashTool, editTool, writeTool
grepTool, findTool, lsTool

// 工具工厂（用于自定义 cwd）
createCodingTools
createReadOnlyTools
createReadTool, createBashTool, createEditTool, createWriteTool
createGrepTool, createFindTool, createLsTool

// 类型
type CreateAgentSessionOptions
type CreateAgentSessionResult
type ExtensionFactory
type ExtensionAPI
type ToolDefinition
type Skill
type PromptTemplate
type Tool
```

有关扩展类型，参见 [extensions.md](extensions.md) 了解完整 API。
