select public.run_ecoregion_selection_iterative(17093, 20, 0.20);

select *
from ecoregion_selection_log
where run_id = (
    select max(run_id)
    from ecoregion_selection_log
)
order by run_ts desc, iteration;
