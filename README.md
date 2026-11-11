# tyx · 签名动画

[在线使用](https://tangyx527.github.io/tyx-signature/)

输入英文名字或拼音，设计动态签名，并直接在浏览器导出 MP4 视频。

## 使用

1. 输入名字，选择单人或情侣模式。
2. 调整颜色、大小、笔迹粗细和装饰；开启“自由拖动”后可移动签名与图案。
3. 点击“完整展开”查看完整设计，点击播放预览动画。
4. 在“导出”中选择横屏、竖屏或方形，设置时长和背景，可选添加音乐，然后生成并下载 MP4。

支持 1080p、30fps、3–15 秒视频。配置自动保存在当前浏览器，也可通过右上角菜单下载或导入 JSON。重新打开页面后，如需音乐，请重新选择音频文件。

视频在当前设备处理。导出需要 HTTPS 或本机 localhost，以及支持 WebCodecs 的浏览器；若设备提示不支持，可换用较新的 Chrome、Edge 或系统浏览器。

## 本地运行

安装 Node.js 24 LTS，然后在项目目录执行：

```sh
npm ci
npm start
```

打开终端显示的网址。Windows 可双击 `开始使用.cmd`；macOS 可运行 `sh ./开始使用.command`。

## 自行部署

```sh
npm run build
```

将生成的 `dist/` 部署到静态托管平台。使用 GitHub Pages 时，在仓库 Settings → Pages 将 Source 设为 GitHub Actions；推送到 `main` 后，随附工作流会自动构建并部署。

开发检查：`npm run check`、`npm test`；预览构建结果：`npm run preview`。

## 许可

项目代码采用 [MIT](LICENSE)。依赖、字体及图标适用各自许可，见 [第三方声明](THIRD_PARTY_NOTICES.md)。

