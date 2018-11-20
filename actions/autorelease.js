// Putting this up here to serve as help for people who open this script
/*
This script will bump package.json to a new version and commit the results to
git. If you have a 'release' script in your package.json, then it will be
executed prior to the commit. Presumably this would be to update any binaries
that need updated upon release.

All you have to do in order to create a release is push to one of the following
branches, and an appropriate release and PR will be created:

release, release/patch, release/minor, release/major

The default type is "patch". This script will automatically increment version
numbers for you based on the release type.

options:
  --script: A script to run after package.json has been update and before the
            files are committed. You can do things like run a specific build
            process for your application with this argument. When your script is
            finished, it should stage its files with 'git add' so that they will
            be committed with this version.

This script needs three environment variables:

AUTORELEASE_BASE:  The base branch for pull requests. Defaults to 'master'
AUTORELEASE_KEY:   Please create a deploy key with write access and
                   paste the private key in this environment variable. You can
                   separate multiple lines with a literal \n if necessary. You
                   can create a key on linux / osx with "ssh-keygen -f ./key"
                   and you can upload the public key to /settings/keys on your
                   repo (https://github.com/:owner/:repo/settings/keys)
AUTORELEASE_TOKEN: Create a personal access token by going to
                   https://github.com/settings/tokens
*/

// The new way uses some new keys, but I haven't updated them in wercker yet, so
// copy the old keys into the new keys
process.env.GH_KEY = process.env.AUTORELEASE_KEY;
process.env.GH_OWNER = process.env.WERCKER_GIT_OWNER;
process.env.GH_REPO = process.env.WERCKER_GIT_REPOSITORY;
process.env.GH_TOKEN = process.env.AUTORELEASE_TOKEN;

const { config: gitConfig, exec, github, pullRequest, setupGitSsh } = require('auto');
const { diff } = require('semver');
const { inspect, promisify } = require('util');
const { readFile, writeFile } = require('fs');
const { resolve } = require('path');

const readFileP = promisify(readFile);
const writeFileP = promisify(writeFile);

// Import environment variables
const {
  WERCKER_GIT_BRANCH,
  WERCKER_GIT_OWNER,
  WERCKER_GIT_REPOSITORY,
} = process.env;

/**
 * Create a pull request into the destination branch
 *
 * If the pull request does not exist, then it will be created.
 *
 * If the pull request exists, and the title is wrong, then it will be updated.
 *
 * If the pull request exists, and the title is correct, then nothing will be
 * done.
 *
 * @param {string} base The branch into which the pull request will go
 * @param {string} version The version of this pull request
 */
async function createOrUpdatePullRequest(base, version) {
  console.log(`Creating pull request to ${base}`);
  const [existingPullRequest] = await github({
    url: 'pulls',
    qs: {
      head: `${WERCKER_GIT_OWNER}:${WERCKER_GIT_BRANCH}`,
      base: base,
      state: 'open',
    },
  })
  .catch(error => {
    console.error('ERROR:', error);
    process.exit(1);
  });
  console.log(existingPullRequest);

  // Create the pull request if needed
  //
  if (!existingPullRequest) {
    console.log(`Creating pull request to ${base}`);
    console.log(await pullRequest({
      title: `Release ${version} (${base})`,
      body: `Auto build of release ${version}`,
      head: WERCKER_GIT_BRANCH,
      base,
    }));
  }

  // Pull request exists and is ok
  //
  else if (existingPullRequest.title === `Release ${version} (${base})`)
    console.log(`Pull request to ${base} exists`);

  // If the pull request exists, make sure the title is right
  //
  else {
    console.log(`Updating pull request title for ${base}`);
    console.log(await github({
      method: 'PATCH',
      url: `pulls/${existingPullRequest.number}`,
      body: {
        title: `Release ${version} (${base})`,
        body: `Auto build of release ${version}`,
        head: WERCKER_GIT_BRANCH,
        base,
      },
    }));
  }
}

/**
 * Check the pull request for the current run and make sure that if there is an
 * open pull request, that it is not pointed to master
 */
async function makeSureThePullRequestIsNotToMaster() {
  // It's ok if it comes from a release branch
  if (WERCKER_GIT_BRANCH === 'release' || WERCKER_GIT_BRANCH === 'pre-release')
    return;

  const [existingPullRequest] = await github({
    url: 'pulls',
    qs: {
      head: `${WERCKER_GIT_OWNER}:${WERCKER_GIT_BRANCH}`,
      base: 'master',
      state: 'open',
    },
  });

  if (existingPullRequest) {
    console.log(`
      There is an open pull request for this branch that is pointed to master.
      Please change the base of that pull request, and restart this build. The
      pull request is at: ${existingPullRequest.url}

      Once you have fixed that pull request, you will need to manually restart
      this build in wercker, or push another commit to the branch.
    `);
    throw new Error('Invalid base branch in open pull request');
  }
}

/**
 * Entry point function
 *
 * @return {Promise<void>} A promise just for the sake of making this function
 * async
 */
async function preRelease() {
  console.log('\n------RUNNING PRE-RELEASE-------');

  // Configure git
  await setupGitSsh();
  await gitConfig({
    'user.email': 'samuel+voidbot@voidray.co',
    'user.name': 'Autorelease Script',

    'remote.origin.fetch': '+refs/heads/*:refs/remotes/origin/*',
    'remote.origin.url': `git@autorelease:${WERCKER_GIT_OWNER}/${WERCKER_GIT_REPOSITORY}`,
  });
  await exec('git', ['fetch']);
  await exec('git', ['checkout', WERCKER_GIT_BRANCH]);

  // Check to see if this pull request is going to master, and if it is, then
  // reject it automatically
  await makeSureThePullRequestIsNotToMaster();

  // Don't run if the commit was from this script
  const author = await exec('git', ['log', '-n', '1', '--pretty=format:%an']);

  if (author === 'Autorelease Script') {
    console.log(`This commit was from ${author}. Refusing to re-release.`);
    process.exit(0);
  }

  else console.log('Valid author for autorelease:', author);

  // Update the release notes
  console.log(await exec('node', [resolve(__dirname, './release-notes')]));

  // Get the release number from RELEASE_NOTES.md
  const releaseNotes = await readFileP('RELEASE_NOTES.md', { encoding: 'utf-8' });
  const NEXT_VERSION = (releaseNotes.match(/## *([\d\.]+)/) || [])[1];

  // See what kind of release we're doing
  const devJson = JSON.parse(await exec('git', ['show', 'origin/dev:package.json']));
  const RELEASE_TYPE = (diff(
    NEXT_VERSION || '0.0.0',
    devJson.version || '0.0.0'
  ) || '').toUpperCase();

  console.log(`CURRENT VERSION: ${devJson.version} NEXT_VERSION: ${NEXT_VERSION}.`);

  //
  // Set the version number in package.json
  //
  const packageJson = require(resolve('package.json'));

  if (RELEASE_TYPE) {
    console.log(`Preparing ${RELEASE_TYPE} release from ${devJson.version} to ${NEXT_VERSION}`);

    // Update package.json
    packageJson.version = NEXT_VERSION;
    await writeFileP(
      resolve('package.json'),
      JSON.stringify(packageJson, null, '  ') + '\n'
    );
  }

  //
  // Run the release script
  //
  if (packageJson.scripts && packageJson.scripts.release) {
    console.log('Running release...');
    console.log(await exec('npm', ['run', 'release']));
  }
  else if (packageJson.scripts)
    console.log('No release in package.json', inspect(packageJson.scripts, { colors: true }));
  else
    console.log('No release script in package.json');

  // Don't actually make a release if we're not on the release branch
  if (WERCKER_GIT_BRANCH !== 'release') {
    console.error('This is not the pre-release branch, so not creating a pre-release');
    return;
  }

  // If the version number is unchanged since the last release, then don't
  // release
  if (!RELEASE_TYPE) {
    console.log('No change in release version. Not creating a release');
    return false;
  }

  console.log(await exec('git', ['status']));

  // Force add all files in the dist directory
  await exec('git', ['add',
    '-f',
    'dist',
  ]);

  // Create the git commit
  const commitResult = await exec('git', ['commit',
    '-a',
    '-m', `Release ${NEXT_VERSION}`,
  ])
  .catch(error => {
    // Swallow this error message
    if (!/nothing to commit/i.test(error.message || error)) throw error;
  });
  console.log(commitResult);
  console.log(await exec('git', ['status']));

  console.log(`Pushing back to ${WERCKER_GIT_BRANCH}`);
  await exec('git', ['push', '--verbose', 'origin', WERCKER_GIT_BRANCH]);
  await exec('git', ['push', '--force', 'origin', 'HEAD:pre-release']);

  // Check if the request exists already
  console.log('Checking for a pre-existing pull request');

  // Pull requests
  await createOrUpdatePullRequest('dev', NEXT_VERSION);
  await createOrUpdatePullRequest('master', NEXT_VERSION);
}

/**
 * Function to release the distribution to aws if AWS properties were provided
 */
async function awsUpload() {
  const packageJson = require(resolve('package.json'));
  const upload = require('./aws-upload');
  const DIST_FOLDER = resolve('dist');

  const {
    AWS_BUCKET
  } = process.env;

  // We only attempt an upload if the AWS_BUCKET is specified
  if (!AWS_BUCKET) {
    return;
  }

  console.log('\n------AWS Upload------');

  // Tar the dist folder contents and upload to S3 so projects can reference the library
  // We get the Bucket Key and Resource Path from AWS_BUCKET but we provide the file name
  // dynamically from this process.
  await upload({
    awsFileName: `${packageJson.version}.tar.gz`,
    directory: DIST_FOLDER,
    makePublic: true,
    tarPath: resolve('dist.tar.gz'),
  });

  console.log('AWS Upload complete');
}

/**
 * Function to cut the release in GitHub and update the release notes
 *
 * @return {Promise} A promise that will be resolved when the release is
 * completed
 */
async function release() {
  console.log('\n------RELEASE-------');

  if (WERCKER_GIT_BRANCH !== 'master') {
    console.error('This is not the master branch, so not creating a release');
    return;
  }

  // Get the release number from RELEASE_NOTES.md
  const releaseNotes = await readFileP('RELEASE_NOTES.md', { encoding: 'utf-8' });
  const NEXT_VERSION = (releaseNotes.match(/## *([\d\.]+)/) || [])[1];

  // See what kind of release we're doing
  const devJson = JSON.parse(await exec('git', ['show', 'HEAD^1:package.json']));
  const RELEASE_TYPE = (diff(NEXT_VERSION, devJson.version) || '').toUpperCase();

  console.log(`Current version ${devJson.version} -> Next version ${NEXT_VERSION}`);

  if (!RELEASE_TYPE) {
    console.error('There is no change to the release. Not making release notes');
    return;
  }

  console.log(`Creating ${RELEASE_TYPE} release from ${devJson.version} to ${NEXT_VERSION}`);

  // Get the release notes
  const notes = (releaseNotes.match(/##[\d\. ]+\n((?:.*|\s*)*?)(?=##|$)/) || [])[1];

  // Create the tag
  return github({
    method: 'POST',
    url: '/releases',

    body: {
      tag_name: NEXT_VERSION,
      target_commitish: 'master',
      name: NEXT_VERSION,
      body: `## Changes\n\n${notes.trim()}`,
    },
  });
}

process.on('unhandledRejection', error => {
  console.error('Unhandled rejection', error.stack || error);
  process.exit(1);
});

preRelease()
.then(awsUpload)
.then(release)
.catch(error => {
  console.error('ERROR:', error.stack || error);
  process.exit(1);
});

