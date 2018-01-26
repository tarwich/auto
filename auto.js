const { github, isPullRequest } = require('./github');
const { commit, config, push } = require('./git');
const { exec } = require('./exec');

module.exports = {
  commit,
  config,
  exec,
  github,
  isPullRequest,
  push,
};
