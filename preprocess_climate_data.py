"""
Creates data/climate_region_trends.csv for the D3 webpage.

Install first:
python3 -m pip install "xarray<2024.0.0" "zarr<3.0.0" gcsfs cftime nc-time-axis pandas numpy intake intake-esm netCDF4

Run:
python3 preprocess_climate_data.py
"""

import os
import warnings
import intake
import numpy as np
import pandas as pd
import xarray as xr

warnings.filterwarnings("ignore")

CATALOG_URL = "https://storage.googleapis.com/cmip6/pangeo-cmip6.json"
MODEL = "MPI-ESM1-2-LR"
TABLE = "Amon"
GRID = "gn"
MEMBER = "r1i1p1f1"
EXPERIMENTS = ["historical", "ssp126", "ssp245", "ssp585"]

REGIONS = {
    "Global": {"lat": (-90, 90), "lon": (0, 360)},
    "North America": {"lat": (15, 72), "lon": (190, 310)},
    "Europe": {"lat": (35, 72), "lon": (350, 40)},
    "East Asia": {"lat": (18, 55), "lon": (95, 145)},
    "Arctic": {"lat": (66.5, 90), "lon": (0, 360)},
}

CO2_ANCHORS = {
    "historical": [(1850, 285), (1950, 310), (2014, 397)],
    "ssp126": [(2015, 400), (2030, 435), (2050, 470), (2065, 465), (2100, 445)],
    "ssp245": [(2015, 400), (2030, 450), (2050, 540), (2065, 610), (2100, 650)],
    "ssp585": [(2015, 400), (2030, 470), (2050, 660), (2065, 820), (2100, 1135)],
}


def normalize_lon(ds):
    if "lon" in ds.coords and float(ds.lon.min()) < 0:
        ds = ds.assign_coords(lon=(ds.lon % 360)).sortby("lon")
    return ds


def select_region(da, bounds):
    lat_min, lat_max = bounds["lat"]
    lon_min, lon_max = bounds["lon"]
    sub = da.sel(lat=slice(lat_min, lat_max))
    if lon_min <= lon_max:
        sub = sub.sel(lon=slice(lon_min, lon_max))
    else:
        sub = xr.concat([sub.sel(lon=slice(lon_min, 360)), sub.sel(lon=slice(0, lon_max))], dim="lon")
    weights = np.cos(np.deg2rad(sub.lat))
    return sub.weighted(weights).mean(("lat", "lon"))


def load_variable(cat, experiment, variable):
    query = dict(
        source_id=MODEL,
        experiment_id=experiment,
        table_id=TABLE,
        variable_id=variable,
        grid_label=GRID,
        member_id=MEMBER,
    )
    col = cat.search(**query)
    if len(col.df) == 0:
        raise ValueError(f"No files found for {experiment} {variable}.")
    dsets = col.to_dataset_dict(zarr_kwargs={"consolidated": True}, storage_options={"token": "anon"})
    ds = normalize_lon(list(dsets.values())[0])
    return ds[variable]


def annual_regional_dataframe(cat, variable, out_name):
    rows = []
    for experiment in EXPERIMENTS:
        print(f"Loading {variable} {experiment}...")
        da = load_variable(cat, experiment, variable)

        if variable == "tas":
            da = da - 273.15
        if variable == "pr":
            da = da * 86400

        annual = da.groupby("time.year").mean("time")
        if experiment == "historical":
            annual = annual.sel(year=slice(1980, 2014))
        else:
            annual = annual.sel(year=slice(2015, 2065))

        for region_name, bounds in REGIONS.items():
            regional = select_region(annual, bounds).compute()
            df = regional.to_dataframe(name=out_name).reset_index()
            df["region"] = region_name
            df["scenario"] = experiment
            rows.append(df[["region", "scenario", "year", out_name]])
    return pd.concat(rows, ignore_index=True)


def add_co2_proxy(out):
    values = []
    for _, row in out.iterrows():
        anchors = CO2_ANCHORS[row["scenario"]]
        years = [x[0] for x in anchors]
        ppm = [x[1] for x in anchors]
        values.append(float(np.interp(row["year"], years, ppm)))
    out["co2_ppm"] = values
    return out


def main():
    cat = intake.open_esm_datastore(CATALOG_URL)

    temp = annual_regional_dataframe(cat, "tas", "temperature_c")
    precip = annual_regional_dataframe(cat, "pr", "precip_mm_day")

    out = temp.merge(precip, on=["region", "scenario", "year"], how="left")

    temp_base = (
        out[(out["scenario"] == "historical") & (out["year"].between(1995, 2014))]
        .groupby("region")["temperature_c"].mean().rename("temp_baseline_c")
    )
    pr_base = (
        out[(out["scenario"] == "historical") & (out["year"].between(1995, 2014))]
        .groupby("region")["precip_mm_day"].mean().rename("precip_baseline_mm_day")
    )
    out = out.merge(temp_base, on="region", how="left").merge(pr_base, on="region", how="left")
    out["temp_anomaly_c"] = out["temperature_c"] - out["temp_baseline_c"]
    out["precip_change_pct"] = ((out["precip_mm_day"] - out["precip_baseline_mm_day"]) / out["precip_baseline_mm_day"]) * 100
    out = add_co2_proxy(out)

    out = out.sort_values(["region", "scenario", "year"])
    os.makedirs("data", exist_ok=True)
    out.to_csv("data/climate_region_trends.csv", index=False)
    print("Saved data/climate_region_trends.csv")
    print(out.head())


if __name__ == "__main__":
    main()
