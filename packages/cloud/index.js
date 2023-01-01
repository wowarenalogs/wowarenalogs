'use strict';
var writeMatchStubHandler = require('./dist/cloud/src/writeMatchStubHandler.js');
var refreshSpellIconsHandler = require('./dist/cloud/src/refreshSpellIconsHandler.js');
module.exports.writeMatchStubHandler = writeMatchStubHandler.handler;
module.exports.refreshSpellIconsHandler = refreshSpellIconsHandler.handler;
