# OBS Recording Engine

## fix uio-hook library importing using \_\_dirname causing issues with webpack

this causes "no native build was found..."

See: https://github.com/prebuild/node-gyp-build/issues/60

## fix ffmpeg lib-cov import issue

seems to be some ENV var that can control it but I have not been able to make it work
manually patched the library in the interim, may just end up using patch-package :(

Update: this is now resolved with patch-package

# Building OSN from source

Building OSN from source is needed to produce a binary that matches the version of electron and node your project is using

https://github.com/stream-labs/obs-studio-node has a guide on doing the build which you should follow with modifications noted here

## Modifications to the repo

To update the build to the electron version you need apply the following patches:

```
--- a/obs-studio-client/CMakeLists.txt
+++ b/obs-studio-client/CMakeLists.txt
@@ -4,7 +4,7 @@ set(CMAKE_CXX_STANDARD_REQUIRED ON)

 SET(NODEJS_URL "https://artifacts.electronjs.org/headers/dist" CACHE STRING "Node.JS URL")
 SET(NODEJS_NAME "iojs" CACHE STRING "Node.JS Name")
-SET(NODEJS_VERSION "v25.8.4" CACHE STRING "Node.JS Version")
+SET(NODEJS_VERSION "v27.0.2" CACHE STRING "Node.JS Version")

 if(WIN32)
     # Resource VersionInfo
```

```
--- a/package.json
+++ b/package.json
@@ -31,7 +31,7 @@
     "aws-sdk": "^2.1164.0",
     "chai": "^4.2.0",
     "colors": "^1.4.0",
-    "electron": "25.8.4",
+    "electron": "27.0.2",
     "electron-mocha": "^8.2.2",
     "mocha": "^7.1.0",
     "mocha-junit-reporter": "^1.22.0",
```

Replacing 27.0.2 with the electron version you intend to use, of course

## Modifications to the build script

Their script may not be using the same Visual Studio or release config reference that you need. As of October 2023 the following was useful:

```
cd build
cmake .. -G"Visual Studio 17 2022" -A x64 -DCMAKE_PREFIX_PATH=%CD%/libobs-src/cmake/
cmake --build . --config Release
```

Which differs from the original in that it is updated to a newer Visual Studio release and changes the build to Release mode config

After this they use

```
cpack -G ZIP
```

to package the archive. I had to run this command in an admin-level command prompt for unknown reasons - I suspect Visual Studio wrote something to disk with admin privleges.

## Updating wowarenalogs

Once archived, you must upload the archive to a public cloud storage account and replace the reference in the appropriate package.json:

```
"obs-studio-node": "https://storage.googleapis.com/spires-log-files/obs-studio-node-0.3.21-win64-27.0.2.tar.gz",
```

It is imperative that you test the `npm install` process after updating this to ensure that your new archive is compatible with npm
