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
    Easily convert novels into audiobooks via Microsoft Edge's Text-to-Speech functions.
    <br />
    <a href="https://github.com/arynsus/Storyteller/releases"><strong>Download release version »</strong></a>
    <br />

  </p>
</div>


<!-- ABOUT THE PROJECT -->
## About The Project

![Product Name Screen Shot][product-screenshot]

This app uses Edge's TTS service to convert .txt novels into audiobooks, with optional and customizable metadata.

IMPORTANT NOTE: This application is intended for progamming-learning only, and not for commercial use.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

[![Vue][Vue.js]][Vue-url]
[![Electron][Electron.js]][Electron-url]
[![Typescript][Typescript]][Typescript-url]
[![Arco Design][Arco]][Arco-url]
[![Tailwind Css][Tailwind]][Tailwind-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- GETTING STARTED -->
## Getting Started

### Installation

Download the released version from [releases page](https://github.com/arynsus/Storyteller/releases) and install.

### Build from source

Alternatively, you can download the source code which offers better customizability and debugging abilities.

After cloning the repo, run:

```
# Change to app directory
cd Storyteller

# Install dependencies
npm install

# Update FFMPEG and FFPROBE binaries
# Windows x64:
copy .\ffmpeg-bin\ffmpeg\win\x64\ffmpeg.exe .\node_modules\ffmpeg-static-electron\bin\win\x64\
copy .\ffmpeg-bin\ffprobe\win\x64\ffprobe.exe .\node_modules\ffprobe-static-electron\bin\win\x64\
# macOS:
cp ./ffmpeg-bin/ffmpeg/mac/arm64/ffmpeg ./node_modules/ffmpeg-static-electron/bin/mac/arm64/
cp ./ffmpeg-bin/ffprobe/mac/arm64/ffprobe ./node_modules/ffprobe-static-electron/bin/mac/arm64/
chmod +x ./node_modules/ffmpeg-static-electron/bin/mac/arm64/
chmod +x ./node_modules/ffprobe-static-electron/bin/mac/arm64/

# Run in development mode
npm run dev

# Build
npm run build
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- USAGE EXAMPLES -->
## Usage

1. Drag your .txt file into the section in the main UI marked by dotted lines, or click in the area to select files to upload. Only files with unique filenames will be listed in the main table.
2. Click on any row in the table to highlight the file, then, in Metadata Settings section, input metadata. If your filename follow some easy to recognize formats, chapter number and chapter title should be autofilled. For the cover art, youo can drag local file into the input field, or click to upload, it also accepts online image files. The button on the right of each input field lets you apply the inputed value to all the txt files in the table that are waiting for conversion.
3. Adjust the TTS Settings as needed and click on Convert. Note that Edge's server will refuse unusually frequent requests, so if you are not in a hurry, keep concurrent jobs and concurrent sections as 1. Alternatively, go extremely high for both numbers, Edge's server will close connection after initial batch, marking the files as error, but you can click on Convert again to retry, which will resume the converting progress.

<p align="right">(<a href="#readme-top">back to top</a>)</p>


<!-- ROADMAP -->
## Roadmap

- [x] Add Multi-language support.
  - [x] English
  - [x] Chinese
  - [x] Spanish
- [x] Auto-testing of Edge TTS Voice availability.
- [ ] Add other TTS options

See the [open issues](https://github.com/arynsus/Storyteller/issues) for a full list of proposed features (and known issues).

<p align="right">(<a href="#readme-top">back to top</a>)</p>


<!-- LICENSE -->
## License

Distributed under the MIT License. See `LICENSE.txt` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>


<!-- ACKNOWLEDGMENTS -->
## Acknowledgments

* [Electron-Vite-Vue Boilerplate](https://github.com/electron-vite/electron-vite-vue)
* [TTS-Vue](https://github.com/LokerL/tts-vue)

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[stars-shield]: https://img.shields.io/github/stars/arynsus/Storyteller?style=for-the-badge
[stars-url]: https://github.com/arynsus/Storyteller/stargazers
[issues-shield]: https://img.shields.io/github/issues/arynsus/Storyteller?style=for-the-badge
[issues-url]: https://github.com/arynsus/Storyteller/issues
[license-shield]: https://img.shields.io/github/license/arynsus/Storyteller?style=for-the-badge
[license-url]: https://github.com/arynsus/Storyteller/blob/master/LICENSE.txt

[product-screenshot]: ./screenshot.png
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