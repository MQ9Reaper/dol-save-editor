# DOL 存档编辑器 (Degrees of Lewdity Save Editor)

一个**纯前端、本地浏览器运行**的存档编辑工具，类似 [saveeditonline.com](https://www.saveeditonline.com/)，
专门针对 Degrees of Lewdity（SugarCube 引擎）的 `.save` 文件。

✅ 桌面端 + 安卓手机自适应  ✅ 支持 PWA（添加到主屏幕，离线运行）

## 功能
- 自动识别 `LZString.compressToBase64` 压缩的存档，解出完整 JSON
- 把 SugarCube 的 `state.delta[0]` 全量帧解析成可视化字段
- 自动按主题分类（常用 / 身体 / 技能 / 物品 / 关系 / 标志 / 全部）
- 数字 / 字符串 / 布尔 / 对象 / 数组 自动渲染对应控件
- 一键重新打包成同格式 `.save`，文件全程不离开本地

## 桌面用法
1. 双击 `index.html`
2. 拖入 `.save` 文件或点"打开"
3. 编辑（绿色高亮表示已修改）
4. 点"💾 导出新存档"下载

## 📱 安卓手机用法

**方案一：本地 HTTP 服务器（推荐）**
1. 在手机上装一个 App，比如 "Simple HTTP Server"、"Termux"、"Phlox"
2. 把整个 `dol-save-editor` 文件夹放到手机存储里
3. 用该 App 指向这个文件夹启动，端口随便（默认 8080）
4. 手机浏览器访问 `http://localhost:8080` 即可
5. 在浏览器菜单选 **"添加到主屏幕"** → 之后像 App 一样用，离线也行

**方案二：放到云盘 / 自己的服务器（最舒服）**
- 上传到任意支持 https 的静态托管（GitHub Pages、Cloudflare Pages、Vercel、自家 Nginx 都行）
- 用手机浏览器打开后"添加到主屏幕"，PWA 自动缓存所有资源，断网也能用

**方案三：浏览器直接打开本地文件（不推荐）**
- Chrome 安卓版会因为 `file://` 同源策略加载 JS 失败
- Firefox 安卓版可以，但功能受限（不能注册 Service Worker，不能 PWA）

## 实现要点
- 解码：`LZString.decompressFromBase64(raw) → JSON.parse`
- 编辑：写回 `state.delta[0].variables`
- 打包：截断 `state.delta` 为 `[delta[0]]`、`state.index = 0`，重新压缩

## 文件结构
```
dol-save-editor/
├── index.html              主界面
├── style.css               样式（含手机响应式）
├── app.js                  解码、UI、重打包逻辑
├── lz-string.min.js        压缩库（离线）
├── sw.js                   Service Worker（PWA 离线缓存）
├── manifest.webmanifest    PWA 清单
├── icon.svg                矢量图标
├── icon-192.png            PWA 图标 (192)
├── icon-512.png            PWA 图标 (512)
└── README.md
```

## 安全
- 所有文件读写都在浏览器本地完成，不会发送到任何服务器
- 改存档可能让游戏崩溃，编辑前请备份原文件

