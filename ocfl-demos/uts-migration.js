/* Migrate legacy UTS datasets from a directory to an OCFL reposticory */


const path = require('path');
const fs = require('fs-extra');
const ocfl = require('ocfl');
const OCFLRepository = require('ocfl').Repository;
const uuid = require('uuid/v4');
const argv = require('yargs').argv;
const ROCrate = require('ro-crate').ROCrate;
const rimraf = require('rimraf');


async function connectRepo(repoPath) {
  const repo = new OCFLRepository();
  try {
    const stat = await fs.stat(repoPath);
    if (stat.isDirectory()) {
      await repo.load(repoPath);
      return repo;
    } else {
      console.error(`${repoPath} is not a directory`);
      process.exit(-1);
    }
  } catch (e) {
    await fs.mkdir(repoPath);
    await repo.create(repoPath);
    return repo;
  }
}

function removeDir(dir) {
  rimraf(dir, {}, (err) => {
    if (err) {
      return Promise.reject(err);
    } else {
      return Promise.resolve();
    }
  });
}

//  [{"id": " ... ", "doi": "...", "dir": "dir-name of crate", "url": "existing repo URL"}, ...]
async function addItem(repo, repoName, crateInfo, tempDir) {
  // Make a copy of the dataset - assume it has both index.html AND ro-crate stuff in it
  const roCrateFile = path.join(tempDir, 'ro-crate-metadata.jsonld');
  const roCrateFileSrc = path.join(crateInfo.dir, 'ro-crate-metadata.jsonld');
  const previewFile = path.join(tempDir, 'ro-crate-preview.html');
  const previewFileSrc = path.join(crateInfo.dir, 'ro-crate-preview.html');
  const indexFile = path.join(tempDir, 'index.html');
  const catalogWildCard = path.join(tempDir, 'CATALOG*');

  await fs.copy(crateInfo.dir, tempDir);
  await fs.remove(roCrateFile);
  await fs.remove(previewFile);
  await repo.importNewObjectDir(crateInfo.id, tempDir);

  // Remove legacy index file and add RO-Crate files
  await fs.remove(indexFile);
  await removeDir(catalogWildCard);
  await fs.copy(roCrateFileSrc, roCrateFile);
  await fs.copy(previewFileSrc, previewFile);


  // Make a crate
  const jsonld = await fs.readJson(roCrateFile);
  const crate = new ROCrate(jsonld);
  crate.index();
  const dataset = crate.getRootDataset();
  crate.addIdentifier({name: repoName, identifier: crateInfo.id});
  if (!(dataset.identifier.includes(crateInfo.doi))) {
    dataset.identifier.push(crateInfo.doi);
  }
  await fs.writeJson(roCrateFile, crate.getJson(), {spaces: 2});
  await repo.importNewObjectDir(crateInfo.id, tempDir);
  console.log(`Added ${roCrateFile}  metadata with identifier ${crateInfo.id}`);
  //
}


async function main() {
  const repoPath = argv.repo || 'ocfl_demo';
  const repoName = argv.name || 'ocfl_demo';
  const temp = argv.temp || 'temp';
  const repo = await connectRepo(repoPath);
  const crateList = await fs.readJson(argv.input);
  for (let crateInfo of crateList) {
    if (!crateInfo.skip) {
      const tempDir = path.join(temp, path.basename(crateInfo.dir));
      await addItem(repo, repoName, crateInfo, tempDir);
    }
  }
}


main(); 

