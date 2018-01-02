const { spawn } = require('child_process');

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

    const child = spawn(program, args, options);

    child.stdout.on('data', data => {
      stdout += data.toString('ascii');
    });
    child.stderr.on('data', data => {
      stderr += data.toString('ascii');
    });
    child.on('close', code => {
      if (code) reject(stderr);
      else resolve(stdout);
    });
  });
}

module.exports = { exec };
