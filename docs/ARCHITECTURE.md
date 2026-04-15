# inkpage 架构

## 总览

inkpage 采用 `index.html + TypeScript ESM + esbuild` 的轻量架构.

- `index.html` 提供页面壳和样式
- `src/` 保存源码
- `dist/main.js` 是构建产物

## 目录结构

```text
.
├─ index.html                 # 页面结构, 样式, dist 入口
├─ package.json               # npm scripts 与依赖
├─ tsconfig.json              # TypeScript 配置
├─ src/
│  ├─ main.ts                 # 初始化与模块装配
│  ├─ config.ts               # 文案, 常量, 默认配置
│  ├─ state.ts                # 类型, 共享状态, DOM 引用
│  ├─ model/
│  │  ├─ stroke.ts            # 笔画模型, 墨迹算法, 序列化
│  │  └─ selection.ts         # 选择模型, 命中测试, 空间索引
│  ├─ engine/
│  │  ├─ render.ts            # 渲染, 视图, 双画布缓存
│  │  ├─ input.ts             # 鼠标, 触控, 手写笔, 键盘输入
│  │  ├─ history.ts           # undo / redo
│  │  └─ storage.ts           # autosave, 保存, 读取, 导出
│  ├─ ui/
│  │  ├─ toolbar.ts           # 工具栏状态与溢出菜单
│  │  ├─ popups.ts            # 颜色, 微调, 项目菜单
│  │  └─ toast.ts             # toast 提示
│  └─ utils/
│     ├─ geometry.ts          # 纯几何工具函数
│     └─ dom.ts               # 轻量 DOM 工具函数
├─ dist/
│  └─ main.js                 # esbuild 输出
└─ docs/
   ├─ DESIGN.md               # 设计原则
   ├─ ARCHITECTURE.md         # 架构说明
   └─ ALGORITHM.md            # 墨迹算法
```

## 分层

- `model` 处理笔画和选择
- `engine` 处理渲染, 输入, 历史, 存储
- `ui` 处理工具栏, popup 和 toast
- `utils` 放纯工具函数

## 状态与数据流

运行时主链路为:

`input -> model / history / storage -> render -> ui`

- 输入层负责解释设备事件和交互语义
- 模型层负责笔画, 选择和几何判断
- 引擎层负责改写状态和调度渲染
- UI 层负责同步按钮, 菜单和提示

DOM 仍然采用原生命令式更新, 不引入框架或虚拟 DOM.

## 构建

- `npm run build`
  打包 `src/main.ts` 到 `dist/main.js`
- `npm run dev`
  监听源码并重建
- `npm run typecheck`
  运行 TypeScript 类型检查

## 约束

- 不引入框架
- 不引入运行时依赖
- 保持模块职责清晰
- 避免过度抽象
