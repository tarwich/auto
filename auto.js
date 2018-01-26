const { github, isPullRequest } = require('./github');
const { commit, push } = require('./git');
const { exec } = require('./exec');

module.exports = {
  commit,
  exec,
  github,
  isPullRequest,
  push,
};
