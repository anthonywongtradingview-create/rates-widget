// === CONFIG ===
// Shared Google Sheet (single CSV for all currency pairs)
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_1Df4oUf4sjTdt75U-dcQ5GiMKPmKs1GAOke-rfIck4dwoAS8jua_vjvlMhOou4Huyjd5o2B3FSlB/pub?gid=0&single=true&output=csv";
const EVENTS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_1Df4oUf4sjTdt75U-dcQ5GiMKPmKs1GAOke-rfIck4dwoAS8jua_vjvlMhOou4Huyjd5o2B3FSlB/pub?gid=433576226&single=true&output=csv";

// Read which pair this page is for (each HTML sets this via <script>)
const BASE = window.BASE || "EUR";
const QUOTE = window.QUOTE || "USD";

console.log(`✅ Loading data for ${BASE}/${QUOTE}`);

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

  // Dynamic index lookup
  const idx = {};
  header.forEach((h, i) => (idx[h] = i));

  const rows = lines.map(line => {
    const cols = line.split(",").map(c => c.replace(/^"|"$/g, "").trim());
    return Object.fromEntries(header.map((h, i) => [h, cols[i]]));
  });

  return rows;
}

// === UTIL: Convert "DD-MMM-YYYY" parts to JS Date ===
function toDate(day, monAbbr, year) {
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const m = months.indexOf(String(monAbbr).toUpperCase());
  if (m < 0) return new Date(); // fallback if month abbreviation invalid
  return new Date(`${year}-${m + 1}-${day}`);
}

// === Render combined holidays table ===
function renderCombinedTable(id, holidays) {
  const el = document.getElementById(id);
  if (!el) return;

  if (!holidays.length) {
    el.innerHTML = "<p>No upcoming settlement holidays found.</p>";
    return;
  }

  const rows = holidays.map(h => `
    <tr>
      <td>${h.jsDate.toLocaleDateString()}</td>
      <td>${h.region}</td>
      <td>${h.name}</td>
    </tr>
  `).join("");

  el.innerHTML = `
    <table>
      <thead>
        <tr>
          <th style="text-align:left;">Date</th>
          <th style="text-align:left;">Region</th>
          <th style="text-align:left;">Holiday</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// === Render economic events table ===
function renderEventsTable(id, events, limit = 10) {
  const el = document.getElementById(id);
  if (!el) return;

  if (!events.length) {
    el.innerHTML = "<p>No upcoming events found.</p>";
    return;
  }

  const rows = events.slice(0, limit).map(ev => `
    <tr>
      <td>${ev.datetime.toLocaleString()}</td>
      <td>${ev.currency}</td>
      <td>${ev.importance}</td>
      <td>${ev.event}</td>
      <td>${ev.actual}</td>
      <td>${ev.forecast}</td>
      <td>${ev.previous}</td>
    </tr>
  `).join("");

  el.innerHTML = `
    <table style="font-size:13px;">
      <thead>
        <tr>
          <th>Date & Time</th>
          <th>Currency</th>
          <th>Importance</th>
          <th>Event</th>
          <th>Actual</th>
          <th>Forecast</th>
          <th>Previous</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// === Main ===
async function main() {
  try {
    const csvText = await fetchCSV(CSV_URL);
    const allRows = parseCSV(csvText);

    // Filter for this specific pair (e.g., EUR/USD)
    const pair = allRows.find(r => r.base === BASE && r.quote === QUOTE);
    if (!pair) throw new Error(`${BASE}/${QUOTE} not found in data`);

    const marketRate = parseFloat(pair.rate);
    document.getElementById("marketRate").textContent = marketRate.toFixed(6);
    document.getElementById("lastUpdate").textContent = pair.time_of_rate || "unknown";

    // === HOLIDAYS ===
    const holidays = [];
    ["eur", "usd", "gbp", "chf", "aed"].forEach(cur => {
      const year = pair[`year_${cur}`];
      const month = pair[`month_${cur}`];
      const day = pair[`day_${cur}`];
      const name = pair[`name_${cur}`];
      if (year && month && day && name)
        holidays.push({
          region: cur.toUpperCase(),
          jsDate: toDate(day, month, year),
          name
        });
    });

    const combinedNext5 = holidays
      .sort((a, b) => a.jsDate - b.jsDate)
      .slice(0, 5);
    renderCombinedTable("combinedHolidays", combinedNext5);

    // === Fetch and render economic events ===
    const eventsCSV = await fetchCSV(EVENTS_CSV_URL);
    const events = parseEventsCSV(eventsCSV);
    const now = new Date();
    const upcoming = events.filter(e => e.datetime > now);
    renderEventsTable("upcomingEvents", upcoming, 10);

    // === Calculations ===
    function recalc() {
      const margin = parseFloat(marginSelect.value) || 0;

      // Check if user wants to use their own value
      const useCustom = document.getElementById("useCustomVolume").checked;
      const customVolume = parseFloat(document.getElementById("customVolume").value) || 0;
      const selectedVolume = parseFloat(volumeSelect.value) || 0;
      const volume = useCustom ? customVolume : selectedVolume;

      const adjusted = marketRate * (1 - margin);
      const inverse = (1 / marketRate) * (1 - margin);

      document.getElementById("offerRate").textContent = adjusted.toFixed(6);
      document.getElementById("inverseRate").textContent = inverse.toFixed(6);

      if (volume > 0) {
        // Update exchange amount cells
        document.getElementById("exchangeEUR").textContent =
          `€${volume.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        document.getElementById("exchangeUSD").textContent =
          `$${volume.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

        const offerAmount = adjusted * volume;
        const inverseAmount = inverse * volume;

        document.getElementById("offerAmount").textContent =
          offerAmount.toLocaleString(undefined, { style: "currency", currency: "USD" });
        document.getElementById("inverseAmount").textContent =
          inverseAmount.toLocaleString(undefined, { style: "currency", currency: "EUR" });

        // === Calculate expected trading revenue (Estimates)
        const effectiveMargin = margin - 0.00055; // margin minus 0.055%
        if (effectiveMargin > 0) {
          const revenueEURUSD = volume * effectiveMargin;
          const revenueUSDEUR = inverseAmount * effectiveMargin;

          document.getElementById("revenueEURUSD").textContent =
            revenueEURUSD.toLocaleString(undefined, { style: "currency", currency: "EUR" });
          document.getElementById("revenueUSDEUR").textContent =
            revenueUSDEUR.toLocaleString(undefined, { style: "currency", currency: "EUR" });
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

    // === Event listeners ===
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

