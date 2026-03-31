# 扩展

> pi 可以创建扩展。让它为你的用例构建一个。

扩展是扩展 pi 行为的 TypeScript 模块。它们可以订阅生命周期事件、注册可被 LLM 调用的自定义工具、添加命令等。

> **/reload 的放置位置：** 将扩展放在 `~/.pi/agent/extensions/`（全局）或 `.pi/extensions/`（项目本地）以进行自动发现。仅在快速测试时使用 `pi -e ./path.ts`。自动发现位置的扩展可以使用 `/reload` 进行热重载。

**核心功能：**
- **自定义工具** - 通过 `pi.registerTool()` 注册 LLM 可调用的工具
- **事件拦截** - 阻止或修改工具调用、注入上下文、自定义压缩
- **用户交互** - 通过 `ctx.ui` 提示用户（选择、确认、输入、通知）
- **自定义 UI 组件** - 通过 `ctx.ui.custom()` 用于复杂交互的完整 TUI 组件和键盘输入
- **自定义命令** - 通过 `pi.registerCommand()` 注册如 `/mycommand` 的命令
- **会话持久化** - 通过 `pi.appendEntry()` 存储在重启后保留的状态
- **自定义渲染** - 控制工具调用/结果和消息在 TUI 中的显示方式

**示例用例：**
- 权限门（在 `rm -rf`、`sudo` 等之前确认）
- Git 检查点（每回合 stash，分支上恢复）
- 路径保护（阻止写入 `.env`、`node_modules/`）
- 自定义压缩（按你的方式总结对话）
- 对话摘要（参见 `summarize.ts` 示例）
- 交互式工具（问题、向导、自定义对话框）
- 有状态工具（待办事项列表、连接池）
- 外部集成（文件监视器、webhook、CI 触发器）
- 等待时的游戏（参见 `snake.ts` 示例）

参见 [examples/extensions/](../examples/extensions/) 了解工作实现。

## 快速开始

创建 `~/.pi/agent/extensions/my-extension.ts`：

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function (pi: ExtensionAPI) {
  // 响应事件
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("扩展已加载！", "info");
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && event.input.command?.includes("rm -rf")) {
      const ok = await ctx.ui.confirm("危险！", "允许 rm -rf？");
      if (!ok) return { block: true, reason: "被用户阻止" };
    }
  });

  // 注册自定义工具
  pi.registerTool({
    name: "greet",
    label: "Greet",
    description: "按名字问候某人",
    parameters: Type.Object({
      name: Type.String({ description: "要问候的名字" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return {
        content: [{ type: "text", text: `你好，${params.name}！` }],
        details: {},
      };
    },
  });

  // 注册命令
  pi.registerCommand("hello", {
    description: "说你好",
    handler: async (args, ctx) => {
      ctx.ui.notify(`你好 ${args || "world"}！`, "info");
    },
  });
}
```

使用 `--extension`（或 `-e`）标志测试：

```bash
pi -e ./my-extension.ts
```

## 扩展位置

> **安全：** 扩展使用你的完全系统权限运行，可以执行任意代码。只安装来自你信任的来源的扩展。

扩展从以下位置自动发现：

| 位置 | 范围 |
|----------|-------|
| `~/.pi/agent/extensions/*.ts` | 全局（所有项目） |
| `~/.pi/agent/extensions/*/index.ts` | 全局（子目录） |
| `.pi/extensions/*.ts` | 项目本地 |
| `.pi/extensions/*/index.ts` | 项目本地（子目录） |

通过 `settings.json` 的附加路径：

```json
{
  "packages": [
    "npm:@foo/bar@1.0.0",
    "git:github.com/user/repo@v1"
  ],
  "extensions": [
    "/path/to/local/extension.ts",
    "/path/to/local/extension/dir"
  ]
}
```

## 可用导入

| 包 | 用途 |
|---------|---------|
| `@mariozechner/pi-coding-agent` | 扩展类型（`ExtensionAPI`、`ExtensionContext`、事件） |
| `@sinclair/typebox` | 工具参数的架构定义 |
| `@mariozechner/pi-ai` | AI 工具（`StringEnum` 用于 Google 兼容枚举） |
| `@mariozechner/pi-tui` | 用于自定义渲染的 TUI 组件 |

npm 依赖项也可以工作。在扩展旁边添加 `package.json`（或在父目录中），运行 `npm install`，然后自动解析来自 `node_modules/` 的导入。

Node.js 内置模块（`node:fs`、`node:path` 等）也可使用。

## 编写扩展

扩展导出接收 `ExtensionAPI` 的默认函数：

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // 订阅事件
  pi.on("event_name", async (event, ctx) => {
    // ctx.ui 用于用户交互
    const ok = await ctx.ui.confirm("标题", "你确定吗？");
    ctx.ui.notify("完成！", "success");
    ctx.ui.setStatus("my-ext", "处理中...");  // 页脚状态
    ctx.ui.setWidget("my-ext", ["第 1 行", "第 2 行"]);  // 编辑器上方的小部件（默认）
  });

  // 注册工具、命令、快捷键、标志
  pi.registerTool({ ... });
  pi.registerCommand("name", { ... });
  pi.registerShortcut("ctrl+x", { ... });
  pi.registerFlag("my-flag", { ... });
}
```

扩展通过 [jiti](https://github.com/unjs/jiti) 加载，因此 TypeScript 无需编译即可工作。

## 事件

### 生命周期概述

```
pi 启动
  │
  └─► session_start
      │
      ▼
用户发送提示 ─────────────────────────────────────────┐
  │                                                        │
  ├─►（首先检查扩展命令，找到则绕过）                    │
  ├─► input（可以拦截、转换或处理）                    │
  ├─►（如果未处理则进行技能/模板展开）                  │
  ├─► before_agent_start（可以注入消息、修改系统提示）  │
  ├─► agent_start                                      │
  ├─► message_start / message_update / message_end     │
  │                                                        │
  │   ┌─── 回合（LLM 调用工具时重复） ───┐              │
  │   │                                            │      │
  │   ├─► turn_start                               │      │
  │   ├─► context（可以修改消息）                  │      │
  │   │                                            │      │
  │   │   LLM 响应，可能调用工具：                   │      │
  │   │     ├─► tool_call（可以阻止）            │      │
  │   │     ├─► tool_execution_start               │      │
  │   │     ├─► tool_execution_update              │      │
  │   │     ├─► tool_execution_end                 │      │
  │   │     └─► tool_result（可以修改）           │      │
  │   │                                            │      │
  │   └─► turn_end                                 │      │
  │                                                        │
  └─► agent_end                                           │

用户发送另一个提示 ◄────────────────────────────────┘

/new（新会话）或 /resume（切换会话）
  ├─► session_before_switch（可以取消）
  └─► session_switch

/fork
  ├─► session_before_fork（可以取消）
  └─► session_fork

/compact 或自动压缩
  ├─► session_before_compact（可以取消或自定义）
  └─► session_compact

/tree 导航
  ├─► session_before_tree（可以取消或自定义）
  └─► session_tree

/model 或 Ctrl+P（模型选择/循环）
  └─► model_select

退出（Ctrl+C、Ctrl+D）
  └─► session_shutdown
```

### 会话事件

#### session_start

初始会话加载时触发。

```typescript
pi.on("session_start", async (_event, ctx) => {
  ctx.ui.notify(`会话：${ctx.sessionManager.getSessionFile() ?? "临时"}`, "info");
});
```

#### session_before_switch / session_switch

开始新会话（`/new`）或切换会话（`/resume`）时触发。

```typescript
pi.on("session_before_switch", async (event, ctx) => {
  // event.reason - "new" 或 "resume"
  // event.targetSessionFile - 我们切换到的会话（仅 "resume"）

  if (event.reason === "new") {
    const ok = await ctx.ui.confirm("清除？", "删除所有消息？");
    if (!ok) return { cancel: true };
  }
});
```

#### session_before_fork / session_fork

通过 `/fork` 分支时触发。

```typescript
pi.on("session_before_fork", async (event, ctx) => {
  // event.entryId - 分支自的条目 ID
  return { cancel: true }; // 取消分支
  // 或者
  return { skipConversationRestore: true }; // 分支但不回退消息
});
```

#### session_before_compact / session_compact

压缩时触发。参见 [compaction.md](compaction.md) 了解详情。

#### session_before_tree / session_tree

`/tree` 导航时触发。参见 [tree.md](tree.md) 了解树导航概念。

#### session_shutdown

退出时触发（Ctrl+C、Ctrl+D、SIGTERM）。

```typescript
pi.on("session_shutdown", async (_event, ctx) => {
  // 清理、保存状态等
});
```

### 代理事件

#### before_agent_start

用户提交提示后、代理循环前触发。可以注入消息和/或修改系统提示。

```typescript
pi.on("before_agent_start", async (event, ctx) => {
  // event.prompt - 用户提示文本
  // event.images - 附加的图像（如果有）
  // event.systemPrompt - 当前系统提示

  return {
    // 注入持久消息（存储在会话中，发送给 LLM）
    message: {
      customType: "my-extension",
      content: "LLM 的附加上下文",
      display: true,
    },
    // 替换本回合的系统提示（跨扩展链式连接）
    systemPrompt: event.systemPrompt + "\n\n本回合的附加指令...",
  };
});
```

#### agent_start / agent_end

每个用户提示触发一次。

```typescript
pi.on("agent_start", async (_event, ctx) => {});

pi.on("agent_end", async (event, ctx) => {
  // event.messages - 本次提示的消息
});
```

#### turn_start / turn_end

每个回合触发（一个 LLM 响应 + 工具调用）。

#### message_start / message_update / message_end

消息生命周期更新时触发。

- `message_start` 和 `message_end` 为用户、助手和 toolResult 消息触发。
- `message_update` 为助手流式传输更新触发。

#### tool_execution_start / tool_execution_update / tool_execution_end

工具执行生命周期更新时触发。

#### context

每次 LLM 调用前触发。非破坏性修改消息。参见 [session.md](session.md) 了解消息类型。

```typescript
pi.on("context", async (event, ctx) => {
  // event.messages - 深层副本，可以安全修改
  const filtered = event.messages.filter(m => !shouldPrune(m));
  return { messages: filtered };
});
```

### 工具事件

#### tool_call

工具执行前触发。**可以阻止。**

```typescript
pi.on("tool_call", async (event, ctx) => {
  // event.toolName - "bash"、"read"、"write"、"edit" 等
  // event.toolCallId
  // event.input - 工具参数

  if (event.toolName === "bash" && event.input.command.includes("rm -rf")) {
    return { block: true, reason: "危险命令" };
  }
});
```

#### tool_result

工具执行后触发。**可以修改结果。**

`tool_result` 处理程序像中间件一样链式连接：
- 处理程序按扩展加载顺序运行
- 每个处理程序看到前一个处理程序更改后的最新结果
- 处理程序可以返回部分补丁（`content`、`details` 或 `isError`）；省略的字段保留当前值

```typescript
pi.on("tool_result", async (event, ctx) => {
  // 修改结果：
  return { content: [...], details: {...}, isError: false };
});
```

## ExtensionContext

每个处理程序接收 `ctx: ExtensionContext`：

### ctx.ui

用于用户交互的 UI 方法。参见[自定义 UI](#自定义-ui)了解完整详情。

### ctx.cwd

当前工作目录。

### ctx.sessionManager

对会话状态的只读访问。参见 [session.md](session.md) 了解完整的 SessionManager API 和条目类型。

```typescript
ctx.sessionManager.getEntries()       // 所有条目
ctx.sessionManager.getBranch()        // 当前分支
ctx.sessionManager.getLeafId()        // 当前叶子条目 ID
```

### ctx.modelRegistry / ctx.model

对模型和 API 密钥的访问。

### ctx.isIdle() / ctx.abort() / ctx.hasPendingMessages()

控制流助手。

### ctx.shutdown()

请求 pi 正常关闭。

### ctx.getContextUsage()

返回活动模型的当前上下文使用量。

### ctx.compact()

触发压缩而不等待完成。

### ctx.getSystemPrompt()

返回当前有效的系统提示。

## ExtensionCommandContext

命令处理程序接收 `ExtensionCommandContext`，它扩展了 `ExtensionContext` 并添加会话控制方法。这些仅在命令中可用，因为在事件处理程序中调用可能会导致死锁。

### ctx.waitForIdle()

等待代理完成流式传输。

### ctx.newSession(options?)

创建新会话。

### ctx.fork(entryId)

从特定条目分支，创建新会话文件。

### ctx.navigateTree(targetId, options?)

导航到会话树中的不同点。

### ctx.reload()

运行与 `/reload` 相同的重载流程。

## ExtensionAPI 方法

### pi.on(event, handler)

订阅事件。

### pi.registerTool(definition)

注册可被 LLM 调用的自定义工具。

```typescript
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "这个工具做什么",
  parameters: Type.Object({
    action: StringEnum(["list", "add"] as const),
    text: Type.Optional(Type.String()),
  }),

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // 流式传输进度
    onUpdate?.({ content: [{ type: "text", text: "工作中..." }] });

    return {
      content: [{ type: "text", text: "完成" }],
      details: { result: "..." },
    };
  },

  // 可选：自定义渲染
  renderCall(args, theme) { ... },
  renderResult(result, options, theme) { ... },
});
```

### pi.sendMessage(message, options?)

将会话消息注入自定义消息。

```typescript
pi.sendMessage({
  customType: "my-extension",
  content: "消息文本",
  display: true,
  details: { ... },
}, {
  triggerTurn: true,
  deliverAs: "steer",
});
```

**选项：**
- `deliverAs` - 传递模式：
  - `"steer"`（默认） - 中断流式传输。当前工具完成后传递，跳过剩余工具。
  - `"followUp"` - 等待代理完成。仅在代理没有更多工具调用时传递。
  - `"nextTurn"` - 为下一个用户提示排队。不中断或触发任何内容。
- `triggerTurn: true` - 如果代理空闲，立即触发 LLM 响应。仅适用于 `"steer"` 和 `"followUp"` 模式（`"nextTurn"` 忽略）。

### pi.sendUserMessage(content, options?)

向代理发送用户消息。

```typescript
// 简单文本消息
pi.sendUserMessage("2+2 是多少？");

// 带内容数组（文本 + 图像）
pi.sendUserMessage([
  { type: "text", text: "描述这张图片：" },
  { type: "image", source: { type: "base64", mediaType: "image/png", data: "..." } },
]);

// 流式传输期间 - 必须指定传递模式
pi.sendUserMessage("专注于错误处理", { deliverAs: "steer" });
```

### pi.appendEntry(customType, data?)

持久化扩展状态（不参与 LLM 上下文）。

```typescript
pi.appendEntry("my-state", { count: 42 });
```

### pi.setSessionName(name)

设置会话显示名称。

### pi.registerCommand(name, options)

注册命令。

```typescript
pi.registerCommand("stats", {
  description: "显示会话统计",
  handler: async (args, ctx) => {
    const count = ctx.sessionManager.getEntries().length;
    ctx.ui.notify(`${count} 条目`, "info");
  }
});
```

### pi.registerShortcut(shortcut, options)

注册键盘快捷键。参见 [keybindings.md](keybindings.md) 了解快捷键格式和内置绑定。

### pi.registerFlag(name, options)

注册 CLI 标志。

### pi.exec(command, args, options?)

执行 shell 命令。

### pi.getActiveTools() / pi.getAllTools() / pi.setActiveTools(names)

管理活动工具。

### pi.setModel(model)

设置当前模型。

### pi.getThinkingLevel() / pi.setThinkingLevel(level)

获取或设置思考级别。

### pi.events

扩展之间通信的共享事件总线：

```typescript
pi.events.on("my:event", (data) => { ... });
pi.events.emit("my:event", { ... });
```

### pi.registerProvider(name, config)

动态注册或覆盖模型提供商。

## 状态管理

有状态的扩展应将状态存储在工具结果的 `details` 中以支持正确的分支：

```typescript
export default function (pi: ExtensionAPI) {
  let items: string[] = [];

  // 从会话重建状态
  pi.on("session_start", async (_event, ctx) => {
    items = [];
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "message" && entry.message.role === "toolResult") {
        if (entry.message.toolName === "my_tool") {
          items = entry.message.details?.items ?? [];
        }
      }
    }
  });

  pi.registerTool({
    name: "my_tool",
    // ...
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      items.push("新项目");
      return {
        content: [{ type: "text", text: "已添加" }],
        details: { items: [...items] },  // 存储以供重建
      };
    },
  });
}
```

## 自定义工具

### 工具定义

```typescript
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "这个工具做什么（显示给 LLM）",
  parameters: Type.Object({
    action: StringEnum(["list", "add"] as const),  // 使用 StringEnum 以保持 Google 兼容性
    text: Type.Optional(Type.String()),
  }),

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // 检查取消
    if (signal?.aborted) {
      return { content: [{ type: "text", text: "已取消" }] };
    }

    // 流式传输进度更新
    onUpdate?.({
      content: [{ type: "text", text: "工作中..." }],
      details: { progress: 50 },
    });

    // 通过 pi.exec 运行命令
    const result = await pi.exec("some-command", [], { signal });

    // 返回结果
    return {
      content: [{ type: "text", text: "完成" }],  // 发送给 LLM
      details: { data: result },                   // 用于渲染和状态
    };
  },

  // 可选：自定义渲染
  renderCall(args, theme) { ... },
  renderResult(result, options, theme) { ... },
});
```

**重要：** 对于字符串枚举使用 `@mariozechner/pi-ai` 中的 `StringEnum`。`Type.Union`/`Type.Literal` 与 Google API 不兼容。

### 覆盖内置工具

扩展可以通过注册同名工具来覆盖内置工具（`read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`）。

```bash
# 扩展的 read 工具替换内置 read
pi -e ./tool-override.ts
```

### 输出截断

**工具必须截断输出**以避免压垮 LLM 上下文。大型输出可能导致：
- 上下文溢出错误（提示太长）
- 压缩失败
- 模型性能下降

内置限制是 **50KB**（约 10k 令牌）和 **2000 行**，以先达到的为准。

## 自定义 UI

扩展可以通过 `ctx.ui` 方法与用户交互，并自定义消息/工具的渲染方式。

### 对话框

```typescript
// 从选项中选择
const choice = await ctx.ui.select("选择一个：", ["A", "B", "C"]);

// 确认对话框
const ok = await ctx.ui.confirm("删除？", "此操作无法撤消");

// 文本输入
const name = await ctx.ui.input("名字：", "占位符");

// 多行编辑器
const text = await ctx.ui.editor("编辑：", "预填文本");

// 通知（非阻塞）
ctx.ui.notify("完成！", "info");  // "info" | "warning" | "error"
```

### 带倒计时的定时对话框

对话框支持 `timeout` 选项，自动关闭并显示实时倒计时：

```typescript
const confirmed = await ctx.ui.confirm(
  "定时确认",
  "此对话框将在 5 秒后自动取消。确认？",
  { timeout: 5000 }
);
```

### 小部件、状态和页脚

```typescript
// 页脚中的状态（持久直到清除）
ctx.ui.setStatus("my-ext", "处理中...");
ctx.ui.setStatus("my-ext", undefined);  // 清除

// 流式传输期间显示的工作消息
ctx.ui.setWorkingMessage("深入思考...");
ctx.ui.setWorkingMessage();  // 恢复默认

// 编辑器上方的小部件（默认）
ctx.ui.setWidget("my-widget", ["第 1 行", "第 2 行"]);
// 编辑器下方的小部件
ctx.ui.setWidget("my-widget", ["第 1 行", "第 2 行"], { placement: "belowEditor" });
```

## 错误处理

扩展中的错误会在 TUI 中显示为通知，并在 RPC 模式中通过 `extension_error` 事件发出。

确保你的扩展正确处理错误并清理资源。
