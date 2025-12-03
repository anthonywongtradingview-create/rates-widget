// ==========================================================
// CONFIG
// ==========================================================

// Google Sheets CSV (historical + holidays)
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_1Df4oUf4sjTdt75U-dcQ5GiMKPmKs1GAOke-rfIck4dwoAS8jua_vjvlMhOou4Huyjd5o2B3FSlB/pub?gid=0&single=true&output=csv";

// Economic events CSV
const EVENTS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_1Df4oUf4sjTdt75U-dcQ5GiMKPmKs1GAOke-rfIck4dwoAS8jua_vjvlMhOou4Huyjd5o2B3FSlB/pub?gid=135859645&single=true&output=csv";

// Live EURUSD API
const LIVE_API =
  "https://fxi-worker.anthonywongtradingview.workers.dev/api/live-refresh?pair=EURUSD";

// Pair detection
const BASE = window.BASE || "EUR";
const QUOTE = window.QUOTE || "USD";

// Currency symbols
const currencySymbols = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  CHF: "Fr.",
  AED: "DH",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
};
function sym(c) {
  return currencySymbols[c] || c;
}

// Dropdown elements
const marginSelect = document.getElementById("margin");
const volumeSelect = document.getElementById("volume");

// Fill dropdowns
for (let i = 0.15; i <= 3.0; i += 0.05) {
  const o = document.createElement("option");
  o.value = i / 100;
  o.textContent = i.toFixed(2) + "%";
  marginSelect.appendChild(o);
}
for (let v = 10000; v <= 100000; v += 10000) {
  const o = document.createElement("option");
  o.value = v;
  o.textContent = v.toLocaleString();
  volumeSelect.appendChild(o);
}

// Global market rate used by calculator & refresh
let marketRate = 0;

// Fetch CSV helper
async function fetchCSV(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed CSV fetch: " + res.status);
  return await res.text();
}

// Parse Sheets CSV (rates + holidays)
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift().split(",").map(h => h.trim().toLowerCase());
  return lines.map(line => {
    const cols = line.split(",").map(c => c.replace(/^"|"$/g, "").trim());
    return Object.fromEntries(header.map((h, i) => [h, cols[i]]));
  });
}

// Parse Events CSV
function parseEventsCSV(text) {
  text = text.replace(/^\uFEFF/, "");

  const lines = text.trim().split(/\r?\n/);
  while (lines.length && !lines[0].toLowerCase().includes("date_and_time")) {
    lines.shift();
  }
  if (!lines.length) return [];

  const header = lines.shift().split(",").map(h => h.trim().toLowerCase());
  const idx = {
    datetime: header.indexOf("date_and_time"),
    currency: header.indexOf("currency"),
    importance: header.indexOf("importance"),
    event: header.indexOf("event"),
    insights: header.indexOf("insights"),
  };

  return lines.map(line => {
    const cols = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [];
    const clean = cols.map(c => c.replace(/^"|"$/g, "").trim());
    return {
      datetime: clean[idx.datetime],
      currency: clean[idx.currency],
      importance: clean[idx.importance],
      event: clean[idx.event],
      insights: clean[idx.insights],
    };
  });
}

// Convert month abbreviations
function toDate(day, monAbbr, year) {
  const months = ["JAN","FEB","MAR","APR","MAY","JUN",
                  "JUL","AUG","SEP","OCT","NOV","DEC"];
  const m = months.indexOf(monAbbr.toUpperCase());
  return m >= 0 ? new Date(`${year}-${m + 1}-${day}`) : new Date();
}

// Render Holidays
function renderCombinedTable(id, list) {
  const el = document.getElementById(id);
  if (!el) return;

  if (!list.length) {
    el.innerHTML = "<p>No upcoming settlement holidays found.</p>";
    return;
  }

  el.innerHTML = `
    <table>
      <thead><tr><th>Date</th><th>Region</th><th>Holiday</th></tr></thead>
      <tbody>
        ${list
          .map(
            h =>
              `<tr><td>${h.jsDate.toLocaleDateString()}</td><td>${h.region}</td><td>${h.name}</td></tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

// Render Events
function renderEventsTable(id, events) {
  const el = document.getElementById(id);
  if (!el) return;

  if (!events.length) {
    el.innerHTML = "<p>No upcoming events found.</p>";
    return;
  }

  el.innerHTML = `
    <table class="events-table">
      <thead>
        <tr>
          <th>Date & Time</th>
          <th>Currency</th>
          <th>Imp.</th>
          <th>Event</th>
          <th>Insights</th>
        </tr>
      </thead>
      <tbody>
        ${events
          .map(e => {
            let dt = new Date(e.datetime);
            const nice = !isNaN(dt)
              ? dt.toLocaleString("en-GB")
              : e.datetime;
            const insights =
              e.insights?.startsWith("http")
                ? `<a href="${e.insights}" target="_blank">View</a>`
                : "—";
            return `
              <tr>
                <td>${nice}</td>
                <td>${e.currency}</td>
                <td>${e.importance}</td>
                <td>${e.event}</td>
                <td>${insights}</td>
              </tr>`;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

// ==========================================================
// MAIN
// ==========================================================
async function main() {
  try {
    let allRows = [];

    // 1️⃣ EURUSD → LIVE API ONLY
    if (BASE === "EUR" && QUOTE === "USD") {
      const res = await fetch(LIVE_API);
      const data = await res.json();
      marketRate = parseFloat(data.price);

      document.getElementById("marketRate").textContent =
        marketRate.toFixed(5);
      document.getElementById("lastUpdate").textContent =
        new Date(data.refreshed_at).toLocaleTimeString();
    }

    // 2️⃣ Other pairs OR fallback → GOOGLE SHEETS
    if (!marketRate) {
      const csvText = await fetchCSV(CSV_URL);
      allRows = parseCSV(csvText);

      const pair = allRows.find(r => r.base === BASE && r.quote === QUOTE);
      if (!pair) throw new Error(`${BASE}/${QUOTE} not found`);

      marketRate = parseFloat(pair.rate);

      document.getElementById("marketRate").textContent =
        marketRate.toFixed(5);
      document.getElementById("lastUpdate").textContent =
        pair.time_of_rate || "unknown";
    }

    // 3️⃣ ALWAYS load holiday/event data from Google Sheets
    if (!allRows.length) {
      const csv = await fetchCSV(CSV_URL);
      allRows = parseCSV(csv);
    }

    // Holidays
    const hol = [];
    allRows.forEach(r => {
      [BASE, QUOTE].forEach(cur => {
        const y = r[`year_${cur.toLowerCase()}`];
        const m = r[`month_${cur.toLowerCase()}`];
        const d = r[`day_${cur.toLowerCase()}`];
        const name = r[`name_${cur.toLowerCase()}`];
        if (y && m && d && name) {
          hol.push({
            region: cur,
            jsDate: toDate(d, m, y),
            name,
          });
        }
      });
    });
    const today = new Date();
    const upcoming = hol
      .filter(h => h.jsDate >= today)
      .sort((a, b) => a.jsDate - b.jsDate)
      .slice(0, 5);

    renderCombinedTable("combinedHolidays", upcoming);

    // Events
    const evText = await fetchCSV(EVENTS_CSV_URL);
    let events = parseEventsCSV(evText);

    events = events.filter(
      ev =>
        ev.currency?.toUpperCase() === BASE ||
        ev.currency?.toUpperCase() === QUOTE
    );

    renderEventsTable("upcomingEvents", events);

    recalc();

  } catch (e) {
    document.body.innerHTML = `<p style="color:red">${e.message}</p>`;
    console.error(e);
  }
}

// ==========================================================
// REFRESH LIVE RATE (EURUSD only)
// ==========================================================
async function refreshLiveRate() {
  if (BASE !== "EUR" || QUOTE !== "USD") return;

  try {
    const res = await fetch(LIVE_API);
    const data = await res.json();

    marketRate = parseFloat(data.price);

    document.getElementById("marketRate").textContent =
      marketRate.toFixed(5);
    document.getElementById("lastUpdate").textContent =
      new Date(data.refreshed_at).toLocaleTimeString();

    recalc();
  } catch (err) {
    console.error("Refresh failed:", err);
  }
}

document
  .getElementById("refreshRateBtn")
  ?.addEventListener("click", refreshLiveRate);

// ==========================================================
// CALCULATOR
// ==========================================================
function recalc() {
  const margin = parseFloat(marginSelect.value) || 0;

  const useCustom = document.getElementById("useCustomVolume").checked;
  const customVolume =
    parseFloat(document.getElementById("customVolume").value) || 0;

  const selectedVolume = parseFloat(volumeSelect.value) || 0;
  const volume = useCustom ? customVolume : selectedVolume;

  const adjusted = marketRate * (1 - margin);
  const inverse = (1 / marketRate) * (1 - margin);

  document.getElementById("offerRate").textContent = adjusted.toFixed(5);
  document.getElementById("inverseRate").textContent = inverse.toFixed(5);

  const baseSymbol = sym(BASE);
  const quoteSymbol = sym(QUOTE);

  if (volume > 0) {
    document.getElementById(
      "exchangeEUR"
    ).textContent = `${baseSymbol}${volume.toLocaleString()}`;
    document.getElementById(
      "exchangeUSD"
    ).textContent = `${quoteSymbol}${volume.toLocaleString()}`;

    const offerAmount = adjusted * volume;
    const inverseAmount = inverse * volume;

    document.getElementById("offerAmount").textContent =
      `${quoteSymbol}${offerAmount.toFixed(2)}`;
    document.getElementById("inverseAmount").textContent =
      `${baseSymbol}${inverseAmount.toFixed(2)}`;

    const eff = margin - 0.00055;

    if (eff > 0) {
      document.getElementById("revenueEURUSD").textContent =
        `${baseSymbol}${(volume * eff).toFixed(2)}`;
      document.getElementById("revenueUSDEUR").textContent =
        `${baseSymbol}${(inverseAmount * eff).toFixed(2)}`;
    } else {
      document.getElementById("revenueEURUSD").textContent = "–";
      document.getElementById("revenueUSDEUR").textContent = "–";
    }
  } else {
    document.getElementById("exchangeEUR").textContent = "–";
    document.getElementById("exchangeUSD").textContent = "–";
    document.getElementById("offerAmount").textContent = "–";
    document.getElementById("inverseAmount").textContent = "–";
    document.getElementById("revenueEURUSD").textContent = "–";
    document.getElementById("revenueUSDEUR").textContent = "–";
  }
}

// Start
main();
