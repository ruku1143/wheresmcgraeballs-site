-- Fake dev data around Basingstoke. Run: npm run seed
DELETE FROM sightings WHERE ip_hash = 'seed';
INSERT INTO sightings (lat, lng, place_name, activity, note, nickname, created_at, ip_hash) VALUES
 (51.2665, -1.0870, 'The Malls', 'in the Malls', 'Strolling like he owns it', 'Spotter Sam', CAST(strftime('%s','now') AS INTEGER) - 1380, 'seed'),
 (51.2640, -1.0890, 'Festival Place', 'vibing', NULL, 'Spotter Sam', CAST(strftime('%s','now') AS INTEGER) - 9000, 'seed'),
 (51.2688, -1.0921, 'Top of the Town', 'on the mic', 'Freestyling at the bus stop', 'Dazza', CAST(strftime('%s','now') AS INTEGER) - 30000, 'seed'),
 (51.2700, -1.0790, 'Viables', 'waiting for a bus', NULL, 'Dazza', CAST(strftime('%s','now') AS INTEGER) - 70000, 'seed'),
 (51.2602, -1.0834, 'War Memorial Park', 'lost', 'Seemed confused', NULL, CAST(strftime('%s','now') AS INTEGER) - 100000, 'seed'),
 (51.2751, -1.0452, 'Chineham', 'at the pub', NULL, 'Mel', CAST(strftime('%s','now') AS INTEGER) - 150000, 'seed'),
 (51.2581, -1.1230, 'Hatch Warren', 'bare mysterious', 'Hood up. Said nothing.', 'Mel', CAST(strftime('%s','now') AS INTEGER) - 200000, 'seed'),
 (51.2812, -1.0510, 'Old Basing', 'vibing', NULL, 'Spotter Sam', CAST(strftime('%s','now') AS INTEGER) - 250000, 'seed'),
 (51.2730, -1.1100, 'Winklebury', 'other', 'Not sure what he was doing', NULL, CAST(strftime('%s','now') AS INTEGER) - 300000, 'seed'),
 (51.2450, -1.1130, 'Popley', 'on the mic', NULL, 'Dazza', CAST(strftime('%s','now') AS INTEGER) - 350000, 'seed'),
 (51.2669, -1.0868, 'The Malls', 'in the Malls', NULL, 'Mel', CAST(strftime('%s','now') AS INTEGER) - 400000, 'seed'),
 (51.2655, -1.0850, 'Station', 'waiting for a bus', 'Wrong stop', NULL, CAST(strftime('%s','now') AS INTEGER) - 450000, 'seed'),
 (51.2630, -1.0900, 'Basing View', 'at the pub', NULL, 'Spotter Sam', CAST(strftime('%s','now') AS INTEGER) - 500000, 'seed'),
 (51.2675, -1.0880, 'Market Square', 'vibing', 'Vibes immaculate', 'Dazza', CAST(strftime('%s','now') AS INTEGER) - 550000, 'seed'),
 (51.2590, -1.0700, 'Black Dam', 'lost', NULL, NULL, CAST(strftime('%s','now') AS INTEGER) - 600000, 'seed');
