"""
build_weekly_chart.py
---------------------
Generates an interactive "Last Week Performance" candlestick chart
from 5-minute Myfxbook data (EUR/USD) and annotates it with
economic events from a Google Sheet.

Requirements:
    pip install pandas plotly

Before running:
    1. Publish your Google Sheets as CSV and copy the URLs.
       - File → Share → Publish to web → choose "Comma-separated values (.csv)"
       - Copy the link for each sheet (PriceData and Events)
    2. Replace the placeholders below with your sheet URLs.
    3. Run: python scripts/build_weekly_chart.py
"""

import pandas as pd
import plotly.graph_objects as go
from datetime import timedelta
import os

# --------------------------------------------------------------------
# 🔗 STEP 1: Configure your Google Sheets URLs
# --------------------------------------------------------------------
# 👇 Replace these with your actual published CSV URLs
PRICE_DATA_URL = "https://docs.google.com/spreadsheets/d/e/REPLACE_WITH_YOUR_PRICE_SHEET_ID/pub?output=csv"
EVENTS_DATA_URL = "https://docs.google.com/spreadsheets/d/e/REPLACE_WITH_YOUR_EVENTS_SHEET_ID/pub?output=csv"

# --------------------------------------------------------------------
# ⚙️ STEP 2: Load and preprocess price data (5-minute → 1-hour)
# --------------------------------------------------------------------
print("📥 Loading data from Google Sheets...")

try:
    price_df = pd.read_csv(PRICE_DATA_URL, parse_dates=["date_eurusd"])
except Exception as e:
    print("❌ Error loading price data. Check your URL or column headers.")
    raise e

# Rename columns to generic names
price_df.rename(columns={
    "date_eurusd": "Time",
    "open_eurusd": "Open",
    "high_eurusd": "High",
    "low_eurusd": "Low",
    "close_eurusd": "Close"
}, inplace=True)

# Add a pair label (since your sheet is only EURUSD for now)
price_df["Pair"] = "EURUSD"

# Ensure sorted by time
price_df.sort_values("Time", inplace=True)

# Convert from 5-minute data to 1-hour candles
price_df.set_index("Time", inplace=True)
price_1h = price_df.resample("1H").agg({
    "Open": "first",
    "High": "max",
    "Low": "min",
    "Close": "last"
}).dropna().reset_index()
price_1h["Pair"] = "EURUSD"

# --------------------------------------------------------------------
# ⚙️ STEP 3: Load and preprocess events data
# --------------------------------------------------------------------
try:
    events_df = pd.read_csv(EVENTS_DATA_URL)
    events_df["Datetime"] = pd.to_datetime(events_df["Date"] + " " + events_df["Time"], errors="coerce")
except Exception as e:
    print("❌ Error loading event data. Check your URL or column headers.")
    raise e

# --------------------------------------------------------------------
# 🕒 STEP 4: Filter for the last 7 days
# --------------------------------------------------------------------
latest_time = price_1h["Time"].max()
last_week_start = latest_time - timedelta(days=7)
recent_prices = price_1h[price_1h["Time"] >= last_week_start].copy()
recent_events = events_df[events_df["Datetime"] >= last_week_start].copy()

# --------------------------------------------------------------------
# 💹 STEP 5: Build annotated chart
# --------------------------------------------------------------------
def build_chart_for_pair(pair_name: str):
    df = recent_prices[recent_prices["Pair"] == pair_name]
    if df.empty:
        print(f"⚠️ No data found for {pair_name}. Skipping.")
        return None

    print(f"📊 Building chart for {pair_name}...")

    fig = go.Figure(data=[go.Candlestick(
        x=df["Time"],
        open=df["Open"],
        high=df["High"],
        low=df["Low"],
        close=df["Close"],
        name=f"{pair_name} 1H Candles"
    )])

    # Weekly levels
    fig.add_hline(y=df["High"].max(), line_dash="dot",
                  annotation_text="Weekly High", annotation_position="top left")
    fig.add_hline(y=df["Low"].min(), line_dash="dot",
                  annotation_text="Weekly Low", annotation_position="bottom left")
    fig.add_hline(y=df["Close"].mean(), line_dash="dot",
                  annotation_text="Weekly Average", annotation_position="bottom right")

    # Annotate events (USD side for EURUSD)
    events_for_pair = recent_events[recent_events["Currency"] == "USD"]
    for _, row in events_for_pair.iterrows():
        nearest_idx = (df["Time"] - row["Datetime"]).abs().idxmin()
        candle_time = df.loc[nearest_idx, "Time"]
        candle_high = df.loc[nearest_idx, "High"]

        fig.add_annotation(
            x=candle_time,
            y=candle_high,
            text=f"{row['Event']}<br>Actual: {row.get('Actual', '')}",
            showarrow=True,
            arrowhead=2,
            yshift=30,
            bgcolor="rgba(255,255,0,0.7)" if str(row.get("Impact", "")).lower() == "high" else "rgba(200,200,200,0.6)",
            bordercolor="black"
        )

    # Styling
    fig.update_layout(
        title=f"{pair_name} – Last Week Performance (1H Aggregated)",
        xaxis_title="Time (UTC)",
        yaxis_title="Price",
        template="plotly_dark",
        xaxis_rangeslider_visible=False,
        margin=dict(l=50, r=50, t=80, b=50)
    )

    return fig

# --------------------------------------------------------------------
# 🧭 STEP 6: Generate the chart
# --------------------------------------------------------------------
os.makedirs("output", exist_ok=True)
fig = build_chart_for_pair("EURUSD")

if fig:
    output_path = "output/EURUSD_last_week.html"
    fig.write_html(output_path)
    print(f"✅ Chart saved to {output_path}")

print("🎉 All charts generated successfully!")

