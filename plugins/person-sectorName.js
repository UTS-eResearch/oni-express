function sectorName(item, crate) {

  if (item["@type"].includes("Person")) {
    if (item['occupation_'] && item['occupation_']['@id']) {
      const o = crate.getItem(item["occupation_"]["@id"]);
      const s = crate.getItem(o["sector"]["@id"])
      if (s) {
        return {"@id": s["@id"], "name": s["name"]};
      }
    }
  }

}

module.exports = sectorName;
