const socket = io();
const state = {
    currentUser: null, authMode: 'login', currentRoomCode: null, isPracticeMode: false,
    selectedProblemId: null, currentLanguage: 'python', participants: [], timer: null,
    timeLeft: 900, problem: null, roomList: [], startTime: Date.now()
};

// --- SOCKET EVENTS ---
socket.on('connect', () => console.log("Connected"));
socket.on('lobbyUpdate', (data) => {
    if (data.type === 'add') { if (!state.roomList.find(r => r.code === data.room.code)) state.roomList.unshift(data.room); }
    else if (data.type === 'remove') state.roomList = state.roomList.filter(r => r.code !== data.code);
    ui.renderRoomList();
});
socket.on('roomCreated', (d) => { ui.closeCreateModal(); ui.toast(`Room Created: ${d.roomCode}`, "success"); app.enterRoom(d.roomCode, d.problem, false, d.players); });
socket.on('joinedRoom', (d) => app.enterRoom(d.roomCode, d.problem, false, d.players));
socket.on('updatePlayers', (p) => { state.participants = p; ui.renderLeaderboard(); });
socket.on('newMessage', (d) => ui.addMessageToChat(d.sender, d.text, d.sender === state.currentUser?.name));
socket.on('error', (m) => ui.toast(m, "error"));

// --- APP LOGIC ---
const app = {
    init: () => { 
        // Load theme
        const savedTheme = localStorage.getItem('ca_theme') || 'default';
        ui.changeTheme(savedTheme);
        if (document.getElementById('theme-select')) {
            document.getElementById('theme-select').value = savedTheme;
        }

        const s = localStorage.getItem('ca_session'); 
        if (s) { 
            state.currentUser = JSON.parse(s); 
            app.showApp(); 
        } else { 
            app.renderAuthForm(); 
            document.getElementById('auth-view').classList.remove('hidden'); 
        } 
    },
    toggleAuthMode: () => { state.authMode = state.authMode === 'login' ? 'signup' : 'login'; app.renderAuthForm(); },
    renderAuthForm: () => { const c = document.getElementById('auth-forms-container'); const su = state.authMode === 'signup'; document.getElementById('auth-toggle-text').textContent = su ? "Already have an account?" : "New here?"; document.getElementById('auth-toggle-btn').textContent = su ? "Login" : "Create Account"; let h = ''; if (su) h += `<div class="form-group"><label>Username</label><input type="text" id="auth-username"></div>`; h += `<div class="form-group"><label>Email</label><input type="email" id="auth-email"></div><div class="form-group"><label>Password</label><input type="password" id="auth-password"></div><button class="btn-primary w-full" onclick="app.handleAuth()">${su ? 'Sign Up' : 'Log In'}</button>`; c.innerHTML = h; },
    handleAuth: async () => { const e = document.getElementById('auth-email').value, p = document.getElementById('auth-password').value, u = document.getElementById('auth-username')?.value; if (!e || !p) return ui.toast("Required", "error"); const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: p, name: u, isSignup: state.authMode === 'signup' }) }); const d = await r.json(); if (r.ok) { state.currentUser = d.user; localStorage.setItem('ca_session', JSON.stringify(d.user)); app.showApp(); } else ui.toast(d.error || "Error", "error"); },
    logout: () => { localStorage.removeItem('ca_session'); location.reload(); },
    showApp: () => { document.getElementById('auth-view').classList.add('hidden'); document.getElementById('app-view').classList.remove('hidden'); document.getElementById('user-display-nav').textContent = state.currentUser.name; ui.renderProblemGrid(); ui.renderRoomList(); },
    confirmCreateStandard: () => { if (!state.selectedProblemId) return ui.toast("Select a problem", "error"); socket.emit('createRoom', { problemId: state.selectedProblemId, user: state.currentUser }); },
    confirmCreateCustom: () => { const t = document.getElementById('custom-title').value, d = document.getElementById('custom-desc').value, f = document.getElementById('custom-difficulty').value, hj = document.getElementById('custom-hidden-json').value; const s = []; for(let i=1; i<=3; i++) { const ip = document.getElementById(`custom-sample-in-${i}`).value, op = document.getElementById(`custom-sample-out-${i}`).value; if(ip && op) s.push({ input: ip, output: op }); } if (!t || s.length === 0) return ui.toast("Title and at least one Sample are required", "error"); let hc = []; try { if (hj) hc = JSON.parse(hj); } catch (e) { return ui.toast("Hidden Test Cases JSON invalid", "error"); } socket.emit('createRoom', { user: state.currentUser, customProblem: { title: t, description: d, difficulty: f, samples: s, hiddenCases: hc } }); },
    confirmJoinRoom: (fromAlt) => { 
        const inputId = fromAlt ? 'modal-join-code-alt' : 'modal-join-code';
        const input = document.getElementById(inputId);
        if (!input) return;
        const code = input.value.trim().toUpperCase(); 
        if (!code) return; 
        socket.emit('joinRoom', { roomCode: code, user: state.currentUser }); 
    },
    startPractice: async (problemId) => { try { const res = await fetch(`/api/problem/${problemId}`); const problem = await res.json(); app.enterRoom('PRACTICE', problem, true, []); } catch(e) { ui.toast("Error loading problem", "error"); } },
    enterRoom: (roomCode, problem, isPractice, players) => { state.currentRoomCode = roomCode; state.problem = problem; state.participants = players || []; state.isPracticeMode = isPractice; state.startTime = Date.now(); document.getElementById('app-view').classList.add('hidden'); document.getElementById('arena-view').classList.remove('hidden'); const rp = document.getElementById('right-panel'), tc = document.getElementById('timer-container'), mb = document.getElementById('mode-badge'); if (isPractice) { rp.style.display = 'none'; tc.style.display = 'none'; mb.textContent = "PRACTICE"; mb.className = "mode-indicator mode-practice"; document.getElementById('room-code-btn').classList.add('hidden'); } else { rp.style.display = 'flex'; tc.style.display = 'block'; mb.textContent = "BATTLE"; mb.className = "mode-indicator mode-battle"; document.getElementById('room-code-btn').classList.remove('hidden'); document.getElementById('room-code-btn').textContent = `ROOM: ${roomCode}`; ui.renderLeaderboard(); if (state.timer) clearInterval(state.timer); state.timeLeft = 900; state.timer = setInterval(() => { state.timeLeft--; ui.updateTimer(); if (state.timeLeft <= 0) app.endGame(); }, 1000); } ui.renderProblem(problem); editor.resetEditor(); },
    leaveRoom: () => { if(state.timer) clearInterval(state.timer); document.getElementById('arena-view').classList.add('hidden'); document.getElementById('app-view').classList.remove('hidden'); },
    copyRoomCode: () => { navigator.clipboard.writeText(state.currentRoomCode); ui.toast("Copied!"); },
    sendChat: () => { const input = document.getElementById('chat-msg'); const text = input.value.trim(); if(!text) return; socket.emit('sendMessage', { roomCode: state.currentRoomCode, text, sender: state.currentUser.name }); input.value = ''; },
    endGame: () => { clearInterval(state.timer); ui.toast("Time's Up!"); }
};

// --- EDITOR LOGIC ---
const editor = {
    resetEditor: () => { const lang = state.currentLanguage; document.getElementById('code-editor').value = state.problem?.templates?.[lang] || ""; editor.updateLineNumbers(); },
    changeLanguage: (lang) => { state.currentLanguage = lang; document.getElementById('filename-display').textContent = `main.${lang === 'python' ? 'py' : (lang === 'cpp' ? 'cpp' : 'java')}`; editor.resetEditor(); },
    handleTab: (e) => { if (e.key === 'Tab') { e.preventDefault(); const t = e.target; t.value = t.value.substring(0, t.selectionStart) + "    " + t.value.substring(t.selectionEnd); } },
    syncScroll: () => { document.getElementById('line-numbers').scrollTop = document.getElementById('code-editor').scrollTop; },
    updateLineNumbers: () => { document.getElementById('line-numbers').innerHTML = Array(document.getElementById('code-editor').value.split('\n').length).fill(0).map((_, i) => i + 1).join('<br>'); },
    toggleConsole: () => { document.getElementById('console-overlay').classList.toggle('open'); },
    runCode: async () => { 
        const code = document.getElementById('code-editor').value, input = document.getElementById('custom-input-area')?.value || ""; 
        document.getElementById('console-overlay').classList.add('open'); 
        ui.logConsole("Running...", "info"); 
        try { 
            const res = await fetch('/api/run', { 
                method: 'POST', 
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.currentUser?.token}`
                }, 
                body: JSON.stringify({ code, language: state.currentLanguage, input }) 
            }); 
            const d = await res.json(); 
            document.getElementById('console-output').innerHTML = ''; 
            ui.logConsole(`Output:\n${d.output}`, d.status === 'error' ? 'error' : 'info'); 
        } catch (e) { 
            ui.logConsole("Server error", "error"); 
        } 
    },
    submitCode: async () => { 
        const code = document.getElementById('code-editor').value, timeElapsed = (Date.now() - state.startTime) / 1000; 
        document.getElementById('console-overlay').classList.add('open'); 
        ui.logConsole("Submitting...", "info"); 
        try { 
            const res = await fetch('/api/submit', { 
                method: 'POST', 
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.currentUser?.token}`
                }, 
                body: JSON.stringify({ code, language: state.currentLanguage, roomCode: state.currentRoomCode, timeElapsed, problemId: state.problem.id }) 
            }); 
            const d = await res.json(); 
            document.getElementById('console-output').innerHTML = ''; 
            if (d.status === 'accepted') { 
                ui.logConsole(`✅ ${d.message}`, "success"); 
                if (!state.isPracticeMode) socket.emit('submitScore', { roomCode: state.currentRoomCode, score: d.score }); 
            } else ui.logConsole(`❌ ${d.message}`, "error"); 
        } catch (e) { 
            ui.logConsole("Server error", "error"); 
        } 
    }
};

// --- UI HELPERS ---
const ui = {
    
    toast: (m, t = 'info') => { const e = document.createElement('div'); e.className = 'toast'; e.textContent = m; e.style.borderLeftColor = t === 'success' ? 'var(--success)' : (t === 'error' ? 'var(--danger)' : 'var(--accent-primary)'); document.getElementById('toast-container').appendChild(e); setTimeout(() => { e.style.opacity = '0'; setTimeout(() => e.remove(), 300); }, 3000); },
    
    changeTheme: (theme) => {
        document.body.classList.remove('theme-neumorphism', 'theme-animation', 'theme-pixel');
        if (theme !== 'default') {
            document.body.classList.add(`theme-${theme}`);
        }
        localStorage.setItem('ca_theme', theme);
    },
    
    navigateTo: (section) => {
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        document.querySelector(`.nav-link[onclick="ui.navigateTo('${section}')"]`).classList.add('active');
        
        document.getElementById('section-hero').classList.toggle('hidden', section !== 'problems');
        document.getElementById('section-problems').classList.toggle('hidden', section !== 'problems');
        document.getElementById('section-arena').classList.toggle('hidden', section !== 'arena');
        document.getElementById('section-leaderboard').classList.toggle('hidden', section !== 'leaderboard');
        
        if (section === 'problems') ui.renderProblemGrid();
    },

    scrollToProblems: () => { document.getElementById('section-problems').scrollIntoView({ behavior: 'smooth' }); },

    filterProblems: (diff) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.filter-btn[onclick="ui.filterProblems('${diff}')"]`).classList.add('active');
        ui.renderProblemGrid(diff);
    },

    renderProblemGrid: (filter = 'all') => {
        const container = document.getElementById('problem-grid');
        const problems = [
            { id: 1, t: "A + B", d: "Easy", desc: "Calculate sum." },
            { id: 2, t: "Reverse String", d: "Easy", desc: "Reverse a string." },
            { id: 3, t: "Even or Odd", d: "Easy", desc: "Check parity." },
            { id: 4, t: "Max in Array", d: "Easy", desc: "Find max." },
            { id: 5, t: "Sum of Digits", d: "Easy", desc: "Sum digits." },
            { id: 6, t: "Palindrome", d: "Easy", desc: "Check palindrome." },
            { id: 7, t: "Factorial", d: "Easy", desc: "Compute factorial." },
            { id: 8, t: "Prime Check", d: "Medium", desc: "Check prime." },
            { id: 9, t: "Fibonacci", d: "Medium", desc: "Nth Fibonacci." },
            { id: 10, t: "Reverse Words", d: "Medium", desc: "Reverse words." }
        ];

        const filtered = filter === 'all' ? problems : problems.filter(p => p.d.toLowerCase() === filter);

        container.innerHTML = filtered.map(p => `
            <div class="problem-card-new" onclick="app.startPractice(${p.id})">
                <div class="problem-info">
                    <h3>${p.t}</h3>
                    <p>${p.desc}</p>
                </div>
                <span class="badge-new ${p.d.toLowerCase()}">${p.d}</span>
            </div>
        `).join('');
    },

    renderRoomList: () => { 
        const c = document.getElementById('room-list'); 
        if (state.roomList.length === 0) {
            c.innerHTML = `<div class="text-muted text-center w-full">No active rooms.</div>`; 
        } else {
            c.innerHTML = state.roomList.map(r => `
                <div class="problem-card-new" onclick="document.getElementById('modal-join-code-alt').value='${r.code}'; app.confirmJoinRoom(true);">
                    <div class="problem-info">
                        <h3>${r.title}</h3>
                        <p>Host: ${r.host}</p>
                        <p class="text-xs">Code: ${r.code}</p>
                    </div>
                    <span class="badge-new easy">LIVE</span>
                </div>
            `).join(''); 
        }
    },
    
    openCreateModal: () => { const l = document.getElementById('problem-selection-list'); const p = [{id:1,t:"A+B"},{id:2,t:"Rev"},{id:3,t:"Even"},{id:4,t:"Max"},{id:5,t:"Sum"},{id:6,t:"Pal"},{id:7,t:"Fact"},{id:8,t:"Prime"},{id:9,t:"Fib"},{id:10,t:"Words"}]; l.innerHTML = p.map(p => `<div class="problem-card ${state.selectedProblemId === p.id ? 'selected' : ''}" onclick="state.selectedProblemId=${p.id}; ui.openCreateModal();"><strong>${p.t}</strong></div>`).join(''); document.getElementById('create-room-modal').classList.remove('hidden'); ui.switchCreateTab('standard'); },
    closeCreateModal: () => document.getElementById('create-room-modal').classList.add('hidden'),
    switchCreateTab: (t) => { document.querySelectorAll('#create-room-modal .nav-tab').forEach(e => e.classList.remove('active')); document.getElementById(`tab-${t}`).classList.add('active'); document.getElementById('create-standard-view').classList.toggle('hidden', t !== 'standard'); document.getElementById('create-custom-view').classList.toggle('hidden', t !== 'custom'); },
    
    renderProblem: (p) => { let s = ''; if (p.samples && p.samples.length > 0) p.samples.forEach((x, i) => s += `<div style="margin-top:1rem;"><div style="font-weight:600; color:var(--accent-primary);">Sample Input ${i+1}:</div><div class="sample-case">${x.input}</div><div style="font-weight:600; color:var(--accent-primary);">Sample Output ${i+1}:</div><div class="sample-case">${x.output}</div></div>`); else s = `<div style="font-weight:600; color:var(--accent-primary);">Sample Input:</div><div class="sample-case">${p.sampleInput}</div><div style="font-weight:600; color:var(--accent-primary);">Sample Output:</div><div class="sample-case">${p.sampleOutput}</div>`; document.getElementById('problem-description').innerHTML = `<h3>${p.title} <span class="badge ${p.difficulty?.toLowerCase()}">${p.difficulty}</span></h3><p style="margin: 1rem 0;">${p.description}</p>${s}<div class="custom-input-area"><label>Test Input</label><textarea id="custom-input-area">${p.sampleInput || (p.samples ? p.samples[0].input : "")}</textarea></div>`; },
    logConsole: (m, t) => { const b = document.getElementById('console-output'); const l = document.createElement('div'); l.className = `log-entry log-${t}`; l.textContent = m; b.appendChild(l); b.scrollTop = b.scrollHeight; },
    renderLeaderboard: () => { const l = document.getElementById('leaderboard'); const s = [...state.participants].sort((a, b) => b.score - a.score); l.innerHTML = s.map((p, i) => `<li class="leaderboard-item ${p.id === socket.id ? 'me' : ''}"><div class="flex items-center gap-2"><span style="width:20px">#${i+1}</span><div class="avatar" style="background:${p.avatarColor}">${p.name[0]}</div><span>${p.name}</span></div><span style="color:var(--success); font-weight:bold;">${p.score}</span></li>`).join(''); },
    updateTimer: () => { const m = Math.floor(state.timeLeft / 60).toString().padStart(2, '0'); const s = (state.timeLeft % 60).toString().padStart(2, '0'); document.getElementById('timer-display').textContent = `${m}:${s}`; },
    addMessageToChat: (u, t, m) => { const b = document.getElementById('chat-box'); const d = document.createElement('div'); d.innerHTML = `<strong style="color:${m ? 'var(--accent-primary)' : 'var(--accent-secondary)'}">${u}:</strong> ${t}`; b.appendChild(d); }

};

window.onload = app.init;