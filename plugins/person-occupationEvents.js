function occupationEvents(item, crate) {

  if (Array.isArray(item['@reverse']['person_'])) {
    const reverseRel = item['@reverse']['person_'];
    const occupationEvents = [];
    for (let r of reverseRel) {
      const po = crate.getItem(r['@id']);
      if (po['@type'] === 'OccupationEventlet') {
        occupationEvents.push(po);
      }
    }
    return occupationEvents;
  }

}

module.exports = occupationEvents;
