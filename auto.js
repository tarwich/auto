const { github, isPullRequest, pullRequest } = require('./github');
const { commit, config, push } = require('./git');
const { exec, objectToArguments } = require('./exec');

module.exports = {
  commit,
  config,
  exec,
  github,
  isPullRequest,
  objectToArguments,
  pullRequest,
  push,
};
