
// === CONFIG ===
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_1Df4oUf4sjTdt75U-dcQ5GiMKPmKs1GAOke-rfIck4dwoAS8jua_vjvlMhOou4Huyjd5o2B3FSlB/pub?gid=0&single=true&output=csv";
const EVENTS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_1Df4oUf4sjTdt75U-dcQ5GiMKPmKs1GAOke-rfIck4dwoAS8jua_vjvlMhOou4Huyjd5o2B3FSlB/pub?gid=433576226&single=true&output=csv";
const BASE = "EUR", QUOTE = "USD";

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

// === PARSE CSV (rates + EUR & USD holiday tables) ===
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift().split(",").map(h => h.trim().toLowerCase());
  const idx = {
    base: header.indexOf("base"),
    quote: header.indexOf("quote"),
    rate: header.indexOf("rate"),
    time: header.indexOf("time_of_rate"),
    year_eur: header.indexOf("year_eur"),
    month_eur: header.indexOf("month_eur"),
    day_eur: header.indexOf("day_eur"),
    name_eur: header.indexOf("name_eur"),
    year_usd: header.indexOf("year_usd"),
    month_usd: header.indexOf("month_usd"),
    day_usd: header.indexOf("day_usd"),
    name_usd: header.indexOf("name_usd")
  };

  const rates = [];
  const eurHolidays = [];
  const usdHolidays = [];

  for (const line of lines) {
    const cols = line.split(",").map(c => c.replace(/^"|"$/g, '').trim());

    // Rate rows
    if (idx.base >= 0 && idx.quote >= 0 && idx.rate >= 0 &&
        cols[idx.base] && cols[idx.quote] && Number.isFinite(parseFloat(cols[idx.rate]))) {
      rates.push({
        base: cols[idx.base],
        quote: cols[idx.quote],
        rate: parseFloat(cols[idx.rate]),
        time: idx.time >= 0 ? cols[idx.time] : null
      });
    }

    // EUR holidays
    if (idx.year_eur >= 0 && idx.month_eur >= 0 && idx.day_eur >= 0 &&
        cols[idx.year_eur] && cols[idx.month_eur] && cols[idx.day_eur]) {
      eurHolidays.push({
        year: cols[idx.year_eur],
        month: cols[idx.month_eur],
        day: cols[idx.day_eur],
        name: cols[idx.name_eur] || "Holiday",
        region: "EUR"
      });
    }

    // USD holidays
    if (idx.year_usd >= 0 && idx.month_usd >= 0 && idx.day_usd >= 0 &&
        cols[idx.year_usd] && cols[idx.month_usd] && cols[idx.day_usd]) {
      usdHolidays.push({
        year: cols[idx.year_usd],
        month: cols[idx.month_usd],
        day: cols[idx.day_usd],
        name: cols[idx.name_usd] || "Holiday",
        region: "USD"
      });
    }
  }

  return { rates, eurHolidays, usdHolidays };
}

// === PARSE EVENTS CSV ===
function parseEventsCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift().split(",").map(h => h.trim().toLowerCase());
  const idx = {
    datetime: header.indexOf("date_and_time"),
    currency: header.indexOf("currency"),
    importance: header.indexOf("importance"),
    event: header.indexOf("event"),
    actual: header.indexOf("actual"),
    forecast: header.indexOf("forecast"),
    previous: header.indexOf("previous")
  };

  const events = [];

  for (const line of lines) {
    const cols = line.split(",").map(c => c.replace(/^"|"$/g, '').trim());
    if (cols[idx.datetime] && cols[idx.currency]) {
      events.push({
        datetime: new Date(cols[idx.datetime]),
        currency: cols[idx.currency],
        importance: cols[idx.importance] || "",
        event: cols[idx.event] || "",
        actual: cols[idx.actual] || "",
        forecast: cols[idx.forecast] || "",
        previous: cols[idx.previous] || ""
      });
    }
  }
  return events.sort((a, b) => a.datetime - b.datetime);
}

// === UTIL: Convert "DD-MMM-YYYY" parts to JS Date ===
function toDate(day, monAbbr, year) {
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const m = months.indexOf(String(monAbbr).toUpperCase());
  return new Date(`${year}-${m+1}-${day}`);
}

// === Build combined next 5 holidays across EUR + USD ===
function getCombinedNextHolidays(eurList, usdList, refDate, count = 5) {
  const all = [...eurList, ...usdList].map(h => ({
    ...h,
    jsDate: toDate(h.day, h.month, h.year)
  }));
  const future = all.filter(h => h.jsDate > refDate)
                    .sort((a, b) => a.jsDate - b.jsDate);
  return future.slice(0, count);
}

// === Render combined table ===
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

// === Render events table ===
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
    const csv = await fetchCSV(CSV_URL);
    const { rates, eurHolidays, usdHolidays } = parseCSV(csv);

    // Rate panel
    const pair = rates.find(r => r.base === BASE && r.quote === QUOTE);
    if (!pair) throw new Error("EUR/USD not found in data");

    const marketRate = pair.rate;
    document.getElementById("marketRate").textContent = marketRate.toFixed(6);
    document.getElementById("lastUpdate").textContent = pair.time || "unknown";

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
        // Revenue for EUR>USD = Exchange amount in euros × effective margin
        const revenueEURUSD = volume * effectiveMargin;
  
        // Revenue for USD>EUR = Offer in euros × effective margin
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
      // Reset all fields if volume is 0 or empty
      document.getElementById("exchangeEUR").textContent = "–";
      document.getElementById("exchangeUSD").textContent = "–";
      document.getElementById("offerAmount").textContent = "–";
      document.getElementById("inverseAmount").textContent = "–";
      document.getElementById("revenueEURUSD").textContent = "–";
      document.getElementById("revenueUSDEUR").textContent = "–";
    }
  }

    // ✅ These belong inside the try block (after recalc is defined)
    marginSelect.addEventListener("change", recalc);
    volumeSelect.addEventListener("change", recalc);
    document.getElementById("customVolume").addEventListener("input", recalc);
    document.getElementById("useCustomVolume").addEventListener("change", recalc);
    recalc();

    // Combined holiday table using time_of_rate as reference
    const refDate = new Date(pair.time || Date.now());
    const combinedNext5 = getCombinedNextHolidays(eurHolidays, usdHolidays, refDate, 5);
    renderCombinedTable("combinedHolidays", combinedNext5);

    // === Fetch and render economic events ===
    const eventsCSV = await fetchCSV(EVENTS_CSV_URL);
    const events = parseEventsCSV(eventsCSV);

    const now = new Date();
    const upcoming = events.filter(e => e.datetime > now);
    renderEventsTable("upcomingEvents", upcoming, 10);

  } catch (e) {
    document.body.innerHTML = `<p style="color:red">${e.message}</p>`;
    console.error(e);
  }
}

main();
