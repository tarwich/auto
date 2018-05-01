/** Set release to true for anything we import that uses it */
process.env.IS_RELEASE = true;

const { exec } = require('auto');
const { resolve } = require('path');
const { writeFile } = require('fs-extra');
const { promisify } = require('util');
const debug = require('debug')('release.js');
const mkdirp = require('mkdirp');
const rmrf = require('rimraf');
const webpack = require('webpack');

const OUT_FOLDER = resolve('dist');
const PACKAGE_JSON = resolve('package.json');
const RELEASE_JSON = resolve('src/release.json');
const DIST_JSON = resolve(OUT_FOLDER, 'package.json');

const mkdirpP = promisify(mkdirp);
const writeFileP = promisify(writeFile);
const webpackP = promisify(webpack);
const rmrfP = promisify(rmrf);
const jsonToString = pojo => `${JSON.stringify(pojo, null, '  ')}\n`;

process.env.NODE_ENV = 'release';

debug('OUT_FOLDER: %o', OUT_FOLDER);

/** Main entry point for the script */
async function main() {
  debug('Beginning release...');
  const packageJson = require(PACKAGE_JSON);

  //
  // Update our version file so the build can know what version it is
  //
  debug(`Nuke the output folder: ${OUT_FOLDER}...`);
  await rmrfP(OUT_FOLDER);

  //
  // Update our version file so the build can know what version it is
  //
  debug('Updating release.json...');
  const releaseJson = require(RELEASE_JSON);
  releaseJson.version = packageJson.version;
  await writeFileP(RELEASE_JSON, jsonToString(releaseJson));

  //
  // Build the application
  //
  console.log('Building application...');
  debug('Creating output folder: ', OUT_FOLDER);
  // Make the build folder
  await mkdirpP(OUT_FOLDER);
  // Make web pack do the build
  debug('Running webpack...');
  const webpackResults = await webpackP(require(resolve('webpack.config.js')));
  const jsonResults = webpackResults.toJson();
  console.log(webpackResults.toString({ colors: true }));
  if (jsonResults.errors.length) {
    console.log(jsonResults.errors.join('\n\n'));
    process.exit(1);
  }
  await exec('git', ['add', OUT_FOLDER]);

  //
  // Update dist/package.json
  //
  debug('Creating dist/package.json');
  const distJson = {
    author: packageJson.author,
    name: packageJson.name,
    version: packageJson.version,
    main: packageJson.main.replace(/^dist\//, ''),
    types: packageJson.types.replace(/^dist\//, ''),
    license: packageJson.license,
    dependencies: packageJson.dependencies,
  };
  await writeFileP(DIST_JSON, jsonToString(distJson));

  // Stage the files for commit
  debug('Staging files for commit');
  await exec('git', ['add', DIST_JSON]);
}

// Make sure unhandled rejections are logged
process.on('unhandledRejection', error => {
  console.error('UNHANDLED REJECTION:', error.stack || error);
  process.exit(1);
});

main()
.catch(error => {
  console.log('ERROR', error.stack || error);
  process.exit(1);
});
