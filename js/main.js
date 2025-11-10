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

// === FETCH CSV ===
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
  text = text.replace(/^\uFEFF/, ""); // remove BOM if present
  const lines = text.trim().split(/\r?\n/);

  // Skip metadata lines until we reach the header
  while (lines.length && !lines[0].toLowerCase().includes("date_and_time")) {
    lines.shift();
  }
  if (!lines.length) return [];

  const header = lines.shift().split(",").map(h => h.trim().toLowerCase());
  console.log("Parsed headers:", header);

  const idx = {
    datetime: header.indexOf("date_and_time"),
    currency: header.indexOf("currency"),
    importance: header.indexOf("importance"),
    event: header.indexOf("event"),
    actual: header.indexOf("actual"),
    forecast: header.indexOf("forecast"),
    previous: header.indexOf("previous"),
    insights: header.indexOf("insights"),
  };

  return lines.map(line => {
    const cols = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)
      ?.map(c => c.replace(/^"|"$/g, "").trim()) || [];

    return {
      datetime: cols[idx.datetime] || "",
      currency: cols[idx.currency] || "",
      importance: cols[idx.importance] || "",
      event: cols[idx.event] || "",
      actual: cols[idx.actual] || "",
      forecast: cols[idx.forecast] || "",
      previous: cols[idx.previous] || "",
      insights: idx.insights >= 0 ? (cols[idx.insights] || "") : "",
    };
  });
}

// === Render Holidays Table ===
function toDate(day, monAbbr, year) {
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
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

  const rows = holidays.map(
    h => `<tr><td>${h.jsDate.toLocaleDateString()}</td><td>${h.region}</td><td>${h.name}</td></tr>`
  ).join("");

  el.innerHTML = `
    <table>
      <thead><tr><th>Date</th><th>Region</th><th>Holiday</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// === Render Economic Events Table (with Insights column) ===
function renderEventsTable(id, events, limit = 10) {
  const el = document.getElementById(id);
  console.log("Rendering events table, total:", events.length);
  if (!el) return;

  if (!events.length) {
    el.innerHTML = "<p>No upcoming events found.</p>";
    return;
  }

  const rows = events.slice(0, limit).map(ev => {
    const dateStr = ev.datetime
      ? new Date(ev.datetime).toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

    let link = ev.insights || "";
    link = link.replace(/^"+|"+$/g, "").trim();

    const insightsCell =
      link && link.startsWith("http")
        ? `<a href="${link}" target="_blank" class="insight-btn">View</a>`
        : (link ? `<span>${link}</span>` : `<span style="color:#ccc;">—</span>`);

    return `
      <tr>
        <td>${dateStr}</td>
        <td>${ev.currency}</td>
        <td>${ev.importance}</td>
        <td>${ev.event}</td>
        <td>${insightsCell}</td>
      </tr>`;
  }).join("");

  el.innerHTML = `
    <table class="events-table" style="font-size:13px; width:100%; border-collapse:collapse;">
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

  // === Add colored blocks to Importance ===
  document.querySelectorAll(`#${id} td:nth-child(3)`).forEach(cell => {
    const value = Number(cell.textContent.trim());
    let html = '<div class="importance-blocks">';
    for (let i = 1; i <= 3; i++) {
      if (i <= value) {
        if (value === 1) html += '<span class="block-green"></span>';
        else if (value === 2) html += '<span class="block-orange"></span>';
        else if (value === 3) html += '<span class="block-red"></span>';
      } else {
        html += '<span class="block-empty"></span>';
      }
    }
    html += "</div>";
    cell.innerHTML = html;
  });
}

// === MAIN ===
async function main() {
  try {
    // Load FX rates
    const csvText = await fetchCSV(CSV_URL);
    const allRows = parseCSV(csvText);

    const pair = allRows.find(r => r.base === BASE && r.quote === QUOTE);
    if (!pair) throw new Error(`${BASE}/${QUOTE} not found in data`);

    const marketRate = parseFloat(pair.rate);
    document.getElementById("marketRate").textContent = marketRate.toFixed(6);
    document.getElementById("lastUpdate").textContent = pair.time_of_rate || "unknown";

    // === HOLIDAYS ===
    const holidays = [];
    allRows.forEach(row => {
      [BASE.toLowerCase(), QUOTE.toLowerCase()].forEach(cur => {
        const year = row[`year_${cur}`];
        const month = row[`month_${cur}`];
        const day = row[`day_${cur}`];
        const name = row[`name_${cur}`];
        if (year && month && day && name) {
          holidays.push({ region: cur.toUpperCase(), jsDate: toDate(day, month, year), name });
        }
      });
    });

    const today = new Date();
    const upcoming = holidays.filter(h => h.jsDate >= today)
      .sort((a, b) => a.jsDate - b.jsDate)
      .slice(0, 5);
    renderCombinedTable("combinedHolidays", upcoming);

    // === EVENTS ===
    const eventsCSV = await fetchCSV(EVENTS_CSV_URL);
    let events = parseEventsCSV(eventsCSV);

    // === Filter only relevant upcoming events for current pair ===
    const now = new Date();
    events = events
      .filter(ev =>
        ev.currency &&
        (ev.currency.toUpperCase() === BASE.toUpperCase() ||
         ev.currency.toUpperCase() === QUOTE.toUpperCase()) &&
        new Date(ev.datetime) >= now
      )
      .sort((a, b) => new Date(a.datetime) - new Date(b.datetime))
      .slice(0, 10); // next 10 events

    renderEventsTable("upcomingEvents", events, 10);

    // === CALCULATION LOGIC ===
    function recalc() {
      const margin = parseFloat(marginSelect.value) || 0;
      const useCustom = document.getElementById("useCustomVolume").checked;
      const customVolume = parseFloat(document.getElementById("customVolume").value) || 0;
      const selectedVolume = parseFloat(volumeSelect.value) || 0;
      const volume = useCustom ? customVolume : selectedVolume;

      const adjusted = marketRate * (1 - margin);
      const inverse = (1 / marketRate) * (1 - margin);
      document.getElementById("offerRate").textContent = adjusted.toFixed(6);
      document.getElementById("inverseRate").textContent = inverse.toFixed(6);

      const baseSymbol = sym(BASE);
      const quoteSymbol = sym(QUOTE);

      if (volume > 0) {
        document.getElementById("exchangeEUR").textContent = `${baseSymbol}${volume.toLocaleString()}`;
        document.getElementById("exchangeUSD").textContent = `${quoteSymbol}${volume.toLocaleString()}`;

        const offerAmount = adjusted * volume;
        const inverseAmount = inverse * volume;
        document.getElementById("offerAmount").textContent = `${quoteSymbol}${offerAmount.toLocaleString()}`;
        document.getElementById("inverseAmount").textContent = `${baseSymbol}${inverseAmount.toLocaleString()}`;

        const effectiveMargin = margin - 0.00055;
        if (effectiveMargin > 0) {
          const revenueEURUSD = volume * effectiveMargin;
          const revenueUSDEUR = inverseAmount * effectiveMargin;
          document.getElementById("revenueEURUSD").textContent = revenueEURUSD.toLocaleString(undefined, {
            style: "currency", currency: "EUR"
          });
          document.getElementById("revenueUSDEUR").textContent = revenueUSDEUR.toLocaleString(undefined, {
            style: "currency", currency: "EUR"
          });
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

    marginSelect.addEventListener("change", recalc);
    volumeSelect.addEventListener("change", recalc);
    document.getElementById("customVolume").addEventListener("input", recalc);
    document.getElementById("useCustomVolume").addEventListener("change", recalc);
    recalc();

  } catch (e) {
    document.body.innerHTML = `<p style="color:red">${e.message}</p>`;
    console.error(e);
  }
}

main();
