// ===============================
// Phase 2B – Sentinel-1 features
// ===============================

// 1. Load LUCAS points
var lucas_fc = ee.FeatureCollection(
  "projects/lucassentinelproject/assets/lucas2018_DE_points"
);

print("lucas size:", lucas_fc.size());

// Load sentinel-1
var s1 = ee.ImageCollection("COPERNICUS/S1_GRD")
  .filterBounds(lucas_fc)
  .filterDate('2018-03-01', '2018-10-31')
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'));

print("S1 raw size:", s1.size());
//Convert to dB (critical)
function toDB(img) {
  return img.select(['VV','VH'])
    .log10()
    .multiply(10)
    .copyProperties(img, ['system:time_start']);
}

s1 = s1.map(toDB);

// Add VV/VH ratio
function addRatio(img) {
  var ratio = img.select('VV').subtract(img.select('VH')).rename('VV_VH');
  return img.addBands(ratio);
}

s1 = s1.map(addRatio);

//Monthly composites
var months = ee.List.sequence(3, 10);

var s1_monthly = ee.ImageCollection(
  months.map(function(m) {
    var monthly = s1.filter(ee.Filter.calendarRange(m, m, 'month'))
                .median()
                .unmask(-999);

    return monthly.set('month', m);
  })
);

print("S1 monthly size:", s1_monthly.size());

//Sample at LUCAS points
var s1_samples = s1_monthly.map(function(img) {
  return img.sampleRegions({
    collection: lucas_fc,
    properties: ['POINT_ID', 'crop_class', 'NUTS2'],
    scale: 10,
    geometries: false
  }).map(function(f) {
    return f.set('month', img.get('month'));
  });
}).flatten();

print("S1 samples size:", s1_samples.size());
//Export CSV
Export.table.toDrive({
  collection: s1_samples,
  description: 'S1_LUCAS_2018_features',
  fileFormat: 'CSV'
});
