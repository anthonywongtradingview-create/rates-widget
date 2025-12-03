// ==========================================
// CONFIG
// ==========================================
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_1Df4oUf4sjTdt75U-dcQ5GiMKPmKs1GAOke-rfIck4dwoAS8jua_vjvlMhOou4Huyjd5o2B3FSlB/pub?gid=0&single=true&output=csv";

const EVENTS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_1Df4oUf4sjTdt75U-dcQ5GiMKPmKs1GAOke-rfIck4dwoAS8jua_vjvlMhOou4Huyjd5o2B3FSlB/pub?gid=135859645&single=true&output=csv";

const BASE = window.BASE || "EUR";
const QUOTE = window.QUOTE || "USD";
console.log(`Loading dashboard for ${BASE}/${QUOTE}`);


// ==========================================
// GLOBAL STATE  (important: no shadowing)
// ==========================================
let marketRate = 0; 
let allRows = []; 


// ==========================================
// CURRENCY SYMBOLS
// ==========================================
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


// ==========================================
// DROPDOWNS
// ==========================================
const marginSelect = document.getElementById("margin");
const volumeSelect = document.getElementById("volume");

for (let i = 0.15; i <= 3.0; i += 0.05) {
  let opt = document.createElement("option");
  opt.value = i / 100;
  opt.textContent = i.toFixed(2) + "%";
  marginSelect.appendChild(opt);
}

for (let v = 10000; v <= 100000; v += 10000) {
  let opt = document.createElement("option");
  opt.value = v;
  opt.textContent = v.toLocaleString();
  volumeSelect.appendChild(opt);
}


// ==========================================
// CSV FETCH & PARSE
// ==========================================
async function fetchCSV(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load CSV");
  return await res.text();
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift().split(",").map(h => h.trim().toLowerCase());
  return lines.map(line => {
    const cols = line.split(",").map(c => c.replace(/^"|"$/g, "").trim());
    return Object.fromEntries(header.map((h, i) => [h, cols[i]]));
  });
}


// ==========================================
// HOLIDAY + EVENTS FUNCTIONS (UNCHANGED)
// ==========================================
function toDate(day, monAbbr, year) {
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const m = months.indexOf(String(monAbbr).toUpperCase());
  return new Date(`${year}-${m + 1}-${day}`);
}

function renderCombinedTable(id, holidays) {
  const el = document.getElementById(id);
  if (!el) return;

  if (!holidays.length) {
    el.innerHTML = "<p>No upcoming settlement holidays found.</p>";
    return;
  }

  const rows = holidays
    .map(
      h => `<tr><td>${h.jsDate.toLocaleDateString()}</td><td>${h.region}</td><td>${h.name}</td></tr>`
    )
    .join("");

  el.innerHTML = `
    <table>
      <thead><tr><th>Date</th><th>Region</th><th>Holiday</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// --- events parser omitted for brevity, keep your current version ---
function parseEventsCSV(text) {
  // (same function you pasted — keep it)
}

function renderEventsTable(id, events, limit = 10) {
  // (same function you pasted — keep it)
}



// ==========================================
// MAIN INITIALISATION
// ==========================================
async function main() {
  try {
    console.log("Starting main()");

    // ------------------------------------------
    // 1) EURUSD LIVE (Cloudflare Worker)
    // ------------------------------------------
    if (BASE === "EUR" && QUOTE === "USD") {
      try {
        const url =
          `https://fxi-worker.anthonywongtradingview.workers.dev/api/live-refresh?pair=EURUSD`;
        const res = await fetch(url);
        const live = await res.json();

        if (live.price) {
          marketRate = parseFloat(live.price);

          document.getElementById("marketRate").textContent = marketRate.toFixed(5);
          document.getElementById("lastUpdate").textContent =
            new Date(live.refreshed_at).toLocaleTimeString();
        }
      } catch (err) {
        console.error("Live EURUSD failed:", err);
      }
    }

    // ------------------------------------------
    // 2) Google Sheets fallback (ALL other pairs)
    // ------------------------------------------
    if (marketRate === 0) {
      console.log("Using Google Sheets fallback");
      const csvText = await fetchCSV(CSV_URL);
      allRows = parseCSV(csvText);

      const pairRow = allRows.find(r => r.base === BASE && r.quote === QUOTE);
      if (!pairRow) throw new Error(`${BASE}/${QUOTE} not found in sheet`);

      marketRate = parseFloat(pairRow.rate);

      document.getElementById("marketRate").textContent = marketRate.toFixed(5);
      document.getElementById("lastUpdate").textContent =
        pairRow.time_of_rate || "unknown";
    }

    // ------------------------------------------
    // 3) Load CSV if EURUSD used live
    // ------------------------------------------
    if (allRows.length === 0) {
      const csvText = await fetchCSV(CSV_URL);
      allRows = parseCSV(csvText);
    }

    // ------------------------------------------
    // 4) Holidays
    // ------------------------------------------
    const holidays = [];
    allRows.forEach(row => {
      [BASE.toLowerCase(), QUOTE.toLowerCase()].forEach(cur => {
        const y = row[`year_${cur}`];
        const m = row[`month_${cur}`];
        const d = row[`day_${cur}`];
        const n = row[`name_${cur}`];
        if (y && m && d && n) {
          holidays.push({
            region: cur.toUpperCase(),
            jsDate: toDate(d, m, y),
            name: n
          });
        }
      });
    });

    renderCombinedTable("combinedHolidays", holidays.slice(0, 5));

    // ------------------------------------------
    // 5) Events
    // ------------------------------------------
    const eventsCSV = await fetchCSV(EVENTS_CSV_URL);
    const events = parseEventsCSV(eventsCSV).filter(
      ev =>
        ev.currency &&
        (ev.currency.toUpperCase() === BASE || ev.currency.toUpperCase() === QUOTE)
    );
    renderEventsTable("upcomingEvents", events, 10);

    // ------------------------------------------
    // 6) First calculation
    // ------------------------------------------
    recalc();

  } catch (err) {
    console.error("MAIN ERROR:", err);
    document.body.innerHTML = `<p style="color:red">${err.message}</p>`;
  }
}



// ==========================================
// LIVE REFRESH BUTTON (EURUSD ONLY)
// ==========================================
async function refreshLiveRate() {
  if (BASE !== "EUR" || QUOTE !== "USD") return;

  try {
    const url =
      `https://fxi-worker.anthonywongtradingview.workers.dev/api/live-refresh?pair=EURUSD`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data.price) return;

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
  if (!marketRate || isNaN(marketRate)) return;

  const margin = parseFloat(marginSelect.value) || 0;
  const useCustom = document.getElementById("useCustomVolume").checked;
  const customVolume =
    parseFloat(document.getElementById("customVolume").value) || 0;

  const volume = useCustom
    ? customVolume
    : parseFloat(volumeSelect.value) || 0;

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
      `${quoteSymbol}${offerAmount.toFixed(2)}`;
    document.getElementById("inverseAmount").textContent =
      `${baseSymbol}${inverseAmount.toFixed(2)}`;

  } else {
    document.getElementById("exchangeEUR").textContent = "–";
    document.getElementById("exchangeUSD").textContent = "–";
    document.getElementById("offerAmount").textContent = "–";
    document.getElementById("inverseAmount").textContent = "–";
  }
}



// ==========================================
// START
// ==========================================
main();
