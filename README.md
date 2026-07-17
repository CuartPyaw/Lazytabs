# LazyTabs

[中文](README.md) | [English](README.en.md)

![LazyTabs 图标](public/icon/128.png)

按域名规则自动整理 Chrome 标签页。

LazyTabs 会在标签页创建或网址发生变化时，将匹配规则的页面放入对应的 Chrome 标签组；也可以一次整理当前窗口中已经打开的标签页。

## 功能

- 按精确域名或一层子域名通配符匹配
- 为每个分组设置名称、颜色和多条规则
- 单独启用或停用分组
- 一键暂停或恢复自动分组
- 手动整理当前窗口，自动分组暂停时仍可使用
- 跳过固定标签页、无痕标签页和非 HTTP(S) 页面

## 安装

### 构建并加载

```bash
npm install
npm run build
```

然后在 Chrome 中：

1. 打开 `chrome://extensions`。
2. 开启右上角的“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择项目下的 `.output/LazyTabs` 目录。

### 开发模式

```bash
npm run dev
```

开发构建启动后，在 `chrome://extensions` 中重新加载扩展即可应用更新。

## 快速开始

1. 点击扩展图标，打开设置页。
2. 添加一个分组，填写分组名称、标签组颜色和域名规则。
3. 每条规则占一行；保存后，启用该分组和“自动分组”。
4. 打开或跳转到匹配网页时，标签页会自动归入对应标签组。
5. 点击弹窗中的“整理当前窗口”，可立即处理当前窗口已有的标签页。

扩展还注册了“整理当前窗口”命令，默认快捷键为 `Alt+O`。可在 `chrome://extensions/shortcuts` 中修改。

## 规则语义

| 规则 | 匹配 | 不匹配 |
| --- | --- | --- |
| `github.com` | `github.com` | `api.github.com` |
| `*.github.com` | `api.github.com` | `github.com`、`api.v1.github.com` |

规则会先去除首尾空格、转换为小写，并忽略末尾的 `.`。仅支持完整域名，或以 `*.` 开头的一层子域名通配符。

保存分组时会校验：

- 分组名称不能为空，且不能与其他分组重复
- 规则只能包含字母、数字、连字符、点和 `*`
- 已启用分组之间不能存在重叠规则

同一分组可以包含多条规则；命中其中任意一条即可归入该分组。规则按分组顺序匹配，因此应避免让不同分组覆盖同一域名。

## 开发

```bash
npm install
npm run dev
```

常用命令：

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 WXT 开发构建 |
| `npm run build` | 生成生产构建到 `.output/LazyTabs` |
| `npm test` | 运行 Vitest 单元测试 |
| `npm run typecheck` | 运行 TypeScript 类型检查 |

项目使用 TypeScript、React、WXT 和 HeroUI 构建。核心规则与标签组逻辑位于 `src/lib/`，弹窗和设置页分别位于 `entrypoints/popup/` 与 `entrypoints/options/`。

## 权限

- `storage`：保存分组规则和启用状态
- `tabs`：读取当前窗口标签页及其网址
- `tabGroups`：创建、更新和复用 Chrome 标签组
