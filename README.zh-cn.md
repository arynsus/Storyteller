<a name="readme-top"></a>

[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url]

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/arynsus/Storyteller">
    <img src="./public/favicon.png" alt="Logo" width="80" height="80">
  </a>

  <h3 align="center">Storyteller</h3>

  <p align="center">
    轻松使用微软Edge浏览器文字转语音功能创建电子书
    <br />
    <a href="https://github.com/arynsus/Storyteller/releases"><strong>下载最新版 »</strong></a>
    <br />
    <a href="https://github.com/arynsus/Storyteller/blob/master/README.md"><strong>English Manual »</strong></a>
    <br />

  </p>
</div>


<!-- ABOUT THE PROJECT -->
## 关于此项目

![Product Name Screen Shot][product-screenshot]

本项目使用微软Edge浏览器的文本转语音服务将.txt文本小说转换为有声书，可附加自定义的元数据。

重要声明：本项目仅用于代码学习，不作任何商业用途。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

### 框架和语言

[![Vue][Vue.js]][Vue-url]
[![Electron][Electron.js]][Electron-url]
[![Typescript][Typescript]][Typescript-url]
[![Arco Design][Arco]][Arco-url]
[![Tailwind Css][Tailwind]][Tailwind-url]

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

<!-- GETTING STARTED -->
## 安装说明

### 安装发布版

在 [此页面](https://github.com/arynsus/Storyteller/releases) 下载对应系统的最新版安装包后，根据提示安装。

### 自行编译

也可以自行编译，这样将更方便二次开发和故障排除。

克隆本仓库源码后，运行如下命令：

```
# 前往项目目录
cd Storyteller

# 安装依赖包
npm install

# 更新 FFMPEG 和 FFPROBE 的可执行程序
# Windows x64:
copy .\ffmpeg-bin\ffmpeg\win\x64\ffmpeg.exe .\node_modules\ffmpeg-static-electron\bin\win\x64\
copy .\ffmpeg-bin\ffprobe\win\x64\ffprobe.exe .\node_modules\ffprobe-static-electron\bin\win\x64\
# macOS:
cp ./ffmpeg-bin/ffmpeg/mac/arm64/ffmpeg ./node_modules/ffmpeg-static-electron/bin/mac/arm64/
cp ./ffmpeg-bin/ffprobe/mac/arm64/ffprobe ./node_modules/ffprobe-static-electron/bin/mac/arm64/
chmod +x ./node_modules/ffmpeg-static-electron/bin/mac/arm64/
chmod +x ./node_modules/ffprobe-static-electron/bin/mac/arm64/

# 以开发模式运行
npm run dev

# 构建为安装包
npm run build
```

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>



<!-- USAGE EXAMPLES -->
## 使用说明
1. 将 `.txt` 文件拖至主界面中虚线标记的部分，或单击该区域以选择要上传的文件。注意，列表中只会加载文件名不同的文件。
2. 可以使用 `窗口` 菜单中的 `章节切割器` 将一整卷的文本文件按章节分割，并将分割后的文件一键导入待转换列表。
3. 单击表中的任意行以选中该文件，然后在 `元数据设置` 部分中输入元数据。如果文件名遵循一些易于识别的格式，系统会自动识别章节编号和章节标题。书名、作者名、封面图输入框右侧的按钮可将输入的内容应用于表中等待转换的所有 `.txt` 文件。
4. 为了更好地为输出的文件排序，可以使用章节编号输入框右侧的按钮在已输入内容末尾追加序列编号。例如，先输入 `2.` 后，点击该按钮，则列表中所有文件的章节编号会被覆写为 `2.1`、`2.2`、`2.3`，以此类推。
5. 对于封面图，可以将本地文件拖到输入框中，或单击上传本地文件。也可以输入在线图像文件的链接。如果转换时文件不可用，或者不是图片文件，系统会忽略图片，生成不带封面图的有声书，因此请注意不要在点击开始转换后，将本地的原始图片删去。
6. 根据需要调整 `文字转语音设置` ，然后单击 `转换`。 请注意，Edge的服务器会拒绝异常频繁的请求，因此，如果不着急，请将 `并行任务数` 和 `并行分块数` 保持为 `1`。另一个思路是将这两个数字设置得极高，Edge的服务器将在初始批次后关闭连接，转换进程将会显示为错误，但此时可以再次单击 `转换` 重试，之前的转换进度会被保留。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>


<!-- ROADMAP -->
## 开发计划

- [x] 增加多语言支持
  - [x] 英文
  - [x] 简体中文
  - [x] 西班牙文
- [x] 自动测试Edge TTS服务可用的语音种类
- [ ] 增加其它的TTS服务

有关建议功能和已知问题的完整列表，请参阅 [此页面](https://github.com/arynsus/Storyteller/issues)。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>


<!-- LICENSE -->
## 许可

依据 MIT 许可发布。有关更多信息，请参阅 `LICENSE.txt`。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>


<!-- ACKNOWLEDGMENTS -->
## 鸣谢

* [Electron-Vite-Vue Boilerplate](https://github.com/electron-vite/electron-vite-vue)
* [TTS-Vue](https://github.com/LokerL/tts-vue)

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>



<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[stars-shield]: https://img.shields.io/github/stars/arynsus/Storyteller?style=for-the-badge
[stars-url]: https://github.com/arynsus/Storyteller/stargazers
[issues-shield]: https://img.shields.io/github/issues/arynsus/Storyteller?style=for-the-badge
[issues-url]: https://github.com/arynsus/Storyteller/issues
[license-shield]: https://img.shields.io/github/license/arynsus/Storyteller?style=for-the-badge
[license-url]: https://github.com/arynsus/Storyteller/blob/master/LICENSE.txt

[product-screenshot]: ./screenshot.zh-cn.png
[Vue.js]: https://img.shields.io/badge/Vue.js-35495E?style=for-the-badge&logo=vuedotjs&logoColor=4FC08D
[Vue-url]: https://electronjs.org/
[Electron.js]: https://img.shields.io/badge/Electron-JS-47848D?style=for-the-badge&logo=electron&logoColor=white
[Electron-url]: https://vuejs.org/
[Typescript]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[Typescript-url]: https://www.typescriptlang.org/
[Arco]: https://img.shields.io/badge/Arco%20Design-00A6FF?style=for-the-badge
[Arco-url]: https://arco.design/
[Tailwind]: https://img.shields.io/badge/Tailwind%20CSS-38B2AC?style=for-the-badge&logo=tailwindcss&logoColor=white
[Tailwind-url]: https://tailwindcss.com/