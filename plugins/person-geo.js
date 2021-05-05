// Given a crate, and a starting point returen a GeoJSON feature collection found by traversing the crate
const GeoJSON = require("geojson");



function findGeo(person, crate) {
  // Find out where a person was convicted by looking for Actions which have a location, which has a geo property
  const convictions = crate.resolve(person, [{"property": "conviction"}]);
  const places = []; // Gonna feed this to the map once it has been turned into GeoJSON
  if( convictions ) {
    for (let c of convictions) {
      const convictionPlace = crate.resolve(c, [{"property": "location"}])
      const convictionGeo = crate.resolve(convictionPlace, [{"property": "geo"}]);
      if (convictionGeo) {
        const convictionGeoData = {
          "id": c["@id"],
          "url": c["@id"],
          name: c.name,
          "latitude": Number(convictionGeo[0].latitude),
          "longitude": Number(convictionGeo[0].longitude),
          description: c.name,
          startDate: c.startTime,
          endDate: c.endTime
        }

        places.push(convictionGeoData);
      }
    }


  }
  return GeoJSON.parse(places, {Point: ['latitude', 'longitude']});
}



module.exports = findGeo;
