function militaryService(item, crate) {

  if (item["@type"].includes("Person")) {
    if (item['militaryService'] && item['militaryService']['@id']) {
      const mil = crate.getItem(item["militaryService"]["@id"]);
      const placesMatch = mil.name.match(/.*\[\s*(.*?)\s*\].*/);
      if (placesMatch) {
        return placesMatch[1].split(/, */);
      }
    }
  }

}

module.exports = militaryService;
