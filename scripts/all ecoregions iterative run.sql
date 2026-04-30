-- run iterative selection for al lecoregions ~4 mins
do $$
begin
    perform public.run_ecoregion_selection_iterative(eco_id, 20, 0.20)
    from (select distinct eco_id from v_landscape_rankings) t;
end
$$;

select * from ecoregion_selection_log  
where name like '%National Monument%' or name like '%NM%'
or name like '%National Park%'
or name like '%National Seashore%'
or name like '%National Preserve%'
or name like '%National Lakeshore%'
or name like '%Botanical%'
or name like '%Geologic%'
