const API = '/api';
const $ = (id) => document.getElementById(id);
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function getPlayerName() {
  let name = localStorage.getItem('geoquest-player');
  if (!name || name === 'Explorer') {
    const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
    name = `Explorer-${suffix}`;
    localStorage.setItem('geoquest-player', name);
  }
  return name;
}

const playerName = getPlayerName();
let selectedMode = 'explorer';
let gameId = null;
let map = null;
let tileLayer = null;
let guessMarker = null;
let targetLayer = null;
let currentRound = 1;
let totalRounds = 10;
let totalScore = 0;
let hintsUsed = 0;
let hasGuessed = false;
let busy = false;
let availableRegions = [];
let targetCountryName = '';

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(`Server returned an unreadable response (${response.status}).`); }
  if (!response.ok || data.success === false) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

let toastTimer;
function notify(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 4200);
}

function showScreen(name) {
  ['home', 'play', 'analytics'].forEach((screen) => $(`view-${screen}`).classList.toggle('hidden', screen !== name));
  if (name === 'play' && map) requestAnimationFrame(() => map.invalidateSize(true));
}

function selectMode(mode) {
  selectedMode = mode;
  document.querySelectorAll('[data-mode]').forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('region-picker').classList.toggle('hidden', mode !== 'regional');
  if (mode === 'regional' && !availableRegions.length) loadRegions();
}

async function loadRegions() {
  const select = $('region-select');
  select.innerHTML = '<option value="">Loading regions…</option>';
  try {
    const data = await api('/regions');
    availableRegions = data.regions || [];
    select.innerHTML = availableRegions.map((region) => `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`).join('');
    if (!availableRegions.length) throw new Error('No regions are available.');
  } catch (error) {
    select.innerHTML = '<option value="">Regions unavailable</option>';
    notify(`Could not load regions: ${error.message}`);
  }
}

function initMap() {
  if (map) return;
  if (typeof L === 'undefined') throw new Error('The map library did not load. Check your internet connection and refresh.');
  map = L.map('map', {
    worldCopyJump: true,
    minZoom: 2,
    maxZoom: 18,
    zoomControl: false,
    attributionControl: true,
  }).setView([18, 0], 2);

  // Satellite imagery has no political boundary overlay or country labels.
  tileLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 18,
      attribution: 'Tiles &copy; Esri — Sources: Esri, Maxar, Earthstar Geographics',
      crossOrigin: true,
    },
  ).addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  tileLayer.on('tileerror', () => {
    notify('Map tiles could not load. Check your internet connection or network restrictions.');
  });
  map.on('click', async (event) => {
    if (!gameId || hasGuessed || busy) return;
    await submitGuess(event.latlng.lat, event.latlng.lng);
  });
}

async function startGame() {
  if (busy) return;
  if (selectedMode === 'regional' && !$('region-select').value) {
    notify('Choose a region before starting.');
    return;
  }
  busy = true;
  $('start-game').disabled = true;
  $('start-game').textContent = 'STARTING…';
  try {
    const region = selectedMode === 'regional' ? $('region-select').value : null;
    const data = await api('/games', {
      method: 'POST',
      body: JSON.stringify({ playerName, mode: selectedMode, region }),
    });
    gameId = data.game.id;
    currentRound = data.game.current_round || 1;
    totalRounds = data.game.total_rounds || 10;
    totalScore = data.game.total_score || 0;
    targetCountryName = data.game.round?.targetCountryName || 'Mystery country';
    showScreen('play');
    initMap();
    resetRound();
    requestAnimationFrame(() => map.invalidateSize(true));
  } catch (error) {
    notify(error.message);
  } finally {
    busy = false;
    $('start-game').disabled = false;
    $('start-game').innerHTML = 'START GAME <span>↗</span>';
  }
}

function resetRound() {
  hasGuessed = false;
  hintsUsed = 0;
  if (guessMarker && map) map.removeLayer(guessMarker);
  if (targetLayer && map) map.removeLayer(targetLayer);
  guessMarker = null;
  targetLayer = null;
  $('round-title').textContent = `ROUND ${String(currentRound).padStart(2, '0')} / ${String(totalRounds).padStart(2, '0')}`;
  $('target-country-name').textContent = targetCountryName || 'Mystery country';
  $('progress-fill').style.width = `${((currentRound - 1) / totalRounds) * 100}%`;
  $('game-score').textContent = totalScore.toLocaleString();
  $('hints-left').textContent = '2 HINTS LEFT';
  $('map-instruction').textContent = 'Click anywhere on the map to place your guess.';
  ['hint-one-result', 'hint-two-result'].forEach((id) => {
    $(id).classList.add('hidden');
    $(id).textContent = '';
  });
  ['hint-one', 'hint-two'].forEach((id) => { $(id).disabled = false; });
  $('round-result').classList.add('hidden');
  if (map) map.setView([18, 0], 2);
}

async function revealHint(number) {
  if (!gameId || hasGuessed || busy || number !== hintsUsed + 1) return;
  const button = $(`hint-${number === 1 ? 'one' : 'two'}`);
  button.disabled = true;
  try {
    const data = await api(`/games/${gameId}/hint`, { method: 'POST', body: '{}' });
    hintsUsed = data.hintsUsed;
    const result = $(`hint-${number === 1 ? 'one' : 'two'}-result`);
    result.textContent = `${data.hint.label}: ${data.hint.value}`;
    result.classList.remove('hidden');
    $('hints-left').textContent = `${data.hintsRemaining} HINT${data.hintsRemaining === 1 ? '' : 'S'} LEFT`;
    if (data.hintsRemaining === 0) $('hint-two').disabled = true;
  } catch (error) {
    button.disabled = false;
    notify(error.message);
  }
}

async function submitGuess(lat, lng) {
  if (busy || hasGuessed) return;
  busy = true;
  hasGuessed = true;
  $('map-instruction').textContent = 'Checking your guess…';
  guessMarker = L.circleMarker([lat, lng], {
    radius: 8, color: '#f3f0e8', weight: 2, fillColor: '#c6d2c4', fillOpacity: 1,
  }).addTo(map).bindPopup('Your guess').openPopup();
  try {
    const data = await api(`/games/${gameId}/guess`, {
      method: 'POST',
      body: JSON.stringify({ lat, lng }),
    });
    const result = data.result;
    totalScore += result.score;
    $('game-score').textContent = totalScore.toLocaleString();

    // The target outline appears only after the player has committed a guess.
    targetLayer = L.geoJSON(result.geometry, {
      style: { color: '#f1d6a1', weight: 2, fillColor: '#f1d6a1', fillOpacity: 0.22 },
    }).addTo(map);
    const bounds = targetLayer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [70, 70], maxZoom: 6 });

    $('map-instruction').textContent = result.correct
      ? 'Correct. Your marker is inside the target country.'
      : `The target country is ${result.distanceKm.toLocaleString()} km from your guess.`;
    renderRoundResult(result);
  } catch (error) {
    hasGuessed = false;
    if (guessMarker) map.removeLayer(guessMarker);
    guessMarker = null;
    notify(error.message);
  } finally {
    busy = false;
  }
}

function renderRoundResult(result) {
  const country = result.country;
  const panel = $('round-result');
  panel.innerHTML = `
    <div class="result-heading"><span class="eyebrow">${result.correct ? 'CORRECT IDENTIFICATION' : 'COUNTRY REVEALED'}</span><h2>${escapeHtml(country.name)}</h2>
    <p>${result.correct ? 'You found the country.' : `Your guess was ${Number(result.distanceKm).toLocaleString()} km from its boundary.`}</p></div>
    <div class="result-points"><small>ROUND SCORE</small><strong>+${Number(result.score).toLocaleString()}</strong></div>
    <div class="result-facts">
      <span>${escapeHtml(country.region)} · ${escapeHtml(country.subregion)}</span>
      <span>Capital: ${escapeHtml(country.capital)}</span>
      <span>${country.landlocked ? 'Landlocked' : 'Has a coastline'} · ${country.borders.length} land neighbours</span>
      <span>${result.hintsUsed} of 2 hints used</span>
    </div>
    <button class="result-next" id="next-round">${currentRound === totalRounds ? 'VIEW FINAL RESULTS' : 'NEXT ROUND'} <span>↗</span></button>`;
  panel.classList.remove('hidden');
  $('next-round').addEventListener('click', nextRound, { once: true });
}

async function nextRound() {
  if (busy) return;
  busy = true;
  $('next-round').disabled = true;
  try {
    const data = await api(`/games/${gameId}/next`, { method: 'POST', body: '{}' });
    if (data.completed) {
      renderFinalResults(data.results);
      return;
    }
    currentRound = data.current_round;
    totalScore = data.total_score;
    targetCountryName = data.round?.targetCountryName || 'Mystery country';
    resetRound();
  } catch (error) {
    notify(error.message);
    const button = $('next-round');
    if (button) button.disabled = false;
  } finally {
    busy = false;
  }
}

function renderFinalResults(results) {
  const stats = results.stats;
  $('round-result').innerHTML = `
    <div class="result-heading"><span class="eyebrow">EXPEDITION COMPLETE</span><h2>World explored.</h2>
    <p>You completed all ${results.game.totalRounds} rounds. Your results have been saved on this browser profile.</p></div>
    <div class="final-score"><small>FINAL SCORE</small><strong>${Number(results.game.totalScore).toLocaleString()}</strong></div>
    <div class="result-facts">
      <span>Accuracy: ${stats.accuracy}% (${stats.correct}/${stats.attempted})</span>
      <span>Average distance: ${Number(stats.averageDistanceKm).toLocaleString()} km</span>
      <span>Hints used: ${stats.hintsUsed}</span>
    </div>
    <button class="result-next" id="view-stats">VIEW MY STATISTICS <span>↗</span></button>
    <button class="exit-button result-home" id="back-home">BACK TO HOME</button>`;
  $('round-result').classList.remove('hidden');
  $('map-instruction').textContent = 'Expedition complete.';
  $('progress-fill').style.width = '100%';
  $('view-stats').addEventListener('click', () => loadAnalytics(), { once: true });
  $('back-home').addEventListener('click', () => {
    gameId = null;
    showScreen('home');
  }, { once: true });
}

async function loadAnalytics() {
  try {
    const data = await api(`/analytics?player=${encodeURIComponent(playerName)}`);
    $('analytics-games').textContent = data.games_played;
    $('analytics-best').textContent = Number(data.best_score).toLocaleString();
    $('analytics-average').textContent = Number(data.average_score).toLocaleString();
    $('player-label').textContent = `Player ${playerName} · Saved in this browser; no account required.`;
    $('history-list').innerHTML = data.history.length
      ? data.history.map((game) => `<div class="history-row"><span>${new Date(game.completed_at || game.created_at).toLocaleDateString()} · ${escapeHtml(game.mode)}</span><strong>${Number(game.total_score).toLocaleString()}</strong></div>`).join('')
      : '<p class="empty-history">Complete a game to build your history.</p>';
    showScreen('analytics');
  } catch (error) {
    notify(`Could not load statistics: ${error.message}`);
  }
}

document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => selectMode(button.dataset.mode)));
$('start-game').addEventListener('click', startGame);
$('hint-one').addEventListener('click', () => revealHint(1));
$('hint-two').addEventListener('click', () => revealHint(2));
$('quit-game').addEventListener('click', () => {
  if (confirm('Exit this game? Your current game will remain saved, but unfinished.')) {
    gameId = null;
    showScreen('home');
  }
});
$('exit-game').addEventListener('click', (event) => {
  event.preventDefault();
  $('quit-game').click();
});
$('analytics-home').addEventListener('click', (event) => {
  event.preventDefault();
  showScreen('home');
});
$('play-again').addEventListener('click', () => showScreen('home'));

selectMode('explorer');
