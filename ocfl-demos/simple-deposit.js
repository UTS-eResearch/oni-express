const path = require('path');
const fs = require('fs-extra');
const ocfl = require('ocfl');
const OCFLRepository = require('ocfl').Repository;
const argv = require('yargs').argv;


async function connectRepo(repoPath) {
  const repo = new OCFLRepository();
  try {
    const stat = await fs.stat(repoPath);
    if( stat.isDirectory() ) {
      await repo.load(repoPath);
      return repo;
    } else {
      console.error(`${repoPath} is not a directory`);
      process.exit(-1);
    }
  } catch(e) {
    console.error(`Stat ${repoPath} failed`);
    console.error(e);
    process.exit(-1);

  }
}


async function main() {

  const repoPath = argv.repo;
  const objectId = argv.oid;
  const contentDir = argv.content;
  const merge = argv.merge;


  if( ! repoPath ) {
    console.error("Need an --repo to deposit to");
    return;
  }

  if( ! objectId ) {
    console.error("Need an --oid to deposit to");
    return;
  }

  if( ! contentDir ) {
    console.error("Need a --content directory to deposit from");
    return;
  }

  if( merge ) {
    console.warn("Merging new content over previous version");
  }


  try {
    const stat = await fs.stat(contentDir);
    if( stat.isDirectory() ) {
      const repo = await connectRepo(repoPath);

      console.log("Connected to " + repoPath);

      await repo.importNewObjectDir(objectId, contentDir, merge);

      console.log(`Updated ${objectId}`);
    } else {
      console.error(`${contentDir} is not a directory`);
    }
  } catch( e ) {
    console.error(`An error occured while ingesting ${contentDir}`);
    console.error(e);
  }
}


main(); 

