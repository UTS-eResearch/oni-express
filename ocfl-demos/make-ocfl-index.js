// Simple Demo script to show usage

const path = require('path');
const fs = require('fs-extra');
const ocfl = require("ocfl");
console.log(ocfl);
const OCFLRepository = require('ocfl').Repository;
var argv = require('yargs').argv;
var Utils  = require("ro-crate").Utils
var ROCrate = require('ro-crate').ROCrate;
var utils = new Utils();


// This is an asynchronous library so you need to call using await, or use promises


async function main() {
  // OCFL repo - exsists?
  const repoPath = argv.repo ? argv.repo : "ocfl_demo";
  const repoName = argv.name || "ocfl_demo";

  // Make or open a database
  // Get or open an OCFL repo
  var repo = new OCFLRepository();
  var index = [];
  var init = await repo.load(repoPath);
  var objects = await repo.objects();
  var p;
  for (let o of  Object.keys(objects)) {
    var object = objects[o];
    const inv = await (object.getInventory());
    var headState = inv.versions[inv.head].state;
    for (let hash of Object.keys(headState)){
        if (headState[hash].includes("ro-crate-metadata.jsonld")) {
            p = inv.manifest[hash][0];
            break;
        }
    }

    var rocrateFile = path.join(object.path, p);
    console.log("GOT", rocrateFile);
    var json =  JSON.parse(fs.readFileSync(rocrateFile));
    crate = new ROCrate(json);
    crate.index();
    var dataset = crate.getRootDataset()
    var identifier = crate.getNamedIdentifier(repoName);
    console.log(identifier, dataset.name, p);
    var newItem = {
        "@id": identifier,
        uri_id: identifier,
        name: utils.asArray(dataset.name)[0],
        description: utils.asArray(dataset.description)[0],
        path: object.path
    }
    index.push(newItem);

    fs.writeFileSync(path.join(repo.path, "index.json"), JSON.stringify(index, null, 2));
    /* 
    TODO

    - Find the dataset []

    - Sumamarize it

    - add to an index object

    - write out the object

    */

  }
}





main(); 

