# inkpage

**inkpage 是一个轻量 Web 墨迹画板, 支持鼠标, 触控和手写笔.**

## 🛠️ 功能

- [x] 流畅的墨迹
- [x] 模拟压感
- [x] 无限画布
- [x] 保存, 读取, 导出为 PNG
- [x] 撤销和重做

## 💡 操作技巧

多数交互应该都符合直觉. 一些 tips 如下:

### 鼠标

- 用中键 / 空格平移画布.
- 右键可以快速使用橡皮.

### 触摸屏

- 双指可平移 / 缩放.
- 开启**触摸墨迹**后, 可用手指书写.

### 手写笔

- 多数手写笔的侧键可以用做橡皮.
- _不支持 Surface Pen 背后的橡皮擦._

## 🔨 从代码构建

```bash
npm install
npm run build
```

构建后会生成 `dist/main.js`. 受跨域限制, 建议用本地服务器测试, 如:

```bash
npx serve .
```

## 📝 设计文档

- [DESIGN.md](./docs/DESIGN.md)
- [ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [ALGORITHM.md](./docs/ALGORITHM.md)
