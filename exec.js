const { spawn } = require('child_process');
const debug = require('debug');

const log = debug('autorelease:exec');

/**
 * Execute a program and return the results in a promise
 *
 * @param {string} program The program to execute
 * @param {string[]} args Array of arguments to pass to the program
 * @param {SpawnOptions} options Options for child_process.spawn
 *
 * @return {Promise} A promise that will resolve to the stdout or stderr of the
 *         program
 */
function exec(program, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    log({ program, args, options });
    const child = spawn(program, args, Object.assign(
      options,
      { env: process.env },
    ));

    child.stdout.on('data', data => {
      stdout += data.toString('utf-8');
    });
    child.stderr.on('data', data => {
      stderr += data.toString('utf-8');
    });
    child.on('close', code => {
      if (code) reject(`${stdout}\n\n${stderr}`);
      else resolve(stdout);
    });
  });
}

/**
 * Take an object and convert to CLI arguments
 *
 * This function will take an object of key/value pairs like {foo: 'bar'} and
 * converts it to an array of ['--foo', 'bar'] so that it can be passed into CLI
 * arguments
 *
 * @param {object} options key/value pairs to convert to CLI arguments
 *
 * @return {string[]} Array of string values to pass into CLI arguments
 */
function objectToArguments(options) {
  // Expand the options into things that can go on the command-line
  return Object.keys(options).reduce((result, k) =>
    result.concat((k.length === 1 ? '-' : '--') + k)
    .concat((options[k] === '' || options[k] === true) ? [] : options[k])
  , []);
}

module.exports = { exec, objectToArguments };
