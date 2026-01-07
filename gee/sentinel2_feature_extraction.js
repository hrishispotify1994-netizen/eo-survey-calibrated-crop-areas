// ============================================
// Phase 2: Sentinel-2 Feature Extraction
// LUCAS 2018 Germany
// ============================================

// Load LUCAS points
var lucas = ee.FeatureCollection(
  "projects/lucassentinelproject/assets/lucas2018_DE_points"
);

// Load Sentinel-2 Surface Reflectance 
// why this dataset ? 
// 1. COPERNICUS/S2_SR = atmospherically corrected
// 2. Standard in official statistics
// 3. Stable across years

var s2 = ee.ImageCollection("COPERNICUS/S2_SR")
  .filterBounds(lucas)
  .filterDate("2018-03-01", "2018-10-31")
  .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20));

print("Sentinel-2 scenes:", s2.size());

// Cloud masking 
// Note  - Google Earth Engine updated Sentinel-2 SR: QA60 is no longer present in this collection , Cloud information is now provided via: SCL (Scene Classification Layer), MSK_CLDPRB (cloud probability), MSK_SNWPRB (snow probability)
function maskS2Clouds(image) {
  var scl = image.select("SCL");

  // Keep only clear vegetation, bare soil, water
  var mask = scl.eq(4)   // Vegetation
      .or(scl.eq(5))     // Bare soil
      .or(scl.eq(6))     // Water
      .or(scl.eq(7));    // Unclassified

  return image.updateMask(mask);
}


s2 = s2.map(maskS2Clouds);

// Computing Vegetation indices
// 1. NDVI - Mandatory for crop statistics
function addNDVI(image) {
  var ndvi = image.normalizedDifference(["B8", "B4"])
                  .rename("NDVI");
  return image.addBands(ndvi);
}

s2 = s2.map(addNDVI);

// 2. EVI - For Maize
function addEVI(image) {
  var evi = image.expression(
    '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
      'NIR': image.select('B8'),
      'RED': image.select('B4'),
      'BLUE': image.select('B2')
    }).rename('EVI');
  return image.addBands(evi);
}

s2 = s2.map(addEVI);

// Temporal composting - We create monthly composites used by EUROSAT, JRC and FAO : This was noted to create memory limit exceed error so a better approach was used.
//var months = ee.List.sequence(3, 10);

//var monthly = ee.ImageCollection.fromImages(
//  months.map(function(m) {
//    var start = ee.Date.fromYMD(2018, m, 1);
//    var end = start.advance(1, "month");

//    return s2.filterDate(start, end)
//      .median()
//      .select(["NDVI", "EVI"])
//      .set("month", m);
//  })
//);

// STEP 1 = Adding month as image property
s2 = s2.map(function(img) {
  var month = ee.Date(img.get("system:time_start")).get("month");
  return img.set("month", month);
});

// STEP 2 = Sample EACH image at LUCAS points (lightweight) - This extracts only few thousand pixels and usses little memory
var sampled = s2.map(function(img) {
  return img.sampleRegions({
    collection: lucas,
    properties: ["POINT_ID", "crop_class", "NUTS2"],
    scale: 10,
    geometries: false
  }).map(function(f) {
    return f.set("month", img.get("month"));
  });
}).flatten();


// STEp 3 = Temporal aggregation (monthly median PER POINT) - This gives statistics per month and not point
var months = ee.List.sequence(3, 10);

var monthlySamples = ee.FeatureCollection(
  months.map(function(m) {
    var monthlyData = sampled.filter(ee.Filter.eq("month", m));
    return monthlyData.reduceColumns({
      reducer: ee.Reducer.median().repeat(2),
      selectors: ["NDVI", "EVI"]
    });
  })
);

// export sampled datasets - this export will not hit memory limits 
Export.table.toDrive({
  collection: sampled,
  description: "lucas2018_DE_S2_point_samples",
  fileFormat: "CSV"
});

// This will generate a CSV which will be later computed in python 
