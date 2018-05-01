#!/usr/bin/env node

const { argv } = process;

switch (argv[2]) {
  case 'release':
    require('../actions/autorelease');
    break;
  case 'build':
    require('../actions/release');
    break;
  case 'check-package':
    require('../actions/check-package');
    break;
  case 'release-notes':
    require('../actions/release-notes');
    break;
  case 'scan-for-import-index':
    require('../actions/scan-for-import-index');
    break;
  default:
    console.error(`Auto script ${argv[2]} not supported`);
    process.exit(1);
    break;
}
