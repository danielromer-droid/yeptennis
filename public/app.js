document.addEventListener("DOMContentLoaded", () => {
  fetchTennisData();
  fetchBBCNews();
});

async function fetchTennisData() {
  try {
    const response = await fetch("/api/tennis");
    const data = await response.json();

    if (data.lastUpdated) {
      document.getElementById("refresh-status").textContent = 
        `Last Synced: ${new Date(data.lastUpdated).toLocaleTimeString()} (Refreshed 6x Daily)`;
    }

    // Render Calendar
    const calEl = document.getElementById("calendar-container");
    calEl.innerHTML = data.calendar.map(item => `
      <div class="item">
        <strong>${item.name}</strong> <span class="badge">${item.type}</span>
        <div><small>🗓️ ${item.dates} | Surface: ${item.surface}</small></div>
      </div>
    `).join("");

    // Render Scores
    const resEl = document.getElementById("results-container");
    resEl.innerHTML = data.results.map(item => `
      <div class="item">
        <small>${item.date} — ${item.tournament} (${item.round})</small>
        <div><strong>${item.match}</strong></div>
        <div class="score">${item.score}</div>
      </div>
    `).join("");

  } catch (err) {
    document.getElementById("calendar-container").textContent = "Unable to load tennis data.";
  }
}

async function fetchBBCNews() {
  try {
    const response = await fetch("/api/bbc-news");
    const articles = await response.json();

    const newsEl = document.getElementById("news-container");
    newsEl.innerHTML = articles.map(art => `
      <div class="news-item">
        <a href="${art.link}" target="_blank" rel="noopener">${art.title}</a>
        <p>${art.description}</p>
      </div>
    `).join("");

  } catch (err) {
    document.getElementById("news-container").textContent = "Unable to load BBC News feed.";
  }
}
