(() => {
  'use strict';
  const R = globalThis.KniffelRules;
  const SAVE_KEY = 'bilgery-kniffel-game-v1';
  const HISTORY_KEY = 'bilgery-kniffel-history-v1';
  const NAME_KEY = 'bilgery-kniffel-last-names-v1';
  const MODE_KEY = 'bilgery-kniffel-last-mode-v1';
  const MAX_PLAYERS = 8;
  // Concise hints focused on what is still needed, not how to use the app.
  const CATEGORY_NEEDS = Object.freeze({
    ones:'1er sammeln', twos:'2er sammeln', threes:'3er sammeln',
    fours:'4er sammeln', fives:'5er sammeln', sixes:'6er sammeln',
    threeKind:'mind. 3 gleiche', fourKind:'mind. 4 gleiche',
    fullHouse:'3 + 2 gleiche', smallStraight:'4 in Folge',
    largeStraight:'5 in Folge', kniffel:'5 gleiche', chance:'Augensumme'
  });
  const PIP_POSITIONS = { 1:[5], 2:[1,9], 3:[1,5,9], 4:[1,3,7,9], 5:[1,3,5,7,9], 6:[1,3,4,6,7,9] };
  const $ = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const getStored = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const putStored = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private browsing or full storage: play without persistence. */ } };
  const rmStored = key => { try { localStorage.removeItem(key); } catch {} };
  const parseJSON = (raw, fallback) => { try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } };
  const clone = object => JSON.parse(JSON.stringify(object));
  const isPlaying = () => game && game.phase === 'playing';
  const isPlayersTurn = () => isPlaying() && game.viewIndex === game.activeIndex;
  const currentPlayer = () => game.players[game.activeIndex];
  const visiblePlayer = () => game.players[game.viewIndex];

  let game = null;
  let setupNames = ['', ''];
  let setupMode = 'digital';
  let currentModal = '';
  let manualCategory = null;
  let toastTimeout;
  let lastFocused = null;

  function validSnapshot(state) {
    if (!state || typeof state !== 'object' || !Array.isArray(state.players) || state.players.length < 1 || state.players.length > MAX_PLAYERS) return false;
    if (!['playing','finished'].includes(state.phase) || !Number.isInteger(state.activeIndex) || state.activeIndex < 0 || state.activeIndex >= state.players.length || !Number.isInteger(state.viewIndex) || state.viewIndex < 0 || state.viewIndex >= state.players.length) return false;
    if (state.mode !== undefined && !['digital','physical'].includes(state.mode)) return false;
    if (state.manualIndex !== undefined && (!Number.isInteger(state.manualIndex) || state.manualIndex < 0 || state.manualIndex > 4)) return false;
    if (!Array.isArray(state.dice) || state.dice.length !== 5 || !state.dice.every(n => Number.isInteger(n) && n >= 0 && n <= 6)) return false;
    if (!Array.isArray(state.kept) || state.kept.length !== 5 || !state.kept.every(value => typeof value === 'boolean')) return false;
    if (!Number.isInteger(state.rollCount) || state.rollCount < 0 || state.rollCount > 3) return false;
    if (state.mode === 'physical') {
      if (state.rollCount !== (state.dice.every(Boolean) ? 1 : 0)) return false;
    } else if (state.rollCount === 0 && state.dice.some(Boolean)) return false;
    if (state.selectedCategory !== null && !R.KEYS.includes(state.selectedCategory)) return false;
    if (typeof state.id !== 'string' || state.id.length > 80) return false;
    return state.players.every(player => {
      if (!player || typeof player.name !== 'string' || player.name.length > 36 || !player.scores || !Number.isInteger(player.bonusKniffels) || player.bonusKniffels < 0 || player.bonusKniffels > 12) return false;
      return R.KEYS.every(key => player.scores[key] === null || (Number.isInteger(player.scores[key]) && player.scores[key] >= 0 && player.scores[key] <= 50));
    });
  }

  function load() {
    const loaded = parseJSON(getStored(SAVE_KEY), null);
    if (validSnapshot(loaded)) {
      game = loaded;
      game.mode = game.mode || 'digital'; // Restore older saved digital-only games.
      game.manualIndex = Number.isInteger(game.manualIndex) ? game.manualIndex : 0;
      // Old physical-mode saves contained entered die faces. No longer needed.
      if (game.mode === 'physical') {
        game.dice = [0,0,0,0,0]; game.kept = [false,false,false,false,false];
        game.rollCount = 0; game.selectedCategory = null;
      }
      setupMode = game.mode;
      // The undo snapshot is optional and must never crash loading.
      if (!validSnapshot(loaded.undo)) game.undo = null;
      game.players.forEach(player => { player.name = player.name.trim() || 'Spieler'; });
      return;
    }
    const lastMode = parseJSON(getStored(MODE_KEY), 'digital');
    setupMode = ['digital','physical'].includes(lastMode) ? lastMode : 'digital';
    const prior = parseJSON(getStored(NAME_KEY), null);
    if (Array.isArray(prior) && prior.length >= 1 && prior.length <= MAX_PLAYERS) setupNames = prior.map(name => typeof name === 'string' ? name.slice(0,24) : '');
  }

  function persist() { if (game) putStored(SAVE_KEY, game); else rmStored(SAVE_KEY); }
  function history() { const list = parseJSON(getStored(HISTORY_KEY), []); return Array.isArray(list) ? list.filter(item => item && typeof item.id === 'string' && Array.isArray(item.players)).slice(0,60) : []; }
  function saveHistory(list) { putStored(HISTORY_KEY, list.slice(0,60)); }
  function recordHistory() {
    const items = history().filter(item => item.id !== game.id);
    items.unshift({ id: game.id, date: new Date().toISOString(), players: game.players.map(p => ({ name:p.name, score:R.totals(p).total })) });
    saveHistory(items);
  }

  function renderSetup() {
    document.body.classList.remove('physical-mode');
    $('setup-screen').hidden = false;
    $('game-screen').hidden = true;
    $('action-dock').hidden = true;
    $('new-button').hidden = true;
    $('player-count').textContent = `${setupNames.length} ${setupNames.length === 1 ? 'Spieler' : 'Spieler'}`;
    $('player-inputs').innerHTML = setupNames.map((name, index) => `
      <div class="input-row"><span class="player-bullet">${index + 1}</span>
      <input type="text" maxlength="24" autocomplete="off" spellcheck="false" data-name="${index}" placeholder="Spieler ${index+1}" value="${esc(name)}" aria-label="Name von Spieler ${index+1}">
      <button type="button" class="remove-player" data-remove="${index}" aria-label="Spieler ${index+1} entfernen" ${setupNames.length <= 1 ? 'disabled' : ''}>×</button></div>`).join('');
    $('add-player').disabled = setupNames.length >= MAX_PLAYERS;
    $('mode-options').querySelectorAll('.mode-option').forEach(option => {
      const radio = option.querySelector('input[name="mode"]');
      radio.checked = radio.value === setupMode;
      option.classList.toggle('selected', radio.checked);
    });
    window.scrollTo(0,0);
  }

  function startGame() {
    const names = setupNames.map((name,i) => name.trim() || `Spieler ${i+1}`);
    if (new Set(names.map(name => name.toLocaleLowerCase('de-DE'))).size !== names.length) { showToast('Bitte verwende unterschiedliche Spielernamen.'); return; }
    game = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2,9)}`,
      phase: 'playing', mode:setupMode, manualIndex:0,
      players: names.map((name,i) => ({ id:i, name, scores:R.emptyScores(), bonusKniffels:0 })),
      activeIndex:0, viewIndex:0, dice:[0,0,0,0,0], kept:[false,false,false,false,false], rollCount:0,
      selectedCategory:null, undo:null
    };
    putStored(NAME_KEY, setupNames);
    putStored(MODE_KEY, setupMode);
    persist(); render();
  }

function diceMarkup(value, index) {
    const kept = game.kept[index];
    const canKeep = isPlayersTurn() && game.rollCount > 0 && game.rollCount < 3;
    const cells = Array.from({length:9},(_,i) => {
      const hasDot = value === 0 ? i === 4 : PIP_POSITIONS[value].includes(i+1);
      return `<span ${hasDot ? `class="pip${value===0?' ghost':''}"` : ''}></span>`;
    }).join('');
    return `<button class="die-button${kept?' kept':''}" type="button" data-die="${index}" aria-label="Würfel ${index+1}: ${value ? value : 'noch nicht geworfen'}${kept?', behalten':''}" aria-pressed="${kept}" ${canKeep ? '' : 'disabled'}>${cells}</button>`;
  }

    function renderPlayers() {
    $('player-strip').innerHTML = game.players.map((player, index) => {
      const active = index === game.activeIndex;
      const viewing = index === game.viewIndex;
      const score = R.totals(player).total;
      return `<button type="button" class="player-chip${active?' active':''}${viewing?' viewing':''}" data-view="${index}" aria-label="Punkteblatt von ${esc(player.name)}, ${score} Punkte" aria-pressed="${viewing}">
        <span class="chip-name">${esc(player.name)}</span><span class="chip-score">${score}<span>Pts</span></span><span class="chip-marker">${active ? 'AM ZUG' : (viewing?'ANSICHT':'&nbsp;')}</span></button>`;
    }).join('');
  }

function renderDice() {
    const physical = game.mode === 'physical';
    $('play-card')?.classList.toggle('physical-turn',physical);
    $('physical-instruction').hidden = !physical;
    const viewing = !isPlayersTurn();
    $('turn-caption').textContent = game.phase === 'finished' ? 'PARTIE BEENDET' : physical ? 'PUNKTEBLOCK · EIGENE WÜRFEL' : 'AM ZUG';
    $('turn-title').textContent = game.phase === 'finished' ? 'Geschafft!' : currentPlayer().name;
    if (physical) return;
    $('dice-row').innerHTML = game.dice.map(diceMarkup).join('');
    $('throw-number').innerHTML = `${game.rollCount}<span>/3</span>`;
    let hint;
    if (game.phase === 'finished') hint = 'Alle 13 Felder sind ausgefüllt.';
    else if (viewing) hint = `Du siehst ${visiblePlayer().name}s Punkteblatt.`;
    else if (!game.rollCount) hint = 'Bereit für deinen ersten Wurf?';
    else if (game.rollCount === 3) hint = 'Wähle jetzt ein freies Punktefeld.';
    else if (game.kept.every(Boolean)) hint = 'Alle Würfel behalten. Wähle eine Kategorie.';
    else hint = 'Würfel antippen, um sie zu behalten.';
    $('dice-hint').textContent = hint;
    $('throw-progress').querySelectorAll('i').forEach((el,i) => el.classList.toggle('filled',i<game.rollCount));
  }

  function manualScoreRow(category,player) {
    const value=player.scores[category.key];
    const scored=value!==null;
    const playable=isPlayersTurn() && !scored;
    const detail = CATEGORY_NEEDS[category.key];
    return `<div class="score-row${scored?' completed':' open'}"><button type="button" class="manual-score-row${scored?' scored':''}${value===0?' zero':''}${!playable?' disabled-view':''}" data-category="${category.key}" ${playable?'':'disabled'} aria-label="${esc(category.name)}: ${scored?value+' Punkte eingetragen':'Noch offen, '+detail+', Punkte eintragen'}">
       <span class="manual-category"><span class="cat-name">${esc(category.name)}</span>${scored?'':`<span class="category-detail">${esc(detail)}</span>`}</span>
       <span class="manual-result">${scored?value:'+'}${!scored?'<span class="chevron" aria-hidden="true">›</span>':''}</span>
       </button></div>`;
  }

  function scoreRow(category, player, preview) {
    if (game.mode === 'physical') return manualScoreRow(category,player);
    const value = player.scores[category.key];
    const scored = value !== null;
    const selected = preview && game.selectedCategory === category.key;
    const potential = preview && !scored ? R.scoreForTurn(category.key, game.dice, player.scores) : null;
    const className = scored ? `recorded${value===0?' crossed':''}` : selected ? 'selected' : potential===null ? '' : potential>0 ? 'available' : 'preview-zero';
    const shown = scored ? String(value) : potential !== null ? `${potential}<small>↗</small>` : '–';
    const detail = CATEGORY_NEEDS[category.key];
    const accessible = `${category.name}: ${scored ? value+' Punkte eingetragen' : potential === null ? 'noch offen, '+detail : potential+' Punkte möglich, '+detail}`;
    return `<div class="score-row${scored?' completed':' open'}"><div class="score-category"><span class="cat-name">${esc(category.name)}</span>${scored?'':`<span class="score-need">${esc(detail)}</span>`}</div>
      <button type="button" class="score-choice ${className}" data-category="${category.key}" ${!preview||scored ? 'disabled' : ''} aria-label="${accessible}" aria-pressed="${!!selected}">${shown}</button></div>`;
  }

    function renderScorecard() {
    const player = visiblePlayer();
    const totals = R.totals(player);
    const canPreview = isPlayersTurn() && game.rollCount > 0;
    const physical = game.mode === 'physical';
    document.querySelector('.score-section').classList.toggle('physical-score', physical);
    const upperPct = Math.min(100, Math.max(0, totals.upper / 63 * 100));
    const upper = R.CATEGORIES.filter(c => c.section === 'upper').map(c => scoreRow(c, player, canPreview)).join('');
    const lower = R.CATEGORIES.filter(c => c.section === 'lower').map(c => scoreRow(c, player, canPreview)).join('');
    $('score-heading').textContent = physical
      ? (game.viewIndex === game.activeIndex ? `Am Zug: ${player.name}` : `${player.name}s Punkte`)
      : (game.viewIndex === game.activeIndex ? 'Punkteblatt' : `${player.name}s Punkteblatt`);
    $('current-total').textContent = String(totals.total);
    const upperMarkup = `
      <div class="section-bar"><span>OBERER BLOCK</span><span>ZAHLEN SAMMELN</span></div>${upper}
      <div class="summary-row"><span>Zwischensumme</span><strong>${totals.upper}</strong></div>
      <div class="summary-row bonus-row"><div><span>Bonus · ab 63 Punkten</span><span class="bonus-progress"><i style="width:${upperPct}%"></i></span></div><strong>${totals.bonus ? '+35' : totals.upper+'/63'}</strong></div>`;
    const lowerMarkup = `
      <div class="section-bar"><span>UNTERER BLOCK</span><span>KOMBINATIONEN</span></div>${lower}
      ${totals.extra ? `<div class="summary-row bonus-row"><span>Zusätzliche Kniffel · ${player.bonusKniffels} × 50</span><strong>+${totals.extra}</strong></div>` : ''}
      <div class="summary-row"><span>Unterer Block${totals.extra ? ' inkl. Extra-Kniffel' : ''}</span><strong>${totals.lower + totals.extra}</strong></div>
      <div class="summary-row final-row"><span>Gesamtpunkte</span><strong>${totals.total}</strong></div>`;
    // On phones the panels visually dissolve back into the classic single
    // scorecard. On iPads each panel becomes its own full-height column.
    $('scorecard').innerHTML = physical
      ? `<div class="score-panel score-panel-upper">${upperMarkup}</div><div class="score-panel score-panel-lower">${lowerMarkup}</div>`
      : upperMarkup + lowerMarkup;
  }
  function renderDock() {
    const button = $('action-button'); const label = $('dock-summary');
    button.disabled = false;
    if (game.phase === 'finished') {
      label.textContent = 'Die Partie ist beendet.';
      button.innerHTML = 'Ergebnis ansehen <span aria-hidden="true">→</span>';
    } else if (!isPlayersTurn()) {
      label.textContent = `Gerade ist ${currentPlayer().name} dran.`;
      button.textContent = 'Zurück zum aktuellen Zug';
    } else if (game.selectedCategory && game.rollCount > 0) {
      const category = R.CATEGORIES.find(c=>c.key===game.selectedCategory);
      const points = R.scoreForTurn(category.key,game.dice,currentPlayer().scores);
      const extra = R.isBonusKniffel(currentPlayer().scores,game.dice) ? ' · +50 Extra-Kniffel' : '';
      label.textContent = `${category.name} · ${points} ${points===1?'Punkt':'Punkte'}${extra}`;
      button.innerHTML = `${points} ${points===1?'Punkt':'Punkte'} eintragen <span aria-hidden="true">✓</span>`;
    } else if (game.rollCount === 3) {
      label.textContent = 'Wähle oben ein freies Punktefeld.';
      button.textContent = 'Kategorie auswählen'; button.disabled = true;
    } else if (game.rollCount > 0 && game.kept.every(Boolean)) {
      label.textContent = 'Alle Würfel sind behalten.';
      button.textContent = 'Kategorie auswählen'; button.disabled = true;
    } else {
      label.textContent = game.rollCount ? `Noch ${3-game.rollCount} ${3-game.rollCount===1?'Wurf':'Würfe'} möglich` : 'Du hast bis zu drei Würfe pro Zug.';
      button.innerHTML = `${game.rollCount ? 'Erneut würfeln' : 'Würfeln'} <span aria-hidden="true">↻</span>`;
    }
  }

  function render() {
    if (!game) { renderSetup(); return; }
    document.body.classList.toggle('physical-mode',game.mode==='physical');
    $('setup-screen').hidden = true; $('game-screen').hidden = false; $('action-dock').hidden = game.mode === 'physical'; $('new-button').hidden = false;
    const completed = game.players.reduce((sum,player)=>sum+R.totals(player).filled,0);
    const round = Math.min(13,Math.floor(completed/game.players.length)+1);
    $('round-label').textContent = game.phase==='finished' ? 'PARTIE ABGESCHLOSSEN' : `RUNDE ${round} VON 13`;
    $('undo-button').hidden = !game.undo || (game.phase === 'playing' && game.dice.some(Boolean));
    renderPlayers(); renderDice(); renderScorecard(); renderDock();
  }

  function randomDie() {
    if (globalThis.crypto?.getRandomValues) {
      const numbers = new Uint32Array(1);
      const limit = 4294967296 - (4294967296 % 6);
      do { crypto.getRandomValues(numbers); } while (numbers[0] >= limit);
      return numbers[0] % 6 + 1;
    }
    return Math.floor(Math.random()*6)+1;
  }

  function roll() {
    if (game.mode === 'physical' || !isPlayersTurn() || game.rollCount >= 3 || (game.rollCount > 0 && game.kept.every(Boolean))) return;
    const rolling = [];
    game.dice = game.dice.map((value,i) => {
      if (game.rollCount && game.kept[i]) return value;
      rolling.push(i);
      return randomDie();
    });
    game.rollCount++;
    game.selectedCategory = null;
    game.undo = null;
    persist();render();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      rolling.forEach(i => $('dice-row').querySelector(`[data-die="${i}"]`)?.classList.add('rolling'));
      setTimeout(() => $('dice-row').querySelectorAll('.rolling').forEach(el=>el.classList.remove('rolling')),320);
    }
  }

function keep(index) {
    if (!isPlayersTurn() || game.rollCount===0 || game.rollCount>=3) return;
    game.kept[index] = !game.kept[index];
    persist();renderDice();renderDock();
  }

  function pickCategory(key) {
    if (!isPlayersTurn() || !R.KEYS.includes(key) || currentPlayer().scores[key] !== null) return;
    if (game.mode === 'physical') { openManualScore(key); return; }
    if (game.rollCount===0) return;
    game.selectedCategory = game.selectedCategory===key ? null : key;
    persist();renderScorecard();renderDock();
  }

  function maxPhysicalScore(key) {
    const category = R.CATEGORIES.find(c=>c.key===key);
    if (!category) return null;
    return category.number ? category.number*5 : ({fullHouse:25,smallStraight:30,largeStraight:40,kniffel:50})[key] ?? 30;
  }

  function validManualPoints(key,value) {
    const category = R.CATEGORIES.find(c=>c.key===key);
    if (!category || !Number.isInteger(value)) return false;
    if (value===0) return true;
    if (category.number) return value<=5*category.number && value%category.number===0;
    if (['threeKind','fourKind','chance'].includes(key)) return value>=5 && value<=30;
    return value===maxPhysicalScore(key);
  }

  function openManualScore(key) {
    if (!isPlayersTurn() || game.mode!=='physical' || !R.KEYS.includes(key) || currentPlayer().scores[key]!==null) return;
    manualCategory=key;
    openModal('manual');
  }

  function manualBonusChecked() {
    return Boolean($('manual-bonus')?.checked);
  }

  function saveManualScore(rawPoints,bonus) {
    const key=manualCategory;
    if (!isPlayersTurn() || game.mode!=='physical' || !key || currentPlayer().scores[key]!==null) return;
    if (bonus && currentPlayer().scores.kniffel!==50) return;
    const emptyInput = !bonus && typeof rawPoints === 'string' && rawPoints.trim() === '';
    const points=bonus?maxPhysicalScore(key):Number(rawPoints);
    if (emptyInput || !validManualPoints(key,points)) {
      const error=$('manual-error');
      if(error){error.hidden=false;error.textContent='Bitte eine gültige Punktzahl eingeben.';}
      return;
    }
    const player=currentPlayer();
    const previous=clone({...game,undo:null});
    player.scores[key]=points;
    if (bonus) player.bonusKniffels++;
    game.undo=previous;
    game.dice=[0,0,0,0,0];game.kept=[false,false,false,false,false];game.rollCount=0;game.selectedCategory=null;
    if (game.players.every(p=>R.totals(p).filled===13)) {
      game.phase='finished';game.viewIndex=game.activeIndex;
      recordHistory();
    } else {
      game.activeIndex=(game.activeIndex+1)%game.players.length;game.viewIndex=game.activeIndex;
    }
    manualCategory=null;
    closeModal();persist();render();window.scrollTo({top:0,behavior:'smooth'});
    if (game.phase==='finished') openModal('results');
    else showToast(`${points} Punkte${bonus?' + 50 Extra-Kniffel':''} für ${player.name} eingetragen.`);
  }

  function refreshManualDialog() {
    if (currentModal!=='manual'||!manualCategory)return;
    const bonus=manualBonusChecked();
    const normal=$('manual-normal');
    const extra=$('manual-extra-summary');
    if(normal)normal.hidden=bonus;
    if(extra){
      extra.hidden=!bonus;
      extra.textContent=`${maxPhysicalScore(manualCategory)} Punkte + 50 Extra-Kniffel`;
    }
    // In bonus mode the main controls are hidden; the dedicated bonus button appears.
  }


    function commit() {
    if (!isPlayersTurn() || !game.rollCount || !game.selectedCategory) return;
    const key = game.selectedCategory;
    const player = currentPlayer();
    const points = R.scoreForTurn(key,game.dice,player.scores);
    if (points === null) return;
    const bonusKniffel = R.isBonusKniffel(player.scores,game.dice);
    const previous = clone({...game,undo:null});
    player.scores[key] = points;
    if (bonusKniffel) player.bonusKniffels++;
    game.undo = previous;
    game.dice = [0,0,0,0,0]; game.kept = [false,false,false,false,false]; game.rollCount = 0; game.selectedCategory = null; game.manualIndex = 0;
    if (game.players.every(p => R.totals(p).filled===13)) {
      game.phase = 'finished';game.viewIndex = game.activeIndex;
      recordHistory();
    } else {
      game.activeIndex = (game.activeIndex+1)%game.players.length;
      game.viewIndex = game.activeIndex;
    }
    persist();render();
    window.scrollTo({top:0,behavior:'smooth'});
    if (game.phase === 'finished') openModal('results');
    else showToast(bonusKniffel ? `${points} Punkte + 50 Extra-Kniffel!` : `${points} ${points===1?'Punkt':'Punkte'} für ${player.name} eingetragen.`);
  }

  function undo() {
    if (!game || !game.undo || (game.phase==='playing' && (game.rollCount>0 || game.dice.some(Boolean)))) return;
    if (game.phase === 'finished') saveHistory(history().filter(item => item.id !== game.id));
    game = game.undo;
    game.undo = null;
    if (game.mode === 'physical') {
      game.dice=[0,0,0,0,0];game.kept=[false,false,false,false,false];game.rollCount=0;game.selectedCategory=null;
    }
    persist();closeModal();render();
    showToast('Letzter Eintrag rückgängig gemacht.');
  }

  function resetToSetup() {
    if (game) {
      setupNames = game.players.map(p=>p.name);
      setupMode = game.mode || 'digital';
    }
    game = null; persist();closeModal();renderSetup();
  }

  function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;toast.hidden = false;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(()=>toast.hidden=true,2600);
  }

  function openModal(type) {
    lastFocused = document.activeElement;
    const content = $('modal-content'); const kicker = $('modal-kicker');
    if (type==='manual') {
      if (!manualCategory||!isPlayersTurn()||game.mode!=='physical') return;
      kicker.textContent='PUNKTE EINTRAGEN · '+esc(currentPlayer().name);
      const category=R.CATEGORIES.find(c=>c.key===manualCategory);
      const fixed=['fullHouse','smallStraight','largeStraight','kniffel'].includes(manualCategory);
      const bonusAllowed=currentPlayer().scores.kniffel===50;
      const value=maxPhysicalScore(manualCategory);
      const normal=fixed
        ? `<div class="manual-fixed-value"><strong>${value}</strong><small>PUNKTE</small></div><button class="primary-button" type="button" data-dialog="manual-fixed">${value} Punkte eintragen</button>`
        : category.number
          ? `<div class="manual-counts">${Array.from({length:6},(_,i)=>`<button type="button" data-manual-value="${i*category.number}">${i*category.number}<span>${i===0?'Streichen':i+' × '+category.number}</span></button>`).join('')}</div>`
          : `<label class="manual-points-field"><input id="manual-points" type="number" inputmode="numeric" min="5" max="30" step="1" autocomplete="off" placeholder="z. B. 23" aria-label="Augensumme eingeben"><span>Punkte</span></label><p class="manual-score-error" id="manual-error" hidden></p><button class="primary-button" type="button" id="manual-confirm" data-dialog="manual-enter">Punkte eintragen</button>`;
      content.innerHTML=`<h2>${esc(category.name)}</h2>
        <p class="manual-edit-subtitle">${category.number?'Wie viele '+esc(category.name.toLowerCase())+' hast du gewürfelt?':fixed?'Trage die volle Wertung ein oder streiche das Feld mit 0 Punkten.':'Trage die Summe deiner fünf Würfel ein.'}</p>
        ${bonusAllowed?`<label class="extra-kniffel-choice"><input type="checkbox" id="manual-bonus"><span><strong>Zusätzlicher Kniffel +50</strong>Nur aktivieren, wenn du erneut fünf Gleiche gewürfelt hast. Die Kategorie erhält ihre Höchstpunktzahl.</span></label>`:''}
        <div id="manual-normal">${normal}${fixed||!category.number?'<button type="button" data-dialog="manual-zero" class="manual-strike">Feld streichen · 0 Punkte</button>':''}</div>
        ${bonusAllowed?`<div id="manual-extra-summary" hidden class="manual-bonus-summary"></div><button id="manual-extra-submit" class="primary-button" data-dialog="manual-bonus" type="button" hidden>Extra-Kniffel eintragen</button>`:''}
        <button type="button" class="secondary-button" data-dialog="close">Abbrechen</button>`;
    } else if (type==='rules') {
      kicker.textContent='SO FUNKTIONIERT’S';
      const physical = (game ? game.mode : setupMode) === 'physical';
      content.innerHTML = `<h2>Die Regeln.</h2><p>Jede Person hat 13 Züge und bis zu drei Würfe mit fünf Würfeln pro Zug. ${physical ? 'Mit euren eigenen Würfeln werft ihr am Tisch. In der App wählt ihr anschließend nur die Kategorie und die Punkte.' : 'In der App kannst du Würfel nach jedem Wurf behalten und die anderen erneut werfen.'}</p>
        <ol class="rule-list">${physical
        ? '<li>Würfle mit den eigenen Würfeln und tippe im Punkteblock auf die gewünschte Kategorie.</li><li>Bei Straße, Full House oder Kniffel sind die Punkte vorausgefüllt. Bei Zahlen und Pasch/Chance wählst du die Anzahl oder gibst die Augensumme ein. Mit 0 kannst du ein Feld streichen.</li>'
        : '<li>Tippe auf <b>Würfeln</b>, um alle fünf Würfel zu werfen.</li><li>Wähle Würfel, die du behalten möchtest, und würfle die anderen erneut. Du darfst auch früher aufhören.</li>'}
        <li>Wähle ein freies Feld im Punkteblatt. Die möglichen Punkte werden dir angezeigt. Tippe anschließend auf <b>Eintragen</b>.</li><li>Erreichst du im oberen Block mindestens <b>63 Punkte</b>, erhältst du <b>35 Bonuspunkte</b>.</li><li>Ein weiterer Kniffel nach einem eingetragenen 50-Punkte-Kniffel bringt <b>50 Extrapunkte</b> und die Höchstpunktzahl in einem beliebigen noch freien Feld.</li></ol>
        <p class="dialog-note">Die App verwendet die Standardwertung der aktuellen Schmidt-Spiele-Anleitung. Full House = 25, kleine Straße = 30, große Straße = 40, Kniffel = 50. Ein Kniffel allein zählt nicht automatisch als Full House. Die strengere Meisterschaftsvariante ist nicht aktiviert.</p>
        <a class="dialog-link" href="https://www.schmidtspiele.de/files/Produkte/4/49203%20-%20Kniffel%C2%AE/49203_Kniffel_DE.pdf" target="_blank" rel="noopener noreferrer">Originalregeln bei Schmidt Spiele ↗</a>
        <button class="primary-button" type="button" data-dialog="close">Verstanden</button>`;
    } else if (type==='new') {
      kicker.textContent='NEUES SPIEL';
      content.innerHTML=`<h2>Noch eine Runde?</h2><p>Wenn du ein neues Spiel startest, wird die laufende Partie verworfen. Abgeschlossene Partien bleiben in der Statistik erhalten.</p><button class="primary-button" type="button" data-dialog="reset">Neues Spiel vorbereiten</button><button class="secondary-button" type="button" data-dialog="close">Weiterspielen</button>`;
    } else if (type==='results') {
      kicker.textContent='SPIEL BEENDET';
      const sorted = game.players.map(p=>({...p,points:R.totals(p).total})).sort((a,b)=>b.points-a.points);
      const top = sorted[0]?.points;
      const winners = sorted.filter(p=>p.points===top);
      content.innerHTML=`<div class="end-spark">✦</div><h2>${winners.length===1? `${esc(winners[0].name)} gewinnt!` : 'Unentschieden!'}</h2><p>${winners.length===1 ? 'Was für eine Runde! Hier ist euer Ergebnis.' : 'Ihr habt die gleiche Punktzahl erreicht.'}</p>
        <div class="results-list">${sorted.map((p,i)=>`<div class="result-item${p.points===top?' winner':''}"><span class="rank">${i+1}.</span><span class="result-name">${esc(p.name)}</span><span class="result-score">${p.points} <small>Pkt.</small></span></div>`).join('')}</div>
        <button class="primary-button" type="button" data-dialog="reset">Noch eine Runde spielen <span aria-hidden="true">→</span></button>
        ${game.undo ? '<button class="secondary-button" type="button" data-dialog="undo">Letzten Eintrag korrigieren</button>' : ''}
        <button class="secondary-button" type="button" data-dialog="close">Punkteblatt ansehen</button>`;
    } else if (type==='stats') {
      kicker.textContent='EUERE SPIELE';
      const list = history();
      const stats = new Map();
      for (const item of list) {
        const valid = item.players.filter(p=>p && typeof p.name==='string' && Number.isFinite(p.score));
        if (!valid.length) continue;
        const highest = Math.max(...valid.map(p=>p.score));
        valid.forEach(p=>{
          const key = p.name.toLocaleLowerCase('de-DE');
          const current = stats.get(key) || {name:p.name, games:0,wins:0,total:0,best:0};
          current.games++;current.total+=p.score;current.best=Math.max(current.best,p.score);
          if(p.score===highest) current.wins++;
          stats.set(key,current);
        });
      }
      const leaders = [...stats.values()].sort((a,b)=>b.wins-a.wins||b.total/b.games-a.total/a.games);
      content.innerHTML=`<h2>Eure Bestenliste.</h2><p>${list.length? `${list.length} abgeschlossene ${list.length===1?'Partie':'Partien'} auf diesem Gerät.` : 'Hier erscheinen eure Ergebnisse nach der ersten abgeschlossenen Partie.'}</p>
      ${leaders.length? `<table class="stats-table"><thead><tr><th>Spieler</th><th>Siege</th><th>Spiele</th><th>Ø Punkte</th></tr></thead><tbody>${leaders.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.wins}</td><td>${p.games}</td><td>${Math.round(p.total/p.games)}</td></tr>`).join('')}</tbody></table>
      <h3>Letzte Partien</h3>${list.slice(0,8).map(item=>{
        const highest=Math.max(...item.players.map(p=>p.score));
        const names=item.players.filter(p=>p.score===highest).map(p=>p.name).join(' & ');
        const date = new Date(item.date);
        const formatted = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'});
        return `<div class="recent-result"><span>${esc(names)} · ${highest} Pkt.</span><span>${formatted}</span></div>`;
      }).join('')}` : '<p class="history-empty">Noch keine gespeicherten Partien.</p>'}
      <button class="primary-button" type="button" data-dialog="close">Schließen</button>`;
    }
    currentModal=type;
    $('modal').hidden=false;
    document.body.classList.add('modal-open');
    $('modal-close').focus();
  }

  function closeModal() {
    $('modal').hidden=true;currentModal='';manualCategory=null;document.body.classList.remove('modal-open');
    if (lastFocused && lastFocused.isConnected && !lastFocused.hidden) lastFocused.focus({preventScroll:true});
  }

  function handleAction() {
    if (!game) return;
    if (game.phase==='finished') return openModal('results');
    if (!isPlayersTurn()) { game.viewIndex=game.activeIndex;persist();render();return; }
    if (game.selectedCategory) return commit();
    if (game.mode === 'physical') return;
    roll();
  }

  $('player-inputs').addEventListener('input', e => {
    if (e.target.matches('input[data-name]')) setupNames[Number(e.target.dataset.name)] = e.target.value;
  });
  $('player-inputs').addEventListener('click', e => {
    const button = e.target.closest('button[data-remove]');
    if (!button || setupNames.length<=1) return;
    setupNames.splice(Number(button.dataset.remove),1);renderSetup();
  });
  $('add-player').addEventListener('click',()=>{ if(setupNames.length<MAX_PLAYERS){setupNames.push('');renderSetup();$('player-inputs').lastElementChild?.querySelector('input')?.focus();} });
  $('mode-options').addEventListener('change', e => {
    if (!e.target.matches('input[name="mode"]')) return;
    setupMode = e.target.value;
    $('mode-options').querySelectorAll('.mode-option').forEach(option =>
      option.classList.toggle('selected', option.querySelector('input').checked));
  });
  $('start-button').addEventListener('click',startGame);
  $('setup-history').addEventListener('click',()=>openModal('stats'));
  $('rules-button').addEventListener('click',()=>openModal('rules'));
  $('new-button').addEventListener('click',()=>game?.phase==='playing'?openModal('new'):resetToSetup());
  $('undo-button').addEventListener('click',undo);
  $('action-button').addEventListener('click',handleAction);
  $('player-strip').addEventListener('click',e=>{
    const button=e.target.closest('button[data-view]');if(!button||!game)return;
    game.viewIndex=Number(button.dataset.view);game.selectedCategory=null;persist();render();
  });
  $('dice-row').addEventListener('click',e=>{const button=e.target.closest('button[data-die]');if(button) keep(Number(button.dataset.die));});
  $('scorecard').addEventListener('click',e=>{const button=e.target.closest('button[data-category]');if(button) pickCategory(button.dataset.category);});
  $('modal').addEventListener('click',e=>{if(e.target===$('modal')) closeModal();});
  $('modal-close').addEventListener('click',closeModal);
  $('modal-content').addEventListener('click',e=>{
    const valueButton=e.target.closest('button[data-manual-value]');
    if(valueButton){saveManualScore(Number(valueButton.dataset.manualValue),false);return;}
    const button=e.target.closest('button[data-dialog]');if(!button)return;
    switch(button.dataset.dialog){
      case 'close':closeModal();break;
      case 'reset':resetToSetup();break;
      case 'undo':undo();break;
      case 'manual-fixed':saveManualScore(maxPhysicalScore(manualCategory),manualBonusChecked());break;
      case 'manual-zero':saveManualScore(0,manualBonusChecked());break;
      case 'manual-enter':saveManualScore($('manual-points')?.value,manualBonusChecked());break;
      case 'manual-bonus':saveManualScore(maxPhysicalScore(manualCategory),true);break;
    }
  });
  $('modal-content').addEventListener('change',e=>{
    if (e.target.id!=='manual-bonus') return;
    refreshManualDialog();
    $('manual-extra-submit').hidden=!e.target.checked;
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&currentModal){e.preventDefault();closeModal();}
    if(e.key==='Tab'&&currentModal){
      const els=[...$('modal').querySelectorAll('button:not(:disabled),a[href]')];
      if(!els.length)return;
      if(e.shiftKey&&document.activeElement===els[0]){e.preventDefault();els[els.length-1].focus();}
      else if(!e.shiftKey&&document.activeElement===els[els.length-1]){e.preventDefault();els[0].focus();}
    }
  });
  load();render();
  if ('serviceWorker' in navigator && location.protocol==='https:') navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
