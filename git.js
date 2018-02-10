const { appendFileSync, mkdir, mkdtempSync, readFile, writeFile } = require('fs');
const { dirname, join, resolve } = require('path');
const { tmpdir } = require('os');
const { exec, objectToArguments } = require('./exec');
const { promisify } = require('util');

const readFileP = promisify(readFile);
const mkdirPromise = promisify(mkdir);
const writeFileP = promisify(writeFile);

const {
  GH_KEY,
  HOME = process.env.HOMEPATH,
} = process.env;
const GIT_SSH_DIR = mkdtempSync(join(tmpdir(), 'autorelease-'));
const ID_RSA = resolve(GIT_SSH_DIR, 'id_rsa');
const SSH_CONFIG = `${HOME}/.ssh/config`;
const KNOWN_HOSTS = `${HOME}/.ssh/known_hosts`;

/**
 * Commit the files specified
 *
 * @param {string[]} files The files to commit (can be any .gitignore pattern)
 * @param {object} options The options to pass to the command
 * @param {string} options.message The commit message
 *
 * @return {Promise} A promise that will be resolved with the output of the
 *         `git commit` command
 */
function commit(files, options = {}) {
  // Expand the options into things that can go on the command-line
  const expanded = objectToArguments(options);

  return exec('git', ['commit', ...files, ...expanded]);
}

/**
 * Set the git config
 *
 * @param {*} config Object of key/value pairs for config
 * @param {*} options Additional CLI options for the config command
 *
 * @return {Promise<string>} The result of the CLI command
 */
async function config(config, options = {}) {
  // Expand the options into things that can go on the command-line
  const expanded = objectToArguments(options);

  return Promise.all(Object.keys(config).map(key =>
    exec('git', ['config', ...expanded, key, config[key]])
  ));
}

/**
 * Push any commits to origin
 *
 * @param {string} remote The remote to push to (default: origin)
 * @param {string} branch The branch to push to (default: HEAD)
 * @param {object} options CLI options with the same keys as cli arguments, such
 *        as force for --force
 *
 * @return {Promise} A promise that will be resolved with the result of the
 * command
 */
async function push(remote = 'origin', branch = 'HEAD', options = {}) {
  await setupGitSsh();
  // Expand the options into things that can go on the command-line
  const expanded = objectToArguments(options);
  // Need to install the key
  return exec('git', ['push', remote, branch, ...expanded]);
}

/**
 * Setup the ssh configs to allow git push to work
 */
async function setupGitSsh() {
  // Create the SSH deploy key
  await writeFileP(ID_RSA, GH_KEY.replace(/\\n/g, '\n'), { mode: 0o400 });

  // Create the .ssh directory if needed
  await mkdirPromise(dirname(SSH_CONFIG))
  .catch(error => {
    // Ignore EEXIST
    if (error.code !== 'EEXIST') throw error;
  });
  // Load the existing ssh config
  const data = await readFileP(SSH_CONFIG, 'UTF-8').catch(error => {
    if (error.code === 'ENOENT') return '';
    throw error;
  }) || '';
  const hostData = `Host autorelease
    User git
    HostName github.com
    IdentityFile ${ID_RSA}`;
  const hosts = data.split(/^\s*Host\b/gm)
  .filter(Boolean)
  .map(h => `Host${h}`);

  let oldIndex = hosts.findIndex(h => /Host voidray-auto-bot/.test(h)); if
  (oldIndex === -1) oldIndex = hosts.length;

  hosts.splice(oldIndex, 1, hostData);
  await writeFileP(SSH_CONFIG, hosts.join('\n\n'));

  // Add github.com to known_hosts
  if (!/\bgithub.com\b/i.test((await readFileP(KNOWN_HOSTS).catch(() => '')))) {
    appendFileSync(
      KNOWN_HOSTS,
      'github.com,192.30.252.*,192.30.253.*,192.30.254.*,192.30.255.* ssh-rsa' +
      ' AAAAB3NzaC1yc2EAAAABIwAAAQEAq2A7hRGmdnm9tUDbO9IDSwBK6TbQa+PXYPCPy6rbT' +
      'rTtw7PHkccKrpp0yVhp5HdEIcKr6pLlVDBfOLX9QUsyCOV0wzfjIJNlGEYsdlLJizHhbn2' +
      'mUjvSAHQqZETYP81eFzLQNnPHt4EVVUh7VfDESU84KezmD5QlWpXLmvU31/yMf+Se8xhHT' +
      'vKSCZIFImWwoG6mbUoWf9nzpIoaSjB+weqqUUmpaaasXVal72J+UX2B+2RPW3RcT0eOzQg' +
      'qlJL3RKrTJvdsjE3JEAvGq3lGHSZXy28G3skua2SmVi/w4yCE6gbODqnTWlg7+wC604ydG' +
      'XA8VJiS5ap43JXiUFFAaQ=='
    );
  }
}

module.exports = { commit, config, push, setupGitSsh };
