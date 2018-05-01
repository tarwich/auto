const { github, isPullRequest, pullRequest } = require('./modules/github');
const { commit, config, push, setupGitSsh } = require('./modules/git');
const { exec, objectToArguments } = require('./modules/exec');

module.exports = {
  commit,
  config,
  exec,
  github,
  isPullRequest,
  objectToArguments,
  pullRequest,
  push,
  setupGitSsh,
};
