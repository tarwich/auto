const { github, isPullRequest } = require('./github');
const { commit } = require('./git');
const { exec } = require('./exec');

module.exports = {
  commit,
  exec,
  github,
  isPullRequest,
};
