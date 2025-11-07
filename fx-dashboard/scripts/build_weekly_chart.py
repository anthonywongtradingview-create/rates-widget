"""
build_weekly_chart.py
---------------------
Generates an interactive "Last Week Performance" candlestick chart
with annotated economic events for a given currency pair.

Requirements:
    pip install pandas plotly

Before running:
    1. Publish your Google Sheets as CSV and copy the URLs.
    2. Replace the placeholders below with your sheet URLs.
    3. Run: python scripts/build_weekly_chart.py
"""

import pandas as pd
import plotly.graph_objects as go
from datetime import timedelta

# --------------------------------------------------------------------
# 🔗 STEP 1: Configure your Google Sheets URLs
# --------------------------------------------------------------------
PRICE_DATA_URL = "https://docs.google.com/spreadsheets/d/e/YOUR_PRICE_SHEET_ID/pub?output=csv"
EVENTS_DATA_URL = "https://docs.google.com/spreadsheets/d/e/YOUR_EVENTS_SHEET_ID/pub?output=csv"

# --------------------------------------------------------------------
# ⚙️ STEP 2: Load and preprocess data
# --------------------------------------------------------------------
print("Loading data from Google Sheets...")

# Load price data (expect columns: Pair, Time, Open, High, Low, Close)
price_df = pd.read_csv(PRICE_DATA_URL, parse_dates=["Time"])

# Load event data (expect columns: Date, Time, Currency, Event, Actual, Forecast, Previous, Impact)
events_df = pd.read_csv(EVENTS_DATA_URL)
events_df["Datetime"] = pd.to_datetime(events_df["Date"] + " " + events_df["Time"], errors="coerce")

# --------------------------------------------------------------------
# 🕒 STEP 3: Filter for the last 7 days
# --------------------------------------------------------------------
latest_time = price_df["Time"].max()
last_week_start = latest_time - timedelta(days=7)
recent_prices = price_df[price_df["Time"] >= last_week_start]
recent_events = events_df[events_df["Datetime"] >= last_week_start]

# --------------------------------------------------------------------
# 💹 STEP 4: Function to build annotated chart for a given currency
# --------------------------------------------------------------------
def build_chart_for_pair(pair_name: str):
    df = recent_prices[recent_prices["Pair"] == pair_name]
    if df.empty:
        print(f"⚠️ No data found for {pair_name}. Skipping.")
        return None

    print(f"Building chart for {pair_name}...")

    fig = go.Figure(data=[go.Candlestick(
        x=df["Time"],
        open=df["Open"],
        high=df["High"],
        low=df["Low"],
        close=df["Close"],
        name=f"{pair_name} 1H Candles"
    )])

    # Add key weekly levels
    fig.add_hline(y=df["High"].max(), line_dash="dot", annotation_text="Weekly High", annotation_position="top left")
    fig.add_hline(y=df["Low"].min(), line_dash="dot", annotation_text="Weekly Low", annotation_position="bottom left")
    fig.add_hline(y=df["Close"].mean(), line_dash="dot", annotation_text="Weekly Average", annotation_position="bottom right")

    # Annotate economic events
    events_for_pair = recent_events[recent_events["Currency"] == pair_name[:3]]  # e.g. "EURUSD" → "EUR"
    for _, row in events_for_pair.iterrows():
        # Find nearest candle to event time
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
            bgcolor="rgba(255,255,0,0.7)" if row.get("Impact", "").lower() == "high" else "rgba(200,200,200,0.6)",
            bordercolor="black"
        )

    # Layout styling
    fig.update_layout(
        title=f"{pair_name} – Last Week Performance",
        xaxis_title="Time (UTC)",
        yaxis_title="Price",
        template="plotly_dark",
        xaxis_rangeslider_visible=False,
        margin=dict(l=50, r=50, t=80, b=50)
    )

    return fig

# --------------------------------------------------------------------
# 🧭 STEP 5: Generate charts for each unique currency pair
# --------------------------------------------------------------------
unique_pairs = recent_prices["Pair"].unique()

for pair in unique_pairs:
    fig = build_chart_for_pair(pair)
    if fig:
        output_path = f"output/{pair}_last_week.html"
        fig.write_html(output_path)
        print(f"✅ Chart saved to {output_path}")

print("All charts generated successfully!")

