const path = require('path');
const fs = require('fs-extra');
const OCFLRepository = require('ocfl').Repository;
const uuid = require('uuid/v4');
const argv = require('yargs').argv;
const ROCrate = require('ro-crate').ROCrate;



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
    await fs.mkdir(repoPath);
    await repo.create(repoPath);
    return repo;
  }
}


async function checkin(repo, repoName, rocratePath) {
  const rocrateFile = path.join(rocratePath, "ro-crate-metadata.json");
  try {
    const jsonld = await fs.readJson(rocrateFile);
    const crate = new ROCrate(jsonld);
    crate.index();
    const dataset = crate.getRootDataset();

    console.log("Ingesting ro-crate " + dataset['name']);

    const existingId = crate.getNamedIdentifier(repoName);

    if( existingId ) {
      console.log(`Local identifier found ${repoName}/${existingId}`);
      await repo.importNewObjectDir(existingId, rocratePath);
      console.log(`Updated ${existingId}`);
    } else {
      const newId = uuid();
      console.log(`Minting new local identifier ${repoName}/${newId}`);
      await repo.importNewObjectDir(newId, rocratePath);
      console.log(`Imported ${rocratePath} ${dataset['name']} ${newId}`);
      crate.addIdentifier({name: repoName, identifier: newId});
      await fs.writeJson(rocrateFile, crate.getJson(), {spaces: 2});
      await repo.importNewObjectDir(newId, rocratePath);
      console.log(`Updated ${rocratePath} ${newId} metadata with identifier`);
    }
  } catch(e) {
    console.log(`Error importing ${rocratePath}`);
    console.log(e);
  }
}



async function main() {

  const repoPath = argv.repo || "ocfl_demo";
  const repoName = argv.name || "ocfl_demo";
  
  const repo = await connectRepo(repoPath);

  for (let rocratePath of argv._) {
    await checkin(repo, repoName, rocratePath);
  }
}


main(); 

