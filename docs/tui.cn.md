# TUI 组件

> pi 可以创建 TUI 组件。让它为你的用例构建一个。

扩展和自定义工具可以为交互式用户界面渲染自定义 TUI 组件。本页面涵盖组件系统和可用的构建块。

**源码：** [`@mariozechner/pi-tui`](https://github.com/badlogic/pi-mono/tree/main/packages/tui)

## 组件接口

所有组件实现：

```typescript
interface Component {
  render(width: number): string[];
  handleInput?(data: string): void;
  wantsKeyRelease?: boolean;
  invalidate(): void;
}
```

| 方法 | 描述 |
|--------|-------------|
| `render(width)` | 返回字符串数组（每行一个）。每行**不能超过 `width`**。 |
| `handleInput?(data)` | 当组件有焦点时接收键盘输入。 |
| `wantsKeyRelease?` | 如果为 true，组件接收按键释放事件（Kitty 协议）。默认：false。 |
| `invalidate()` | 清除缓存的渲染状态。在主题更改时调用。 |

TUI 在每行渲染末尾追加完整的 SGR 重置和 OSC 8 重置。样式不会跨行延续。

## 焦点接口（IME 支持）

显示文本光标且需要 IME（输入法编辑器）支持的组件应实现 `Focusable` 接口：

```typescript
import { CURSOR_MARKER, type Component, type Focusable } from "@mariozechner/pi-tui";

class MyInput implements Component, Focusable {
  focused: boolean = false;  // 焦点变化时由 TUI 设置
  
  render(width: number): string[] {
    const marker = this.focused ? CURSOR_MARKER : "";
    return [`> ${beforeCursor}${marker}\x1b[7m${atCursor}\x1b[27m${afterCursor}`];
  }
}
```

## 使用组件

**在扩展中**通过 `ctx.ui.custom()`：

```typescript
pi.on("session_start", async (_event, ctx) => {
  const handle = ctx.ui.custom(myComponent);
  // handle.requestRender() - 触发重新渲染
  // handle.close() - 恢复正常 UI
});
```

**在自定义工具中**通过 `pi.ui.custom()`：

```typescript
async execute(toolCallId, params, onUpdate, ctx, signal) {
  const handle = pi.ui.custom(myComponent);
  // ...
  handle.close();
}
```

## 覆盖层

覆盖层在现有内容之上渲染组件而不清除屏幕。传递 `{ overlay: true }` 到 `ctx.ui.custom()`：

```typescript
const result = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => new MyDialog({ onClose: done }),
  { overlay: true }
);
```

## 内置组件

从 `@mariozechner/pi-tui` 导入：

```typescript
import { Text, Box, Container, Spacer, Markdown } from "@mariozechner/pi-tui";
```

### Text

带自动换行的多行文本。

### Box

带填充和背景色的容器。

### Container

垂直分组子组件。

### Spacer

空的垂直空间。

### Markdown

渲染带语法高亮的 markdown。

### Image

在支持的终端中渲染图像（Kitty、iTerm2、 Ghostty、WezTerm）。

## 键盘输入

使用 `matchesKey()` 进行按键检测：

```typescript
import { matchesKey, Key } from "@mariozechner/pi-tui";

handleInput(data: string) {
  if (matchesKey(data, Key.up)) {
    this.selectedIndex--;
  } else if (matchesKey(data, Key.enter)) {
    this.onSelect?.(this.selectedIndex);
  } else if (matchesKey(data, Key.escape)) {
    this.onCancel?.();
  }
}
```

## 行宽

**关键：** `render()` 的每行不能超过 `width` 参数。

```typescript
import { visibleWidth, truncateToWidth } from "@mariozechner/pi-tui";

render(width: number): string[] {
  return [truncateToWidth(this.text, width)];
}
```

工具函数：
- `visibleWidth(str)` - 获取显示宽度（忽略 ANSI 代码）
- `truncateToWidth(str, width, ellipsis?)` - 可选省略号的截断
- `wrapTextWithAnsi(str, width)` - 保留 ANSI 代码的自动换行

## 创建自定义组件

示例：交互式选择器

```typescript
import { matchesKey, Key, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

class MySelector {
  private items: string[];
  private selected = 0;
  private cachedWidth?: number;
  private cachedLines?: string[];
  
  public onSelect?: (item: string) => void;
  public onCancel?: () => void;

  constructor(items: string[]) {
    this.items = items;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up) && this.selected > 0) {
      this.selected--;
      this.invalidate();
    } else if (matchesKey(data, Key.down) && this.selected < this.items.length - 1) {
      this.selected++;
      this.invalidate();
    } else if (matchesKey(data, Key.enter)) {
      this.onSelect?.(this.items[this.selected]);
    } else if (matchesKey(data, Key.escape)) {
      this.onCancel?.();
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    this.cachedLines = this.items.map((item, i) => {
      const prefix = i === this.selected ? "> " : "  ";
      return truncateToWidth(prefix + item, width);
    });
    this.cachedWidth = width;
    return this.cachedLines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}
```

## 主题

组件接受用于样式的主题对象。

**在 `renderCall`/`renderResult` 中**，使用 `theme` 参数：

```typescript
renderResult(result, options, theme) {
  return new Text(theme.fg("success", "完成！"), 0, 0);
}
```

**前景色**（`theme.fg(color, text)`）：

| 类别 | 颜色 |
|----------|--------|
| 通用 | `text`、`accent`、`muted`、`dim` |
| 状态 | `success`、`error`、`warning` |
| 边框 | `border`、`borderAccent`、`borderMuted` |
| 消息 | `userMessageText`、`customMessageText`、`customMessageLabel` |
| 工具 | `toolTitle`、`toolOutput` |
| 差异 | `toolDiffAdded`、`toolDiffRemoved`、`toolDiffContext` |
| Markdown | `mdHeading`、`mdLink`、`mdLinkUrl`、`mdCode`、`mdCodeBlock` 等 |
| 语法 | `syntaxComment`、`syntaxKeyword`、`syntaxFunction` 等 |
| 思考 | `thinkingOff`、`thinkingMinimal`、`thinkingLow` 等 |
| 模式 | `bashMode` |

**背景色**（`theme.bg(color, text)`）：

`selectedBg`、`userMessageBg`、`customMessageBg`、`toolPendingBg`、`toolSuccessBg`、`toolErrorBg`

## 性能

尽可能缓存渲染输出：

```typescript
class CachedComponent {
  private cachedWidth?: number;
  private cachedLines?: string[];

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }
    // ... 计算行 ...
    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}
```

当状态更改时调用 `invalidate()`，然后调用 `handle.requestRender()` 触发重新渲染。

## 失效和主题更改

当主题更改时，TUI 在所有组件上调用 `invalidate()` 以清除缓存。组件必须正确实现 `invalidate()` 以确保主题更改生效。

## 常见模式

### 模式 1：选择对话框（SelectList）

让用户从选项列表中选择。使用 `@mariozechner/pi-tui` 中的 `SelectList`，用 `DynamicBorder` 框定。

### 模式 2：带取消的异步操作（BorderedLoader）

用于需要时间且应可取消的操作。`BorderedLoader` 显示微调器并处理 escape 取消。

### 模式 3：设置/开关（SettingsList）

切换多个设置。使用 `@mariozechner/pi-tui` 中的 `SettingsList`。

### 模式 4：持久状态指示器

在页脚中显示跨渲染持久的状态。适合模式指示器。

### 模式 5：编辑器上方/下方的小部件

在输入编辑器上方或下方显示持久内容。适合待办事项列表、进度。

### 模式 6：自定义页脚

替换页脚。

### 模式 7：自定义编辑器（vim 模式等）

用自定义实现替换主输入编辑器。适合模态编辑（vim）、不同键绑定（emacs）或专用输入处理。

## 关键规则

1. **始终使用回调中的主题** - 不要直接导入主题。使用 `ctx.ui.custom((tui, theme, keybindings, done) => ...)` 回调中的 `theme`。

2. **始终键入 DynamicBorder 颜色参数** - 写 `(s: string) => theme.fg("accent", s)`，而不是 `(s) => theme.fg("accent", s)`。

3. **在状态更改后调用 tui.requestRender()** - 在 `handleInput` 中，更新状态后调用 `tui.requestRender()`。

4. **返回三方法对象** - 自定义组件需要 `{ render, invalidate, handleInput }`。

5. **使用现有组件** - `SelectList`、`SettingsList`、`BorderedLoader` 覆盖 90% 的情况。不要重新构建它们。

## 示例

- **选择 UI**：preset.ts - 带 DynamicBorder 框定的 SelectList
- **带取消的异步**：qna.ts - 用于 LLM 调用的 BorderedLoader
- **设置开关**：tools.ts - 用于工具启用/禁用的 SettingsList
- **状态指示器**：plan-mode.ts - setStatus 和 setWidget
- **自定义页脚**：custom-footer.ts - 带统计的 setFooter
- **自定义编辑器**：modal-editor.ts - 类 vim 模态编辑
- **贪吃蛇游戏**：snake.ts - 完整游戏带键盘输入、游戏循环
- **自定义工具渲染**：todo.ts - renderCall 和 renderResult
