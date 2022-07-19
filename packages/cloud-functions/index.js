'use strict';
var writeMatchStubHandler = require('./dist/cloud-functions/src/writeMatchStubHandler.js');
var writeAnonLogHandler = require('./dist/cloud-functions/src/writeAnonLogHandler.js');
module.exports.writeMatchStubHandler = writeMatchStubHandler.handler;
module.exports.writeAnonLogHandler = writeAnonLogHandler.handler;
