'use strict';
var writeMatchStubHandler = require('./dist/cloud/src/writeMatchStubHandler.js');
var writeAnonLogHandler = require('./dist/cloud/src/writeAnonLogHandler.js');
module.exports.writeMatchStubHandler = writeMatchStubHandler.handler;
module.exports.writeAnonLogHandler = writeAnonLogHandler.handler;
