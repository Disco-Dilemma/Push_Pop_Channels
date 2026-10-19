(function () {
  'use strict';

  /* ============================================================
     CONSTANTS
     ============================================================ */
  const DEFAULT_ARRAY = [12, 3, 7, 9, 21, 5, 14, 8];
  const DEFAULT_SEARCH_VALUE = 7;
  const DEFAULT_ADD_VALUE = 12;

  const BAR_BASE_HEIGHT = 24;
  const BAR_MAX_HEIGHT = 170;
  const BAR_SOLO_HEIGHT = BAR_BASE_HEIGHT + 70;

  const SLEEP_LINEAR   = 380;
  const SLEEP_BINARY   = 550;
  const SLEEP_COMPARE  = 420;
  const SLEEP_SWAP     = 380;
  const SLEEP_SELECT   = 320;
  const SLEEP_MERGE    = 340;
  const SLEEP_TICK     = 80;

  const CLICK_DEFAULT  = 0.16;
  const CLICK_STEP     = 0.10;
  const CLICK_COMPARE  = 0.09;
  const CLICK_SWAP     = 0.14;
  const CLICK_SUCCESS  = 0.20;
  const CLICK_WARN     = 0.12;
  const CLICK_ADD      = 0.18;
  const CLICK_TICK     = 0.08;
  const CLICK_MERGE    = 0.11;

  /* ============================================================
     AUDIO — cassette click synth
     ============================================================ */
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playCassetteClick(volume = CLICK_DEFAULT) {
    try {
      initAudio();
      if (!audioCtx) return;

      const now = audioCtx.currentTime;
      const bufferSize = 256;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 30);
      }

      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;

      const hp = audioCtx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1200;
      hp.Q.value = 0.8;

      const lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 6000;

      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

      noise.connect(hp); hp.connect(lp); lp.connect(gain); gain.connect(audioCtx.destination);
      noise.start(now);
      noise.stop(now + 0.03);
    } catch { /* silent */ }
  }

  /* ============================================================
     STATE
     ============================================================ */
  let array = [...DEFAULT_ARRAY];
  const highlightIndices = new Set();
  const foundIndices = new Set();
  const notFoundIndices = new Set();

  let isBusy = false;
  let isSortedFlag = false;
  let runId = 0;

  const barContainer   = document.getElementById('barContainer');
  const arraySizeBadge = document.getElementById('arraySizeBadge');
  const statusMessage  = document.getElementById('statusMessage');
  const searchInput    = document.getElementById('searchInput');
  const addInput       = document.getElementById('addInput');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ============================================================
     UTILITIES
     ============================================================ */
  function setStatus(html) { statusMessage.innerHTML = html; }

  function clearVisualState() {
    highlightIndices.clear();
    foundIndices.clear();
    notFoundIndices.clear();
  }

  function isSorted(arr) {
    for (let i = 1; i < arr.length; i++) {
      if (arr[i - 1] > arr[i]) return false;
    }
    return true;
  }

  function setSortedFlag(flag) {
    isSortedFlag = flag;
    const badge = document.querySelector('.badge-op');
    if (badge) {
      badge.textContent = flag ? 'SORTED ✓ · CASSETTE ON' : 'UNSORTED · CASSETTE ON';
      badge.style.color = flag ? '#4caf50' : 'var(--orange)';
    }
  }

  function readNumberInput(input) {
    const raw = input.value.trim();
    if (raw === '') return { ok: false, reason: 'EMPTY' };
    const v = Number(raw);
    if (Number.isNaN(v)) return { ok: false, reason: 'INVALID' };
    return { ok: true, value: v };
  }

  function lockButtons(lock) {
    isBusy = lock;
    document.querySelectorAll('button').forEach((b) => {
      b.disabled = lock;
      b.style.opacity = lock ? 0.55 : '';
      b.style.cursor = lock ? 'not-allowed' : '';
    });
  }

  /* ============================================================
     RENDER
     ============================================================ */
  function renderBars() {
    arraySizeBadge.textContent =
      `${String(array.length).padStart(2, '0')} ELEMENT${array.length !== 1 ? 'S' : ''}`;

    if (array.length === 0) {
      barContainer.innerHTML = '<span class="empty-message">— EMPTY ARRAY —</span>';
      return;
    }

    const maxVal = Math.max(...array);
    const minVal = Math.min(...array);
    const range  = maxVal - minVal;

    barContainer.innerHTML = '';

    array.forEach((value, idx) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'bar-wrapper';

      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.dataset.index = idx;

      const height = range === 0
        ? BAR_SOLO_HEIGHT
        : BAR_BASE_HEIGHT + ((value - minVal) / range) * (BAR_MAX_HEIGHT - BAR_BASE_HEIGHT);
      bar.style.height = `${Math.round(height)}px`;

      if (foundIndices.has(idx))          bar.classList.add('found');
      else if (highlightIndices.has(idx)) bar.classList.add('highlight');
      else if (notFoundIndices.has(idx))  bar.classList.add('not-found');

      const label = document.createElement('span');
      label.className = 'bar-label';
      label.textContent = value;

      wrapper.append(bar, label);
      barContainer.appendChild(wrapper);
    });
  }

  /* ============================================================
     [1] LINEAR SEARCH
     ============================================================ */
  async function linearSearchVisual(target, myRun) {
    clearVisualState();
    renderBars();
    playCassetteClick(CLICK_DEFAULT);
    setStatus(`🔎 LINEAR SEARCH · TARGET <span>${target}</span>`);

    if (array.length === 0) {
      setStatus('⚠️ ARRAY IS EMPTY');
      return;
    }

    for (let i = 0; i < array.length; i++) {
      if (myRun !== runId) return;

      clearVisualState();
      highlightIndices.add(i);
      renderBars();
      setStatus(`🔎 LINEAR · CHECK INDEX <span>${i}</span> · VALUE <span>${array[i]}</span>`);
      playCassetteClick(CLICK_STEP);
      await sleep(SLEEP_LINEAR);
      if (myRun !== runId) return;

      if (array[i] === target) {
        clearVisualState();
        foundIndices.add(i);
        renderBars();
        setStatus(`✅ FOUND <span>${target}</span> AT INDEX <span>${i}</span> · LINEAR`);
        playCassetteClick(CLICK_SUCCESS);
        return;
      }
    }

    clearVisualState();
    renderBars();
    setStatus(`❌ <span>${target}</span> NOT FOUND · LINEAR`);
    playCassetteClick(CLICK_STEP);
  }

  /* ============================================================
     [2] BINARY SEARCH
     ============================================================ */
  async function binarySearchVisual(target, myRun) {
    clearVisualState();
    renderBars();
    playCassetteClick(CLICK_DEFAULT);

    if (array.length === 0) {
      setStatus('⚠️ ARRAY IS EMPTY');
      return;
    }

    if (!isSortedFlag || !isSorted(array)) {
      setStatus('⚠️ ARRAY MUST BE SORTED · RUN A SORT FIRST');
      playCassetteClick(CLICK_WARN);
      setSortedFlag(false);
      return;
    }

    let left = 0;
    let right = array.length - 1;

    while (left <= right) {
      if (myRun !== runId) return;
      const mid = Math.floor((left + right) / 2);

      clearVisualState();
      for (let i = 0; i < array.length; i++) {
        if (i < left || i > right) notFoundIndices.add(i);
      }
      highlightIndices.add(mid);

      renderBars();
      setStatus(
        `🔎 BINARY · LOW=${left} HIGH=${right} MID=<span>${mid}</span> · VALUE <span>${array[mid]}</span>`
      );
      playCassetteClick(CLICK_STEP + 0.01);
      await sleep(SLEEP_BINARY);
      if (myRun !== runId) return;

      if (array[mid] === target) {
        clearVisualState();
        foundIndices.add(mid);
        renderBars();
        setStatus(`✅ FOUND <span>${target}</span> AT INDEX <span>${mid}</span> · BINARY`);
        playCassetteClick(CLICK_SUCCESS);
        return;
      }

      if (array[mid] < target) left = mid + 1;
      else right = mid - 1;
    }

    clearVisualState();
    for (let i = 0; i < array.length; i++) notFoundIndices.add(i);
    renderBars();
    setStatus(`❌ <span>${target}</span> NOT FOUND · BINARY`);
    playCassetteClick(CLICK_STEP);
  }

  /* ============================================================
     [3] BUBBLE SORT
     ============================================================ */
  async function bubbleSortVisual(myRun) {
    clearVisualState();
    renderBars();
    playCassetteClick(CLICK_DEFAULT);

    if (array.length <= 1) {
      setStatus('✨ ARRAY ALREADY SORTED');
      setSortedFlag(true);
      return;
    }

    const n = array.length;
    setStatus('🫧 BUBBLE SORT · RUNNING');

    for (let i = 0; i < n - 1; i++) {
      if (myRun !== runId) return;
      let swapped = false;

      for (let j = 0; j < n - i - 1; j++) {
        if (myRun !== runId) return;

        clearVisualState();
        highlightIndices.add(j);
        highlightIndices.add(j + 1);
        renderBars();
        setStatus(
          `🫧 COMPARE <span>${j}</span> & <span>${j + 1}</span> · <span>${array[j]}</span> vs <span>${array[j + 1]}</span>`
        );
        playCassetteClick(CLICK_COMPARE);
        await sleep(SLEEP_COMPARE);
        if (myRun !== runId) return;

        if (array[j] > array[j + 1]) {
          [array[j], array[j + 1]] = [array[j + 1], array[j]];
          swapped = true;

          clearVisualState();
          highlightIndices.add(j);
          highlightIndices.add(j + 1);
          renderBars();
          setStatus(`🔄 SWAPPED → <span>${array[j]}</span> & <span>${array[j + 1]}</span>`);
          playCassetteClick(CLICK_SWAP);
          await sleep(SLEEP_SWAP);
          if (myRun !== runId) return;
        }
      }

      if (!swapped) break;

      clearVisualState();
      renderBars();
      await sleep(SLEEP_TICK);
      playCassetteClick(CLICK_TICK);
    }

    clearVisualState();
    renderBars();
    setSortedFlag(true);
    setStatus('✅ ARRAY SORTED · READY FOR BINARY SEARCH');
    playCassetteClick(CLICK_SUCCESS);
  }

  /* ============================================================
     [4] SELECTION SORT
     ============================================================ */
  async function selectionSortVisual(myRun) {
    clearVisualState();
    renderBars();
    playCassetteClick(CLICK_DEFAULT);

    if (array.length <= 1) {
      setStatus('✨ ARRAY ALREADY SORTED');
      setSortedFlag(true);
      return;
    }

    const n = array.length;
    setStatus('🎯 SELECTION SORT · RUNNING');

    for (let i = 0; i < n - 1; i++) {
      if (myRun !== runId) return;

      let minIdx = i;

      clearVisualState();
      highlightIndices.add(i);
      renderBars();
      setStatus(`🎯 PASS <span>${i + 1}</span> · SCANNING FROM INDEX <span>${i}</span>`);
      playCassetteClick(CLICK_STEP);
      await sleep(SLEEP_SELECT);
      if (myRun !== runId) return;

      for (let j = i + 1; j < n; j++) {
        if (myRun !== runId) return;

        clearVisualState();
        highlightIndices.add(minIdx);
        highlightIndices.add(j);
        renderBars();
        setStatus(
          `🎯 COMPARE MIN=<span>${array[minIdx]}</span> @${minIdx} vs <span>${array[j]}</span> @${j}`
        );
        playCassetteClick(CLICK_COMPARE);
        await sleep(SLEEP_SELECT);
        if (myRun !== runId) return;

        if (array[j] < array[minIdx]) {
          minIdx = j;
          clearVisualState();
          highlightIndices.add(minIdx);
          renderBars();
          setStatus(`🔽 NEW MIN <span>${array[minIdx]}</span> @ INDEX <span>${minIdx}</span>`);
          playCassetteClick(CLICK_TICK);
          await sleep(SLEEP_TICK);
          if (myRun !== runId) return;
        }
      }

      if (minIdx !== i) {
        [array[i], array[minIdx]] = [array[minIdx], array[i]];
        clearVisualState();
        highlightIndices.add(i);
        highlightIndices.add(minIdx);
        renderBars();
        setStatus(`🔄 SWAP <span>${array[minIdx]}</span> ↔ <span>${array[i]}</span>`);
        playCassetteClick(CLICK_SWAP);
        await sleep(SLEEP_SWAP);
        if (myRun !== runId) return;
      }

      clearVisualState();
      foundIndices.add(i);
      renderBars();
      playCassetteClick(CLICK_TICK);
      await sleep(SLEEP_TICK);
      if (myRun !== runId) return;
    }

    clearVisualState();
    if (array.length) foundIndices.add(array.length - 1);
    renderBars();
    setSortedFlag(true);
    setStatus('✅ ARRAY SORTED · SELECTION SORT COMPLETE');
    playCassetteClick(CLICK_SUCCESS);
  }

  /* ============================================================
     [5] MERGE SORT
     ============================================================ */
  async function mergeSortVisual(myRun) {
    clearVisualState();
    renderBars();
    playCassetteClick(CLICK_DEFAULT);

    if (array.length <= 1) {
      setStatus('✨ ARRAY ALREADY SORTED');
      setSortedFlag(true);
      return;
    }

    setStatus('🔀 MERGE SORT · DIVIDE & CONQUER');

    const work = [...array];

    async function merge(lo, mid, hi) {
      const left  = work.slice(lo, mid + 1);
      const right = work.slice(mid + 1, hi + 1);

      let i = 0, j = 0, k = lo;

      setStatus(`🔀 MERGING [<span>${lo}</span>..<span>${mid}</span>] + [<span>${mid + 1}</span>..<span>${hi}</span>]`);
      await sleep(SLEEP_MERGE);
      if (myRun !== runId) return;

      while (i < left.length && j < right.length) {
        if (myRun !== runId) return;

        clearVisualState();
        highlightIndices.add(lo + i);
        highlightIndices.add(mid + 1 + j);
        renderBars();
        setStatus(`🔀 PICK <span>${Math.min(left[i], right[j])}</span>`);
        playCassetteClick(CLICK_MERGE);
        await sleep(SLEEP_MERGE);
        if (myRun !== runId) return;

        if (left[i] <= right[j]) work[k++] = left[i++];
        else                     work[k++] = right[j++];

        for (let p = 0; p < work.length; p++) array[p] = work[p];
        clearVisualState();
        highlightIndices.add(k - 1);
        renderBars();
        await sleep(SLEEP_TICK);
        if (myRun !== runId) return;
      }

      while (i < left.length) {
        if (myRun !== runId) return;
        work[k++] = left[i++];
        for (let p = 0; p < work.length; p++) array[p] = work[p];
        clearVisualState();
        highlightIndices.add(k - 1);
        renderBars();
        playCassetteClick(CLICK_TICK);
        await sleep(SLEEP_TICK);
      }

      while (j < right.length) {
        if (myRun !== runId) return;
        work[k++] = right[j++];
        for (let p = 0; p < work.length; p++) array[p] = work[p];
        clearVisualState();
        highlightIndices.add(k - 1);
        renderBars();
        playCassetteClick(CLICK_TICK);
        await sleep(SLEEP_TICK);
      }
    }

    async function mergeSort(lo, hi) {
      if (lo >= hi) return;
      if (myRun !== runId) return;
      const mid = Math.floor((lo + hi) / 2);
      await mergeSort(lo, mid);
      if (myRun !== runId) return;
      await mergeSort(mid + 1, hi);
      if (myRun !== runId) return;
      await merge(lo, mid, hi);
    }

    await mergeSort(0, array.length - 1);
    if (myRun !== runId) return;

    clearVisualState();
    renderBars();
    setSortedFlag(true);
    setStatus('✅ ARRAY SORTED · MERGE SORT COMPLETE');
    playCassetteClick(CLICK_SUCCESS);
  }

   /* ============================================================
     [6] SORT CHANNELS · TV dial
     ============================================================ */
  const SORT_CHANNELS = [
    { id: 'bubble',    code: 'BUB · SORT', name: 'BUBBLE',    label: 'CH 01',
      accent: '#e05a33', accentDark: '#b84322', fn: bubbleSortVisual },
    { id: 'selection', code: 'SEL · SORT', name: 'SELECTION', label: 'CH 02',
      accent: '#b81d3b', accentDark: '#821027', fn: selectionSortVisual }, // Deep Crimson Red
    { id: 'merge',     code: 'MRG · SORT', name: 'MERGE',     label: 'CH 03',
      accent: '#0a8f9e', accentDark: '#056975', fn: mergeSortVisual },     // Retro Teal/Cyan
  ];

  let sortChannel = 0;

  function applyChannelTheme(ch) {
    document.documentElement.style.setProperty('--ch-accent', ch.accent);
    document.documentElement.style.setProperty('--ch-accent-dark', ch.accentDark);

    const chLabel = document.getElementById('chLabel');
    const chName  = document.getElementById('chName');
    const sortCode = document.getElementById('sortCode');
    if (chLabel) chLabel.textContent = ch.label;
    if (chName)  chName.textContent  = ch.name;
    if (sortCode) sortCode.textContent = ch.code;

    const sortBtn = document.getElementById('sortBtn');
    if (sortBtn) sortBtn.textContent = `▶ Run ${ch.name} Sort`;

    const screen = barContainer;
    if (screen) {
      screen.classList.remove('crt-flicker');
      void screen.offsetWidth;
      screen.classList.add('crt-flicker');
    }

    const dial = document.getElementById('channelBtn');
    if (dial) {
      dial.classList.remove('tuning');
      void dial.offsetWidth;
      dial.classList.add('tuning');
    }

    setStatus(`📺 TUNED TO <span>${ch.label} · ${ch.name}</span> · PRESS RUN SORT`);
    playCassetteClick(CLICK_WARN);
  }

  function tuneSort(direction) {
    if (isBusy) return;
    initAudio();
    sortChannel = (sortChannel + direction + SORT_CHANNELS.length) % SORT_CHANNELS.length;
    applyChannelTheme(SORT_CHANNELS[sortChannel]);
  }

  async function onRunSort() {
    if (isBusy) return;
    initAudio();
    lockButtons(true);
    const myRun = ++runId;
    await SORT_CHANNELS[sortChannel].fn(myRun);
    if (myRun === runId) lockButtons(false);
  }

  /* ============================================================
     EVENT HANDLERS
     ============================================================ */
  function validateSearchInput() {
    const r = readNumberInput(searchInput);
    if (!r.ok) {
      setStatus(r.reason === 'EMPTY' ? '⚠️ ENTER A NUMBER TO SEARCH' : '⚠️ INVALID NUMBER');
      playCassetteClick(CLICK_STEP);
      return null;
    }
    return r.value;
  }

  async function onLinearSearch() {
    if (isBusy) return;
    const target = validateSearchInput();
    if (target === null) return;
    initAudio();
    lockButtons(true);
    const myRun = ++runId;
    await linearSearchVisual(target, myRun);
    if (myRun === runId) lockButtons(false);
  }

  async function onBinarySearch() {
    if (isBusy) return;
    const target = validateSearchInput();
    if (target === null) return;
    initAudio();

    if (!isSortedFlag || !isSorted(array)) {
      setStatus('⚠️ ARRAY MUST BE SORTED · RUN A SORT FIRST');
      playCassetteClick(CLICK_WARN);
      setSortedFlag(false);
      return;
    }

    lockButtons(true);
    const myRun = ++runId;
    await binarySearchVisual(target, myRun);
    if (myRun === runId) lockButtons(false);
  }

  function onAddElement() {
    if (isBusy) return;
    initAudio();
    const r = readNumberInput(addInput);
    if (!r.ok) {
      setStatus(r.reason === 'EMPTY' ? '⚠️ ENTER A NUMBER TO ADD' : '⚠️ INVALID NUMBER');
      playCassetteClick(CLICK_STEP);
      return;
    }

    array.push(r.value);
    clearVisualState();
    renderBars();
    setSortedFlag(false);
    setStatus(`➕ ADDED <span>${r.value}</span> · SIZE <span>${array.length}</span> · RESORT NEEDED`);
    playCassetteClick(CLICK_ADD);
    addInput.value = '';
  }

  function onReset() {
    if (isBusy) return;
    initAudio();
    runId++;
    array = [...DEFAULT_ARRAY];
    clearVisualState();
    renderBars();
    setSortedFlag(false);
    setStatus('↺ ARRAY RESET · DEFAULT [12,3,7,9,21,5,14,8]');
    playCassetteClick(CLICK_DEFAULT);
    searchInput.value = DEFAULT_SEARCH_VALUE;
    addInput.value = DEFAULT_ADD_VALUE;
  }

  /* ============================================================
     INIT
     ============================================================ */
  function init() {
    renderBars();
    setSortedFlag(false);

    document.getElementById('linearSearchBtn').addEventListener('click', onLinearSearch);
    document.getElementById('binarySearchBtn').addEventListener('click', onBinarySearch);
    document.getElementById('addBtn').addEventListener('click', onAddElement);
    document.getElementById('resetBtn').addEventListener('click', onReset);

    // Channel dial wiring
    document.getElementById('sortBtn').addEventListener('click', onRunSort);
    document.getElementById('channelBtn').addEventListener('click', () => tuneSort(1));
    document.getElementById('chanNextBtn').addEventListener('click', () => tuneSort(1));
    document.getElementById('chanPrevBtn').addEventListener('click', () => tuneSort(-1));

    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onLinearSearch(); }
    });
    addInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onAddElement(); }
    });

    document.body.addEventListener('click', initAudio, { once: true });

    // Paint the initial channel (CH 01 · BUBBLE) without the tuning sound
    sortChannel = 0;
    const initial = SORT_CHANNELS[sortChannel];
    document.documentElement.style.setProperty('--ch-accent', initial.accent);
    document.documentElement.style.setProperty('--ch-accent-dark', initial.accentDark);
    const chLabel = document.getElementById('chLabel');
    const chName  = document.getElementById('chName');
    const sortCode = document.getElementById('sortCode');
    if (chLabel) chLabel.textContent = initial.label;
    if (chName)  chName.textContent  = initial.name;
    if (sortCode) sortCode.textContent = initial.code;
    const sortBtn = document.getElementById('sortBtn');
    if (sortBtn) sortBtn.textContent = `▶ Run ${initial.name} Sort`;
  }

  init();
})();