# webots-blockly

Open the [editor](https://richom.github.io/webots-blockly/editor/)

## Instructions

To start the server:

    $ npm run server

To start the desktop app:

    $ npm run desktop

To install dependencies (I add this mostly as a reminder to myself):

    $ npm install

To package the application as a desktop executable you will need [electron-packager](https://github.com/electron/electron-packager) installed globally (`npm install electron-packager -g`) and then run:

    $ electron-packager . webots-blockly --platform win32 --arch=ia32 --out=out --overwrite
