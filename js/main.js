
// ---------- CONFIG ----------

// Shared Google Sheet
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_1Df4oUf4sjTdt75U-dcQ5GiMKPmKs1GAOke-rfIck4dwoAS8jua_vjvlMhOou4Huyjd5o2B3FSlB/pub?gid=0&single=true&output=csv";

const EVENTS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_1Df4oUf4sjTdt75U-dcQ5GiMKPmKs1GAOke-rfIck4dwoAS8jua_vjvlMhOou4Huyjd5o2B3FSlB/pub?gid=135859645&single=true&output=csv";

// Live EURUSD endpoint (Cloudflare Worker -> TwelveData)
const LIVE_API =
  "https://fxi-worker.anthonywongtradingview.workers.dev/api/live-refresh?pair=EURUSD";

// BASE / QUOTE provided by each HTML page
const BASE = window.BASE || "EUR";
const QUOTE = window.QUOTE || "USD";
console.log(`🔄 Initialising FX dashboard for ${BASE}/${QUOTE}`);


// ---------- CURRENCY SYMBOLS ----------

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


// ---------- DOM / DROPDOWNS ----------

const marginSelect = document.getElementById("margin");
const volumeSelect = document.getElementById("volume");

// Populate margin dropdown (0.15% → 3.00%)
for (let i = 0.15; i <= 3.0; i += 0.05) {
  const opt = document.createElement("option");
  opt.value = i / 100;            // e.g. 0.0015
  opt.textContent = i.toFixed(2) + "%";
  marginSelect.appendChild(opt);
}

// Populate volume dropdown (10k → 100k)
for (let v = 10000; v <= 100000; v += 10000) {
  const opt = document.createElement("option");
  opt.value = v;
  opt.textContent = v.toLocaleString();
  volumeSelect.appendChild(opt);
}


// ---------- HELPERS ----------

async function fetchCSV(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch CSV (${res.status})`);
  return await res.text();
}

// Basic CSV parser for Sheets export
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift().split(",").map(h => h.trim().toLowerCase());
  return lines.map(line => {
    const cols = line.split(",").map(c => c.replace(/^"|"$/g, "").trim());
    return Object.fromEntries(header.map((h, i) => [h, cols[i]]));
  });
}

// Parse events CSV
function parseEventsCSV(text) {
  text = text.replace(/^\uFEFF/, ""); // remove BOM if present
  const lines = text.trim().split(/\r?\n/);

  // Skip metadata rows before header
  while (lines.length && !lines[0].toLowerCase().includes("date_and_time")) {
    lines.shift();
  }
  if (!lines.length) return [];

  const header = lines.shift().split(",").map(h => h.trim().toLowerCase());

  const idx = {
    datetime:
      header.indexOf("date_and_time") !== -1
        ? header.indexOf("date_and_time")
        : header.indexOf("date_and_time_"),
    currency: header.indexOf("currency"),
    importance: header.indexOf("importance"),
    event: header.indexOf("event"),
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
      insights: idx.insights >= 0 ? (cols[idx.insights] || "") : "",
    };
  });
}

// Month abbreviation → Date
function toDate(day, monAbbr, year) {
  const months = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"
  ];
  const m = months.indexOf(String(monAbbr).toUpperCase());
  return m >= 0 ? new Date(`${year}-${m + 1}-${day}`) : new Date();
}


// ---------- RENDER HOLIDAYS ----------

function renderCombinedTable(id, holidays) {
  const el = document.getElementById(id);
  if (!el) return;

  if (!holidays.length) {
    el.innerHTML = "<p>No upcoming settlement holidays found.</p>";
    return;
  }

  const rows = holidays.map(
    h =>
      `<tr><td>${h.jsDate.toLocaleDateString()}</td><td>${h.region}</td><td>${h.name}</td></tr>`
  ).join("");

  el.innerHTML = `
    <table>
      <thead><tr><th>Date</th><th>Region</th><th>Holiday</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}


// ---------- RENDER EVENTS ----------

function renderEventsTable(id, events, limit = 10) {
  const el = document.getElementById(id);
  if (!el) return;

  if (!events || !events.length) {
    el.innerHTML = "<p>No upcoming events found.</p>";
    return;
  }

  const rows = events.slice(0, limit).map(ev => {
    let dateStr = "";

    if (ev.datetime) {
      const raw = ev.datetime.trim();
      let parsed = null;

      // Try Sheets-style "MM/DD/YYYY HH:MM[:SS]"
      const m = raw.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}:\d{2}(?::\d{2})?)$/
      );
      if (m) {
        const [, month, day, year, timePart] = m;
        const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(
          2,
          "0"
        )}T${timePart}`;
        parsed = new Date(iso);
      }

      if (!parsed || isNaN(parsed)) {
        const tryNative = new Date(raw);
        if (!isNaN(tryNative)) parsed = tryNative;
      }

      dateStr =
        parsed && !isNaN(parsed)
          ? parsed.toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : raw;
    }

    // Insights cell
    let link = ev.insights || "";
    link = link.replace(/^"+|"+$/g, "").trim();
    const insightsCell =
      link && link.startsWith("http")
        ? `<a href="${link}" target="_blank" class="insight-btn">View</a>`
        : (link ? `<span>${link}</span>` : `<span style="color:#ccc;">—</span>`);

    return `
      <tr>
        <td style="width:22%;white-space:nowrap;">${dateStr}</td>
        <td style="width:10%;text-align:center;">${ev.currency}</td>
        <td style="width:18%;text-align:center;">${ev.importance}</td>
        <td style="width:40%;">${ev.event}</td>
        <td style="width:10%;text-align:center;">${insightsCell}</td>
      </tr>`;
  }).join("");

  el.innerHTML = `
    <table class="events-table" style="font-size:13px;width:100%;border-collapse:collapse;table-layout:fixed;">
      <thead>
        <tr>
          <th style="width:22%;">Date & Time</th>
          <th style="width:10%;">Currency</th>
          <th style="width:18%;">Importance</th>
          <th style="width:40%;">Event</th>
          <th style="width:10%;">Insights</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}


// GLOBAL STATE (shared by main + recalc)
let marketRate = 0;


// MAIN INITIALISATION
async function main() {
  try {
    // 1) Load main FX CSV (for all pairs, and for holidays)
    const csvText = await fetchCSV(CSV_URL);
    const allRows = parseCSV(csvText);

    const pairRow = allRows.find(
      r => r.base === BASE && r.quote === QUOTE
    );
    if (!pairRow) {
      throw new Error(`${BASE}/${QUOTE} not found in FX CSV`);
    }

    // 2) Decide where to get the rate from
    if (BASE === "EUR" && QUOTE === "USD") {
      // EURUSD → try live API first
      try {
        const res = await fetch(LIVE_API);
        const data = await res.json();

        if (data && data.price) {
          marketRate = parseFloat(data.price);
          document.getElementById("marketRate").textContent =
            marketRate.toFixed(5);
          document.getElementById("lastUpdate").textContent =
            new Date(data.refreshed_at).toLocaleTimeString();
        } else {
          console.warn("Live API returned no price, falling back to CSV", data);
          marketRate = parseFloat(pairRow.rate);
          document.getElementById("marketRate").textContent =
            marketRate.toFixed(5);
          document.getElementById("lastUpdate").textContent =
            pairRow.time_of_rate || "unknown";
        }
      } catch (err) {
        console.error("Live API failed, using CSV:", err);
        marketRate = parseFloat(pairRow.rate);
        document.getElementById("marketRate").textContent =
          marketRate.toFixed(5);
        document.getElementById("lastUpdate").textContent =
          pairRow.time_of_rate || "unknown";
      }
    } else {
      // Any non-EURUSD pair → always use Google Sheets CSV
      marketRate = parseFloat(pairRow.rate);
      document.getElementById("marketRate").textContent =
        marketRate.toFixed(5);
      document.getElementById("lastUpdate").textContent =
        pairRow.time_of_rate || "unknown";
    }

    // 3) HOLIDAYS (from allRows)
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
    const upcoming = holidays
      .filter(h => h.jsDate >= today)
      .sort((a, b) => a.jsDate - b.jsDate)
      .slice(0, 5);

    renderCombinedTable("combinedHolidays", upcoming);

    // 4) ECONOMIC EVENTS
    try {
      const eventsCSV = await fetchCSV(EVENTS_CSV_URL);
      let events = parseEventsCSV(eventsCSV);

      if (Array.isArray(events)) {
        events = events
          .filter(
            ev =>
              ev.currency &&
              (ev.currency.toUpperCase() === BASE ||
               ev.currency.toUpperCase() === QUOTE)
          );
      } else {
        events = [];
      }

      renderEventsTable("upcomingEvents", events, 10);
    } catch (err) {
      console.warn("Events CSV failed:", err);
      renderEventsTable("upcomingEvents", [], 10);
    }

    // 5) Attach calculator handlers & run initial calc
    attachCalcListeners();
    recalc();

    // 6) Attach refresh button (EURUSD only)
    const refreshBtn = document.getElementById("refreshRateBtn");
    if (refreshBtn && BASE === "EUR" && QUOTE === "USD") {
      refreshBtn.addEventListener("click", refreshLiveRate);
    }

  } catch (e) {
    document.body.innerHTML = `<p style="color:red">${e.message}</p>`;
    console.error("MAIN ERROR:", e);
  }
}


// LIVE REFRESH (EURUSD ONLY)
async function refreshLiveRate() {
  if (BASE !== "EUR" || QUOTE !== "USD") return;

  try {
    const res = await fetch(LIVE_API);
    const data = await res.json();

    if (!data || !data.price) {
      console.error("Refresh error: no price in response", data);
      return;
    }

    marketRate = parseFloat(data.price);

    document.getElementById("marketRate").textContent =
      marketRate.toFixed(5);
    document.getElementById("lastUpdate").textContent =
      new Date(data.refreshed_at).toLocaleTimeString();

    recalc();
  } catch (err) {
    console.error("Error refreshing live rate:", err);
  }
}


// CALCULATION LOGIC
function recalc() {
  const margin = parseFloat(marginSelect.value) || 0;
  const useCustom = document.getElementById("useCustomVolume").checked;
  const customVolume =
    parseFloat(document.getElementById("customVolume").value) || 0;
  const selectedVolume = parseFloat(volumeSelect.value) || 0;
  const volume = useCustom ? customVolume : selectedVolume;

  // Adjusted rates
  const adjusted = marketRate * (1 - margin);
  const inverse = (1 / marketRate) * (1 - margin);

  document.getElementById("offerRate").textContent = adjusted.toFixed(5);
  document.getElementById("inverseRate").textContent = inverse.toFixed(5);

  const baseSymbol = sym(BASE);
  const quoteSymbol = sym(QUOTE);

  if (volume > 0) {
    // Display chosen volumes
    document.getElementById("exchangeEUR").textContent =
      `${baseSymbol}${volume.toLocaleString()}`;
    document.getElementById("exchangeUSD").textContent =
      `${quoteSymbol}${volume.toLocaleString()}`;

    // Amounts
    const offerAmount = adjusted * volume;
    const inverseAmount = inverse * volume;

    document.getElementById("offerAmount").textContent =
      `${quoteSymbol}${Number(offerAmount.toFixed(2)).toLocaleString()}`;
    document.getElementById("inverseAmount").textContent =
      `${baseSymbol}${Number(inverseAmount.toFixed(2)).toLocaleString()}`;

    // Revenue (margin - 0.055% cost)
    const effectiveMargin = margin - 0.00055;

    if (effectiveMargin > 0) {
      const revenueEURUSD = volume * effectiveMargin;
      const revenueUSDEUR = inverseAmount * effectiveMargin;

      const profitSymbol = sym(BASE);

      document.getElementById("revenueEURUSD").textContent =
        `${profitSymbol}${revenueEURUSD.toFixed(2)}`;
      document.getElementById("revenueUSDEUR").textContent =
        `${profitSymbol}${revenueUSDEUR.toFixed(2)}`;
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


// Attach listeners once (called from main)
function attachCalcListeners() {
  marginSelect.addEventListener("change", recalc);
  volumeSelect.addEventListener("change", recalc);
  document.getElementById("customVolume").addEventListener("input", recalc);
  document
    .getElementById("useCustomVolume")
    .addEventListener("change", recalc);
}


// BOOTSTRAP
main();
