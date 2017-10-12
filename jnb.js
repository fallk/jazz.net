'use strict';

const program = require('commander');

program
  .version('0.1.0');
  
require('./compiler')(program);

  
program.parse(process.argv);