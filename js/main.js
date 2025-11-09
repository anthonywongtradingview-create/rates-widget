// === CONFIG ===
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_1Df4oUf4sjTdt75U-dcQ5GiMKPmKs1GAOke-rfIck4dwoAS8jua_vjvlMhOou4Huyjd5o2B3FSlB/pub?gid=0&single=true&output=csv";
const EVENTS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR_1Df4oUf4sjTdt75U-dcQ5GiMKPmKs1GAOke-rfIck4dwoAS8jua_vjvlMhOou4Huyjd5o2B3FSlB/pub?gid=433576226&single=true&output=csv";

const BASE = window.BASE || "EUR";
const QUOTE = window.QUOTE || "USD";

// === Currency symbols ===
const currencySymbols = { EUR: "€", USD: "$", GBP: "£", CHF: "Fr.", AED: "DH", JPY: "¥", AUD: "A$", CAD: "C$" };
function sym(cur) { return currencySymbols[cur] || cur; }

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

// === SAFE CSV PARSER ===
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// === Parse CSV (with header row) ===
function parseEventsCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = parseCSVLine(lines.shift()).map(h => h.trim().toLowerCase());
  const idx = {
    datetime: header.indexOf("date_and_time"),
    currency: header.indexOf("currency"),
    importance: header.indexOf("importance"),
    event: header.indexOf("event"),
    insights: header.indexOf("insights")
  };

  return lines
    .map(line => {
      const cols = parseCSVLine(line);
      const rawDate = cols[idx.datetime];
      const parsedDate = new Date(rawDate.replace(/-/g, "/")); // handle 13-Nov-2025 08:00:00 format
      return {
        datetime: parsedDate,
        currency: cols[idx.currency],
        importance: cols[idx.importance],
        event: cols[idx.event],
        insights: cols[idx.insights]
      };
    })
    .filter(e => e.datetime instanceof Date && !isNaN(e.datetime))
    .sort((a, b) => a.datetime - b.datetime);
}

// === Render economic events table (adds Insights button) ===
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
      <td>${ev.insights ? `<a href="${ev.insights}" target="_blank" class="insight-btn">View</a>` : ""}</td>
    </tr>`).join("");

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

  // === Intensity bars ===
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
    const eventsCSV = await fetchCSV(EVENTS_CSV_URL);
    const events = parseEventsCSV(eventsCSV);
    const now = new Date();
    const upcoming = events.filter(e => e.datetime > now);
    renderEventsTable("upcomingEvents", upcoming, 20);
  } catch (e) {
    console.error("⚠️ Error:", e);
    document.getElementById("upcomingEvents").innerHTML = "<p style='color:red'>Failed to load events.</p>";
  }
}

main();
