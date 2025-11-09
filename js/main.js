// === CONFIG ===
// Shared Google Sheet (single CSV for all currency pairs)
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_1Df4oUf4sjTdt75U-dcQ5GiMKPmKs1GAOke-rfIck4dwoAS8jua_vjvlMhOou4Huyjd5o2B3FSlB/pub?gid=0&single=true&output=csv";
const EVENTS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_1Df4oUf4sjTdt75U-dcQ5GiMKPmKs1GAOke-rfIck4dwoAS8jua_vjvlMhOou4Huyjd5o2B3FSlB/pub?gid=433576226&single=true&output=csv";

// Read which pair this page is for
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
  CAD: "C$"
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

// === PARSE CSV ===
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift().split(",").map(h => h.trim().toLowerCase());
  return lines.map(line => {
    const cols = line.split(",").map(c => c.replace(/^"|"$/g, "").trim());
    return Object.fromEntries(header.map((h, i) => [h, cols[i]]));
  });
}

// === UTIL: Convert "DD-MMM-YYYY" or "DD/MM/YYYY" ===
function safeDateParse(value) {
  if (!value) return null;
  const parts = value.match(/\d+/g);
  if (!parts) return new Date(value);
  if (parts[2] && parts[1] && parts[0]) {
    if (value.includes("-")) return new Date(value); // already ISO-like
    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
  }
  return new Date(value);
}

// === Render combined holidays table ===
function renderCombinedTable(id, holidays) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!holidays.length) {
    el.innerHTML = "<p>No upcoming settlement holidays found.</p>";
    return;
  }
  const rows = holidays
    .map(
      h => `
    <tr>
      <td>${h.jsDate.toLocaleDateString()}</td>
      <td>${h.region}</td>
      <td>${h.name}</td>
    </tr>`
    )
    .join("");
  el.innerHTML = `
    <table>
      <thead>
        <tr><th>Date</th><th>Region</th><th>Holiday</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// === Parse events CSV (includes Insights column) ===
function parseEventsCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift().split(",").map(h => h.trim().toLowerCase());
  const idx = {
    datetime: header.indexOf("date_and_time"),
    currency: header.indexOf("currency"),
    importance: header.indexOf("importance"),
    event: header.indexOf("event"),
    insights: header.indexOf("insights")
  };
  return lines
    .map(line => {
      const cols = line.split(",").map(c => c.replace(/^"|"$/g, "").trim());
      return {
        datetime: safeDateParse(cols[idx.datetime]),
        currency: cols[idx.currency],
        importance: cols[idx.importance],
        event: cols[idx.event],
        insights: cols[idx.insights] || ""
      };
    })
    .filter(e => e.datetime instanceof Date && !isNaN(e.datetime))
    .sort((a, b) => a.datetime - b.datetime);
}

// === Render economic events table (with clickable Insights button) ===
function renderEventsTable(id, events, limit = 10) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!events.length) {
    el.innerHTML = "<p>No upcoming events found.</p>";
    return;
  }

  const rows = events
    .slice(0, limit)
    .map(ev => {
      const insightsButton = ev.insights
        ? `<a href="${ev.insights}" target="_blank" class="insight-btn">View</a>`
        : "";
      return `
      <tr>
        <td>${ev.datetime.toLocaleString()}</td>
        <td>${ev.currency}</td>
        <td>${ev.importance}</td>
        <td>${ev.event}</td>
        <td>${insightsButton}</td>
      </tr>`;
    })
    .join("");

  el.innerHTML = `
    <table style="font-size:13px;">
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

  // === Convert numeric importance to color bars ===
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

// === Main ===
async function main() {
  try {
    const csvText = await fetchCSV(CSV_URL);
    const allRows = parseCSV(csvText);
    const pair = allRows.find(r => r.base === BASE && r.quote === QUOTE);
    if (!pair) throw new Error(`${BASE}/${QUOTE} not found in data`);

    const marketRate = parseFloat(pair.rate);
    document.getElementById("marketRate").textContent = marketRate.toFixed(6);
    document.getElementById("lastUpdate").textContent =
      pair.time_of_rate || "unknown";

    // === HOLIDAYS ===
    const holidays = [];
    allRows.forEach(row => {
      [BASE.toLowerCase(), QUOTE.toLowerCase()].forEach(cur => {
        const year = row[`year_${cur}`];
        const month = row[`month_${cur}`];
        const day = row[`day_${cur}`];
        const name = row[`name_${cur}`];
        if (year && month && day && name)
          holidays.push({
            region: cur.toUpperCase(),
            jsDate: new Date(`${month} ${day}, ${year}`),
            name
          });
      });
    });
    const today = new Date();
    const upcoming = holidays
      .filter(h => h.jsDate >= today)
      .sort((a, b) => a.jsDate - b.jsDate)
      .slice(0, 5);
    renderCombinedTable("combinedHolidays", upcoming);

    // === EVENTS ===
    const eventsCSV = await fetchCSV(EVENTS_CSV_URL);
    const events = parseEventsCSV(eventsCSV);
    const now = new Date();
    const upcomingEvents = events.filter(e => e.datetime > now);
    renderEventsTable("upcomingEvents", upcomingEvents, 10);

    // === Recalc ===
    function recalc() {
      const margin = parseFloat(marginSelect.value) || 0;
      const useCustom = document.getElementById("useCustomVolume").checked;
      const customVolume =
        parseFloat(document.getElementById("customVolume").value) || 0;
      const selectedVolume = parseFloat(volumeSelect.value) || 0;
      const volume = useCustom ? customVolume : selectedVolume;

      const adjusted = marketRate * (1 - margin);
      const inverse = (1 / marketRate) * (1 - margin);

      document.getElementById("offerRate").textContent = adjusted.toFixed(6);
      document.getElementById("inverseRate").textContent = inverse.toFixed(6);

      const baseSymbol = sym(BASE);
      const quoteSymbol = sym(QUOTE);

      if (volume > 0) {
        document.getElementById(
          "exchangeEUR"
        ).textContent = `${baseSymbol}${volume.toLocaleString(undefined, {
          minimumFractionDigits: 2
        })}`;
        document.getElementById(
          "exchangeUSD"
        ).textContent = `${quoteSymbol}${volume.toLocaleString(undefined, {
          minimumFractionDigits: 2
        })}`;

        const offerAmount = adjusted * volume;
        const inverseAmount = inverse * volume;

        document.getElementById(
          "offerAmount"
        ).textContent = `${quoteSymbol}${offerAmount.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}`;
        document.getElementById(
          "inverseAmount"
        ).textContent = `${baseSymbol}${inverseAmount.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}`;
      } else {
        document.getElementById("exchangeEUR").textContent = "–";
        document.getElementById("exchangeUSD").textContent = "–";
        document.getElementById("offerAmount").textContent = "–";
        document.getElementById("inverseAmount").textContent = "–";
      }
    }

    marginSelect.addEventListener("change", recalc);
    volumeSelect.addEventListener("change", recalc);
    document.getElementById("customVolume").addEventListener("input", recalc);
    document
      .getElementById("useCustomVolume")
      .addEventListener("change", recalc);
    recalc();
  } catch (e) {
    console.error("⚠️ Error loading data:", e);
    const msg = document.createElement("p");
    msg.textContent =
      "⚠️ Some data failed to load. Please refresh or check your Google Sheet link.";
    msg.style.color = "red";
    msg.style.textAlign = "center";
    document.body.prepend(msg);
  }
}

main();
