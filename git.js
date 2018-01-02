const { appendFileSync, mkdtempSync, readFile, writeFileSync } = require('fs');
const { join, resolve } = require('path');
const { tmpdir } = require('os');
const { exec } = require('./exec');
const { toPromise } = require('util');

const readFileP = toPromise(readFile);

const {
  GH_KEY,
  HOME = process.env.HOMEPATH,
} = process.env;
const GIT_SSH_DIR = mkdtempSync(join(tmpdir(), 'autorelease-'));
const ID_RSA = resolve(GIT_SSH_DIR, 'id_rsa');
const SSH_CONFIG = `${HOME}/.ssh/config`;
const KNOWN_HOSTS = `${HOME}/.ssh/known_hosts`;

// Immediately setup SSH for git
const setupGitSsh = new Promise(async () => {
  // Create the SSH deploy key
  writeFileSync(ID_RSA, GH_KEY.replace(/\\n/g, '\n'), { mode: 0o400 });

  // Load the existing ssh config
  const data = await readFileP(SSH_CONFIG, 'UTF-8');
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

  // Add github.com to known_hosts
  if (!/\bgithub.com\b/i.test((await readFileP(KNOWN_HOSTS))).catch(() => '')) {
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
});

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
function commit(files, options) {
  // Expand the options into things that can go on the command-line
  const expanded = Object.keys(options).reduce((result, k) =>
    result.concat((k.length === 1 ? '-' : '--') + k)
    .concat(options[k] === '' ? [] : options[k])
  , []);

  return exec('git', ['commit', ...files, ...expanded]);
}

/**
 * Push any commits to origin
 *
 * @return {Promise} A promise that will be resolved with the result of the
 * command
 */
async function push() {
  await setupGitSsh;
  // Need to install the key
  return exec('git', ['push', 'origin', 'HEAD']);
}

module.exports = { commit, push };
