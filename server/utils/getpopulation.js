const axios = require("axios");

// 🔹 Fetch population from GeoDB
async function fetchPopulation(lat, lon) {
  try {
    const url = `https://wft-geo-db.p.rapidapi.com/v1/geo/locations/${lat}+${lon}/nearbyCities`;

    const res = await axios.get(url, {
      headers: {
        "X-RapidAPI-Key": process.env.GEODB_API_KEY,
        "X-RapidAPI-Host": "wft-geo-db.p.rapidapi.com"
      },
      timeout: 5000
    });

    const city = res.data.data[0];

    if (!city) {
      console.log("⚠️ No city found");
      return null;
    }

    console.log("🌆 City:", city.city, "Population:", city.population);

    return {
      name: city.city,
      population: city.population
    };

  } catch (err) {
    console.log("❌ Population ERROR:", err.response?.data || err.message);
    return null;
  }
}

// 🔹 Classification logic
function classifyByPopulation(population) {
  if (!population) return "rural";

  if (population > 10000000) return "metro";
  if (population > 500000) return "urban";
  return "rural";
}


// 🔥 Export
module.exports = {
  fetchPopulation,
  classifyByPopulation
};