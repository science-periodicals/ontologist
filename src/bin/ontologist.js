#!/usr/bin/env node

import path from 'path';
import { exec } from 'child_process';
import yargs from 'yargs';
import colors from 'colors'; // eslint-disable-line

/* eslint-disable no-console */

const argv = yargs
  .usage(
    `Usage: ontologist <command> [options] where command is:
    - seed [-e, --env]
  `
  )
  .alias('v', 'version')
  .describe('v', 'print version number')
  .describe('e', 'environment')
  .alias('e', 'env')
  .alias('node-env', 'env')
  .describe('redis-port', 'Redis port')
  .describe('redis-host', 'Redis host')
  .describe('redis-password', 'Redis password')
  .help('h').argv;

if (argv.v) {
  console.log(require('../../package.json').version);
  process.exit(0);
}

switch (argv._[0]) {
  case 'seed': {
    const scriptPath = path.join(
      path.dirname(path.dirname(__dirname)),
      'scripts',
      'seed.sh'
    );

    exec(
      scriptPath,
      {
        cwd: path.dirname(path.dirname(__dirname)),
        env: {
          NODE_ENV: argv.e || process.env.NODE_ENV,
          REDIS_PORT: argv['redis-port'] || process.env.REDIS_PORT,
          REDIS_HOST: argv['redis-host'] || process.env.REDIS_HOST,
          REDIS_PASSWORD: argv['redis-password'] || process.env.REDIS_PASSWORD
        }
      },
      (err, stdout, stderr) => {
        if (err) {
          console.error(argv._[0].grey + ' ERR! '.red + err.message);
          if (stderr) {
            console.log(stderr);
          }
          process.exit(1);
        }

        console.log(argv._[0].grey + ' ✓ '.green);
        if (stdout) {
          console.log(stdout);
        }
        process.exit(0);
      }
    );

    break;
  }

  default: {
    console.log('invalid command');
    process.exit(0);
    break;
  }
}
