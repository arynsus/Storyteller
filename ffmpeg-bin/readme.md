The npm package `ffmpeg-static-electron` uses very old version of ffmpeg binaries, which doesn't support the commands this app requires. 

Therefore, if you are building fromm source, after running `npm install`, replace the binaries in `node_modules/ffmpeg-static-electron/bin` with the current version of corresponding platform. I put the Windows x64 and macOS ones here for convenience.

For macOS, don't forget to use `chmod +x` on the copied binaries.