# DSC 106 Project 3: Climate Futures Across Regions

Question: How do temperature, precipitation, and greenhouse gas pathways change across regions and future scenarios?

## Run locally

```bash
python3 -m pip install "xarray<2024.0.0" "zarr<3.0.0" gcsfs cftime nc-time-axis pandas numpy intake intake-esm netCDF4
python3 preprocess_climate_data.py
```

Then open `index.html` with VS Code Live Server.

## Files

- `preprocess_climate_data.py`: loads CMIP6 temperature and precipitation, creates regional annual data, and adds a greenhouse gas pathway proxy.
- `data/climate_region_trends.csv`: generated data used by D3.
- `main.js`: D3 line chart, regional bar chart, heatmap, tooltips, zoom, and controls.
- `index.html`: webpage and write-up.
- `style.css`: visual design.
