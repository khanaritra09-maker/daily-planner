(function(){
  const START_HOUR = 0;
  const END_HOUR = 23;
  const STORAGE_PREFIX = 'daybook:';
  const RECUR_KEY = 'daybook:recurring';
  let current = new Date();
  current.setHours(0,0,0,0);

  const $ = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);

  const dayNumEl = $('#dayNum'), dayNameEl = $('#dayName'), monthYearEl = $('#monthYear');
  const timelineEl = $('#timeline'), prioritiesEl = $('#priorities'), notesEl = $('#notes');
  const weekStripEl = $('#weekStrip'), taskCountEl = $('#taskCount'), toastEl = $('#toast');
  const wordCountEl = $('#wordCount');

  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  function showToast(msg){
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=> toastEl.classList.remove('show'), 2200);
  }

  /* ---------------- Theme ---------------- */
  const themeBtn = $('#themeBtn');
  function applyTheme(t){
    document.documentElement.setAttribute('data-theme', t);
    themeBtn.textContent = t === 'dark' ? '☀️' : '🌙';
    themeBtn.classList.toggle('on', t === 'dark');
    try{ localStorage.setItem('daybook:theme', t); }catch(e){}
  }
  (function initTheme(){
    let t = 'light';
    try{
      t = localStorage.getItem('daybook:theme');
      if(!t) t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }catch(e){}
    applyTheme(t);
  })();
  themeBtn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });

  /* ---------------- Data Layer ---------------- */
  function keyFor(date){
    return STORAGE_PREFIX + date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
  }
  function dateStr(date){ return keyFor(date).replace(STORAGE_PREFIX,''); }

  function loadRecurring(){
    try{ return JSON.parse(localStorage.getItem(RECUR_KEY)) || []; }catch(e){ return []; }
  }
  function saveRecurring(list){
    try{ localStorage.setItem(RECUR_KEY, JSON.stringify(list)); }catch(e){}
  }

  function recurringAppliesToDate(rule, date){
    if(rule.freq === 'daily') return true;
    if(rule.freq === 'weekdays') return date.getDay() !== 0 && date.getDay() !== 6;
    if(rule.freq === 'weekly') return date.getDay() === rule.weekday;
    return false;
  }

  function loadDay(date){
    let data;
    try{
      const raw = localStorage.getItem(keyFor(date));
      data = raw ? JSON.parse(raw) : { tasks: [], priorities: ['', '', ''], notes: '' };
    }catch(e){ data = { tasks: [], priorities: ['', '', ''], notes: '' }; }
    if(!data.tasks) data.tasks = [];
    if(!data.priorities) data.priorities = ['','',''];
    if(!data.priorityDone) data.priorityDone = [false,false,false];

    // Materialize recurring templates
    const templates = loadRecurring();
    let changed = false;
    templates.forEach(rule => {
      if(recurringAppliesToDate(rule, date)){
        const exists = data.tasks.some(t => t.recurringId === rule.id);
        if(!exists){
          data.tasks.push({ id: uid(), hour: rule.hour, text: rule.text, category: rule.category || '', subtasks: [], done: false, recurringId: rule.id, recurringFreq: rule.freq });
          changed = true;
        }
      }
    });
    if(changed){
      try{ localStorage.setItem(keyFor(date), JSON.stringify(data)); }catch(e){}
    }
    return data;
  }

  function saveDay(date, data){
    try{ localStorage.setItem(keyFor(date), JSON.stringify(data)); }catch(e){}
    renderWeekStrip();
    renderChart();
  }

  function dayHasTasks(date){
    const d = loadDay(date);
    return d.tasks.length > 0 || d.priorities.some(p=>p && p.trim());
  }

  let dayData = loadDay(current);

  function uid(){ return Math.random().toString(36).slice(2,9); }

  function fmtHour(h){
    const period = h < 12 ? 'AM' : 'PM';
    let hr = h % 12; if(hr===0) hr = 12;
    return String(hr).padStart(2,'0') + ':00 ' + period;
  }

  /* ---------------- Navigation ---------------- */
  function renderHeader(){
    dayNumEl.textContent = String(current.getDate()).padStart(2,'0');
    dayNameEl.textContent = dayNames[current.getDay()];
    monthYearEl.textContent = monthNames[current.getMonth()] + ' ' + current.getFullYear();
  }

  function renderWeekStrip(){
    weekStripEl.innerHTML = '';
    const startOfWeek = new Date(current);
    startOfWeek.setDate(current.getDate() - current.getDay());
    for(let i=0;i<7;i++){
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate()+i);
      const btn = document.createElement('button');
      if(d.getTime() === current.getTime()) btn.classList.add('active');
      if(dayHasTasks(d)) btn.classList.add('has-tasks');
      btn.innerHTML = '<span class="wd">'+dayNames[d.getDay()].slice(0,1)+'</span><span class="wn">'+d.getDate()+'</span><span class="dot"></span>';
      btn.setAttribute('aria-label', dayNames[d.getDay()] + ' ' + d.getDate());
      btn.addEventListener('click', ()=>{ goToDate(d); });
      weekStripEl.appendChild(btn);
    }
  }

  function goToDate(date){
    const nd = new Date(date); nd.setHours(0,0,0,0);
    current = nd;
    dayData = loadDay(current);
    notifiedThisSession.clear();
    renderAll();
  }

  /* ---------------- Drag & Drop ---------------- */
  let dragTaskId = null;

  function handleDragStart(e, task, el){
    dragTaskId = task.id;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    try{ e.dataTransfer.setData('text/plain', task.id); }catch(err){}
  }
  function handleDragEnd(el){ el.classList.remove('dragging'); }

  function attachSlotDnD(slot, hour){
    slot.addEventListener('dragover', e => {
      e.preventDefault();
      slot.classList.add('drag-over');
    });
    slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
    slot.addEventListener('drop', e => {
      e.preventDefault();
      slot.classList.remove('drag-over');
      if(!dragTaskId) return;

      const movingTask = dayData.tasks.find(t => t.id === dragTaskId);
      if(!movingTask) return;

      dayData.tasks = dayData.tasks.filter(t => t.id !== dragTaskId);
      movingTask.hour = hour;

      const targetEl = e.target.closest('.task');
      if(targetEl && targetEl.dataset.id){
        const targetTask = dayData.tasks.find(t => t.id === targetEl.dataset.id);
        const targetIdx = dayData.tasks.indexOf(targetTask);
        if(targetIdx !== -1){
          dayData.tasks.splice(targetIdx, 0, movingTask);
        } else {
          dayData.tasks.push(movingTask);
        }
      } else {
        let lastIdx = -1;
        dayData.tasks.forEach((t,i) => { if(t.hour === hour) lastIdx = i; });
        if(lastIdx !== -1){
          dayData.tasks.splice(lastIdx + 1, 0, movingTask);
        } else {
          dayData.tasks.push(movingTask);
        }
      }
      dragTaskId = null;
      saveDay(current, dayData);
      renderTimeline();
    });
  }

  /* ---------------- Timeline Rendering ---------------- */
  function renderTimeline(){
    timelineEl.innerHTML = '';
    let count = 0;
    for(let h = START_HOUR; h <= END_HOUR; h++){
      const row = document.createElement('div');
      row.className = 'timeline-row';

      const timeEl = document.createElement('div');
      timeEl.className = 'time';
      timeEl.textContent = fmtHour(h);

      const slot = document.createElement('div');
      slot.className = 'slot';
      attachSlotDnD(slot, h);

      const tasksForHour = dayData.tasks.filter(t => t.hour === h);
      tasksForHour.forEach(t => {
        count++;
        slot.appendChild(renderTask(t));
      });

      const addBtn = document.createElement('button');
      addBtn.className = 'add-task-btn';
      addBtn.addEventListener('click', () => startAddTask(slot, h, addBtn));
      slot.appendChild(addBtn);

      row.appendChild(timeEl);
      row.appendChild(slot);
      timelineEl.appendChild(row);
    }
    taskCountEl.textContent = count + (count === 1 ? ' task' : ' tasks');
  }

  function startAddTask(slot, hour, addBtn){
    if(slot.querySelector('.inline-task-form')) return;

    const form = document.createElement('div');
    form.className = 'inline-task-form';

    const input = document.createElement('input');
    input.className = 'inline-input';
    input.placeholder = 'What are you doing at ' + fmtHour(hour) + '?';
    input.type = 'text';

    const catPicker = document.createElement('div');
    catPicker.className = 'category-picker';
    let selectedCategory = '';
    const categories = ['work', 'personal', 'fitness', 'study'];
    categories.forEach(cat => {
      const opt = document.createElement('span');
      opt.className = 'cat-opt';
      opt.textContent = '#' + cat;
      opt.addEventListener('click', () => {
        if(selectedCategory === cat){
          selectedCategory = '';
          opt.classList.remove('selected');
        } else {
          catPicker.querySelectorAll('.cat-opt').forEach(o=>o.classList.remove('selected'));
          selectedCategory = cat;
          opt.classList.add('selected');
        }
      });
      catPicker.appendChild(opt);
    });

    form.appendChild(input);
    form.appendChild(catPicker);
    addBtn.insertAdjacentElement('beforebegin', form);
    input.focus();

    let committed = false;
    function commit(){
      if(committed) return;
      committed = true;
      const val = input.value.trim();
      form.remove();
      if(val){
        dayData.tasks.push({
          id: uid(),
          hour,
          text: val,
          category: selectedCategory,
          subtasks: [],
          done: false
        });
        saveDay(current, dayData);
        renderTimeline();
      }
    }

    input.addEventListener('keydown', e => {
      if(e.key === 'Enter') commit();
      if(e.key === 'Escape'){ committed = true; form.remove(); }
    });
    // Give time for category picker click before blur
    input.addEventListener('blur', e => {
      setTimeout(() => { if(!form.contains(document.activeElement)) commit(); }, 150);
    });
  }

  const RECUR_CYCLE = [null, 'daily', 'weekdays', 'weekly'];
  const RECUR_LABEL = { daily: '🔁 daily', weekdays: '🔁 weekdays', weekly: '🔁 weekly' };

  function cycleRecurrence(task){
    const cur = task.recurringFreq || null;
    const idx = RECUR_CYCLE.indexOf(cur);
    const next = RECUR_CYCLE[(idx + 1) % RECUR_CYCLE.length];
    let templates = loadRecurring();

    if(next === null){
      if(task.recurringId) templates = templates.filter(r => r.id !== task.recurringId);
      delete task.recurringId; delete task.recurringFreq;
    } else if(!task.recurringId){
      const rule = { id: uid(), text: task.text, hour: task.hour, category: task.category, freq: next, weekday: current.getDay() };
      templates.push(rule);
      task.recurringId = rule.id;
      task.recurringFreq = next;
    } else {
      const rule = templates.find(r => r.id === task.recurringId);
      if(rule){ rule.freq = next; rule.weekday = current.getDay(); }
      task.recurringFreq = next;
    }
    saveRecurring(templates);
  }

  function renderTask(t){
    const el = document.createElement('div');
    el.className = 'task' + (t.done ? ' done' : '');
    el.draggable = true;
    el.dataset.id = t.id;
    el.addEventListener('dragstart', e => handleDragStart(e, t, el));
    el.addEventListener('dragend', () => handleDragEnd(el));

    const check = document.createElement('button');
    check.className = 'check' + (t.done ? ' done' : '');
    check.setAttribute('aria-label', t.done ? 'Mark task not done' : 'Mark task done');
    check.addEventListener('click', () => {
      t.done = !t.done;
      saveDay(current, dayData);
      renderTimeline();
    });

    const textWrap = document.createElement('div');
    textWrap.className = 'task-text-wrap';
    const textEl = document.createElement('div');
    textEl.className = 'task-text';
    textEl.textContent = t.text;
    textWrap.appendChild(textEl);

    const metaRow = document.createElement('div');
    metaRow.className = 'task-meta-row';

    if(t.category){
      const catBadge = document.createElement('span');
      catBadge.className = 'task-badge tag-' + t.category;
      catBadge.textContent = '#' + t.category;
      metaRow.appendChild(catBadge);
    }

    if(t.recurringFreq){
      const b = document.createElement('span');
      b.className = 'task-badge';
      b.textContent = RECUR_LABEL[t.recurringFreq];
      metaRow.appendChild(b);
    }

    if(metaRow.children.length > 0) textWrap.appendChild(metaRow);

    if(t.done){
      const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('class','strike-svg');
      svg.setAttribute('viewBox','0 0 300 16');
      svg.setAttribute('preserveAspectRatio','none');
      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d','M2,9 C40,4 80,13 120,7 C160,2 200,11 240,6 C260,4 280,8 298,7');
      svg.appendChild(path);
      textWrap.appendChild(svg);
    }

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    const repeatBtn = document.createElement('button');
    repeatBtn.className = 'task-action-btn' + (t.recurringFreq ? ' active' : '');
    repeatBtn.innerHTML = '🔁';
    repeatBtn.title = 'Repeat: ' + (t.recurringFreq || 'none');
    repeatBtn.addEventListener('click', () => {
      cycleRecurrence(t);
      saveDay(current, dayData);
      renderTimeline();
    });

    const del = document.createElement('button');
    del.className = 'task-action-btn del';
    del.innerHTML = '&times;';
    del.title = 'Delete task';
    del.addEventListener('click', () => {
      dayData.tasks = dayData.tasks.filter(x => x.id !== t.id);
      saveDay(current, dayData);
      renderTimeline();
    });

    actions.appendChild(repeatBtn);
    actions.appendChild(del);

    el.appendChild(check);
    el.appendChild(textWrap);
    el.appendChild(actions);
    return el;
  }

  /* ---------------- Priorities & Confetti ---------------- */
  function fireConfetti(){
    try{
      const canvas = document.createElement('canvas');
      canvas.style.position = 'fixed'; canvas.style.inset = '0';
      canvas.style.pointerEvents = 'none'; canvas.style.zIndex = '999';
      document.body.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      canvas.width = window.innerWidth; canvas.height = window.innerHeight;

      const particles = [];
      const colors = ['#6F8B6B','#C98A3C','#56708A','#E0AA68','#86AD80'];
      for(let i=0; i<60; i++){
        particles.push({
          x: canvas.width / 2, y: canvas.height / 2,
          vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.7) * 14,
          size: Math.random() * 8 + 4, color: colors[Math.floor(Math.random()*colors.length)],
          alpha: 1
        });
      }

      function anim(){
        ctx.clearRect(0,0,canvas.width,canvas.height);
        let alive = false;
        particles.forEach(p => {
          p.x += p.vx; p.y += p.vy; p.vy += 0.3; p.alpha -= 0.015;
          if(p.alpha > 0){
            alive = true;
            ctx.fillStyle = p.color; ctx.globalAlpha = p.alpha;
            ctx.fillRect(p.x, p.y, p.size, p.size);
          }
        });
        if(alive) requestAnimationFrame(anim);
        else canvas.remove();
      }
      anim();
    }catch(e){}
  }

  function renderPriorities(){
    prioritiesEl.innerHTML = '';
    if(!dayData.priorityDone) dayData.priorityDone = [false,false,false];
    for(let i=0;i<3;i++){
      const row = document.createElement('div');
      row.className = 'priority-row' + (dayData.priorityDone[i] ? ' p-row-done' : '');

      const num = document.createElement('div');
      num.className = 'p-num';
      num.textContent = (i+1) + '.';

      const check = document.createElement('button');
      check.className = 'p-check' + (dayData.priorityDone[i] ? ' done' : '');
      check.setAttribute('aria-label','Toggle priority done');
      check.addEventListener('click', () => {
        dayData.priorityDone[i] = !dayData.priorityDone[i];
        saveDay(current, dayData);
        renderPriorities();
        if(dayData.priorityDone.every(Boolean) && dayData.priorities.some(p => p.trim())){
          fireConfetti();
          showToast('🎉 All top priorities completed for today!');
        }
      });

      const input = document.createElement('input');
      input.className = 'p-input';
      input.placeholder = 'Priority ' + (i+1);
      input.value = dayData.priorities[i] || '';
      input.addEventListener('input', () => {
        dayData.priorities[i] = input.value;
        saveDay(current, dayData);
      });

      row.appendChild(num);
      row.appendChild(check);
      row.appendChild(input);
      prioritiesEl.appendChild(row);
    }
  }

  const URGENT_WORDS = ['urgent','asap','deadline','due','important','call','meeting','pay','submit','interview','exam','appointment','review','launch','send','follow up','followup'];
  function scoreTask(t){
    let score = 0;
    const lower = t.text.toLowerCase();
    URGENT_WORDS.forEach(w => { if(lower.includes(w)) score += 3; });
    score += Math.max(0, (END_HOUR - t.hour)) * 0.15;
    if(t.recurringFreq) score += 0.5;
    return score;
  }

  $('#aiSuggestBtn').addEventListener('click', () => {
    const undone = dayData.tasks.filter(t => !t.done);
    if(undone.length === 0){
      showToast('No open tasks to suggest from yet');
      return;
    }
    const ranked = [...undone].sort((a,b) => scoreTask(b) - scoreTask(a)).slice(0,3);
    dayData.priorities = ranked.map(t => t.text);
    while(dayData.priorities.length < 3) dayData.priorities.push('');
    dayData.priorityDone = [false,false,false];
    saveDay(current, dayData);
    renderPriorities();
    showToast('Suggested top 3 from your open tasks');
  });

  /* ---------------- Notes ---------------- */
  function renderNotes(){
    notesEl.value = dayData.notes || '';
    updateWordCount();
  }
  function updateWordCount(){
    const text = notesEl.value.trim();
    const words = text ? text.split(/\s+/).length : 0;
    const chars = text.length;
    wordCountEl.textContent = `${words} words · ${chars} chars`;
  }
  notesEl.addEventListener('input', () => {
    dayData.notes = notesEl.value;
    updateWordCount();
    saveDay(current, dayData);
  });

  /* ---------------- Productivity Chart ---------------- */
  function renderChart(){
    const wrap = $('#chartWrap');
    wrap.innerHTML = '';
    for(let i=6;i>=0;i--){
      const d = new Date(current);
      d.setDate(current.getDate() - i);
      const dd = loadDay(d);
      const total = dd.tasks.length;
      const done = dd.tasks.filter(t=>t.done).length;
      const pct = total ? Math.round((done/total)*100) : 0;

      const col = document.createElement('div');
      col.className = 'chart-col';
      const pctEl = document.createElement('div');
      pctEl.className = 'chart-pct';
      pctEl.textContent = total ? pct + '%' : '—';
      const track = document.createElement('div');
      track.className = 'chart-bar-track';
      const bar = document.createElement('div');
      bar.className = 'chart-bar';
      bar.style.height = (total ? Math.max(pct,6) : 0) + '%';
      track.appendChild(bar);
      const label = document.createElement('div');
      label.className = 'chart-day';
      label.textContent = dayNames[d.getDay()].slice(0,1);

      col.appendChild(pctEl);
      col.appendChild(track);
      col.appendChild(label);
      wrap.appendChild(col);
    }
  }

  /* ---------------- Pomodoro & Ambient Audio ---------------- */
  let pomoMode = 'focus';
  let pomoSeconds = 25*60;
  let pomoRunning = false;
  let pomoInterval = null;
  let pomoSessionCount = 0;

  const pomoTimeEl = $('#pomoTime'), pomoModeEl = $('#pomoMode'), pomoSessionsEl = $('#pomoSessions');
  const pomoStartBtn = $('#pomoStart'), pomoResetBtn = $('#pomoReset'), pomoSkipBtn = $('#pomoSkip');
  const pomoWorkLenEl = $('#pomoWorkLen'), pomoBreakLenEl = $('#pomoBreakLen');

  function pomoLenSeconds(){
    return (pomoMode === 'focus' ? parseInt(pomoWorkLenEl.value||25,10) : parseInt(pomoBreakLenEl.value||5,10)) * 60;
  }
  function renderPomo(){
    const m = Math.floor(pomoSeconds/60), s = pomoSeconds%60;
    pomoTimeEl.textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
    pomoModeEl.textContent = pomoMode === 'focus' ? 'Focus' : 'Break';
    pomoSessionsEl.textContent = pomoSessionCount + (pomoSessionCount === 1 ? ' session completed' : ' sessions completed');
    pomoStartBtn.textContent = pomoRunning ? 'Pause' : 'Start';
  }

  function beep(){
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 660;
      osc.connect(gain); gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    }catch(e){}
  }

  function notify(title, body){
    if('Notification' in window && Notification.permission === 'granted'){
      try{ new Notification(title, { body }); }catch(e){}
    }
  }

  function pomoTick(){
    pomoSeconds--;
    if(pomoSeconds < 0){
      beep();
      if(pomoMode === 'focus'){
        pomoSessionCount++;
        pomoMode = 'break';
        notify('Focus session complete', 'Time for a short break.');
      } else {
        pomoMode = 'focus';
        notify('Break over', 'Back to focus.');
      }
      pomoSeconds = pomoLenSeconds();
    }
    renderPomo();
  }

  pomoStartBtn.addEventListener('click', () => {
    pomoRunning = !pomoRunning;
    if(pomoRunning){
      pomoInterval = setInterval(pomoTick, 1000);
    } else {
      clearInterval(pomoInterval);
    }
    renderPomo();
  });
  pomoResetBtn.addEventListener('click', () => {
    pomoRunning = false;
    clearInterval(pomoInterval);
    pomoMode = 'focus';
    pomoSeconds = pomoLenSeconds();
    renderPomo();
  });
  pomoSkipBtn.addEventListener('click', () => {
    pomoSeconds = 0;
    pomoTick();
  });
  [pomoWorkLenEl, pomoBreakLenEl].forEach(inp => {
    inp.addEventListener('change', () => {
      if(!pomoRunning) pomoSeconds = pomoLenSeconds();
      renderPomo();
    });
  });

  /* Ambient Audio Synthesizer (White Noise / Rain Simulator) */
  let ambientAudioCtx = null;
  let ambientNoiseNode = null;
  let activeAmbientType = null;

  function stopAmbientSound(){
    if(ambientNoiseNode){
      ambientNoiseNode.stop();
      ambientNoiseNode.disconnect();
      ambientNoiseNode = null;
    }
    activeAmbientType = null;
    $$('.ambient-btn').forEach(b => b.classList.remove('active'));
  }

  function playAmbientSound(type){
    if(activeAmbientType === type){
      stopAmbientSound();
      return;
    }
    stopAmbientSound();
    activeAmbientType = type;

    try{
      if(!ambientAudioCtx) ambientAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const bufferSize = ambientAudioCtx.sampleRate * 2;
      const noiseBuffer = ambientAudioCtx.createBuffer(1, bufferSize, ambientAudioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = ambientAudioCtx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const filter = ambientAudioCtx.createBiquadFilter();
      filter.type = type === 'rain' ? 'lowpass' : 'bandpass';
      filter.frequency.value = type === 'rain' ? 800 : 1000;

      const gain = ambientAudioCtx.createGain();
      gain.gain.value = 0.05;

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(ambientAudioCtx.destination);
      whiteNoise.start();

      ambientNoiseNode = whiteNoise;
      $(`#amb-${type}`).classList.add('active');
    }catch(e){
      showToast('Audio synthesis not supported in browser');
    }
  }

  $('#amb-rain').addEventListener('click', () => playAmbientSound('rain'));
  $('#amb-noise').addEventListener('click', () => playAmbientSound('noise'));

  /* ---------------- Notifications ---------------- */
  const notifBtn = $('#notifBtn');
  let notifiedThisSession = new Set();
  function updateNotifBtn(){
    const granted = ('Notification' in window) && Notification.permission === 'granted';
    notifBtn.classList.toggle('on', granted);
    notifBtn.title = granted ? 'Reminders enabled' : 'Enable reminders';
  }
  notifBtn.addEventListener('click', async () => {
    if(!('Notification' in window)){
      showToast('Notifications are not supported in this browser');
      return;
    }
    if(Notification.permission === 'granted'){
      showToast('Reminders already enabled');
      return;
    }
    const perm = await Notification.requestPermission();
    updateNotifBtn();
    showToast(perm === 'granted' ? 'Reminders enabled' : 'Permission not granted');
  });
  updateNotifBtn();

  setInterval(() => {
    if(!('Notification' in window) || Notification.permission !== 'granted') return;
    const now = new Date();
    if(dateStr(now) !== dateStr(current)) return;
    const isToday = dateStr(now) === dateStr(new Date());
    if(!isToday) return;
    dayData.tasks.forEach(t => {
      if(t.done || notifiedThisSession.has(t.id)) return;
      if(t.hour === now.getHours()){
        notify('Daybook · ' + fmtHour(t.hour), t.text);
        notifiedThisSession.add(t.id);
      }
    });
  }, 30000);

  /* ---------------- Command Palette & Search Modal ---------------- */
  const searchModal = $('#searchModal');
  const searchInput = $('#searchInput');
  const searchResults = $('#searchResults');
  const searchModalBtn = $('#searchModalBtn');
  const searchModalClose = $('#searchModalClose');

  function openSearchModal(){
    searchModal.classList.add('open');
    searchInput.value = '';
    searchInput.focus();
    renderSearchResults('');
  }
  function closeSearchModal(){ searchModal.classList.remove('open'); }

  searchModalBtn.addEventListener('click', openSearchModal);
  searchModalClose.addEventListener('click', closeSearchModal);
  searchModal.addEventListener('click', e => { if(e.target === searchModal) closeSearchModal(); });

  function renderSearchResults(query){
    searchResults.innerHTML = '';
    const q = query.toLowerCase().trim();
    const matches = [];

    // Search across all stored days
    for(let i=0; i<localStorage.length; i++){
      const key = localStorage.key(i);
      if(key.startsWith(STORAGE_PREFIX) && key !== RECUR_KEY && key !== 'daybook:theme'){
        try{
          const dateString = key.replace(STORAGE_PREFIX,'');
          const data = JSON.parse(localStorage.getItem(key));
          if(data && data.tasks){
            data.tasks.forEach(t => {
              if(!q || t.text.toLowerCase().includes(q)){
                matches.push({ date: dateString, task: t });
              }
            });
          }
        }catch(e){}
      }
    }

    if(matches.length === 0){
      searchResults.innerHTML = '<div style="color:var(--ink-soft); font-size:13px; text-align:center; padding:16px;">No matching tasks found</div>';
      return;
    }

    matches.slice(0, 20).forEach(m => {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.innerHTML = `
        <div style="font-size:14px; font-weight:500;">${m.task.text}</div>
        <div class="result-date">${m.date} · ${fmtHour(m.task.hour)}</div>
      `;
      item.addEventListener('click', () => {
        const parts = m.date.split('-');
        const targetDate = new Date(parseInt(parts[0],10), parseInt(parts[1],10)-1, parseInt(parts[2],10));
        goToDate(targetDate);
        closeSearchModal();
      });
      searchResults.appendChild(item);
    });
  }

  searchInput.addEventListener('input', () => renderSearchResults(searchInput.value));

  /* ---------------- Export & Import ---------------- */
  function buildExportRows(){
    const rows = [['Time','Task','Category','Done']];
    dayData.tasks.slice().sort((a,b)=>a.hour-b.hour).forEach(t => {
      rows.push([fmtHour(t.hour), t.text, t.category||'None', t.done ? 'Yes' : 'No']);
    });
    return rows;
  }

  $('#exportCsv').addEventListener('click', () => {
    const rows = buildExportRows();
    rows.push([]);
    rows.push(['Priorities']);
    dayData.priorities.forEach((p,i)=>{ if(p) rows.push([(i+1)+'.', p, dayData.priorityDone[i] ? 'Yes':'No']); });
    rows.push([]);
    rows.push(['Notes', (dayData.notes||'').replace(/\n/g,' ')]);
    const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'daybook-' + dateStr(current) + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#exportPdf').addEventListener('click', () => {
    if(!window.jspdf){ showToast('PDF library failed to load'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let y = 18;
    doc.setFont('helvetica','bold'); doc.setFontSize(18);
    doc.text('Daybook · ' + dayNames[current.getDay()] + ' ' + monthNames[current.getMonth()] + ' ' + current.getDate() + ', ' + current.getFullYear(), 14, y);
    y += 10;
    doc.setFontSize(12); doc.text("Today's Three", 14, y); y += 6;
    doc.setFont('helvetica','normal'); doc.setFontSize(10);
    dayData.priorities.forEach((p,i) => {
      if(p){ doc.text((i+1)+'. ' + p + (dayData.priorityDone[i] ? '  [done]' : ''), 16, y); y += 6; }
    });
    y += 4;
    doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.text('Timeline', 14, y); y += 6;
    doc.setFont('helvetica','normal'); doc.setFontSize(10);
    dayData.tasks.slice().sort((a,b)=>a.hour-b.hour).forEach(t => {
      if(y > 275){ doc.addPage(); y = 18; }
      doc.text(fmtHour(t.hour) + '  —  ' + t.text + (t.done ? '  [done]' : ''), 16, y);
      y += 6;
    });
    if(dayData.notes){
      y += 6;
      if(y > 260){ doc.addPage(); y = 18; }
      doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.text('Notes', 14, y); y += 6;
      doc.setFont('helvetica','normal'); doc.setFontSize(10);
      const split = doc.splitTextToSize(dayData.notes, 180);
      doc.text(split, 16, y);
    }
    doc.save('daybook-' + dateStr(current) + '.pdf');
  });

  /* JSON Data Backup & Restore */
  $('#exportBackup').addEventListener('click', () => {
    const backup = {};
    for(let i=0; i<localStorage.length; i++){
      const k = localStorage.key(i);
      if(k.startsWith(STORAGE_PREFIX)){
        backup[k] = localStorage.getItem(k);
      }
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'daybook-backup-' + dateStr(new Date()) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Backup JSON downloaded');
  });

  /* ---------------- Global Navigation Wiring ---------------- */
  $('#prevDay').addEventListener('click', () => { const d = new Date(current); d.setDate(d.getDate()-1); goToDate(d); });
  $('#nextDay').addEventListener('click', () => { const d = new Date(current); d.setDate(d.getDate()+1); goToDate(d); });
  $('#todayBtn').addEventListener('click', () => { goToDate(new Date()); });

  document.addEventListener('keydown', e => {
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'){
      e.preventDefault();
      openSearchModal();
      return;
    }
    if(['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
    if(e.key === 'ArrowLeft'){ const d = new Date(current); d.setDate(d.getDate()-1); goToDate(d); }
    if(e.key === 'ArrowRight'){ const d = new Date(current); d.setDate(d.getDate()+1); goToDate(d); }
  });

  function renderAll(){
    renderHeader();
    renderTimeline();
    renderPriorities();
    renderNotes();
    renderWeekStrip();
    renderChart();
  }

  renderPomo();
  renderAll();
})();

