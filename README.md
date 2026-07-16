# LazyTabs

一个按域名规则自动整理 Chrome 标签页的扩展。

创建或访问网页标签页时，LazyTabs 会将匹配规则的标签页放入对应的 Chrome 标签组。也可以从扩展弹窗手动整理当前窗口。

## 功能

- 按精确域名或一层子域名通配符分组
- 为每个规则设置标签组名称和颜色
- 单独启用或停用规则，或暂停全部自动分组
- 手动整理当前窗口中的标签页
- 跳过固定标签页、无痕标签页和非 HTTP(S) 页面

## 安装

1. 安装依赖并构建扩展：

   ```bash
   npm install
   npm run build
   ```

2. 打开 `chrome://extensions`，启用右上角的“开发者模式”。
3. 选择“加载已解压的扩展程序”，然后选择 `.output/chrome-mv3` 目录。

开发时可运行 `npm run dev`；重新加载扩展后即可看到更新。

## 使用

1. 在扩展弹窗中打开设置。
2. 新建一条规则，填写域名模式、目标分组名称和颜色。
3. 保持“自动分组”开启；之后打开或跳转至匹配网页的标签页会自动归入目标分组。
4. 在弹窗点击“整理当前窗口”，可立即处理已打开的标签页。

## 规则语义

| 模式 | 匹配示例 | 不匹配示例 |
| --- | --- | --- |
| `github.com` | `github.com` | `api.github.com` |
| `*.github.com` | `api.github.com` | `github.com`、`api.v1.github.com` |

模式不区分大小写，首尾空格和末尾 `.` 会被忽略。仅支持完整域名，或以 `*.` 开头的单层子域名通配符。

已启用且会命中同一域名的规则不能指向不同分组；同名分组必须使用同一种颜色。

## 开发

```bash
npm install
npm run dev
```

可用命令：

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 WXT 开发构建 |
| `npm run build` | 生成生产构建到 `.output/` |
| `npm test` | 运行 Vitest 单元测试 |
| `npm run typecheck` | 运行 TypeScript 类型检查 |

项目使用 TypeScript、React 和 WXT 构建。
