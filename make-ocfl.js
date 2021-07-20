#!/usr/bin/env node

const path = require('path');
const fs = require('fs-extra');
const ocfl = require('ocfl');
const OCFLRepository = require('ocfl').Repository;

const REPODIR = './ocfl';
const RO_CRATE_METADATA = 'ro-crate-metadata.json';

const argv = require('yargs')
    .usage('Useage: $0 --dir ./dir')
    .describe('d', 'a directory containing subdirectories with RO-Crates')
    .alias('d', 'dir')
    .string('d')
    .help('h')
    .alias('h', 'help')
    .demandCommand()
    .recommendCommands()
    .strict()
    .argv;


async function isDir(dir) {
  try {
    const stat = await fs.stat(dir);
    if( stat.isDirectory() ) {
      return true;
    }
  } catch (e) {
    if( e.code === 'ENOENT' ) {
      return false;
    } else {
      console.error(e);
      return false;
    }
  }
}


async function connectRepo(repoPath) {
  const exists = await isDir(repoPath);
  if( !exists ) {
    return false;
  }
  
  try {
    const repo = new OCFLRepository();
    await repo.load(repoPath);
    return repo;
  } catch(e) {
    try {
      const repo = new OCFLRepository();
      await repo.create(repoPath);
      return repo;
    } catch(e) {
      console.log('Error initialising repository');
      console.log(e.message);
      return false;
    }
  }
}  

async function loadCrates(dir) {
  try {
    const stat = await fs.stat(path.join(dir, RO_CRATE_METADATA));
    if( stat.isFile() ) {
    // have to get an id for this more legitimately
      return { 'root': dir };
    } else {
      console.error(`There is a ${RO_CRATE_METADATA} in ${dir} but it isn't a file`);
      process.exit(-1);
    }
  } catch(e) {
    const contents = await fs.readdir(dir);
    const results = {};
    for( let c of contents ) {
      const stat = await fs.stat(path.join(dir, c));
      if( stat.isDirectory() ) {
        results[c] = path.join(dir, c);
      }
    }
    return results;
  }
}


async function main() {

  const contentDir = argv.dir;

  if( ! contentDir ) {
    console.error("Need a --dir directory to deposit from");
    return;
  }

  const repoDir = path.join(process.cwd(), REPODIR);
  const fullDir = path.join(process.cwd(), contentDir);

  const dirExists = await isDir(fullDir);
  if( !dirExists ) {
    console.error(`${fullDir} is not a directory`);
    process.exit(-1);
  }

  const repo = await connectRepo(repoDir);

  if( !repo ) {
    console.error(`Couldn't connect to or initialise ${repoDir}`);
    process.exit(-1);
  }

  const crates = await loadCrates(fullDir);

  console.log("Importing to ocfl at " + repoDir);
  for ( let crateId in crates ) {
    console.log(`Importing ${crateId}`);
    await repo.importNewObjectDir(crateId, crates[crateId], false);
  }
  console.log("Done");
}


main(); 

