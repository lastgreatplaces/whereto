UPDATE weights -- Replace with your actual table name
SET weight_value = CASE 
    WHEN factor_name = 'facet_types' THEN 40
    WHEN factor_name = 'native_veg_types' THEN 20
    WHEN factor_name = 'footprint' THEN 40
    ELSE weight_value -- Keep the same if it doesn't match
END
WHERE factor_name IN ('facet_types', 'native_veg_types', 'footprint');

select * from v_landscape_rankings

TRUNCATE TABLE facet_target_curve;
INSERT INTO facet_target_curve (facet_total_acres, facet_target_acres) VALUES
(10,10),
(100,80),
(1000, 500),
(10000, 3000),
(25000, 6000),
(50000, 8000),
(100000, 10000),
(150000, 20000),
(500000, 40000),
(1000000, 50000),
(5000000, 100000),
(25000000, 250000)