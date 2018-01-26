const { URL } = require('url');
const assert = require('assert');
const debug = require('debug');
const fetch = require('node-fetch');

const log = debug('auto:github');

const {
  GH_OWNER,
  GH_REPO,
  GH_TOKEN,
} = process.env;

// Make sure out environment variables are defined
['GH_REPO', 'GH_OWNER', 'GH_TOKEN']
.forEach(k => {
  if (!process.env[k]) {
    console.warn(
      `WARNING: ${k} is undefined. This will cause problems when trying to ` +
      'access the github api'
    );
  }
});

/**
 * Make a call to the github api
 *
 * @param {object} options The options to be consumed
 * @param {string} options.url The url to use This should be a partial url as
 *        the api.github.com will be prepended along with the GH_OWNER and
 *        GH_REPO
 * @param {'get' | 'post'} options.method The HTTP method of the request.
 *        Defaults to 'get'
 * @return {Promise} The result of the fetch call with any json already parsed
 */
function github(options) {
  const { url, method = 'GET', headers = {}, qs = {} } = options;

  // Make sure out environment variables are defined
  ['GH_REPO', 'GH_OWNER', 'GH_TOKEN']
  .forEach(k => assert(process.env[k], `${k} is undefined`));

  // Default content-type to JSON as most of the github api endpoints use JSON
  if (!headers['content-type']) headers['content-type'] = 'application/json';
  if (!headers.Authorization) headers.Authorization = `token ${GH_TOKEN}`;
  // Accept v3 of the API
  headers.accept = ['application/vnd.github.v3+json']
  .concat(headers.accept || []);
  // Clean up the URL
  const fullUrl = new URL(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/${url.replace(/^\//, '')}`
  );

  // Set any query parameters
  for (const key of Object.keys(qs)) fullUrl.searchParams.set(key, qs[key]);

  log(fullUrl, { method, headers });

  return fetch(fullUrl.toString(), { method, headers })
  .then(result => {
    if (/application\/json/i.test(result.headers.get('content-type')))
      return result.json();
  })
  ;
}

/**
 * Determine if a branch has a pull request
 *
 * @param {string} branch The branch to check for being a pull request
 *
 * @return {Promise<boolean>} A promise that will resolve to true if there is an
 *         open pull request
 */
async function isPullRequest(branch) {
  const pullRequests = await github({ url: 'pulls', qs: {
    head: `${GH_OWNER}:${branch}`
  } });
  return pullRequests.length > 0;
}

/**
 * Create a pull request on GitHub
 *
 * @param {object} options Options for the pull request
 * @param {string} options.title The title for the pull request (mandatory)
 * @param {string} options.body The message for the pull request (mandatory)
 * @param {string} options.head The branch from which to pull (mandatory)
 * @param {string} options.base The branch to which to merge (mandatory)
 *
 * @return {Promise<*>} The response from GitHub
 */
async function pullRequest(options) {
  const { title, body, head, base } = options;

  return github({
    url: 'pulls',
    method: 'POST',
    body: { title, body, head, base },
  })
  .catch(error => {
    console.error('ERROR:', error);
    process.exit(1);
  });
}

module.exports = { github, isPullRequest, pullRequest };
