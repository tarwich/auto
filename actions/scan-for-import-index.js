const { readdir, readFile, stat } = require('fs');
const { resolve } = require('path');
const { promisify } = require('util');

const readdirP = promisify(readdir);
const readFileP = promisify(readFile);
const statP = promisify(stat);

const RE_INDEX = /import.*from.*(\bindex\b|[\./]+["']).*/ig;
const RE_NON_RELATIVE = /import.*from.*["'](\w.*)["']/ig;

/**
 * Process dir and all its subdirectories for import problems
 *
 * @param {string} dir The directory to process
 */
async function processDir(dir) {
  const files = await readdirP(dir);

  for (const file of files) {
    // Ignore certain things
    if (['.git', '.vscode', '.', '..'].indexOf(file) !== -1) continue;
    const fullFile = resolve(dir, file);
    const stats = await statP(fullFile);

    if (stats.isDirectory()) await processDir(fullFile);
    else {
      const data = await readFileP(fullFile, { encoding: 'utf-8' });
      {
        const matches = data.match(RE_INDEX);

        if (matches) {
          console.error(`${fullFile}: File contains an index import: \n${matches.join('\n')}`);
          process.exitCode = 1;
        }
      }

      {
        const matches = (data.match(RE_NON_RELATIVE) || [])
        // Check all imports for something that can be resolved in node_modules
        .filter(match => {
          const captures = match.match(new RegExp(RE_NON_RELATIVE, 'i'));
          // HACK: Add the path to the node_modules of the project that
          // required this script
          require.main.paths.push(resolve('node_modules'));
          try {
            return !require.resolve(captures[1]);
          }
          catch (error) {
            return true;
          }
        });

        if (matches && matches.length) {
          console.error(
            `${fullFile}: File contains an non-relative import: \n`,
            matches.join('\n'),
            '\n'
          );
          process.exitCode = 1;
        }
      }
    }
  }
}

/** The main entry point for this script */
async function main() {
  await processDir(resolve('src'));
}

process.on('unhandledRejection', error => {
  console.error('UNHANDLED REJECTION:', error.stack || error);
  process.exit(1);
});

main()
.catch(error => {
  console.error('ERROR', error.stack || error);
  process.exitCode = 1;
});
