const tooltip = d3.select("#tooltip");
const regionSelect = d3.select("#regionSelect");
const metricSelect = d3.select("#metricSelect");
const scenarioSelect = d3.select("#scenarioSelect");
const yearSlider = d3.select("#yearSlider");
const yearValue = d3.select("#yearValue");
const resetButton = d3.select("#resetButton");
const legend = d3.select("#legend");

const lineSvg = d3.select("#lineChart");
const barSvg = d3.select("#barChart");
const heatSvg = d3.select("#heatChart");

const margin = { top: 34, right: 36, bottom: 58, left: 72 };
const smallMargin = { top: 24, right: 20, bottom: 72, left: 76 };

const colors = new Map([
  ["historical", "#374151"],
  ["ssp126", "#2563eb"],
  ["ssp245", "#f59e0b"],
  ["ssp585", "#dc2626"]
]);

const labels = new Map([
  ["historical", "Historical"],
  ["ssp126", "SSP1-2.6"],
  ["ssp245", "SSP2-4.5"],
  ["ssp585", "SSP5-8.5"]
]);

const metricInfo = {
  temp_anomaly_c: {
    label: "Temperature anomaly",
    unit: "°C",
    axis: "Temperature anomaly from 1995–2014 baseline (°C)",
    format: d => `${d.toFixed(2)} °C`
  },
  precip_change_pct: {
    label: "Precipitation change",
    unit: "%",
    axis: "Precipitation change from 1995–2014 baseline (%)",
    format: d => `${d.toFixed(1)}%`
  },
  co2_ppm: {
    label: "Greenhouse gas concentration proxy",
    unit: "ppm CO₂",
    axis: "Scenario CO₂ concentration proxy (ppm)",
    format: d => `${d.toFixed(0)} ppm`
  }
};

let allData = [];
let currentTransform = d3.zoomIdentity;

const zoom = d3.zoom()
  .scaleExtent([1, 12])
  .on("zoom", event => {
    currentTransform = event.transform;
    drawLineChart();
  });

lineSvg.call(zoom);

d3.csv("data/climate_region_trends.csv", d3.autoType).then(data => {
  allData = data.filter(d => Number.isFinite(d.year) && d.region && d.scenario);
  setupControls();
  drawAll();
}).catch(error => {
  d3.select(".chart-card").append("p")
    .style("color", "#dc2626")
    .style("font-weight", "800")
    .text("Could not load data/climate_region_trends.csv. Run preprocess_climate_data.py first, then make sure the CSV is inside the data folder.");
  console.error(error);
});

function setupControls() {
  const regions = Array.from(new Set(allData.map(d => d.region))).sort();
  regionSelect.selectAll("option")
    .data(regions)
    .join("option")
    .attr("value", d => d)
    .text(d => d);

  const years = d3.extent(allData.filter(d => d.scenario !== "historical"), d => d.year);
  yearSlider.attr("min", years[0]).attr("max", years[1]).attr("value", Math.min(2050, years[1]));
  yearValue.text(yearSlider.property("value"));

  legend.selectAll("span")
    .data(Array.from(labels.keys()))
    .join("span")
    .attr("class", "legend-item")
    .html(d => `<span class="legend-swatch" style="background:${colors.get(d)}"></span>${labels.get(d)}`);

  regionSelect.on("change", drawAll);
  metricSelect.on("change", drawAll);
  scenarioSelect.on("change", drawAll);
  yearSlider.on("input", () => {
    yearValue.text(yearSlider.property("value"));
    drawAll();
  });
  resetButton.on("click", () => {
    currentTransform = d3.zoomIdentity;
    lineSvg.transition().duration(450).call(zoom.transform, d3.zoomIdentity);
  });
}

function drawAll() {
  drawLineChart();
  drawBarChart();
  drawHeatChart();
}

function drawLineChart() {
  const metric = metricSelect.property("value");
  const region = regionSelect.property("value");
  const focusYear = +yearSlider.property("value");
  const info = metricInfo[metric];

  d3.select("#lineTitle").text(`${region}: ${info.label}`);
  lineSvg.selectAll("*").remove();

  const width = lineSvg.node().clientWidth;
  const height = lineSvg.node().clientHeight;
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const data = allData.filter(d => d.region === region && Number.isFinite(d[metric]));
  const xBase = d3.scaleLinear().domain(d3.extent(data, d => d.year)).range([0, innerWidth]);
  const x = currentTransform.rescaleX(xBase);
  const y = d3.scaleLinear().domain(d3.extent(data, d => d[metric])).nice().range([innerHeight, 0]);

  const g = lineSvg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(6).tickSize(-innerWidth).tickFormat(""));
  g.append("g").attr("class", "axis").attr("transform", `translate(0,${innerHeight})`).call(d3.axisBottom(x).tickFormat(d3.format("d")));
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6));

  g.append("text")
    .attr("x", innerWidth / 2).attr("y", innerHeight + 44)
    .attr("text-anchor", "middle").attr("fill", "#374151").text("Year");

  g.append("text")
    .attr("transform", "rotate(-90)").attr("x", -innerHeight / 2).attr("y", -52)
    .attr("text-anchor", "middle").attr("fill", "#374151").text(info.axis);

  const line = d3.line()
    .defined(d => Number.isFinite(d[metric]))
    .x(d => x(d.year))
    .y(d => y(d[metric]));

  for (const [scenario, values] of d3.group(data, d => d.scenario)) {
    g.append("path")
      .datum(values.sort((a, b) => d3.ascending(a.year, b.year)))
      .attr("class", "line")
      .attr("stroke", colors.get(scenario) || "#6b7280")
      .attr("stroke-dasharray", scenario === "historical" ? "0" : "8 4")
      .attr("d", line);
  }

  const focusX = x(focusYear);
  if (focusX >= 0 && focusX <= innerWidth) {
    g.append("line").attr("class", "focus-line")
      .attr("x1", focusX).attr("x2", focusX).attr("y1", 0).attr("y2", innerHeight);
  }

  const points = data.filter(d => Math.abs(d.year - focusYear) <= 0.5);
  g.selectAll("circle")
    .data(points)
    .join("circle")
    .attr("cx", d => x(d.year)).attr("cy", d => y(d[metric]))
    .attr("r", 5).attr("fill", d => colors.get(d.scenario) || "#6b7280")
    .attr("stroke", "white").attr("stroke-width", 2)
    .on("mousemove", (event, d) => showTooltip(event, d, metric))
    .on("mouseleave", hideTooltip);

  g.append("rect")
    .attr("width", innerWidth).attr("height", innerHeight)
    .attr("fill", "transparent")
    .style("cursor", "crosshair")
    .on("mousemove", event => {
      const [mx] = d3.pointer(event);
      const year = Math.round(x.invert(mx));
      const nearest = data
        .filter(d => Math.abs(d.year - year) <= 1)
        .sort((a, b) => Math.abs(a.year - year) - Math.abs(b.year - year))[0];
      if (nearest) showTooltip(event, nearest, metric);
    })
    .on("mouseleave", hideTooltip);
}

function drawBarChart() {
  const metric = metricSelect.property("value");
  const scenario = scenarioSelect.property("value");
  const focusYear = +yearSlider.property("value");
  const info = metricInfo[metric];
  d3.select("#barTitle").text(`${labels.get(scenario)} regional values in ${focusYear}`);
  barSvg.selectAll("*").remove();

  const width = barSvg.node().clientWidth;
  const height = barSvg.node().clientHeight;
  const innerWidth = width - smallMargin.left - smallMargin.right;
  const innerHeight = height - smallMargin.top - smallMargin.bottom;

  const data = allData
    .filter(d => d.scenario === scenario && d.year === focusYear && Number.isFinite(d[metric]))
    .sort((a, b) => d3.descending(a[metric], b[metric]));

  const x = d3.scaleBand().domain(data.map(d => d.region)).range([0, innerWidth]).padding(0.22);
  const y = d3.scaleLinear().domain([Math.min(0, d3.min(data, d => d[metric])), d3.max(data, d => d[metric])]).nice().range([innerHeight, 0]);

  const g = barSvg.append("g").attr("transform", `translate(${smallMargin.left},${smallMargin.top})`);
  g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(5).tickSize(-innerWidth).tickFormat(""));
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5));
  g.append("g").attr("class", "axis").attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x))
    .selectAll("text").attr("transform", "rotate(-35)").style("text-anchor", "end");

  g.selectAll("rect.bar")
    .data(data)
    .join("rect")
    .attr("class", "bar")
    .attr("x", d => x(d.region))
    .attr("y", d => y(Math.max(0, d[metric])))
    .attr("width", x.bandwidth())
    .attr("height", d => Math.abs(y(d[metric]) - y(0)))
    .attr("fill", colors.get(scenario))
    .attr("rx", 7)
    .on("mousemove", (event, d) => showTooltip(event, d, metric))
    .on("mouseleave", hideTooltip);

  g.append("text")
    .attr("transform", "rotate(-90)").attr("x", -innerHeight / 2).attr("y", -50)
    .attr("text-anchor", "middle").attr("fill", "#374151").text(info.axis);
}

function drawHeatChart() {
  const metric = metricSelect.property("value");
  const focusYear = +yearSlider.property("value");
  const info = metricInfo[metric];
  d3.select("#heatTitle").text(`Scenario divergence in ${focusYear}`);
  heatSvg.selectAll("*").remove();

  const width = heatSvg.node().clientWidth;
  const height = heatSvg.node().clientHeight;
  const innerWidth = width - smallMargin.left - smallMargin.right;
  const innerHeight = height - smallMargin.top - smallMargin.bottom;

  const scenarios = ["ssp126", "ssp245", "ssp585"];
  const data = allData.filter(d => scenarios.includes(d.scenario) && d.year === focusYear && Number.isFinite(d[metric]));
  const regions = Array.from(new Set(data.map(d => d.region))).sort();

  const x = d3.scaleBand().domain(scenarios).range([0, innerWidth]).padding(0.08);
  const y = d3.scaleBand().domain(regions).range([0, innerHeight]).padding(0.08);
  const extent = d3.extent(data, d => d[metric]);
  const color = d3.scaleSequential(d3.interpolateYlOrRd).domain(extent);

  const g = heatSvg.append("g").attr("transform", `translate(${smallMargin.left},${smallMargin.top})`);
  g.append("g").attr("class", "axis").attr("transform", `translate(0,${innerHeight})`).call(d3.axisBottom(x).tickFormat(d => labels.get(d)));
  g.append("g").attr("class", "axis").call(d3.axisLeft(y));

  g.selectAll("rect.cell")
    .data(data)
    .join("rect")
    .attr("class", "cell")
    .attr("x", d => x(d.scenario))
    .attr("y", d => y(d.region))
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("rx", 8)
    .attr("fill", d => color(d[metric]))
    .on("mousemove", (event, d) => showTooltip(event, d, metric))
    .on("mouseleave", hideTooltip);

  g.selectAll("text.value")
    .data(data)
    .join("text")
    .attr("class", "value")
    .attr("x", d => x(d.scenario) + x.bandwidth() / 2)
    .attr("y", d => y(d.region) + y.bandwidth() / 2 + 4)
    .attr("text-anchor", "middle")
    .attr("fill", "#111827")
    .attr("font-size", 11)
    .attr("font-weight", 800)
    .text(d => metric === "co2_ppm" ? d[metric].toFixed(0) : d[metric].toFixed(1));

  g.append("text")
    .attr("x", innerWidth / 2).attr("y", innerHeight + 54)
    .attr("text-anchor", "middle").attr("fill", "#374151").text(info.label);
}

function showTooltip(event, d, metric) {
  const info = metricInfo[metric];
  tooltip
    .style("opacity", 1)
    .style("left", `${event.pageX}px`)
    .style("top", `${event.pageY}px`)
    .html(`<strong>${d.region}</strong><br>${labels.get(d.scenario) || d.scenario}<br>Year: ${d.year}<br>${info.label}: ${info.format(d[metric])}`);
}

function hideTooltip() {
  tooltip.style("opacity", 0);
}
