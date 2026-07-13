/**
 * charts.js
 * ---------------------------------------------------------------------------
 * Three charts, per spec section 20:
 *   1. Pie  — Active vs Inactive stores
 *   2. Bar  — City-wise cost
 *   3. Line — Rain trend (active sessions over the course of the day)
 * ---------------------------------------------------------------------------
 */

const Charts = (() => {
  let pieChart, barChart, lineChart;

  const PALETTE = {
    active: "#2FB8A6",
    inactive: "#3A4A63",
    grid: "rgba(255,255,255,0.06)",
    text: "#B7C2D0",
    line: "#4C8DFF",
  };

  function baseOptions(extra = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: PALETTE.text } },
      },
      scales: {
        x: { ticks: { color: PALETTE.text }, grid: { color: PALETTE.grid } },
        y: { ticks: { color: PALETTE.text }, grid: { color: PALETTE.grid } },
      },
      ...extra,
    };
  }

  function initPie() {
    const ctx = document.getElementById("chartActiveInactive");
    if (!ctx) return;
    pieChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Active", "Inactive"],
        datasets: [{ data: [0, 0], backgroundColor: [PALETTE.active, PALETTE.inactive] }],
      },
      options: baseOptions({ scales: undefined, cutout: "65%" }),
    });
  }

  function initBar() {
    const ctx = document.getElementById("chartCityCost");
    if (!ctx) return;
    barChart = new Chart(ctx, {
      type: "bar",
      data: { labels: [], datasets: [{ label: "Cost (₹)", data: [], backgroundColor: PALETTE.line }] },
      options: baseOptions(),
    });
  }

  function initLine() {
    const ctx = document.getElementById("chartRainTrend");
    if (!ctx) return;
    lineChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Active Rain Surge Sessions",
            data: [],
            borderColor: PALETTE.line,
            backgroundColor: "rgba(76,141,255,0.15)",
            tension: 0.35,
            fill: true,
          },
        ],
      },
      options: baseOptions(),
    });
  }

  function init() {
    initPie();
    initBar();
    initLine();
  }

  /**
   * @param {{active:number, inactive:number, cityCost: Record<string,number>, trend: {label:string, count:number}[]}} data
   */
  function update(data) {
    if (pieChart) {
      pieChart.data.datasets[0].data = [data.active, data.inactive];
      pieChart.update();
    }
    if (barChart) {
      const entries = Object.entries(data.cityCost || {});
      barChart.data.labels = entries.map(([city]) => city);
      barChart.data.datasets[0].data = entries.map(([, cost]) => cost);
      barChart.update();
    }
    if (lineChart) {
      lineChart.data.labels = (data.trend || []).map((p) => p.label);
      lineChart.data.datasets[0].data = (data.trend || []).map((p) => p.count);
      lineChart.update();
    }
  }

  return { init, update };
})();
