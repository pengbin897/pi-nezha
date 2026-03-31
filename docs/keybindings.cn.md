# 键盘快捷键

所有键盘快捷键都可以通过 `~/.pi/agent/keybindings.json` 自定义。每个动作可以绑定到一个或多个键。

## 键格式

`modifier+key`，其中修饰符是 `ctrl`、`shift`、`alt`（可组合），键包括：

- **字母：** `a-z`
- **特殊：** `escape`、`esc`、`enter`、`return`、`tab`、`space`、`backspace`、`delete`、`insert`、`clear`、`home`、`end`、`pageUp`、`pageDown`、`up`、`down`、`left`、`right`
- **功能键：** `f1`-`f12`
- **符号：** `` ` ``、`-`、`=`、`[`、`]`、`\`、`;`、`'`、`,`、`.`、`/`、`!`、`@`、`#`、`$`、`%`、`^`、`&`、`*`、`(`、`)`、`_`、`+`、`|`、`~`、`{`、`}`、`:`、`<`、`>`、`?`

修饰符组合：`ctrl+shift+x`、`alt+ctrl+x`、`ctrl+shift+alt+x` 等。

## 所有动作

### 光标移动

| 动作 | 默认 | 描述 |
|--------|---------|-------------|
| `cursorUp` | `up` | 光标上移 |
| `cursorDown` | `down` | 光标下移 |
| `cursorLeft` | `left`、`ctrl+b` | 光标左移 |
| `cursorRight` | `right`、`ctrl+f` | 光标右移 |
| `cursorWordLeft` | `alt+left`、`ctrl+left`、`alt+b` | 光标左移一个词 |
| `cursorWordRight` | `alt+right`、`ctrl+right`、`alt+f` | 光标右移一个词 |
| `cursorLineStart` | `home`、`ctrl+a` | 移动到行首 |
| `cursorLineEnd` | `end`、`ctrl+e` | 移动到行尾 |
| `jumpForward` | `ctrl+]` | 向前跳转到字符 |
| `jumpBackward` | `ctrl+alt+]` | 向后跳转到字符 |
| `pageUp` | `pageUp` | 向上翻页 |
| `pageDown` | `pageDown` | 向下翻页 |

### 删除

| 动作 | 默认 | 描述 |
|--------|---------|-------------|
| `deleteCharBackward` | `backspace` | 删除前一个字符 |
| `deleteCharForward` | `delete`、`ctrl+d` | 删除后一个字符 |
| `deleteWordBackward` | `ctrl+w`、`alt+backspace` | 删除前一个词 |
| `deleteWordForward` | `alt+d`、`alt+delete` | 删除后一个词 |
| `deleteToLineStart` | `ctrl+u` | 删除到行首 |
| `deleteToLineEnd` | `ctrl+k` | 删除到行尾 |

### 文本输入

| 动作 | 默认 | 描述 |
|--------|---------|-------------|
| `newLine` | `shift+enter` | 插入新行 |
| `submit` | `enter` | 提交输入 |
| `tab` | `tab` | Tab/自动补全 |

### 剪贴板环

| 动作 | 默认 | 描述 |
|--------|---------|-------------|
| `yank` | `ctrl+y` | 粘贴最近删除的文本 |
| `yankPop` | `alt+y` | 粘贴后循环遍历删除的文本 |
| `undo` | `ctrl+-` | 撤销上次编辑 |

### 剪贴板

| 动作 | 默认 | 描述 |
|--------|---------|-------------|
| `copy` | `ctrl+c` | 复制选区 |
| `pasteImage` | `ctrl+v` | 从剪贴板粘贴图像 |

### 应用程序

| 动作 | 默认 | 描述 |
|--------|---------|-------------|
| `interrupt` | `escape` | 取消/中止 |
| `clear` | `ctrl+c` | 清除编辑器 |
| `exit` | `ctrl+d` | 退出（编辑器为空时） |
| `suspend` | `ctrl+z` | 挂起到后台 |
| `externalEditor` | `ctrl+g` | 在外部编辑器中打开（`$VISUAL` 或 `$EDITOR`） |

### 会话

| 动作 | 默认 | 描述 |
|--------|---------|-------------|
| `newSession` | *（无）* | 开始新会话（`/new`） |
| `tree` | *（无）* | 打开会话树导航器（`/tree`） |
| `fork` | *（无）* | 派生当前会话（`/fork`） |
| `resume` | *（无）* | 打开会话恢复选择器（`/resume`） |

### 模型与思考

| 动作 | 默认 | 描述 |
|--------|---------|-------------|
| `selectModel` | `ctrl+l` | 打开模型选择器 |
| `cycleModelForward` | `ctrl+p` | 切换到下一个模型 |
| `cycleModelBackward` | `shift+ctrl+p` | 切换到上一个模型 |
| `cycleThinkingLevel` | `shift+tab` | 切换思考级别 |

### 显示

| 动作 | 默认 | 描述 |
|--------|---------|-------------|
| `expandTools` | `ctrl+o` | 折叠/展开工具输出 |
| `toggleThinking` | `ctrl+t` | 折叠/展开思考块 |

### 消息队列

| 动作 | 默认 | 描述 |
|--------|---------|-------------|
| `followUp` | `alt+enter` | 排队后续消息 |
| `dequeue` | `alt+up` | 将排队的消息恢复到编辑器 |

### 选择（列表、选择器）

| 动作 | 默认 | 描述 |
|--------|---------|-------------|
| `selectUp` | `up` | 上移选择 |
| `selectDown` | `down` | 下移选择 |
| `selectPageUp` | `pageUp` | 列表中向上翻页 |
| `selectPageDown` | `pageDown` | 列表中向下翻页 |
| `selectConfirm` | `enter` | 确认选择 |
| `selectCancel` | `escape`、`ctrl+c` | 取消选择 |

### 会话选择器

| 动作 | 默认 | 描述 |
|--------|---------|-------------|
| `toggleSessionPath` | `ctrl+p` | 切换路径显示 |
| `toggleSessionSort` | `ctrl+s` | 切换排序模式 |
| `toggleSessionNamedFilter` | `ctrl+n` | 切换仅名称过滤 |
| `renameSession` | `ctrl+r` | 重命名会话 |
| `deleteSession` | `ctrl+d` | 删除会话 |
| `deleteSessionNoninvasive` | `ctrl+backspace` | 删除会话（查询为空时） |

## 自定义配置

创建 `~/.pi/agent/keybindings.json`：

```json
{
  "cursorUp": ["up", "ctrl+p"],
  "cursorDown": ["down", "ctrl+n"],
  "deleteWordBackward": ["ctrl+w", "alt+backspace"]
}
```

每个动作可以有一个键或一组键。用户配置会覆盖默认值。

### Emacs 示例

```json
{
  "cursorUp": ["up", "ctrl+p"],
  "cursorDown": ["down", "ctrl+n"],
  "cursorLeft": ["left", "ctrl+b"],
  "cursorRight": ["right", "ctrl+f"],
  "cursorWordLeft": ["alt+left", "alt+b"],
  "cursorWordRight": ["alt+right", "alt+f"],
  "deleteCharForward": ["delete", "ctrl+d"],
  "deleteCharBackward": ["backspace", "ctrl+h"],
  "newLine": ["shift+enter", "ctrl+j"]
}
```

### Vim 示例

```json
{
  "cursorUp": ["up", "alt+k"],
  "cursorDown": ["down", "alt+j"],
  "cursorLeft": ["left", "alt+h"],
  "cursorRight": ["right", "alt+l"],
  "cursorWordLeft": ["alt+left", "alt+b"],
  "cursorWordRight": ["alt+right", "alt+w"]
}
```
