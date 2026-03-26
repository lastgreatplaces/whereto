SELECT * FROM public.weights
update weights
set facets_variety=5,
facets_pct_eco=20,
veg_variety=5,
veg_pct_eco=20,
landform_structure=0,
veg_structure=0,
footprint=30,
management=10,
designation = 10,
complementarity=.20,     -- reduced from .67
candidate_pct = 20.0,   -- keep top 20% in each ecoregion
candidate_floor = 12   -- but always keep at least top 12
;   

