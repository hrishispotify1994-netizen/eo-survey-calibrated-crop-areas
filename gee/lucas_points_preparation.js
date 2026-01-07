var lucas_table = ee.FeatureCollection(
  "projects/lucassentinelproject/assets/lucas2018_DE_phase1_ground_truth"
);

print(lucas_table.limit(5));

var lucas_points = lucas_table.map(function(f) {
  var lon = ee.Number(f.get("TH_LONG"));
  var lat = ee.Number(f.get("TH_LAT"));
  var point = ee.Geometry.Point([lon, lat]);
  return f.setGeometry(point);
});

Map.addLayer(lucas_points, {}, "LUCAS points");
Map.centerObject(lucas_points, 6);

Export.table.toAsset({
  collection: lucas_points,
  description: "lucas2018_DE_points",
  assetId: "projects/lucassentinelproject/assets/lucas2018_DE_points"
});



