// === CONFIG ===
// Shared Google Sheet (single CSV for all currency pairs)
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_1Df4oUf4sjTdt75U-dcQ5GiMKPmKs1GAOke-rfIck4dwoAS8jua_vjvlMhOou4Huyjd5o2B3FSlB/pub?gid=0&single=true&output=csv";

const EVENTS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_1Df4oUf4sjTdt75U-dcQ5GiMKPmKs1GAOke-rfIck4dwoAS8jua_vjvlMhOou4Huyjd5o2B3FSlB/pub?gid=135859645&single=true&output=csv";

// === BASE AND QUOTE DETECTION ===
const BASE = window.BASE || "EUR";
const QUOTE = window.QUOTE || "USD";
console.log(`✅ Loading data for ${BASE}/${QUOTE}`);


// === Currency symbols ===
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
function sym(cur) {
  return currencySymbols[cur] || cur;
}


// === DROPDOWNS ===
const marginSelect = document.getElementById("margin");
const volumeSelect = document.getElementById("volume");

for (let i = 0.15; i <= 3.0; i += 0.05) {
  const opt = document.createElement("option");
  opt.value = i / 100;
  opt.textContent = i.toFixed(2) + "%";
  marginSelect.appendChild(opt);
}

for (let v = 10000; v <= 100000; v += 10000) {
  const opt = document.createElement("option");
  opt.value = v;
  opt.textContent = v.toLocaleString();
  volumeSelect.appendChild(opt);
}


// === CSV FETCH ===
async function fetchCSV(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch CSV: " + res.status);
  return await res.text();
}


// === PARSE FX DATA CSV ===
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift().split(",").map(h => h.trim().toLowerCase());
  return lines.map(line => {
    const cols = line.split(",").map(c => c.replace(/^"|"$/g, "").trim());
    return Object.fromEntries(header.map((h, i) => [h, cols[i]]));
  });
}


// === PARSE EVENTS CSV ===
function parseEventsCSV(text) {
  text = text.replace(/^\uFEFF/, ""); // remove BOM
  const lines = text.trim().split(/\r?\n/);

  while (lines.length && !lines[0].toLowerCase().includes("date_and_time")) {
    lines.shift();
  }
  if (!lines.length) return [];

  const header = lines.shift().split(",").map(h => h.trim().toLowerCase());
  console.log("Parsed headers:", header);

  const datetimeIndex =
    header.indexOf("date_and_time") !== -1
      ? header.indexOf("date_and_time")
      : header.indexOf("date_and_time_");

  const idx = {
    datetime: datetimeIndex,
    currency: header.indexOf("currency"),
    importance: header.indexOf("importance"),
    event: header.indexOf("event"),
    actual: header.indexOf("actual"),
    forecast: header.indexOf("forecast"),
    previous: header.indexOf("previous"),
    insights: header.indexOf("insights"),
  };

  return lines.map(line => {
    const cols =
      line
        .match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)
        ?.map(c => c.replace(/^"|"$/g, "").trim()) || [];

    return {
      datetime: idx.datetime >= 0 ? (cols[idx.datetime] || "") : "",
      currency: idx.currency >= 0 ? (cols[idx.currency] || "") : "",
      importance: idx.importance >= 0 ? (cols[idx.importance] || "") : "",
      event: idx.event >= 0 ? (cols[idx.event] || "") : "",
      actual: idx.actual >= 0 ? (cols[idx.actual] || "") : "",
      forecast: idx.forecast >= 0 ? (cols[idx.forecast] || "") : "",
      previous: idx.previous >= 0 ? (cols[idx.previous] || "") : "",
      insights: idx.insights >= 0 ? (cols[idx.insights] || "") : "",
    };
  });
}


// === Render Holidays Table ===
function toDate(day, monAbbr, year) {
  const months = [
    "JAN","FEB","MAR","APR","MAY","JUN",
    "JUL","AUG","SEP","OCT","NOV","DEC"
  ];
  const m = months.indexOf(String(monAbbr).toUpperCase());
  return m >= 0 ? new Date(`${year}-${m + 1}-${day}`) : new Date();
}

function renderCombinedTable(id, holidays) {
  const el = document.getElementById(id);
  if (!el) return;

  if (!holidays.length) {
    el.innerHTML = "<p>No upcoming settlement holidays found.</p>";
    return;
  }

  const rows = holidays.map(h =>
    `<tr><td>${h.jsDate.toLocaleDateString()}</td><td>${h.region}</td><td>${h.name}</td></tr>`
  ).join("");

  el.innerHTML = `
    <table>
      <thead><tr><th>Date</th><th>Region</th><th>Holiday</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}


// === Render Events Table ===
function renderEventsTable(id, events, limit = 10) {
  const el = document.getElementById(id);
  console.log("Rendering events table, total:", events.length);
  if (!el) return;

  if (!events.length) {
    el.innerHTML = "<p>No upcoming events found.</p>";
    return;
  }

  const rows = events.slice(0, limit).map(ev => {
    let dateStr = "";
    if (ev.datetime) {
      const tryNative = new Date(ev.datetime);
      dateStr = !isNaN(tryNative)
        ? tryNative.toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : ev.datetime;
    }

    let link = ev.insights || "";
    link = link.replace(/^"+|"+$/g, "").trim();
    const insightsCell =
      link && link.startsWith("http")
        ? `<a href="${link}" target="_blank" class="insight-btn">View</a>`
        : `<span>${link || "—"}</span>`;

    return `
      <tr>
        <td style="width:22%;">${dateStr}</td>
        <td style="width:10%;text-align:center;">${ev.currency}</td>
        <td style="width:18%;text-align:center;">${ev.importance}</td>
        <td style="width:40%;">${ev.event}</td>
        <td style="width:10%;text-align:center;">${insightsCell}</td>
      </tr>`;
  }).join("");

  el.innerHTML = `
    <table class="events-table" style="font-size:13px;width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th>Date & Time</th>
          <th>Currency</th>
          <th>Importance</th>
          <th>Event</th>
          <th>Insights</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}


// ==========================================
// GLOBAL STATE (shared between main + recalc + refresh)
// ==========================================
let marketRate = 0;   // <-- important global (FIXED)


// ==========================================
// MAIN — LOAD DATA
// ==========================================
async function main() {
  try {
    let allRows = [];

    // === EURUSD → Live TwelveData ===
    if (BASE === "EUR" && QUOTE === "USD") {
      try {
        const apiUrl =
          "https://fxi-worker.anthonywongtradingview.workers.dev/api/live-refresh?pair=EURUSD";

        const res = await fetch(apiUrl);
        const liveData = await res.json();

        if (liveData.price) {
          marketRate = parseFloat(liveData.price);

          document.getElementById("marketRate").textContent =
            marketRate.toFixed(5);
          document.getElementById("lastUpdate").textContent =
            new Date(liveData.refreshed_at).toLocaleTimeString();
        }
      } catch (err) {
        console.error("Live EURUSD fetch error:", err);
      }
    }

    // === OTHER PAIRS → Google Sheets ===
    if (marketRate === 0) {
      const csvText = await fetchCSV(CSV_URL);
      allRows = parseCSV(csvText);

      const pair = allRows.find(r => r.base === BASE && r.quote === QUOTE);
      if (!pair) throw new Error(`${BASE}/${QUOTE} not found in CSV`);

      marketRate = parseFloat(pair.rate);

      document.getElementById("marketRate").textContent =
        marketRate.toFixed(5);
      document.getElementById("lastUpdate").textContent =
        pair.time_of_rate || "unknown";
    }

    // If EURUSD live, still load CSV for holidays/events
    if (allRows.length === 0) {
      const csvText = await fetchCSV(CSV_URL);
      allRows = parseCSV(csvText);
    }

    // === HOLIDAYS ===
    const holidays = [];
    allRows.forEach(row => {
      [BASE.toLowerCase(), QUOTE.toLowerCase()].forEach(cur => {
        const year = row[`year_${cur}`];
        const month = row[`month_${cur}`];
        const day = row[`day_${cur}`];
        const name = row[`name_${cur}`];

        if (year && month && day && name) {
          holidays.push({
            region: cur.toUpperCase(),
            jsDate: toDate(day, month, year),
            name,
          });
        }
      });
    });

    const today = new Date();
    renderCombinedTable(
      "combinedHolidays",
      holidays
        .filter(h => h.jsDate >= today)
        .sort((a, b) => a.jsDate - b.jsDate)
        .slice(0, 5)
    );

    // === EVENTS ===
    const eventsCSV = await fetchCSV(EVENTS_CSV_URL);
    let events = parseEventsCSV(eventsCSV)
      .filter(ev =>
        ev.currency &&
        (ev.currency.toUpperCase() === BASE ||
         ev.currency.toUpperCase() === QUOTE)
      );

    renderEventsTable("upcomingEvents", events, 10);

    // === INITIAL CALC ===
    recalc();

  } catch (err) {
    console.error("MAIN ERROR:", err);
    document.body.innerHTML =
      `<p style="color:red;font-size:20px;">${err.message}</p>`;
  }
}


// ==========================================
// REFRESH (EUR/USD only)
// ==========================================
async function refreshLiveRate() {
  if (BASE !== "EUR" || QUOTE !== "USD") return;

  try {
    const apiUrl =
      "https://fxi-worker.anthonywongtradingview.workers.dev/api/live-refresh?pair=EURUSD";

    const res = await fetch(apiUrl);
    const data = await res.json();

    if (!data.price) {
      console.error("Refresh error:", data);
      return;
    }

    marketRate = parseFloat(data.price);

    document.getElementById("marketRate").textContent = marketRate.toFixed(5);
    document.getElementById("lastUpdate").textContent =
      new Date(data.refreshed_at).toLocaleTimeString();

    recalc();
  } catch (err) {
    console.error("Refresh error:", err);
  }
}

document.getElementById("refreshRateBtn")
  .addEventListener("click", refreshLiveRate);


// ==========================================
// CALCULATION LOGIC
// ==========================================
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
    document.getElementById("exchangeEUR").textContent =
      `${baseSymbol}${volume.toLocaleString()}`;
    document.getElementById("exchangeUSD").textContent =
      `${quoteSymbol}${volume.toLocaleString()}`;

    const offerAmount = adjusted * volume;
    const inverseAmount = inverse * volume;

    document.getElementById("offerAmount").textContent =
      `${quoteSymbol}${Number(offerAmount.toFixed(2)).toLocaleString()}`;
    document.getElementById("inverseAmount").textContent =
      `${baseSymbol}${Number(inverseAmount.toFixed(2)).toLocaleString()}`;

    const effectiveMargin = margin - 0.00055;

    if (effectiveMargin > 0) {
      document.getElementById("revenueEURUSD").textContent =
        `${baseSymbol}${(volume * effectiveMargin).toFixed(2)}`;
      document.getElementById("revenueUSDEUR").textContent =
        `${baseSymbol}${(inverseAmount * effectiveMargin).toFixed(2)}`;
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


// ==========================================
// START
// ==========================================
main();
