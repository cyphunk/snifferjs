The client application is based on the Electron.js framework. Packages were
created as follows:

```
cd /tmp
git clone git@github.com:cyphunk/snifferjs.git
cd snifferjs
git checkout electronApplication
npm install
npm install electron-rebuild electron-prebuilt@0.36.7

./node_modules/.bin/electron-rebuild

npm install -g electron-packager

electron-packager . snifferjs \
  --out ~/git/snifferjs/app_releases --ignore="(app_releases|node_modules/.bin|node_modules/electron-rebuild|node_modules/electron-prebuilt|client/js/tmp|data/save_*)" \
  --overwrite --prune \
  --platform=all --arch=x64 --version=0.36.7

Test:

sudo ~/git/snifferjs/app_releases/snifferjs-linux-x64/snifferjs
sudo ~/git/snifferjs/app_releases/snifferjs-darwin-x64/snifferjs.app/Contents/MacOS/Electron

cd ~/git/snifferjs/app_releases
tar -cf - snifferjs-linux-x64 | gzip -9 > snifferjs-linux-x64.tar.gz
rm snifferjs-darwin-x64.zip; 7z a -tzip snifferjs-darwin-x64.zip snifferjs-darwin-x64
rm snifferjs-win32-x64.zip; 7z a -tzip snifferjs-win32-x64.zip snifferjs-win32-x64
```

We have not testing the win32 app yet. If someone could check and report back
issues, it would be much appreciated.

Still figuring out the best method for compiling native modules between different
hosts. Until then each package is built on the native OS it is intended for.
