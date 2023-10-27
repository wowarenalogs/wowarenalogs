# TODO

## fix uio-hook library importing using \_\_dirname causing issues with webpack

this causes "no native build was found..."

## fix ffmpeg lib-cov import issue

seems to be some ENV var that can control it but I have not been able to make it work
manually patched the library in the interim, may just end up using patch-package :(

## decide on @ffmpeg-installer/ffmpeg or ffmpeg-static
