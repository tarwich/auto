/**
 * The method exported from this file is used to analyze options and environment variables
 * to tar the contents of a directory and upload the tarball to an AWS S3 file system.
 *
 * This is an example to use this method straight from the command line (fish shell):
 *
 * env
 *  TEST=true
 *  AWS_ACCESS_KEY_ID=<insert your AWS access key here>
 *  AWS_SECRET_ACCESS_KEY=<insert your AWS secret access key here>
 *  AWS_PUBLIC=<set this to true to make the uploaded file public>
 *  AWS_BUCKET=<set this to bucketName/path/to/file/filename.tar.gz
 *  AWS_UPLOAD=<set this to the directory you want uploaded>
 *  AWS_TAR_PATH=<set this to the path the tar gets saved to the local disk before getting uploaded>
 * node actions/aws-upload.js
 *
 * The Javascript interface is pretty simple. It follows the same security Key protocal as aws-sdk does.
 * Thus run your program with the security key in the environment vars. The following shows an example
 * where the environment provides the AWS resource path and the javascript provides the resource name and some
 * other configurations. Javascript options superscedes environment options:
 *
 * const upload = require('./actions/aws-upload.js');
 *
 * upload({
 *  // This is js config to override just the AWS resource filename and not the whole path
 *  // thus the AWS resource will be <AWS_BUCKET>/fileName.tar.gz
 *  awsFileName: 'fileName.tar.gz',
 *  directory: resolve('directory/to/be/tarred'),
 *  makePublic: true,
 *  tarPath: resolve('dist.tar.gz'),
 * });
 */

const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const fs = require('fs');
const path = require('path');
const tar = require('tar');
const util = require('util');

const exists = util.promisify(fs.exists);
const lstat = util.promisify(fs.lstat);
const readdir = util.promisify(fs.readdir);
const createBucket = util.promisify(s3.createBucket.bind(s3));
const putObject = util.promisify(s3.putObject.bind(s3));
const readFile = util.promisify(fs.readFile);

const {
  TEST
} = process.env;

/**
 * Tars the specified directory's CONTENTS (not the directory itself).
 */
async function tarDirectory(directory, toPath) {
  // Make our path resolve to an absolute path
  toPath = path.resolve(toPath);
  // Store the current working directory so we can return to it with no issue
  const cwd = process.cwd();

  try {
    const fileExists = await exists(directory);

    if (!fileExists) {
      throw new Error(`AWS Upload Error: A directory was specified that does not exist: ${directory}`);
    }

    const stat = await lstat(directory);

    if (!stat.isDirectory()) {
      throw new Error('AWS Upload Error: Can not TAR a file directly. Please specify a directory who\'s contents should be tarred and uploaded');
    }

    // Move our process to the directory so we can tar with a '.' path thus making the tar grab the contents
    // of the directory and not tar a long list of directories into the tar.
    process.chdir(directory);

    // Prep our params for the tar operation, we want to mimick 'tar czf ./file,.tgz  [files]'
    const params = {
      gzip: true,
      file: path.resolve(toPath),
    };

    console.log('Tarring directory:', process.cwd());
    console.log('Writing tar to:', toPath);

    // Tar the file
    await tar.c(params, ['.']);
    // Return to original working directory
    process.chdir(cwd);
  }

  catch(err) {
    process.chdir(directory);
    throw err;
  }
}

/**
 * options {
 *   directory: The directory who's contents we upload
 *   tarPath: The path where the tar file should be saved. Default is '.'
 *   bucketPath: The path for the bucket and file path to upload to in AWS <bucket name>/<file path>
 *   awsFileName: The name of the file to use in the AWS system
 *   makePublic: Set to true if the file is supposed to be public in the AWS repo
 * }
 * This uploads a directory to AWS using the aws-sdk by tarring the contents of the directory then using
 * the sdk to upload the file.Normal rules apply for the awk-sdk authentication.
 *
 * The recommended authentication method for this method is to use the environment variables.
 * AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 *
 * This supports taking the file path to upload as a parameter or from the environment var:
 * AWS_UPLOAD
 *
 * This is the path
 * AWS_TAR_PATH
 *
 * This supports taking the path for the bucket to upload to via parameter bucketPath or env:
 * AWS_BUCKET
 *
 * @returns An error message if the upload failed. Nothing if successful.
 */
async function awsTarUpload(options = {}) {
  const {
    // When this is defined with valid content, autorelease will attempt to upload a tar of the
    // distribution with the provided credentials. This should be populated in the following fashion:
    // <bucket name>/<path to file>
    AWS_BUCKET,
    // This should be provided to indicate which directory to upload
    AWS_UPLOAD,
    // The path of the tar file's save location
    AWS_TAR_PATH,
    // When set, makes the uploaded file public
    AWS_PUBLIC,
  } = process.env;

  const {
    awsFileName = '',
    bucketPath = AWS_BUCKET || '',
    directory = AWS_UPLOAD || '',
    makePublic = Boolean(AWS_PUBLIC),
    tarPath = AWS_TAR_PATH || '',
  } = options;

  // Split the path so we can use the start as the bucket name and the rest as the file pathing
  const bucketPathing = bucketPath.split('\/');
  // This is the selected path for uploading to the system
  const pathToUpload = directory || AWS_UPLOAD;

  // Bucket names must be unique across all S3 users
  const myBucket = bucketPathing[0];

  if (awsFileName) {
    // Add the file name as a part of the pathing
    bucketPathing.push(awsFileName);
  }

  const myKey = bucketPathing.slice(1).join('/');

  // Validate all inputs for the process
  if (!bucketPath || !bucketPathing || !pathToUpload) {
    reject(new Error(`All needed inputs for the AWS upload were not provided or invalid. bucket: ${myBucket}, bucketPath: ${myKey}, toUpload: ${pathToUpload}`));
    return;
  }

  // Tar the specified directory
  await tarDirectory(pathToUpload, tarPath);
  // Now read in the tar file to be uploaded to AWS
  const tar = await readFile(path.resolve(tarPath));
  // Make sure the bucket itself is created
  await createBucket({Bucket: myBucket});

  const params = {
    Bucket: myBucket,
    Key: myKey,
    Body: tar,
  };

  if (makePublic) {
    params.ACL = 'public-read';
  }

  // Put the object into the bucket
  await putObject(params);

  console.log(`Successfully uploaded data to http://s3.amazonaws.com/${myBucket}/${myKey}`);
  return true;
}

// Executes this method automatically allowing for use of the method from the console.
if (TEST) {
  awsTarUpload();
}

module.exports = awsTarUpload;
