/* app.js - Lógica principal de la Agenda */
(function(){
  const STORAGE_PREFIX = 'agenda_user_';
  let state = { user: null, data: null };

  // Diagnostic helpers: capture runtime errors and unhandled rejections
  window.addEventListener('error', (ev)=>{
    try{
      console.error('Runtime error caught:', ev.error || ev.message, ev);
      const details = [];
      if(ev.message) details.push(ev.message);
      if(ev.filename) details.push('at '+ev.filename+':'+ev.lineno+':'+ev.colno);
      if(ev.error && ev.error.stack) details.push('\n'+ev.error.stack);
      showDebugBanner('Error: '+ details.join(' '));
    }catch(e){}
  });
  window.addEventListener('unhandledrejection', (ev)=>{
    try{ console.error('Unhandled rejection:', ev.reason); showDebugBanner('Promise rejection: '+(ev.reason?.message||JSON.stringify(ev.reason))); }catch(e){}
  });

  function showDebugBanner(msg){
    let b = document.getElementById('debug-banner');
    if(!b){ b = document.createElement('div'); b.id='debug-banner'; b.style.position='fixed'; b.style.left='12px'; b.style.right='12px'; b.style.top='12px'; b.style.zIndex=99999; b.style.padding='8px 12px'; b.style.borderRadius='10px'; b.style.background='linear-gradient(90deg,#fff1f0,#fff7f0)'; b.style.border='1px solid rgba(0,0,0,0.06)'; b.style.boxShadow='0 12px 30px rgba(0,0,0,0.08)'; b.style.color='#7a1a1a'; document.body.appendChild(b); }
    b.textContent = msg;
  }

  // DOM
  const loginScreen = document.getElementById('login-screen');
  const mainScreen = document.getElementById('main-screen');
  const userButtons = document.querySelectorAll('.user-card');
  const titleUser = document.getElementById('title-user');
  const logoutBtn = document.getElementById('logout');

  // Quick sanity check: ensure essential elements exist to avoid runtime exceptions
  (function checkDOM(){
    const missing = [];
    if(!loginScreen) missing.push('login-screen');
    if(!mainScreen) missing.push('main-screen');
    if(!titleUser) missing.push('title-user');
    if(!logoutBtn) missing.push('logout');
    if(!userButtons || userButtons.length===0) missing.push('.user-card (no buttons)');
    if(missing.length>0){ showDebugBanner('Faltan elementos HTML: '+missing.join(', ')+'. Revisa Index.html.'); console.warn('Missing elements:', missing); }
  })();

  // Views
  const navBtns = document.querySelectorAll('.nav-btn');
  const views = document.querySelectorAll('.view');

  // Tasks
  const taskForm = document.getElementById('task-form');
  const taskTitle = document.getElementById('task-title');
  const taskRequired = document.getElementById('task-required');
  const taskPeriod = document.getElementById('task-period');
  const taskList = document.getElementById('task-list');
  const progressEl = document.getElementById('progress');
  const progressText = document.getElementById('progress-text');

  // Notes
  const noteForm = document.getElementById('note-form');
  const notesList = document.getElementById('notes-list');

  // Boards & goals
  const boardUrgent = document.getElementById('board-urgent');
  const boardPending = document.getElementById('board-pending');
  const addGoalBtn = document.getElementById('add-goal');
  const goalsList = document.getElementById('goals-list');

  // Attendance
  const attDate = document.getElementById('att-date');
  const attAbsent = document.getElementById('att-absent');
  const attLate = document.getElementById('att-late');
  const saveAtt = document.getElementById('save-att');
  const attendanceList = document.getElementById('attendance-list');
  // selection controls for attendance
  const attSelectToggle = document.getElementById('att-select-toggle');
  const attDeleteSelected = document.getElementById('att-delete-selected');
  const attCancelSelect = document.getElementById('att-cancel-select');
  let attendanceSelectionMode = false;
  let selectedAttendanceIds = new Set();

  // Settings
  const yearInput = document.getElementById('year-input');
  const p1 = document.getElementById('p1');
  const p2 = document.getElementById('p2');
  const p3 = document.getElementById('p3');
  const saveSettings = document.getElementById('save-settings');
  const annualLog = document.getElementById('annual-log');
  // Annual log selection controls (buttons exist in Index.html)
  const annualSelectToggle = document.getElementById('annual-select-toggle');
  const annualDeleteSelected = document.getElementById('annual-delete-selected');
  const annualCancelSelect = document.getElementById('annual-cancel-select');
  let annualSelectionMode = false;
  let selectedAnnualIdx = new Set();

  // AI
  const aiModal = document.getElementById('ai-modal');
  const aiOpen = document.getElementById('ai-open');
  const aiClose = document.getElementById('ai-close');
  const aiRun = document.getElementById('ai-run');
  const aiPrompt = document.getElementById('ai-prompt');
  const aiOutput = document.getElementById('ai-output');

  // Helpers
  function nowISO(){return new Date().toISOString()}
  // Subject colors mapping (name -> color hex)
  function ensureSubjectColors(){ state.data._subjectColors = state.data._subjectColors || {}; return state.data._subjectColors }
  // Image settings for papers and washi
  function ensureImageSettings(){ state.data.settings = state.data.settings || {}; state.data.settings.images = state.data.settings.images || { paper1: '', paper2: '', paper3: '', washi1: '', washi2: '' }; return state.data.settings.images }
  const LOG_IGNORED_TYPES = new Set(['login','logout','attendance_delete','annual_delete','task_delete','attendance_bulk_delete','annual_bulk_delete']);
  function saveLogEntry(user, type, details){
    // Only record user-initiated creations/edits and important settings; ignore login/logout and deletions per user request
    if(!type || LOG_IGNORED_TYPES.has(type)) return;
    const now = nowISO();
    // prefer current state.user when available
    const targetUser = (state.user) ? state.user : user;
    if(!targetUser) return; // nothing to log
    // load target data (may be state.data or from storage)
    let targetData = (state.user === targetUser) ? state.data : null;
    if(!targetData){
      const raw = localStorage.getItem(STORAGE_PREFIX+targetUser);
      targetData = raw ? JSON.parse(raw) : { tasks:[], notes:[], goals:[], attendance:[], urgent:[], settings:{year:new Date().getFullYear(), periods:[30,30,40]}, annualLog:{}, schedule:{} };
    }
    const year = (targetData.settings?.year) || new Date().getFullYear();
    targetData.annualLog = targetData.annualLog || {};
    targetData.annualLog[year] = targetData.annualLog[year] || [];
    targetData.annualLog[year].push({ts:now, type, details});
    // persist back
    if(state.user === targetUser){
      state.data = targetData; persist(); renderAnnualLog();
    } else {
      try{ localStorage.setItem(STORAGE_PREFIX+targetUser, JSON.stringify(targetData)); }catch(e){}
    }
  }

  function persist(){
    if(!state.user) return;
    localStorage.setItem(STORAGE_PREFIX+state.user, JSON.stringify(state.data));
  }
  function load(user){
    const raw = localStorage.getItem(STORAGE_PREFIX+user);
    if(raw) return JSON.parse(raw);
    // Defaults per user (personalización)
    const base = { tasks:[], notes:[], goals:[], attendance:[], urgent:[], settings:{year:new Date().getFullYear(), periods:[30,30,40]}, annualLog:{}, schedule:{} };
    if(user === 'juliana'){
      base.tasks = [
        {id:Date.now()+1,title:'Leer capítulo 4 - Literatura',required:false,period:1,done:false,created:nowISO()},
        {id:Date.now()+2,title:'Practicar ejercicios de álgebra',required:true,period:3,done:false,created:nowISO()}
      ];
      base.goals = [{id:1,text:'Estudiar 45 min hoy',type:'daily',created:nowISO()}];
      base.notes = [{id:1,title:'Resumen Filosofía',body:'Puntos clave: ...',hacer:80,saber:70,ser:60,computed:computeHSR({hacer:80,saber:70,ser:60}),created:nowISO()}];
      // gentle pastel schedule sample
      base.schedule[new Date().getFullYear()] = {periods:8,days:['L','M','Mi','J','V'],cells:{'L_1':'EA','M_1':'Soc','Mi_1':'Esp','J_1':'Esp','V_1':'Ing'}};
    }
    if(user === 'juan'){
      base.tasks = [
        {id:Date.now()+3,title:'Resolver problemas - Matemáticas',required:true,period:3,done:false,created:nowISO()},
        {id:Date.now()+4,title:'Revisar apuntes de Física',required:false,period:2,done:false,created:nowISO()}
      ];
      base.goals = [{id:2,text:'Completar 2 tareas prioritarias',type:'daily',created:nowISO()}];
      base.notes = [{id:2,title:'Fórmulas física',body:'F = m*a ...',hacer:90,saber:80,ser:50,computed:computeHSR({hacer:90,saber:80,ser:50}),created:nowISO()}];
      base.schedule[new Date().getFullYear()] = {periods:8,days:['L','M','Mi','J','V'],cells:{'L_1':'Mat','M_1':'Fis','Mi_1':'Quim','J_1':'Mat','V_1':'Teln'}};
    }
    return base;
  }

  // Login
  // Password-protected login: click selects user and opens password prompt
  const passwordPrompt = document.getElementById('password-prompt');
  const promptPassword = document.getElementById('prompt-password');
  const promptLogin = document.getElementById('prompt-login');
  const promptCancel = document.getElementById('prompt-cancel');
  const promptTitle = document.getElementById('prompt-title');
  const promptError = document.getElementById('prompt-error');
  let pendingLoginUser = null;
  // hardcoded passwords (can be changed later in settings)
  const PASSWORDS = { juliana: 'juliana123', juan: 'juan123' };

  userButtons.forEach(b=>b.addEventListener('click',()=>{
    const u = b.dataset.user;
    pendingLoginUser = u;
    promptTitle.textContent = 'Iniciar sesión: ' + (u==='juliana' ? 'Juliana Santamaría' : 'Juan Diego');
    promptPassword.value = '';
    promptError.style.display = 'none';
    passwordPrompt.classList.remove('hidden');
    promptPassword.focus();
  }));

  promptCancel.addEventListener('click', ()=>{ passwordPrompt.classList.add('hidden'); pendingLoginUser = null; promptPassword.value=''; promptError.style.display='none'; });
  promptLogin.addEventListener('click', ()=>{ const pwd = promptPassword.value || ''; if(!pendingLoginUser) return; const ok = (PASSWORDS[pendingLoginUser] === pwd); if(!ok){ promptError.style.display='block'; promptError.textContent = 'Contraseña incorrecta'; return; } // success
    // perform actual login
    const u = pendingLoginUser; pendingLoginUser = null; passwordPrompt.classList.add('hidden');
    state.user = u; state.data = load(u); applyTheme(u); showMain(); renderAll(); saveLogEntry(u,'login','inicio de sesion');
  });
  // close password prompt when clicking outside
  passwordPrompt.addEventListener('click', (e)=>{ if(e.target === passwordPrompt){ passwordPrompt.classList.add('hidden'); pendingLoginUser=null; promptError.style.display='none'; } });
  // submit on Enter
  promptPassword.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ promptLogin.click(); } });

  logoutBtn.addEventListener('click',()=>{
    saveLogEntry(state.user,'logout','fin de sesion');
    state.user = null; state.data=null; document.body.classList.remove('theme-juliana','theme-juan'); showLogin();
  });

  function applyTheme(user){
    document.body.classList.remove('theme-juliana','theme-juan');
    // Reset custom vars
    document.documentElement.style.removeProperty('--accent-1');
    document.documentElement.style.removeProperty('--accent-2');
    if(user==='juliana'){
      document.body.classList.add('theme-juliana');
      document.documentElement.style.setProperty('--accent-1','#7c4dff');
      document.documentElement.style.setProperty('--accent-2','#c9a7ff');
      titleUser.textContent = 'Juliana Santamaría Quintero';
    }
    if(user==='juan'){
      document.body.classList.add('theme-juan');
      document.documentElement.style.setProperty('--accent-1','#ff7a00');
      document.documentElement.style.setProperty('--accent-2','#ffd19a');
      titleUser.textContent = 'Juan Diego Moreno Mesa';
    }
  }

  function showMain(){loginScreen.classList.add('hidden'); mainScreen.classList.remove('hidden')}
  function showLogin(){loginScreen.classList.remove('hidden'); mainScreen.classList.add('hidden')}

  // Navigation with animated transitions between panels
  function activateTab(button){
    const v = button.dataset.view;
    // set active tab styling
    navBtns.forEach(nb=>{ nb.classList.remove('active'); nb.setAttribute('aria-selected','false'); });
    button.classList.add('active'); button.setAttribute('aria-selected','true');

    const target = document.getElementById('view-'+v);
    const current = Array.from(views).find(x=>!x.classList.contains('hidden'));
    if(current === target) return;

    // animate current out
    if(current){
      current.classList.add('view-exit');
      const onEnd = (e)=>{ if(e.propertyName==='opacity'){ current.classList.add('hidden'); current.classList.remove('view-exit'); current.removeEventListener('transitionend', onEnd); } };
      current.addEventListener('transitionend', onEnd);
    }

    // animate target in
    if(target){
      // make visible before animating
      target.classList.remove('hidden');
      // start from enter state
      target.classList.add('view-enter');
      requestAnimationFrame(()=>{ 
        target.classList.remove('view-enter');
        // trigger page-open 3D animation
        try{ target.classList.add('page-open'); }catch(e){}
      });
      // remove page-open after animation ends
      const removePageOpen = (ev)=>{ if(ev.animationName === 'pageOpen'){ target.classList.remove('page-open'); target.removeEventListener('animationend', removePageOpen); } };
      target.addEventListener('animationend', removePageOpen);
      if(v === 'schedule') renderSchedule();
    }
  }

  navBtns.forEach(btn=>{ btn.addEventListener('click', ()=> activateTab(btn)); });

  // enable keyboard switching (ArrowLeft/ArrowRight) between tabs
  document.querySelectorAll('.nav-btn').forEach((btn, idx, list)=>{
    btn.addEventListener('keydown', (e)=>{
      if(e.key === 'ArrowRight'){ e.preventDefault(); const nx = (idx+1) % list.length; list[nx].focus(); list[nx].click(); }
      if(e.key === 'ArrowLeft'){ e.preventDefault(); const nx = (idx-1+list.length) % list.length; list[nx].focus(); list[nx].click(); }
    });
  });

  // Tasks CRUD
  taskForm.addEventListener('submit',e=>{
    e.preventDefault();
    const priority = document.getElementById('task-priority').value;
    const due = document.getElementById('task-due').value || null;
    const t = {id:Date.now(), title:taskTitle.value, required:taskRequired.checked, period:parseInt(taskPeriod.value), priority, due, done:false, created:nowISO()};
    state.data.tasks.push(t); persist(); renderTasks(); saveLogEntry(state.user,'task_add',t.title);
    taskForm.reset();
  });

  // Task editor elements
  const taskEditor = document.getElementById('task-editor');
  const editTitle = document.getElementById('edit-title');
  const editRequired = document.getElementById('edit-required');
  const editPeriod = document.getElementById('edit-period');
  const editPriority = document.getElementById('edit-priority');
  const editDue = document.getElementById('edit-due');
  const saveEdit = document.getElementById('save-edit');
  const cancelEdit = document.getElementById('cancel-edit');
  let editingTaskId = null;

  function openTaskEditor(task){
    editingTaskId = task.id;
    editTitle.value = task.title || '';
    editRequired.checked = !!task.required;
    editPeriod.value = task.period || 1;
    editPriority.value = task.priority || 'med';
    editDue.value = task.due || '';
    taskEditor.classList.remove('hidden');
    taskEditor.scrollIntoView({behavior:'smooth', block:'center'});
  }
  function closeTaskEditor(){ editingTaskId = null; taskEditor.classList.add('hidden'); }

  saveEdit.addEventListener('click',()=>{
    const t = state.data.tasks.find(x=>x.id===editingTaskId); if(!t) return;
    t.title = editTitle.value; t.required = editRequired.checked; t.period = parseInt(editPeriod.value); t.priority = editPriority.value; t.due = editDue.value||null; t.updated = nowISO(); persist(); renderTasks(); saveLogEntry(state.user,'task_edit',t.title); closeTaskEditor();
  });
  cancelEdit.addEventListener('click',()=>{ closeTaskEditor(); });

  function renderTasks(){
    taskList.innerHTML='';
    const tasks = state.data.tasks||[];
    tasks.forEach(task=>{
      const div = document.createElement('div'); div.className='task-item';
      const left = document.createElement('div'); left.className='task-left';
      const cb = document.createElement('input'); cb.type='checkbox'; cb.checked=task.done;
      cb.addEventListener('change',()=>{task.done=cb.checked; task.updated=nowISO(); persist(); renderTasks(); saveLogEntry(state.user,'task_toggle',task.title)});
      const title = document.createElement('div'); title.className='title';
      const titleHtml = `<strong>${task.title}</strong><div class="small">Periodo ${task.period} • ${task.created.substring(0,10)}${task.due?(' • vence: '+task.due):''}</div>`;
      title.innerHTML = titleHtml;
      left.appendChild(cb); left.appendChild(title);
      const right = document.createElement('div');
      // priority tag
      const pr = document.createElement('span'); pr.className = task.priority==='high' ? 'priority-high' : (task.priority==='low' ? 'priority-low' : 'priority-med'); pr.textContent = task.priority === 'high' ? 'Alta' : (task.priority==='low' ? 'Baja' : 'Media'); right.appendChild(pr);
      if(task.required){const b=document.createElement('span');b.className='badge required';b.textContent='Oblig.';b.style.marginLeft='8px';right.appendChild(b)}
      // pin/unpin to urgent board
      const pin = document.createElement('button'); pin.textContent = state.data.urgent && state.data.urgent.includes(task.id) ? '📌' : '📍'; pin.className='btn-ghost'; pin.title='Fijar/Desfijar en "No olvidar"'; pin.addEventListener('click',()=>{
        state.data.urgent = state.data.urgent || [];
        const idx = state.data.urgent.indexOf(task.id);
        if(idx===-1) state.data.urgent.push(task.id); else state.data.urgent.splice(idx,1);
        persist(); renderBoards(); renderTasks(); saveLogEntry(state.user, idx===-1 ? 'task_pin' : 'task_unpin', task.title);
      }); right.appendChild(pin);
      const edit = document.createElement('button'); edit.textContent='✎'; edit.className='btn-ghost'; edit.addEventListener('click',()=>{ openTaskEditor(task); });
      const del = document.createElement('button'); del.textContent='🗑'; del.className='btn-ghost'; del.addEventListener('click',()=>{if(confirm('Eliminar tarea?')){state.data.tasks=state.data.tasks.filter(x=>x.id!==task.id); persist(); renderTasks(); saveLogEntry(state.user,'task_delete',task.title)}});
      right.appendChild(edit); right.appendChild(del);
      div.appendChild(left); div.appendChild(right);
      taskList.appendChild(div);
    });
    renderProgress();
    // check urgent tasks after rendering
    try{ checkUrgentTasks(); }catch(e){}
  }

  // Progress calculation: usa ponderaciones por periodo y tareas completadas
  function renderProgress(){
    const periods = state.data.settings?.periods || [30,30,40];
    const tasks = state.data.tasks||[];
    if(tasks.length===0){progressEl.value=0;progressText.textContent='0%';return}
    // Calcular contribución por tarea según su periodo: cada tarea en periodo p vale (periods[p-1]/totalTasksInThatPeriod)
    const byPeriod = {1:[],2:[],3:[]};
    tasks.forEach(t=>byPeriod[t.period||1].push(t));
    let score=0; let totalWeight=0;
    [1,2,3].forEach(i=>{
      const weight = periods[i-1];
      const arr = byPeriod[i];
      if(arr.length===0) return;
      const perTask = weight / arr.length;
      arr.forEach(t=>{ if(t.done) score += perTask; });
      totalWeight += weight;
    });
    // Normalizar a porcentaje sobre totalWeight
    const pct = Math.round((score/totalWeight)*100);
    progressEl.value = pct; progressText.textContent = pct+'%';
  }

  // Notes
  noteForm.addEventListener('submit',e=>{
    e.preventDefault();
    const category = document.getElementById('note-category') ? document.getElementById('note-category').value : 'hacer';
    const n = {id:Date.now(), title:document.getElementById('note-title').value, body:document.getElementById('note-body').value, category, hacer:parseFloat(document.getElementById('score-hacer').value||0), saber:parseFloat(document.getElementById('score-saber').value||0), ser:parseFloat(document.getElementById('score-ser').value||0), created:nowISO()};
    n.computed = computeHSR(n);
    state.data.notes.push(n); persist(); renderNotes(); saveLogEntry(state.user,'note_add',n.title);
    noteForm.reset();
  });
  function computeHSR(n){
    // HACER 40%, SABER 40%, SER 20%
    const val = ((n.hacer||0)*0.4 + (n.saber||0)*0.4 + (n.ser||0)*0.2);
    return Math.round(val*100)/100;
  }
  function renderNotes(){
    // Render notes split by category: hacer, saber, ser
    const nh = document.getElementById('notes-hacer');
    const ns = document.getElementById('notes-saber');
    const nr = document.getElementById('notes-ser');
    if(!nh || !ns || !nr) return;
    nh.innerHTML=''; ns.innerHTML=''; nr.innerHTML='';
    (state.data.notes||[]).forEach(note=>{
      const d=document.createElement('div'); d.className='note-card';
      d.innerHTML = `<strong>${note.title}</strong><div class="small">${note.created.substring(0,19)}</div><div>${note.body||''}</div><div class="small">H:${note.hacer||0} S:${note.saber||0} R:${note.ser||0} ${note.computed?('• Ponderado: '+note.computed):''}</div>`;
      const actions = document.createElement('div'); actions.style.marginTop='8px';
      const editBtn = document.createElement('button'); editBtn.textContent='✎'; editBtn.className='icon-btn'; editBtn.title='Editar nota'; editBtn.addEventListener('click',()=>{ openNoteEditor(note); });
      const del=document.createElement('button');del.textContent='Eliminar';del.className='btn-ghost';del.addEventListener('click',()=>{if(confirm('Eliminar nota?')){state.data.notes=state.data.notes.filter(x=>x.id!==note.id);persist();renderNotes();saveLogEntry(state.user,'note_delete',note.title)}});
      const move = document.createElement('button'); move.textContent='Mover'; move.className='btn-ghost'; move.addEventListener('click',()=>{ const target = prompt('Mover a categoría: hacer/saber/ser', note.category||'hacer'); if(target && ['hacer','saber','ser'].includes(target)){ note.category = target; note.updated = nowISO(); persist(); renderNotes(); saveLogEntry(state.user,'note_move',note.title+' -> '+target); } });
      actions.appendChild(editBtn); actions.appendChild(move); actions.appendChild(del); d.appendChild(actions);
      if(note.category==='hacer') nh.appendChild(d);
      else if(note.category==='saber') ns.appendChild(d);
      else nr.appendChild(d);
    });
  }

  // Note editor logic
  const noteEditor = document.getElementById('note-editor');
  const enTitle = document.getElementById('edit-note-title');
  const enBody = document.getElementById('edit-note-body');
  const enCat = document.getElementById('edit-note-category');
  const enH = document.getElementById('edit-score-hacer');
  const enS = document.getElementById('edit-score-saber');
  const enR = document.getElementById('edit-score-ser');
  const saveNoteEdit = document.getElementById('save-note-edit');
  const cancelNoteEdit = document.getElementById('cancel-note-edit');
  const deleteNoteEdit = document.getElementById('delete-note-edit');
  let editingNoteId = null;

  function openNoteEditor(note){
    editingNoteId = note.id;
    enTitle.value = note.title || '';
    enBody.value = note.body || '';
    enCat.value = note.category || 'hacer';
    enH.value = note.hacer || '';
    enS.value = note.saber || '';
    enR.value = note.ser || '';
    noteEditor.classList.remove('hidden');
    noteEditor.scrollIntoView({behavior:'smooth', block:'center'});
  }
  function closeNoteEditor(){ editingNoteId = null; noteEditor.classList.add('hidden'); }

  saveNoteEdit.addEventListener('click',()=>{
    const n = (state.data.notes||[]).find(x=>x.id===editingNoteId); if(!n) return;
    n.title = enTitle.value; n.body = enBody.value; n.category = enCat.value; n.hacer = parseFloat(enH.value||0); n.saber = parseFloat(enS.value||0); n.ser = parseFloat(enR.value||0); n.computed = computeHSR(n); n.updated = nowISO(); persist(); renderNotes(); saveLogEntry(state.user,'note_edit',n.title); closeNoteEditor();
  });
  cancelNoteEdit.addEventListener('click',()=>{ closeNoteEditor(); });
  deleteNoteEdit.addEventListener('click',()=>{ if(!editingNoteId) return; if(confirm('Eliminar nota?')){ state.data.notes = state.data.notes.filter(x=>x.id!==editingNoteId); persist(); renderNotes(); saveLogEntry(state.user,'note_delete','editor'); closeNoteEditor(); } });

  // Goals
  addGoalBtn.addEventListener('click',()=>{
    const t = document.getElementById('goal-text').value.trim(); const type=document.getElementById('goal-type').value; if(!t) return; const g={id:Date.now(),text:t,type,created:nowISO()}; state.data.goals.push(g); persist(); renderGoals(); saveLogEntry(state.user,'goal_add',t); document.getElementById('goal-text').value='';
  });
  function renderGoals(){
    goalsList.innerHTML=''; (state.data.goals||[]).forEach(g=>{const el=document.createElement('div');el.className='note';el.innerHTML=`<strong>${g.text}</strong><div class="small">${g.type} • ${g.created.substring(0,10)}</div>`; const del=document.createElement('button');del.textContent='Eliminar';del.className='btn-ghost';del.addEventListener('click',()=>{state.data.goals=state.data.goals.filter(x=>x.id!==g.id);persist();renderGoals();saveLogEntry(state.user,'goal_delete',g.text)}); el.appendChild(del);goalsList.appendChild(el)})
  }

  // Boards
  function renderBoards(){
    boardUrgent.innerHTML=''; boardPending.innerHTML='';
    // urgent tasks (pinned)
    (state.data.urgent||[]).slice(0,10).forEach(id=>{const t = (state.data.tasks||[]).find(x=>x.id===id); if(t){const el=document.createElement('div');el.className='note';el.textContent = t.title; boardUrgent.appendChild(el)}});
    // fallback: daily goals
    if((state.data.urgent||[]).length===0){ (state.data.goals||[]).filter(g=>g.type==='daily').slice(0,5).forEach(g=>{const el=document.createElement('div');el.className='note';el.textContent=g.text;boardUrgent.appendChild(el)}); }
    (state.data.notes||[]).slice(0,6).forEach(n=>{const el=document.createElement('div');el.className='note';el.textContent=n.title;boardPending.appendChild(el)});
  }

  // Attendance
  saveAtt.addEventListener('click',()=>{
    const date = attDate.value || new Date().toISOString().substring(0,10);
    const rec = {id:Date.now(), date, absent:attAbsent.checked, late:attLate.checked, ts:nowISO()};
    state.data.attendance.push(rec); persist(); renderAttendance(); saveLogEntry(state.user,'attendance_add',`fecha ${date} absent:${rec.absent} late:${rec.late}`);
    attAbsent.checked=false; attLate.checked=false; attDate.value='';
  });
  function renderAttendance(){
    attendanceList.innerHTML='';
    const arr = (state.data.attendance||[]).slice().reverse();
    arr.forEach(a=>{
      const el = document.createElement('div'); el.className = 'note';
      if(attendanceSelectionMode){
        const cb = document.createElement('input'); cb.type='checkbox'; cb.style.marginRight='8px'; cb.checked = selectedAttendanceIds.has(a.id);
        cb.addEventListener('change', ()=>{ if(cb.checked) selectedAttendanceIds.add(a.id); else selectedAttendanceIds.delete(a.id); attDeleteSelected.classList.toggle('hidden', selectedAttendanceIds.size===0); });
        el.appendChild(cb);
      }
      const info = document.createElement('div'); info.innerHTML = `<strong>${a.date}</strong><div class="small">Inasistencia: ${a.absent} • Retardo: ${a.late} • registrado: ${a.ts}</div>`;
      el.appendChild(info);
      if(!attendanceSelectionMode){
        const del = document.createElement('button'); del.textContent='Eliminar'; del.className='btn-ghost';
        del.addEventListener('click', ()=>{ if(confirm('Eliminar registro de asistencia?')){ state.data.attendance = state.data.attendance.filter(x=>x.id!==a.id); persist(); renderAttendance(); saveLogEntry(state.user,'attendance_delete',a.date); } });
        el.appendChild(del);
      }
      attendanceList.appendChild(el);
    });
    // control visibility of action button
    if(attDeleteSelected) attDeleteSelected.classList.toggle('hidden', selectedAttendanceIds.size===0);
  }

  // Attendance selection handlers
  if(attSelectToggle){
    attSelectToggle.addEventListener('click', ()=>{
      attendanceSelectionMode = true; selectedAttendanceIds = new Set();
      attSelectToggle.classList.add('hidden'); attCancelSelect.classList.remove('hidden'); attDeleteSelected.classList.remove('hidden'); renderAttendance();
    });
  }
  if(attCancelSelect){
    attCancelSelect.addEventListener('click', ()=>{
      attendanceSelectionMode = false; selectedAttendanceIds = new Set(); attSelectToggle.classList.remove('hidden'); attCancelSelect.classList.add('hidden'); attDeleteSelected.classList.add('hidden'); renderAttendance();
    });
  }
  if(attDeleteSelected){
    attDeleteSelected.addEventListener('click', ()=>{
      if(selectedAttendanceIds.size===0) return; if(!confirm('Eliminar registros seleccionados?')) return;
      state.data.attendance = (state.data.attendance||[]).filter(a=> !selectedAttendanceIds.has(a.id)); persist(); saveLogEntry(state.user,'attendance_bulk_delete',`deleted ${selectedAttendanceIds.size}`);
      attendanceSelectionMode = false; selectedAttendanceIds = new Set(); attSelectToggle.classList.remove('hidden'); attCancelSelect.classList.add('hidden'); attDeleteSelected.classList.add('hidden'); renderAttendance();
    });
  }

  // Settings
  saveSettings.addEventListener('click',()=>{
    state.data.settings = state.data.settings || {};
    state.data.settings.year = parseInt(yearInput.value)||new Date().getFullYear();
    state.data.settings.periods = [parseFloat(p1.value)||30,parseFloat(p2.value)||30,parseFloat(p3.value)||40];
    // apply image inputs if present (do not overwrite if empty)
    const imgs = ensureImageSettings();
    const ip1 = document.getElementById('img-paper-1').value.trim(); if(ip1) imgs.paper1 = ip1;
    const ip2 = document.getElementById('img-paper-2').value.trim(); if(ip2) imgs.paper2 = ip2;
    const ip3 = document.getElementById('img-paper-3').value.trim(); if(ip3) imgs.paper3 = ip3;
    const iw1 = document.getElementById('img-washi-1').value.trim(); if(iw1) imgs.washi1 = iw1;
    const iw2 = document.getElementById('img-washi-2').value.trim(); if(iw2) imgs.washi2 = iw2;
    persist(); renderAnnualLog(); saveLogEntry(state.user,'settings_save',JSON.stringify({year:state.data.settings.year,periods:state.data.settings.periods})); applyImagesFromSettings(); alert('Ajustes guardados');
  });

  // Apply images from settings into DOM elements
  function applyImagesFromSettings(){
    if(!state.data) return; const imgs = ensureImageSettings();
    const p1el = document.querySelector('.paper-1'); const p2el = document.querySelector('.paper-2'); const p3el = document.querySelector('.paper-3');
    const w1el = document.querySelector('.washi-1'); const w2el = document.querySelector('.washi-2');
    try{
      if(p1el) p1el.style.backgroundImage = imgs.paper1 ? `url('${imgs.paper1}')` : '';
      if(p2el) p2el.style.backgroundImage = imgs.paper2 ? `url('${imgs.paper2}')` : '';
      if(p3el) p3el.style.backgroundImage = imgs.paper3 ? `url('${imgs.paper3}')` : '';
      if(w1el) w1el.style.backgroundImage = imgs.washi1 ? `url('${imgs.washi1}')` : '';
      if(w2el) w2el.style.backgroundImage = imgs.washi2 ? `url('${imgs.washi2}')` : '';
    }catch(e){console.warn('Error applying images',e)}
  }

  // Apply / Reset image buttons
  const applyImagesBtn = document.getElementById('apply-images');
  const resetImagesBtn = document.getElementById('reset-images');
  if(applyImagesBtn){
    applyImagesBtn.addEventListener('click', ()=>{
      const imgs = ensureImageSettings();
      const ip1 = document.getElementById('img-paper-1').value.trim(); if(ip1) imgs.paper1 = ip1;
      const ip2 = document.getElementById('img-paper-2').value.trim(); if(ip2) imgs.paper2 = ip2;
      const ip3 = document.getElementById('img-paper-3').value.trim(); if(ip3) imgs.paper3 = ip3;
      const iw1 = document.getElementById('img-washi-1').value.trim(); if(iw1) imgs.washi1 = iw1;
      const iw2 = document.getElementById('img-washi-2').value.trim(); if(iw2) imgs.washi2 = iw2;
      persist(); applyImagesFromSettings(); alert('Imágenes aplicadas');
    });
  }
  if(resetImagesBtn){
    resetImagesBtn.addEventListener('click', ()=>{
      const imgs = ensureImageSettings(); imgs.paper1=''; imgs.paper2=''; imgs.paper3=''; imgs.washi1=''; imgs.washi2='';
      // clear inputs
      ['img-paper-1','img-paper-2','img-paper-3','img-washi-1','img-washi-2'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
      persist(); applyImagesFromSettings(); alert('Imágenes restablecidas');
    });
  }
  function renderAnnualLog(){
    annualLog.innerHTML='';
    const year = state.data.settings?.year || new Date().getFullYear();
    const entries = state.data.annualLog?.[year]||[];
    // summary
    const summaryEl = document.getElementById('annual-summary'); summaryEl.innerHTML = '';
    const totalTasks = (state.data.tasks||[]).length;
    const doneTasks = (state.data.tasks||[]).filter(t=>t.done).length;
    const absences = (state.data.attendance||[]).filter(a=>a.absent && a.date.startsWith(year)).length;
    const lates = (state.data.attendance||[]).filter(a=>a.late && a.date.startsWith(year)).length;
    const shtml = `<div class="note"><strong>Resumen ${year}</strong><div class="small">Tareas: ${doneTasks}/${totalTasks} completadas • Inasistencias: ${absences} • Retardos: ${lates}</div></div>`;
    summaryEl.innerHTML = shtml;
    // entries with optional selection checkboxes
    const entriesReversed = entries.slice().reverse();
    entriesReversed.forEach((e, revIdx)=>{
      // compute original index
      const origIdx = entries.length - 1 - revIdx;
      const el = document.createElement('div'); el.className='note';
      if(annualSelectionMode){
        const cb = document.createElement('input'); cb.type='checkbox'; cb.style.marginRight='8px'; cb.checked = selectedAnnualIdx.has(origIdx);
        cb.addEventListener('change', ()=>{ if(cb.checked) selectedAnnualIdx.add(origIdx); else selectedAnnualIdx.delete(origIdx); annualDeleteSelected.classList.toggle('hidden', selectedAnnualIdx.size===0); });
        el.appendChild(cb);
      }
      const content = document.createElement('div'); content.innerHTML = `<div class="small">${e.ts} • ${e.type}</div><div>${e.details}</div>`;
      el.appendChild(content);
      if(!annualSelectionMode){ const del = document.createElement('button'); del.textContent='Eliminar'; del.className='btn-ghost'; del.addEventListener('click',()=>{ if(confirm('Eliminar registro?')){ state.data.annualLog[year] = state.data.annualLog[year].filter((__,i)=>i!==origIdx); persist(); renderAnnualLog(); saveLogEntry(state.user,'annual_delete',e.details); } }); el.appendChild(del); }
      annualLog.appendChild(el);
    });
    if(annualDeleteSelected) annualDeleteSelected.classList.toggle('hidden', selectedAnnualIdx.size===0);
  }

  // Schedule (horario)
  const scheduleYear = document.getElementById('schedule-year');
  const scheduleTableBody = document.querySelector('#schedule-table tbody');
  const scheduleImport = document.getElementById('schedule-import');
  const saveScheduleBtn = document.getElementById('save-schedule');
  const importScheduleBtn = document.getElementById('import-schedule');
  const clearScheduleBtn = document.getElementById('clear-schedule');

  function ensureScheduleForYear(y){
    state.data.schedule = state.data.schedule || {};
    if(!state.data.schedule[y]){
      // create empty 8x5 schedule
      state.data.schedule[y] = { periods:8, days:['L','M','Mi','J','V'], cells: {} };
    }
    return state.data.schedule[y];
  }

  function renderSchedule(){
    const y = scheduleYear.value || (state.data.settings?.year) || new Date().getFullYear();
    // keep the year input in sync with selected schedule
    scheduleYear.value = y;
    const sched = ensureScheduleForYear(y);
    scheduleTableBody.innerHTML='';
    for(let p=1;p<=sched.periods;p++){
      const tr = document.createElement('tr');
      const th = document.createElement('th'); th.textContent = p; tr.appendChild(th);
      sched.days.forEach(d=>{
        const td = document.createElement('td'); td.contentEditable = 'true'; td.style.padding='10px'; td.style.border='1px solid rgba(0,0,0,0.06)';
        const key = `${d}_${p}`;
        const val = (sched.cells[key] || '').toString();
        td.dataset.key = key;
        // choose a subject class based on common abbreviations or keywords
        let cls = 'subject-default';
        const vlow = val.toLowerCase();
        if(/mat|matem|matr|mate/.test(vlow)) cls = 'subject-mat';
        else if(/fis|física|fiz/.test(vlow)) cls = 'subject-fis';
        else if(/esp|lit|lengua|ea/.test(vlow)) cls = 'subject-esp';
        else if(/qui|quim/.test(vlow)) cls = 'subject-default';
        if(val){ 
          const colorMap = ensureSubjectColors();
          const col = colorMap[val] || null;
          const span = document.createElement('span'); span.className = 'subject-tag '+cls; span.textContent = val;
          if(col){ span.style.background = col; span.style.color = (getContrastYIQ(col) === 'dark' ? '#111' : '#fff'); }
          // clicking subject opens color picker
          span.addEventListener('click', (e)=>{ e.stopPropagation(); openSubjectColorPicker(val, span); });
          td.innerHTML = ''; td.appendChild(span);
        } else { td.textContent = ''; }
        td.addEventListener('blur', ()=>{ const text = td.textContent.trim() || (td.querySelector('.subject-tag')?.textContent || ''); sched.cells[key] = text; sched.updated = nowISO(); persist(); renderSchedule(); saveLogEntry(state.user,'schedule_edit',`${y} ${key} ${text}`); });
        tr.appendChild(td);
      });
      scheduleTableBody.appendChild(tr);
    }
  }

  saveScheduleBtn.addEventListener('click',()=>{
    const y = scheduleYear.value || new Date().getFullYear(); ensureScheduleForYear(y); persist(); saveLogEntry(state.user,'schedule_save',`horario ${y}`); alert('Horario guardado para '+y);
  });

  // Annual log selection handlers
  if(annualSelectToggle){
    annualSelectToggle.addEventListener('click', ()=>{ annualSelectionMode = true; selectedAnnualIdx = new Set(); annualSelectToggle.classList.add('hidden'); annualCancelSelect.classList.remove('hidden'); annualDeleteSelected.classList.remove('hidden'); renderAnnualLog(); });
  }
  if(annualCancelSelect){
    annualCancelSelect.addEventListener('click', ()=>{ annualSelectionMode = false; selectedAnnualIdx = new Set(); annualSelectToggle.classList.remove('hidden'); annualCancelSelect.classList.add('hidden'); annualDeleteSelected.classList.add('hidden'); renderAnnualLog(); });
  }
  if(annualDeleteSelected){
    annualDeleteSelected.addEventListener('click', ()=>{ if(selectedAnnualIdx.size===0) return; if(!confirm('Eliminar registros seleccionados?')) return; const year = state.data.settings?.year || new Date().getFullYear(); state.data.annualLog[year] = (state.data.annualLog[year]||[]).filter((_,i)=> !selectedAnnualIdx.has(i)); persist(); saveLogEntry(state.user,'annual_bulk_delete',`deleted ${selectedAnnualIdx.size}`); annualSelectionMode=false; selectedAnnualIdx=new Set(); annualSelectToggle.classList.remove('hidden'); annualCancelSelect.classList.add('hidden'); annualDeleteSelected.classList.add('hidden'); renderAnnualLog(); });
  }

  importScheduleBtn.addEventListener('click',()=>{
    const text = scheduleImport.value.trim(); if(!text){alert('Pega CSV con 5 columnas y 8 filas.');return}
    const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>0);
    const y = scheduleYear.value || new Date().getFullYear(); const sched = ensureScheduleForYear(y);
    for(let r=0;r<Math.min(lines.length, sched.periods); r++){
      const cols = lines[r].split(',');
      for(let c=0;c<Math.min(cols.length, sched.days.length); c++){
        const key = `${sched.days[c]}_${r+1}`; sched.cells[key] = cols[c].trim();
      }
    }
    persist(); renderSchedule(); saveLogEntry(state.user,'schedule_import',`import ${y}`); alert('Importado');
  });

  clearScheduleBtn.addEventListener('click',()=>{
    const y = scheduleYear.value || new Date().getFullYear(); const sched = ensureScheduleForYear(y);
    if(!confirm('Limpiar horario para '+y+'?')) return; sched.cells = {}; persist(); renderSchedule(); saveLogEntry(state.user,'schedule_clear',`clear ${y}`);
  });

  // render schedule when schedule-year changes or when navigating
  scheduleYear.addEventListener('change', renderSchedule);


  // AI mock
  // Existing modal buttons (keep but repurpose to open pug-panel)
  aiOpen.addEventListener('click',()=>{ openPugPanel(); });
  aiClose.addEventListener('click',()=>{ aiModal.classList.add('hidden') });
  aiRun.addEventListener('click',()=>{
    const prompt = aiPrompt.value.trim(); if(!prompt){aiOutput.textContent='Describe qué necesitas...';return}
    aiOutput.textContent='Generando sugerencias...'; setTimeout(()=>{ aiOutput.innerHTML = generateAISuggestions(prompt); saveLogEntry(state.user,'ai_use',prompt) },700)
  });

  // Pug assistant elements
  const pugToggle = document.getElementById('pug-toggle');
  const pugPanel = document.getElementById('pug-panel');
  const pugPrompt = document.getElementById('pug-prompt');
  const pugRun = document.getElementById('pug-run');
  const pugClose = document.getElementById('pug-close');
  const pugOutput = document.getElementById('pug-output');
  const pugSuggest = document.getElementById('pug-suggest');
  const pugSummary = document.getElementById('pug-summary');
  const pugConvert = document.getElementById('pug-convert');
  const pugChecklist = document.getElementById('pug-checklist');
  const pugPrioritize = document.getElementById('pug-prioritize');

  function openPugPanel(){ pugPanel.classList.remove('hidden'); pugToggle.classList.add('active'); }
  function closePugPanel(){ pugPanel.classList.add('hidden'); pugToggle.classList.remove('active'); }

  pugToggle.addEventListener('click',()=>{
    if(pugPanel.classList.contains('hidden')) { openPugPanel(); localStorage.setItem(STORAGE_PREFIX+state.user+'_pug_open','1'); } else { closePugPanel(); localStorage.setItem(STORAGE_PREFIX+state.user+'_pug_open','0'); }
  });
  pugClose.addEventListener('click', closePugPanel);

  pugRun.addEventListener('click',()=>{
    const prompt = pugPrompt.value.trim(); if(!prompt){pugOutput.textContent='Escribe algo para el pug...';return}
    pugOutput.textContent='El pug está pensando...'; setTimeout(()=>{pugOutput.innerHTML = generateAISuggestions(prompt); saveLogEntry(state.user,'pug_use',prompt)},600);
  });
  pugSuggest.addEventListener('click',()=>{pugPrompt.value='Dame un plan de estudio de 1 hora para hoy'; pugRun.click()});
  pugSummary.addEventListener('click',()=>{
    // create a summary of notes
    const notes = state.data.notes || [];
    if(notes.length===0){ pugOutput.textContent = 'No hay notas para resumir.'; return }
    const combined = notes.map(n=>`- ${n.title}: ${n.body||''}`).join('\n');
    // simple extractive summary: first sentences of bodies
    const summary = notes.map(n=> (n.body||'').split('.').slice(0,2).join('.')).join('\n');
    pugOutput.innerHTML = `<strong>Resumen</strong><div class="small">${summary}</div><pre style="white-space:pre-wrap">${combined}</pre>`;
    saveLogEntry(state.user,'ai_summary','resumen de notas');
  });

  pugConvert.addEventListener('click',()=>{
    const title = prompt('Título exacto de la nota a convertir a tarea:');
    if(!title) return; const note = (state.data.notes||[]).find(n=>n.title===title);
    if(!note){ pugOutput.textContent='No se encontró nota con ese título.'; return }
    const t = { id: Date.now(), title: note.title, required:false, period:1, priority:'med', due:null, done:false, created:nowISO() };
    state.data.tasks.push(t); persist(); renderTasks(); pugOutput.textContent='Nota convertida a tarea.'; saveLogEntry(state.user,'ai_convert',note.title);
  });

  pugChecklist.addEventListener('click',()=>{
    const title = prompt('Título de la nota para usar como checklist:'); if(!title) return; const note = (state.data.notes||[]).find(n=>n.title===title);
    if(!note){ pugOutput.textContent='Nota no encontrada.'; return }
    // split lines or sentences into tasks
    const parts = (note.body||'').split(/\n|\.|;/).map(s=>s.trim()).filter(Boolean);
    if(parts.length===0){ pugOutput.textContent='No hay elementos para crear checklist.'; return }
    parts.forEach(p=>{ const tt = {id:Date.now()+Math.random(), title: p, required:false, period:1, priority:'low', due:null, done:false, created:nowISO()}; state.data.tasks.push(tt); });
    persist(); renderTasks(); pugOutput.textContent=`Checklist creada: ${parts.length} tareas añadidas.`; saveLogEntry(state.user,'ai_checklist',note.title);
  });

  pugPrioritize.addEventListener('click',()=>{
    const tasks = state.data.tasks || [];
    if(tasks.length===0){ pugOutput.textContent='No hay tareas'; return }
    // simple prioritization: required first, then by priority high>med>low, then oldest
    const order = { 'high':3,'med':2,'low':1 };
    const sorted = tasks.slice().sort((a,b)=>{ if(a.required!==b.required) return a.required? -1:1; if((order[b.priority]||0) - (order[a.priority]||0)) return (order[b.priority]||0)-(order[a.priority]||0); return a.created < b.created ? -1:1 });
    const list = sorted.map(t=>`${t.required? '(!) ':''}${t.priority.toUpperCase()} • ${t.title}`).join('<br>');
    pugOutput.innerHTML = `<strong>Prioridad sugerida</strong><div class="small">Orden recomendado</div><div>${list}</div>`;
    saveLogEntry(state.user,'ai_prioritize','priorizado');
  });
  function generateAISuggestions(prompt){
    // Simple heuristics: si menciona 'prioridad' sugerir ordenar pendientes, si 'estudiar' crear mini-plan
    const lower = prompt.toLowerCase(); let out='';
    if(lower.includes('prioridad')||lower.includes('importante')){
      out += '<strong>Sugerencia:</strong> Marca las tareas obligatorias y colócalas en periodo 3 si afectan evaluación. Prioriza por fecha y peso.';
    }
    if(lower.includes('estudiar')||lower.includes('plan')){
      out += '<br><strong>Plan de estudio:</strong> Divide la sesión en bloques Pomodoro de 25min. Comienza con HACER (práctica), sigue con SABER (teoría), termina con SER (autoevaluación).';
    }
    if(lower.includes('tareas')||lower.includes('organizar')){
      out += '<br><strong>Organizar tareas:</strong> Usa etiquetas: Urgente, Importante, Opcional. Añade en "No olvidar" los 3 urgentes.';
    }
    if(!out) out = 'Te propongo: 1) Lista 3 tareas urgentes; 2) Asigna periodos; 3) Establece metas diarias.';
    return out;
  }

  // contrast helper for text color
  function getContrastYIQ(hex){
    if(!hex) return 'light';
    if(hex.startsWith('rgb')){
      // parse rgb(r,g,b)
      const m = hex.match(/(\d+),\s*(\d+),\s*(\d+)/);
      if(m){ const r=+m[1], g=+m[2], b=+m[3]; const yiq=(r*299+g*587+b*114)/1000; return (yiq>=128)?'dark':'light' }
    }
    const h = hex.replace('#',''); const r = parseInt(h.substring(0,2),16), g=parseInt(h.substring(2,4),16), b=parseInt(h.substring(4,6),16); const yiq=(r*299+g*587+b*114)/1000; return (yiq>=128)?'dark':'light';
  }

  // Subject color picker flow
  const subjColorPicker = document.getElementById('subject-color-picker');
  let currentSubjectName = null; let currentSubjectEl = null;
  function openSubjectColorPicker(name, el){ currentSubjectName = name; currentSubjectEl = el; subjColorPicker.value = state.data._subjectColors && state.data._subjectColors[name] ? state.data._subjectColors[name] : '#FFD19A'; subjColorPicker.click(); }
  subjColorPicker.addEventListener('input', (e)=>{
    try{
      const color = e.target.value; state.data._subjectColors = state.data._subjectColors || {}; state.data._subjectColors[currentSubjectName] = color; persist(); // update element
      if(currentSubjectEl){ currentSubjectEl.style.background = color; currentSubjectEl.style.color = (getContrastYIQ(color)==='dark'?'#111':'#fff'); }
    }catch(err){ console.warn(err) }
  });

  // Notifications + urgent tasks
  function requestNotificationPermission(){
    if(!('Notification' in window)) return;
    if(Notification.permission === 'default') Notification.requestPermission();
  }

  function sendNotification(title, body){
    if(!('Notification' in window)) return;
    if(Notification.permission === 'granted'){
      try{ new Notification(title, {body}) }catch(e){}
    }
  }

  function checkUrgentTasks(){
    if(!state.data) return;
    const tasks = state.data.tasks || [];
    const urgentCount = tasks.filter(t=>t.required && !t.done).length;
    if(urgentCount>0){
      pugToggle.classList.add('has-urgent');
      // notify once per day per user
      const today = new Date().toISOString().slice(0,10);
      state.data._pug_meta = state.data._pug_meta || {};
      if(state.data._pug_meta.lastNotified !== today){
        requestNotificationPermission();
        sendNotification('Tienes tareas urgentes','Hay '+urgentCount+' tareas obligatorias sin completar.');
        state.data._pug_meta.lastNotified = today; persist();
      }
    } else {
      pugToggle.classList.remove('has-urgent');
      if(state.data && state.data._pug_meta) { delete state.data._pug_meta.lastNotified; persist(); }
    }
  }

  // Close AI modal when clicking outside content or pressing Escape
  aiModal.addEventListener('click', (e)=>{
    if(e.target === aiModal){ aiModal.classList.add('hidden'); }
  });
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape'){ aiModal.classList.add('hidden'); closePugPanel(); }
  });

  // Render all
  function renderAll(){ renderTasks(); renderNotes(); renderGoals(); renderBoards(); renderAttendance(); renderAnnualLog(); renderSchedule(); }

  // Initial setup: set today's date placeholder
  attDate.value = new Date().toISOString().substring(0,10);

  // If already a user in session (none), show login
  showLogin();

  // Ensure pug is hidden on login and appears on user login
  function initPugForUser(){
    // show the pug toggle when in main screen
    pugToggle.classList.remove('hidden');
    // restore panel open state for this user
    const key = STORAGE_PREFIX + state.user + '_pug_open';
    try{
      const val = localStorage.getItem(key);
      if(val === '1') { pugPanel.classList.remove('hidden'); } else { pugPanel.classList.add('hidden'); }
    }catch(e){ pugPanel.classList.add('hidden'); }
    // check urgent tasks and notify if needed
    try{ checkUrgentTasks(); }catch(e){}
  }

  // Modify login flow to init pug after rendering
  // Note: userButtons click handler already calls showMain(); renderAll(); saveLogEntry(...)
  // We'll hook into showMain to reveal pug toggle
  const originalShowMain = showMain;
  showMain = function(){ originalShowMain(); initPugForUser(); };

  // Ensure hiding pug on logout
  const originalLogout = logoutBtn.onclick;
  // logoutBtn uses addEventListener earlier; ensure pug hidden on logout
  logoutBtn.addEventListener('click', ()=>{ pugToggle.classList.add('hidden'); closePugPanel(); });

})();
