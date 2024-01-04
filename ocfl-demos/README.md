# ocfl-demos

This is a repository for scripts and demos for the  project [FAIR Simple Scalable Static Research Data Repository Demonstrator](https://www.eresearch.uts.edu.au/2019/06/07/ardc_ocfl.htm).

Some of the data is UTS-only but the scripts are available for re-use.

## Audience

This is for NodeJS developers at UTS, and other interested parties capable of coding in node-js and advanced problem solving.

## Conventions

This guide assumes that you are working in `~/working`.

## Installation


-  Get this repository and install it:

   `git clone https://code.research.uts.edu.au/eresearch/ocfl-demos.git ~/working`

   `cd  ~/working/ocfl-demos`

   `npm install .`

### Optional: Get Calcyte

If you want to work with the examples, eg by changing metadata then you can use Calcyte:

To install calcyte-js so you can work with the test data/

-  Follow [the instructions](https://code.research.uts.edu.au/eresearch/CalcyteJS) - you do not need bagit, so that step can be skipped.

Get the examples:



## Usage 

### Get the data

*Warning* - these data sets are *BIG*.

TO fetch them:

    `make pull SRC_PATH=~/working/ocfl-demo/src`

### Add all the examples to an OCFL repository

To make all the example from calcyte:
-   `make index  REPO_PATH=~/working/ocfl-demo/repo SRC_PATH=~/working/ocfl-test-data/src` 

This will:
-  Generate RO-Crates for all the examples at `~/working/calcyte.js/test_data/`
-  Create an OCFL repository at `~/working/ocfl-demo/repo` if it does not already exist
-  Deposit all the example RO-Crates into the repository
-  Generate an index file


## TODO 

## Add more examples such as Cameron Neylon's dataset

### Port legacy datasets from the UTS Research Data Repository



### Run with data downloaded from Research Data Australia

### Add in sample data from Omeka (Farms to freeways and Dharmae)



