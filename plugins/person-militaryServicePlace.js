function militaryService(item, crate) {

  if (item["@type"].includes("Person")) {
    if (item['militaryService'] && item['militaryService']['@id']) {
      const mil = crate.getItem(item["militaryService"]["@id"]);
      const placesMatch = mil.name.match(/.*\[\s*(.*?)\s*\].*/);
      if (placesMatch) {
        return placesMatch[1].split(/, */);
      }
    }
    // if (item['occupation_'] && item['occupation_']['@id']) {
    //   const o = crate.getItem(item["occupation_"]["@id"]);
    //   const s = crate.getItem(o["sector"]["@id"])
    //   if (s) {
    //     item.sectorName = s.name;
    //   }
    // }
  }

}

module.exports = militaryService;
