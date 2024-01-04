all: setup sample plays glop GTM luckett hasan  grace landsat eco carter DVTSD MDM_AED stud vic  f2f ftir book  dharmae ftir pedestrian 

metacrate:
	metacrate  -d  $(SRC_PATH)/samples/ -n "Sample RO-Crates from a variety of sources" -t "This RO-Crate links to a set of sample crates that illustrate various different crate features" -u $(URL)samples/
	metacrate  -d  $(SRC_PATH)/UTS/ -n "Sample RO-Crates from the UTS research data repository" -t "This RO-Crate links to a set of sample crates that illustrate various different crate features"  -u $(URL)UTS/
	metacrate  -d  $(SRC_PATH)/notebooks/ -n "Sample RO-Crates exported from LabArchives" -t "This RO-Crate links to a set of sample crates that were downloaded from the LabArchives lab notebook system"  -u $(URL)notebooks/
	metacrate  -d  $(SRC_PATH)/ -n "Sample RO-Crates" -t "This RO-Crate links to multiple other crates which in turn link to examples. This is an example of 'nested meta crates'"  -u $(URL)

setup: clean
	cp ~/working/ro-crate-js/lib/crate.js  $(SRC_PATH)

index: 
	node ro-crate-deposit.js --repo=$(REPO_PATH)  $(SRC_PATH)/UTS/*
	node ro-crate-deposit.js --repo=$(REPO_PATH)  $(SRC_PATH)/samples/*
	node make-ocfl-index.js --repo $(REPO_PATH) 

clean: 
	#find $(SRC_PATH) -name ~* -delete
	#find $(SRC_PATH) -name .DS_Store  -delete

sample:  clean
	calcyfy -r $(SRC_PATH)/samples/sample  -c https://data.research.uts.edu.au/examples/ro-crate/examples/src/crate.js -z -b $(SRC_PATH)/downloads  -u https://data.research.uts.edu.au/examples/ro-crate/examples/src/downloads/sample.zip
	rm -rf $(SRC_PATH)/downloadms/sample
IDRC:  clean
	calcyfy -m 24 -z -b $(SRC_PATH)/downloads -u https://data.research.uts.edu.au/examples/ro-crate/examples/src/downloads/IDRC.zip  -r $(SRC_PATH)/samples/IDRC  -c https://data.research.uts.edu.au/examples/ro-crate/examples/src/crate.js
	rm -rf $(SRC_PATH)/downloads/IDRC
plays:  clean
	calcyfy -r $(SRC_PATH)/samples/plays  -c https://data.research.uts.edu.au/examples/ro-crate/examples/src/crate.js

glop: clean
	calcyfy -r $(SRC_PATH)/samples/Glop_Pot -c https://data.research.uts.edu.au/examples/ro-crate/examples/src/crate.js
	# TODO: needs a license

GTM: clean
	calcyfy -r $(SRC_PATH)/UTS/GTM -c https://data.research.uts.edu.au/examples/ro-crate/examples/src/crate.js

luckett: clean
	calcyfy -r $(SRC_PATH)/UTS/luckett  -c https://data.research.uts.edu.au/examples/ro-crate/examples/src/crate.js

hasan: clean
	calcyfy -r $(SRC_PATH)/TUTS/CSVT-Hasan  -c https://data.research.uts.edu.au/examples/ro-crate/examples/src/crate.js
 
grace: clean
	
	
    #TODO: Error with creators - needs debugging
	calcyfy -r $(SRC_PATH)/UTS/zunyi_xie_grace  -c https://data.research.uts.edu.au/examples/ro-crate/examples/src/crate.js

landsat: clean

	calcyfy -r $(SRC_PATH)/UTS/zunyi_xie_landsat  -c https://data.research.uts.edu.au/examples/ro-crate/examples/src/crate.js


MDM_AED: clean
	calcyfy -r $(SRC_PATH)/UTS/MDM_AED  -c https://data.research.uts.edu.au/examples/ro-crate/examples/src/crate.js

DVTSD: clean
	calcyfy $(SRC_PATH)/UTS/DVTSD  -c https://data.research.uts.edu.au/examples/ro-crate/examples/src/crate.js

stud: clean
	calcyfy -r $(SRC_PATH)/UTS/IntStudStenberg  -c https://data.research.uts.edu.au/examples/ro-crate/examples/src/crate.js


carter: clean
	calcyfy -r $(SRC_PATH)/UTS/Carter_APM  -c https://data.research.uts.edu.au/examples/ro-crate/examples/src/crate.js
	calcyfy -r $(SRC_PATH)/UTS/Carter_QAA  -c https://data.research.uts.edu.au/examples/ro-crate/examples/src/crate.js

eco: clean
	calcyfy -r $(SRC_PATH)/UTS/ecohydrology2014  -c https://data.research.uts.edu.au/examples/ro-crate/examples/src/crate.js

ftir: 
    # No data with this one - add it on server?
	calcyfy -r $(SRC_PATH)/UTS/ftir  -c https://data.research.uts.edu.au/examples/ro-crate/examples/src/crate.js

vic: clean
	calcyfy -r $(SRC_PATH)/UTS/Victoria_Arch  -c https://data.research.uts.edu.au/examples/ro-crate/examples/src/crate.js

book: clean
	calcyfy  $(SRC_PATH)/UTS/IE4783007  -c https://data.research.uts.edu.au/examples/ro-crate/examples/src/crate.js

f2f: clean
	calcyfy $(SRC_PATH)/samples/farms_to_freeways  -c https://data.research.uts.edu.au/examples/ro-crate/examples/src/crate.js


dharmae: clean
	calcyfy $(SRC_PATH)/samples/dharmae  -c https://data.research.uts.edu.au/examples/ro-crate/examples/src/crate.js

pedestrian: clean
	calcyfy $(SRC_PATH)/UTS/pedestrian_d3  -c https://data.research.uts.edu.au/examples/ro-crate/examples/src/crate.js

pull: 
    # WARNING - this is *BIG*
	mkdir -p $(SRC_PATH)
	cd $(SRC_PATH)
	wget -r -np -nH --cut-dirs=3 https://data.research.uts.edu.au/examples/ro-crate/examples/src/crate.js
	cd -

todo: clean
	# file:///Users/124411/working/ro-crate-examples/src/crate.jscuration/




