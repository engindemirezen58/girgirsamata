const ICON_PLAY = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const ICON_PAUSE = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
const ICON_VOL = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
const ICON_MUTE = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;

const socket = io();
let myId = null, myRoomCode = null, myLang = localStorage.getItem('mw_lang')||'tr';
window.myLang = myLang;
let gameState = null, myMeme = null, changeRemaining = 0;
let hasSubmitted = false, hasVoted = false, hasTrashed = false;
let pendingJoinCode = null, pendingJoinType = null;
let currentShowcaseSubmission = null;
let availablePacks = [];
let allMemesData = {}; // Will hold all memes from all packs

socket.emit("system:get_packs");
socket.on("system:packs", packs => { availablePacks = packs; });

socket.on("system:all_memes", allMemes => { 
  allMemesData = allMemes; 
  if (document.getElementById('modalMemeSelect').style.display === 'flex') {
    renderModalMemes('');
  }
});

function renderMemeDOM(container, imgSrc, caption, style, caption2, style2, startMuted = false, caption3, style3) {
  if (!container) return;
  container.querySelectorAll('video').forEach(v => {
    try { v.pause(); v.removeAttribute('src'); v.load(); } catch(e) {}
  });
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.aspectRatio = '4/3';
  container.style.width = '100%';
  container.style.background = 'var(--bg)';
  container.style.overflow = 'hidden';
  
  const isVideo = /\.(mp4|webm|mov)$/i.test(imgSrc) || (typeof imgSrc === 'string' && imgSrc.startsWith('data:video/'));
  let media;
  if (isVideo) {
    media = document.createElement('video');
    media.src = imgSrc + (imgSrc.includes('#') ? '' : '#t=0.1');
    media.autoplay = true;
    media.loop = true;
    media.muted = startMuted;
    media.volume = 0.25;
    media.playsInline = true;
    media.setAttribute('playsinline', ''); 
    media.style.width = '100%';
    media.style.height = '100%';
    media.style.objectFit = 'contain';
    media.style.display = 'block';
    container.appendChild(media);

    const controls = document.createElement('div');
    controls.style.position = 'absolute';
    controls.style.top = '10px';
    controls.style.right = '10px';
    controls.style.display = 'flex';
    controls.style.gap = '8px';
    controls.style.zIndex = '100';

    const playBtn = document.createElement('button');
    playBtn.innerHTML = media.paused ? ICON_PLAY : ICON_PAUSE;
    playBtn.className = 'btn btn-ghost';
    playBtn.style.padding = '4px 8px';
    playBtn.style.fontSize = '1rem';
    playBtn.onclick = (e) => {
      e.stopPropagation();
      if (media.paused) media.play();
      else media.pause();
    };
    media.addEventListener('play', () => { playBtn.innerHTML = ICON_PAUSE; });
    media.addEventListener('pause', () => { playBtn.innerHTML = ICON_PLAY; });

    const muteWrapper = document.createElement('div');
    muteWrapper.style.display = 'flex';
    muteWrapper.style.alignItems = 'center';
    muteWrapper.style.background = 'rgba(8,4,26,0.6)';
    muteWrapper.style.borderRadius = 'var(--r)';
    muteWrapper.style.paddingRight = '4px';

    const muteBtn = document.createElement('button');
    muteBtn.innerHTML = startMuted ? ICON_MUTE : ICON_VOL;
    muteBtn.className = 'btn btn-ghost';
    muteBtn.style.padding = '4px 8px';
    muteBtn.style.fontSize = '1rem';
    muteBtn.style.border = 'none';
    
    const volSlider = document.createElement('input');
    volSlider.type = 'range';
    volSlider.min = '0';
    volSlider.max = '1';
    volSlider.step = '0.05';
    volSlider.value = startMuted ? '0' : '0.25';
    volSlider.style.width = '60px';
    volSlider.style.display = startMuted ? 'none' : 'inline-block';
    volSlider.style.accentColor = 'var(--neon-cyan)';
    
    muteBtn.onclick = (e) => {
      e.stopPropagation();
      media.muted = !media.muted;
      muteBtn.innerHTML = media.muted ? ICON_MUTE : ICON_VOL;
      if(media.muted) { volSlider.style.display = 'none'; volSlider.value = 0; }
      else { volSlider.style.display = 'inline-block'; volSlider.value = 0.25; media.volume = 0.25; }
    };
    volSlider.oninput = (e) => {
      e.stopPropagation();
      media.volume = volSlider.value;
      if (volSlider.value == 0) { media.muted = true; muteBtn.innerHTML = ICON_MUTE; volSlider.style.display = 'none'; }
    };
    muteWrapper.appendChild(muteBtn);
    muteWrapper.appendChild(volSlider);

    controls.appendChild(playBtn);
    controls.appendChild(muteWrapper);
    container.appendChild(controls);
    media.play().catch(() => {
      media.muted = true;
      muteBtn.innerHTML = ICON_MUTE;
      volSlider.value = 0;
      volSlider.style.display = 'none';
      media.play().catch(e => {
        console.log("Autoplay blocked entirely:", e);
        if (playBtn) playBtn.innerHTML = ICON_PLAY;
      });
    });
  } else {
    media = document.createElement('img');
    media.src = imgSrc;
    media.style.width = '100%';
    media.style.height = '100%';
    media.style.objectFit = 'contain';
    media.style.display = 'block';
    media.onerror = function() {
      console.error('Görsel yüklenemedi:', this.src);
      this.onerror = null;
      this.style.objectFit = 'scale-down';
      this.style.padding = '20%';
      this.style.opacity = '0.3';
      this.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#888"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>');
    };
    container.appendChild(media);
  }
  container.style.containerType = 'inline-size';

  
  const addTextDiv = (text, textStyle, defaultY) => {
    if (text && text.trim() && text !== '...') {
      const textDiv = document.createElement('div');
      textDiv.textContent = text.toLocaleUpperCase('tr-TR');
      textDiv.style.position = 'absolute';
      textDiv.style.left = (textStyle?.x || 50) + '%';
      textDiv.style.top = (textStyle?.y || defaultY) + '%';
      textDiv.style.transform = 'translateX(-50%)';
      textDiv.style.fontFamily = "'Montserrat', Impact, 'Arial Black', sans-serif";
      textDiv.style.fontWeight = '900';
      textDiv.style.color = '#fff';
      textDiv.style.textShadow = '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000';
      textDiv.style.textAlign = 'center';
      textDiv.style.whiteSpace = 'pre-wrap';
      textDiv.style.lineHeight = '1.15';
      textDiv.style.width = '90%';
      textDiv.style.letterSpacing = '1.5px';
      
      const fs = (textStyle?.size || 3) * 2.5;
      textDiv.style.fontSize = fs + 'cqw';
      
      container.appendChild(textDiv);
    }
  };

  addTextDiv(caption, style, 5);
  addTextDiv(caption2, style2, 50);
  addTextDiv(caption3, style3, 80);
}

function renderCustomCaption(ctx, w, h, text, style) {
  const upper = text.toLocaleUpperCase('tr-TR');
  const vwToPx = w / 100; 
  const fs = style.size * vwToPx * 2.5; 
  ctx.font = `900 ${fs}px Montserrat, Impact, 'Arial Black', sans-serif`;
  ctx.textAlign = 'center';
  ctx.letterSpacing = "1.5px";
  const lines = wrapText(ctx, upper, w * 0.9);
  
  const x = w * (style.x / 100);
  let y = h * (style.y / 100) + fs * 0.9; 
  
  lines.forEach((line, i) => {
    const ly = y + i * fs * 1.15;
    ctx.strokeStyle = '#000'; ctx.lineWidth = fs * 0.2; ctx.lineJoin = 'round';
    ctx.strokeText(line, x, ly); ctx.fillStyle = '#fff'; ctx.fillText(line, x, ly);
  });
}

function drawMeme(canvas, imgSrc, caption, onDone, fixedW, fixedH, style, caption2, style2, caption3, style3) {
  fixedW = fixedW || 800; fixedH = fixedH || 600;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.crossOrigin = "Anonymous";
  img.onload = () => {
    const render = () => {
      canvas.width = fixedW; canvas.height = fixedH;
      canvas.style.width = '100%'; canvas.style.height = 'auto';
      ctx.fillStyle = 'var(--bg)'; ctx.fillRect(0, 0, fixedW, fixedH);
      const iRatioD = img.naturalWidth / img.naturalHeight;
      const cRatioD = fixedW / fixedH;
      let ddw, ddh, ddx, ddy;
      if (iRatioD > cRatioD) { ddw=fixedW; ddh=fixedW/iRatioD; ddx=0; ddy=(fixedH-ddh)/2; }
      else { ddh=fixedH; ddw=fixedH*iRatioD; ddy=0; ddx=(fixedW-ddw)/2; }
      ctx.drawImage(img, ddx, ddy, ddw, ddh);
      if (caption && caption.trim() && caption !== '...') {
        if (style) renderCustomCaption(ctx, fixedW, fixedH, caption.trim(), style);
        else renderCaption(ctx, canvas.width, canvas.height, caption.trim());
      }
      if (caption2 && caption2.trim() && caption2 !== '...') {
        if (style2) renderCustomCaption(ctx, fixedW, fixedH, caption2.trim(), style2);
        else renderCaption(ctx, canvas.width, canvas.height, caption2.trim());
      }
      if (caption3 && caption3.trim() && caption3 !== '...') {
        if (style3) renderCustomCaption(ctx, fixedW, fixedH, caption3.trim(), style3);
        else renderCaption(ctx, canvas.width, canvas.height, caption3.trim());
      }
      if (onDone) onDone();
    };

    if (document.fonts && typeof document.fonts.load === 'function') {
      document.fonts.load('900 24px Montserrat').then(render).catch(() => render());
    } else {
      render();
    }
  };
  img.onerror = () => {
    canvas.width = 400; canvas.height = 280;
    ctx.fillStyle = '#111'; ctx.fillRect(0,0,400,280);
    ctx.fillStyle = '#444'; ctx.font = '16px Space Grotesk'; ctx.textAlign = 'center';
    ctx.fillText('Görsel yüklenemedi', 200, 140);
    if (onDone) onDone();
  };
  img.src = imgSrc;
}

function renderCaption(ctx, w, h, text) {
  const upper = text.toLocaleUpperCase('tr-TR');
  const fs = Math.max(w * 0.068, 32);
  ctx.font = `900 ${fs}px Montserrat, Impact, 'Arial Black', sans-serif`;
  ctx.textAlign = 'center';
  ctx.letterSpacing = "1.5px";
  const lines = wrapText(ctx, upper, w * 0.86);
  lines.forEach((line, i) => {
    const x = w / 2; const y = fs + i * fs * 1.18 + h * 0.022;
    ctx.strokeStyle = '#000'; ctx.lineWidth = fs * 0.2; ctx.lineJoin = 'round';
    ctx.strokeText(line, x, y); ctx.fillStyle = '#fff'; ctx.fillText(line, x, y);
  });
}

function renderWritingMedia(imgSrc, onDone) {
  const imgEl = document.getElementById('memeImg');
  const vidEl = document.getElementById('memeVideo');
  const controls = document.getElementById('writingVideoControls');
  const playBtn = document.getElementById('wBtnPlay');
  const muteBtn = document.getElementById('wBtnMute');
  const volSlider = document.getElementById('wVolSlider');

  const isVideo = /\.(mp4|webm|mov)$/i.test(imgSrc) || (typeof imgSrc === 'string' && imgSrc.startsWith('data:video/'));

  if (isVideo) {
    vidEl.pause();
    imgEl.style.display = 'none';
    vidEl.style.display = 'block';
    controls.style.display = 'flex';
    vidEl.src = imgSrc + (imgSrc.includes('#') ? '' : '#t=0.1');
    vidEl.muted = false;
    vidEl.volume = 0.25;
    muteBtn.innerHTML = ICON_VOL;
    if(volSlider) { volSlider.value = 0.25; volSlider.style.display = 'inline-block'; }
    
    playBtn.innerHTML = ICON_PAUSE;
    
    const handleLoaded = () => {
      if (onDone) { onDone(); onDone = null; }
    };

    if (vidEl.readyState >= 2) {
      handleLoaded();
    } else {
      vidEl.onloadeddata = handleLoaded;
    }

    vidEl.play().catch(e => {
      console.warn('Unmuted autoplay prevented:', e);
      vidEl.muted = true;
      muteBtn.innerHTML = ICON_MUTE;
      if(volSlider) { volSlider.value = 0; volSlider.style.display = 'none'; }
      vidEl.play().catch(e2 => {
        console.warn('Muted autoplay also prevented:', e2);
        playBtn.innerHTML = ICON_PLAY;
      });
    });
    
    playBtn.onclick = (e) => {
      e.stopPropagation();
      if (vidEl.paused) vidEl.play();
      else vidEl.pause();
    };
    vidEl.addEventListener('play', () => { playBtn.innerHTML = ICON_PAUSE; });
    vidEl.addEventListener('pause', () => { playBtn.innerHTML = ICON_PLAY; });
    muteBtn.onclick = (e) => {
      e.stopPropagation();
      if(volSlider) volSlider.style.display = volSlider.style.display === 'none' ? 'block' : 'none';
    };

    if(volSlider) {
      volSlider.onclick = (e) => e.stopPropagation();
      volSlider.oninput = (e) => {
        e.stopPropagation();
        vidEl.volume = volSlider.value;
        if (volSlider.value == 0) {
          vidEl.muted = true;
          muteBtn.innerHTML = ICON_MUTE;
        } else {
          vidEl.muted = false;
          muteBtn.innerHTML = ICON_VOL;
        }
      };
    }
  } else {
    vidEl.style.display = 'none';
    controls.style.display = 'none';
    vidEl.pause();
    vidEl.src = '';
    imgEl.style.display = 'block';
    
    const handleLoaded = () => {
      if (onDone) { onDone(); onDone = null; }
    };
    imgEl.onload = handleLoaded;
    imgEl.onerror = handleLoaded; // Proceed even if error, to avoid stuck state
    imgEl.src = imgSrc;
    
    if (imgEl.complete) {
      handleLoaded();
    }
  }
}

function downloadCanvas(canvasId, filename) {
  const cv = document.getElementById(canvasId);
  if(!cv) return;
  const link = document.createElement('a');
  link.download = filename || 'meme.png';
  link.href = cv.toDataURL('image/png');
  link.click();
}

function onCaptionInput() {
  const cap = document.getElementById('captionText').value;
  const drag = document.getElementById('captionDrag');
  if (drag) drag.textContent = cap;
  
  const cap2 = document.getElementById('captionText2') ? document.getElementById('captionText2').value : '';
  const drag2 = document.getElementById('captionDrag2');
  if (drag2) drag2.textContent = cap2;
  
  const cap3 = document.getElementById('captionText3') ? document.getElementById('captionText3').value : '';
  const drag3 = document.getElementById('captionDrag3');
  if (drag3) drag3.textContent = cap3;
  
  const overlay = document.getElementById('captionOverlay');
  if (overlay) overlay.style.pointerEvents = (cap.trim() || cap2.trim() || cap3.trim()) ? 'auto' : 'none';
}

function addSecondText() {
  document.getElementById('textControls2').style.display = 'block';
  document.getElementById('captionDrag2').style.display = 'block';
  document.getElementById('btnAddText').style.display = 'none';
  document.getElementById('btnAddThirdText').style.display = 'inline-block';
}

function addThirdText() {
  document.getElementById('textControls3').style.display = 'block';
  document.getElementById('captionDrag3').style.display = 'block';
  document.getElementById('btnAddThirdText').style.display = 'none';
}

function removeSecondText() {
  document.getElementById('textControls2').style.display = 'none';
  document.getElementById('captionDrag2').style.display = 'none';
  const capText2 = document.getElementById('captionText2');
  if (capText2) { capText2.value = ''; capText2.disabled = false; }
  const drag2 = document.getElementById('captionDrag2');
  if (drag2) drag2.textContent = '';
  document.getElementById('btnAddText').style.display = 'block';
  removeThirdText();
  onCaptionInput();
}

function removeThirdText() {
  document.getElementById('textControls3').style.display = 'none';
  document.getElementById('captionDrag3').style.display = 'none';
  const capText3 = document.getElementById('captionText3');
  if (capText3) { capText3.value = ''; capText3.disabled = false; }
  const drag3 = document.getElementById('captionDrag3');
  if (drag3) drag3.textContent = '';
  document.getElementById('btnAddThirdText').style.display = 'inline-block';
  onCaptionInput();
}

function wrapText(ctx, text, maxW) {
  const words = text.split(' '), lines = []; let cur = '';
  words.forEach(w => {
    const t = cur ? cur+' '+w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  });
  if (cur) lines.push(cur); return lines;
}

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function show(name){
  document.querySelectorAll('video').forEach(v => {
    try { v.pause(); v.removeAttribute('src'); v.load(); } catch(e) {}
  });
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('s'+name).classList.add('active');
  if (name === 'Home') {
    document.body.classList.add('home-active');
    document.body.classList.remove('game-active');
    socket.emit('community:list');
  } else {
    document.body.classList.remove('home-active');
    document.body.classList.add('game-active');
  }
}

function updateDashboardActiveRooms(list) {
  const container = document.getElementById('dashActiveRoomsGrid');
  if (!container) return;
  const filtered = list.slice(0, 3);
  if (!filtered.length) {
    container.innerHTML = `<div class="active-room-card" style="grid-column: 1/-1; justify-content: center; color:var(--muted); font-size:0.9rem; border-style:dashed;">${window.myLang==='tr'?'Açık oda yok. İlk sunucuyu sen kur!':'No active rooms.'}</div>`;
    return;
  }
  container.innerHTML = filtered.map(s => {
    const isLobby = s.state === 'lobby';
    const stateText = isLobby ? (window.myLang === 'tr' ? 'KATIL' : 'JOIN') : (window.myLang === 'tr' ? 'OYUNDA' : 'INGAME');
    const stateClass = isLobby ? 'btn-join-room' : 'btn-ingame-room';
    const lobbyStatusBadge = isLobby 
      ? `<span class="room-status-badge status-lobby">${window.myLang==='tr'?'LOBİ':'LOBBY'}</span>`
      : `<span class="room-status-badge status-playing">${window.myLang==='tr'?'OYUNDA':'INGAME'}</span>`;
    return `
      <div class="active-room-card">
        <div class="room-card-info">
          <div class="room-card-title">${esc(s.name)}</div>
          <div class="room-card-meta">${s.players}/${s.maxPlayers} oyuncu</div>
        </div>
        <div class="room-card-action">
          ${lobbyStatusBadge}
          <button class="room-action-btn ${stateClass}" onclick="joinCommunity('${s.id}',${!s.isPublic})" ${!isLobby?'disabled':''}>${stateText}</button>
        </div>
      </div>
    `;
  }).join('');
}
let _tt;
function toast(msg,dur=2600){
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  clearTimeout(_tt); _tt=setTimeout(()=>el.classList.remove('show'),dur);
}
function openModal(id){ document.getElementById(id).style.display='flex'; }
function closeModal(id){ document.getElementById(id).style.display='none'; }
function setLang(l){
  myLang=l; window.myLang=l; localStorage.setItem('mw_lang',l);
  const tBtn = document.getElementById('btnTR'); if(tBtn) tBtn.classList.toggle('active',l==='tr');
  const eBtn = document.getElementById('btnEN'); if(eBtn) eBtn.classList.toggle('active',l==='en');
  if(typeof updateTranslations === 'function') updateTranslations();
  
  // Eğer özel ekranlar aktifse dinamik içerikleri tekrar render et
  if (gameState) {
    if (gameState.state === 'lobby') renderLobby(gameState);
    else if (gameState.state === 'round_summary') renderRoundSummary(gameState, gameState.roundVoteTotals||{});
  }
}

function updateSidebar(state) {
  // Scoreboard is now only shown during the Round Summary phase via sRoundSummary.
}

function getPlayerName(){ return (document.getElementById('inputName')?.value||'').trim(); }
function highlightNameInput(inputId) {
  const el = document.getElementById(inputId);
  if(el) {
    el.classList.add('error-glow');
    el.focus();
    setTimeout(() => { el.classList.remove('error-glow'); }, 2000);
  }
  toast(t('toastEnterName'));
}

function showCreateRoom(){
  if(!getPlayerName()){highlightNameInput('inputName');return;}
  const req = { playerName:getPlayerName(), serverName: getPlayerName() + (myLang==='tr'?' Odası':' Room'), lang:myLang, password:null, maxRounds:3, writingTime:60, votingTime:20, changeAllowed:true, changeCount:5, memePack: availablePacks.length > 0 ? availablePacks[0].id : "default" };
  socket.emit('community:create', req);
}

function showJoinPrivate(){
  if(!getPlayerName()){highlightNameInput('inputName');return;}
  const code=document.getElementById('inputCode').value.trim().toLocaleUpperCase('tr-TR');
  if(!code){toast(t('toastEnterCode'));return;}
  
  if(code.length > 5) {
    pendingJoinCode=code; pendingJoinType='community';
    socket.emit('community:join',{serverId:code,playerName:getPlayerName(),password:''});
  } else {
    pendingJoinCode=code; pendingJoinType='room';
    socket.emit('room:join',{roomCode:code,playerName:getPlayerName(),password:''});
  }
}

function doJoinWithPass(){
  const pass=document.getElementById('mjPass').value;
  if(pendingJoinType==='room') socket.emit('room:join',{roomCode:pendingJoinCode,playerName:getPlayerName(),password:pass});
  else socket.emit('community:join',{serverId:pendingJoinCode,playerName:getPlayerName(),password:pass});
  closeModal('modalJoin');
}

function joinCommunity(id,locked){
  if(!getPlayerName()){highlightNameInput('inputName');return;}
  pendingJoinCode=id; pendingJoinType='community';
  if(locked){openModal('modalJoin');return;}
  socket.emit('community:join',{serverId:id,playerName:getPlayerName(),password:''});
}

function quickGame() {
  if (!getPlayerName()) { highlightNameInput('inputName'); return; }
  const col = document.getElementById('quickGameCol'); const icon = document.getElementById('quickGameIcon');
  if(col) col.classList.add('loading'); if(icon) icon.style.display = 'none';
  socket._quickGamePending = true;
  socket.emit('community:list');
  setTimeout(() => { if(col) col.classList.remove('loading'); if(icon) icon.style.display = ''; }, 5000);
}

function openBrowseModal() {
  if (!getPlayerName()) { highlightNameInput('inputName'); return; }
  changeSidebarTab(null, 'rooms');
}
function loadCommunityListBrowse() { socket._browsePending = true; socket.emit('community:list'); }

// ── STREAMER MODE ──
function toggleStreamerPanel() {
  const panel = document.getElementById('streamerPanel');
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function toggleStreamerMode() {
  if (!gameState || gameState.host !== myId) return;
  if (gameState.gameMode === 'king_long_live') {
    toast(myLang === 'tr' ? "Kral Çok Yaşa modunda yayıncı modu açılamaz." : "Streamer mode is disabled in King mode.");
    return;
  }
  const newVal = !gameState.streamerMode;
  socket.emit('room:streamer_settings', { roomCode: myRoomCode, streamerMode: newVal });
}

function toggleViewerRole(targetId, currentlyViewer) {
  if (!gameState || gameState.host !== myId) return;
  socket.emit('room:set_viewer_role', { roomCode: myRoomCode, targetId, makeViewer: !currentlyViewer });
}

// Filter player chips by search query
function filterPlayersGrid(query) {
  const chips = document.querySelectorAll('#playersGrid .player-chip');
  const q = query.toLocaleLowerCase('tr-TR');
  chips.forEach(chip => {
    const name = chip.textContent.toLocaleLowerCase('tr-TR');
    chip.style.display = name.includes(q) ? '' : 'none';
  });
}




function renderBrowseList(list) {
  const el = document.getElementById('browseServerList');
  if (!el) return;
  if (!list.length) { el.innerHTML = `<p class="muted" style="text-align:center;padding:20px">${myLang==='tr'?'Açık sunucu yok. İlk sunucuyu sen kur!':'No open servers. Create the first one!'}</p>`; return; }
  el.innerHTML = list.map(s => `
    <div class="server-card">
      <div>
        <div class="s-title">${esc(s.name)} ${!s.isPublic?`<span style="font-size:.7rem;color:var(--muted2);font-family:Space Mono,monospace">[${t('closed').toLocaleUpperCase('tr-TR')}]</span>`:''}</div>
        <div class="s-meta">${s.players}/${s.maxPlayers} ${myLang==='tr'?'oyuncu':'players'} · ${s.maxRounds} ${t('settingRounds').toLowerCase()} · ${esc(s.hostName||'')} </div>
      </div>
      <div class="flex-h">
        <span class="server-state ${s.state==='lobby'?'state-lobby':'state-playing'}">${s.state==='lobby'?t('lobbyPhase'):(myLang==='tr'?'OYNUYOR':'PLAYING')}</span>
        <button class="btn ${s.state!=='lobby'?'btn-ghost':'btn-yellow'}" onclick="joinCommunity('${s.id}',${!s.isPublic});" ${s.state!=='lobby'?'disabled':''} style="padding:6px 14px;font-size:.78rem">${s.state==='lobby'?t('joinBtn'):(myLang==='tr'?'OYUNDA':'INGAME')}</button>
      </div>
    </div>`).join('');
}

socket.on('community:list', list => {
  if (socket._quickGamePending) {
    socket._quickGamePending = false;
    const col = document.getElementById('quickGameCol'); const icon = document.getElementById('quickGameIcon');
    if(col) col.classList.remove('loading'); if(icon) icon.style.display = '';
    const open = list.find(s => s.state === 'lobby' && s.isPublic && s.players < s.maxPlayers);
    if (open) { toast(myLang==='tr'?'Açık oda bulundu, katılıyorsun...':'Found open room, joining...'); joinCommunity(open.id, false); }
    else { toast(myLang==='tr'?'Bekleyen açık oda yok. Oda Kur tuşunu kullan!':'No open rooms waiting. Use Create Room!'); }
    return;
  }
  if (socket._browsePending) { socket._browsePending = false; renderBrowseList(list); return; }
});

socket.on('community:update', () => {
  const roomsScreen = document.getElementById('sRooms');
  if (roomsScreen && roomsScreen.classList.contains('active')) {
    loadCommunityListBrowse();
  }
});

function copyCode(){ navigator.clipboard.writeText(myRoomCode).then(()=>toast(t('toastCopied'))); }

function toggleRevealCode() {
  const codeEl = document.getElementById('lobbyCode');
  if(!codeEl) return;
  if(codeEl.textContent === '****') {
    codeEl.textContent = gameState ? (gameState.code || gameState.id) : '';
  } else {
    codeEl.textContent = '****';
  }
}

function renderLobby(state) {
  const codeEl = document.getElementById('lobbyCode');
  if (codeEl) {
    if(codeEl.textContent !== '****' && codeEl.textContent !== state.code && codeEl.textContent !== state.id) {
      codeEl.textContent = '****'; // Oda değişmişse gizle
    }
  }
  
  const isHost = state.host === myId;
  const isStreamer = state.streamerMode === true;

  // Show/hide streamer panel & header button
  const streamerBtn = document.getElementById('streamerModeBtn');
  if (streamerBtn) streamerBtn.style.display = isHost ? 'inline-flex' : 'none';
  const streamerPanel = document.getElementById('streamerPanel');
  if (streamerPanel) streamerPanel.style.display = isHost ? '' : 'none';

  // Sync streamer toggle button text
  if (isHost) {
    const tog = document.getElementById('streamerModeToggle');
    if (tog) {
      if (state.gameMode === 'king_long_live') {
        tog.textContent = '\u2B1C Yayıncı Modu (Kral Modunda Kapalı)';
        tog.style.background = 'rgba(168,85,247,0.1)';
        tog.style.borderColor = 'rgba(168,85,247,0.2)';
        tog.style.color = 'rgba(168,85,247,0.4)';
        tog.disabled = true;
        tog.style.cursor = 'not-allowed';
      } else {
        tog.textContent = isStreamer ? '\u{1F7E3} Yayıncı Modu: AÇIK' : '\u2B1C Yayıncı Modu: KAPALI';
        tog.style.background = isStreamer ? 'rgba(168,85,247,0.4)' : 'rgba(168,85,247,0.15)';
        tog.style.borderColor = isStreamer ? '#a855f7' : 'rgba(168,85,247,0.5)';
        tog.style.color = isStreamer ? '#e9d5ff' : '#c084fc';
        tog.disabled = false;
        tog.style.cursor = 'pointer';
      }
    }
    // Sync viewer count
    const viewerCount = (state.viewers || []).length;
    const vc = document.getElementById('streamerViewerCount');
    if (vc) vc.textContent = viewerCount + (myLang === 'tr' ? ' izleyici' : ' viewers');
    
    // Show/hide info bar
    const infoBar = document.getElementById('streamerInfoBar');
    if (infoBar) infoBar.style.display = isStreamer ? '' : 'none';
  }

  // Viewer banner for non-host viewers
  const myRole = (state.viewers || []).includes(myId) ? 'viewer' : 'player';
  const isViewer = myRole === 'viewer';

  document.getElementById('playersGrid').innerHTML = state.players.map(p => {
    const pIsViewer = (state.viewers || []).includes(p.id);
    const roleBadge = pIsViewer ? `<span style="font-size:0.6rem; padding:1px 5px; border-radius:4px; background:rgba(168,85,247,0.3); color:#c084fc; margin-left:4px;">\u{1F465} İzl</span>` : `<span style="font-size:0.6rem; padding:1px 5px; border-radius:4px; background:rgba(74,222,128,0.2); color:#4ade80; margin-left:4px;">\u{1F3AE} Oyn</span>`;
    const showRoleBadge = isStreamer;
    const rightPad = (isHost && p.id !== myId) ? '120px' : '13px';
    const isKing = state.gameMode === 'king_long_live' && state.kingId === p.id;
    const kingBadgeHtml = isKing ? `<span class="king-badge">\u{1F451} Kral</span>` : '';
    return `
    <div class="player-chip${p.isHost?' is-host':''}" style="position:relative; padding-right:${rightPad}">
      ${esc(p.name)}${p.id===myId?` <small style="opacity:.5">${t('youText')}</small>`:''}
      ${showRoleBadge ? roleBadge : ''}
      ${kingBadgeHtml}
      ${(isHost && p.id !== myId) ? `
        <div style="position:absolute; right:4px; top:50%; transform:translateY(-50%); display:flex; gap:4px;">
          ${isStreamer ? `<button style="padding:4px 6px; display:flex; align-items:center; justify-content:center; border-radius:4px; border:none; background:rgba(168,85,247,0.4); color:#c084fc; cursor:pointer;" onclick="toggleViewerRole('${p.id}', ${pIsViewer})" title="${pIsViewer ? 'Oyuncu Yap' : 'İzleyici Yap'}">${pIsViewer ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><polyline points="17 11 19 13 23 9"></polyline></svg>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>'}</button>` : ''}
          <button class="btn btn-red" style="padding:4px 6px; display:flex; align-items:center; justify-content:center; border-radius:4px;" onclick="kickPlayer('${p.id}')" title="Kick"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg></button>
          <button class="btn btn-red" style="padding:4px 6px; display:flex; align-items:center; justify-content:center; border-radius:4px; background:#991b1b;" onclick="banPlayer('${p.id}')" title="Ban"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg></button>
        </div>
      ` : ''}
    </div>`;
  }).join('');

  document.getElementById('hostActions').style.display = isHost ? '' : 'none';
  document.getElementById('lbWaiting').style.display   = isHost ? 'none' : '';
  
  if (isHost) {
    const kingSelectPanel = document.getElementById('kingSelectPanel');
    if (kingSelectPanel) {
      if (state.gameMode === 'king_long_live') {
        kingSelectPanel.style.display = 'block';
        updateKingManualPickUI(state.players);
      } else {
        kingSelectPanel.style.display = 'none';
      }
    }
  }
  
  const s = state;
  if (isHost) {
    const selectedPackDef = availablePacks.find(p => p.id === s.memePack) || availablePacks[0] || {id: 'default', previews: []};
    const packName = selectedPackDef.id === 'default' ? t('defaultPack') : selectedPackDef.id;
    const imgs = (selectedPackDef.previews || []).map(url => url ? `<img src="${url}" loading="lazy" onerror="this.onerror=null;this.style.opacity='0.3';this.src='data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#888"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>')}'">` : `<div class="empty-slot"></div>`).join('');
    
    const packHtml = `
      <div class="pack-item selected" style="margin: 0 auto; cursor: default;">
        <div class="pack-grid">${imgs}</div>
        <div class="pack-name-pill">${packName}</div>
      </div>
    `;
    
    document.getElementById('settingsContent').innerHTML = `
      <div class="flex-v" style="gap:4px">
        <div style="background:var(--card); padding:6px 10px; border-radius:6px; border:1px solid var(--border)">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px">
            <label style="font-size:0.85rem; font-weight:700; color:var(--yellow); margin:0">${t('settingMemePack')}</label>
            <button class="btn btn-ghost" style="padding:2px 8px; font-size:0.65rem; color:var(--cyan); border-color:var(--cyan)" onclick="openPackModal()" data-i18n="seeAllPacks">${t('seeAllPacks')}</button>
          </div>
          <div style="display:flex; justify-content:center; padding:2px 0;">
            ${packHtml}
          </div>
        </div>
        <div style="margin-bottom:4px;"><label style="display:block; font-size:0.75rem; color:var(--muted); font-weight:700; margin-bottom:2px;">${t('settingGameMode')}</label>
          <select id="ls_gamemode" onchange="sendSettings()" style="width:100%; background:var(--card); border:1px solid var(--border); border-radius:6px; color:var(--text); padding:4px 8px; font-size:0.85rem; font-family:'Space Grotesk', sans-serif; outline:none;">
            <option value="classic" ${s.gameMode==='classic'?'selected':''}>${t('gameModeClassic')}</option>
            <option value="topic_mode" ${s.gameMode==='topic_mode'?'selected':''}>${t('gameModeTopic')}</option>
            <option value="custom_mode" ${s.gameMode==='custom_mode'?'selected':''}>${t('gameModeCustom')}</option>
            <option value="meme_hunter" ${s.gameMode==='meme_hunter'?'selected':''}>${t('gameModeMemeHunter')}</option>
            <option value="king_long_live" ${s.gameMode==='king_long_live'?'selected':''}>${t('gameModeKingLongLive') || 'Kral Çok Yaşa!'}</option>
          </select>
        </div>
        <div style="margin-bottom:4px;"><label style="display:block; font-size:0.75rem; color:var(--muted); font-weight:700; margin-bottom:2px;">${t('settingPasswordLong')}</label>
          <input type="password" id="ls_pass" placeholder="${t('settingPasswordPlaceholder')}" value="${s.password || ''}" onchange="sendSettings()" style="width:100%; background:var(--card); border:1px solid var(--border); border-radius:6px; color:var(--text); padding:4px 8px; font-size:0.85rem; font-family:'Space Grotesk', sans-serif; outline:none; transition:border-color 0.3s;" onfocus="this.style.borderColor='var(--primary-violet)'" onblur="this.style.borderColor='var(--border)'"/>
        </div>
        <div style="margin-bottom:4px;"><label style="display:block; font-size:0.75rem; color:var(--muted); font-weight:700; margin-bottom:2px;">${t('settingRoundsLong')}</label><div class="range-row"><input type="range" id="ls_rounds" min="1" max="12" value="${s.maxRounds}" oninput="document.getElementById('ls_rounds_v').textContent=this.value;sendSettings()"/><span class="range-val" id="ls_rounds_v" style="font-size:0.75rem; color:var(--text);">${s.maxRounds}</span></div></div>
        <div style="margin-bottom:4px;"><label style="display:block; font-size:0.75rem; color:var(--muted); font-weight:700; margin-bottom:2px;">${t('settingWriteLong')}</label><div class="range-row"><input type="range" id="ls_write" min="20" max="120" step="10" value="${s.writingTime}" oninput="document.getElementById('ls_write_v').textContent=this.value+'s';sendSettings()"/><span class="range-val" id="ls_write_v" style="font-size:0.75rem; color:var(--text);">${s.writingTime}s</span></div></div>
        <div style="margin-bottom:4px;"><label style="display:block; font-size:0.75rem; color:var(--muted); font-weight:700; margin-bottom:2px;">${t('settingVoteLong')}</label><div class="range-row"><input type="range" id="ls_vote" min="10" max="60" step="5" value="${s.votingTime}" oninput="document.getElementById('ls_vote_v').textContent=this.value+'s';sendSettings()"/><span class="range-val" id="ls_vote_v" style="font-size:0.75rem; color:var(--text);">${s.votingTime}s</span></div></div>
        <div style="margin-bottom:4px;"><label style="display:block; font-size:0.75rem; color:var(--muted); font-weight:700; margin-bottom:2px;">${t('settingChangeLong')}</label><div class="range-row"><input type="range" id="ls_change" min="0" max="30" value="${!s.changeAllowed?0:s.changeCount}" oninput="document.getElementById('ls_change_v').textContent=this.value=='0'?'${t('closed')}':this.value;sendSettings()"/><span class="range-val" id="ls_change_v" style="font-size:0.75rem; color:var(--text);">${!s.changeAllowed||s.changeCount==0?t('closed'):s.changeCount}</span></div></div>
        <div style="margin-top:6px; margin-bottom:2px; padding:6px 10px; background:rgba(255,255,255,0.05); border-radius:8px; border:1px solid rgba(255,255,255,0.1);">
          <label style="display:flex; justify-content:space-between; align-items:center; font-size:0.95rem; color:var(--text); font-weight:800; cursor:pointer;">
            <span>${myLang === 'tr' ? '\u{1F5D1}\uFE0F Çöp butonu' : '\u{1F5D1}\uFE0F Trash Button'}</span>
            <input type="checkbox" id="ls_trash" ${s.trashAllowed === false ? '' : 'checked'} onchange="document.getElementById('trash_info').style.display=this.checked?'block':'none'; sendSettings()" style="width:18px; height:18px; cursor:pointer; accent-color:var(--red);">
          </label>
          <div id="trash_info" style="margin-top:4px; font-size:0.75rem; color:var(--muted); font-weight:600; line-height:1.2; display:${s.trashAllowed === false ? 'none' : 'block'};">
            ${myLang === 'tr' ? 'Aktif olduğunda oylama ekranında çöp butonu belirir. Çoğunluk bir memeye çöp oyu verirse, o oyuncu o tur için -150 puan ceza alır. Herkes tur başına 1 çöp oyu hakkına sahiptir.' : 'When active, a trash button appears on the voting screen. If the majority votes trash on a meme, that player gets a -150 point penalty for the round. Each player has 1 trash vote per round.'}
          </div>
        </div>
      </div>`;
  } else {
    let selectedPack = availablePacks.find(p => p.id === s.memePack) || {id: s.memePack, previews:['','','','']};
    let packName = selectedPack.id === 'default' ? t('defaultPack') : selectedPack.id;
    let imgs = (selectedPack.previews || []).map(url => {
      if(!url) return `<div class="empty-slot"></div>`;
      if(/\.(mp4|webm|mov)$/i.test(url)) return `<video src="${url}#t=0.5" autoplay loop muted playsinline preload="metadata" style="width:100%;height:100%;object-fit:cover;"></video>`;
      return `<img src="${url}" loading="lazy" onerror="this.onerror=null;this.style.opacity='0.3';this.src='data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#888"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>')}'">`;
    }).join('');

    document.getElementById('settingsContent').innerHTML = `
      <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); margin-bottom:10px">
        <label style="font-size:1rem; font-weight:700; color:var(--yellow); display:block; text-align:center; margin-bottom:10px">${t('settingMemePack')}</label>
        <div style="display:flex; justify-content:center;">
           <div class="pack-item selected" style="cursor:default; transform:scale(1.1); margin-bottom:8px">
              <div class="pack-grid">${imgs}</div>
              <div class="pack-name-pill">${packName}</div>
           </div>
        </div>
      </div>
      <div class="settings-grid">
        <div class="settings-cell"><div class="settings-cell-label">${t('settingGameMode')}</div><div class="settings-cell-val" style="font-size:0.9rem;">${s.gameMode === 'topic_mode' ? t('gameModeTopic') : (s.gameMode === 'custom_mode' ? t('gameModeCustom') : (s.gameMode === 'meme_hunter' ? t('gameModeMemeHunter') : (s.gameMode === 'king_long_live' ? (t('gameModeKingLongLive') || 'Kral Çok Yaşa!') : t('gameModeClassic'))))}</div></div>
        <div class="settings-cell"><div class="settings-cell-label">${t('settingRounds')}</div><div class="settings-cell-val">${s.maxRounds}</div></div>
        <div class="settings-cell"><div class="settings-cell-label">${t('settingWrite')}</div><div class="settings-cell-val">${s.writingTime}s</div></div>
        <div class="settings-cell"><div class="settings-cell-label">${t('settingVote')}</div><div class="settings-cell-val">${s.votingTime}s</div></div>
        <div class="settings-cell"><div class="settings-cell-label">${t('settingChange')}</div><div class="settings-cell-val">${s.changeAllowed?s.changeCount+'x':'—'}</div></div>
        <div class="settings-cell"><div class="settings-cell-label">${myLang === 'tr' ? 'Çöp' : 'Trash'}</div><div class="settings-cell-val">${s.trashAllowed === false ? t('closed') : 'Açık'}</div></div>
      </div>`;
  }
}

window.selectPack = function(id) {
  if (!gameState || gameState.host !== myId) return;
  const rounds = document.getElementById('ls_rounds'); const write = document.getElementById('ls_write');
  const vote = document.getElementById('ls_vote'); const chg = document.getElementById('ls_change');
  const pass = document.getElementById('ls_pass');
  const mode = document.getElementById('ls_gamemode');
  if (!rounds) return;
  const changeVal = +chg.value;
  socket.emit('room:update_settings', { 
    roomCode: myRoomCode, maxRounds: +rounds.value, writingTime: +write.value, votingTime: +vote.value, 
    changeAllowed: changeVal > 0, changeCount: changeVal, password: pass.value || null, memePack: id, 
    gameMode: mode ? mode.value : 'classic', 
    trashAllowed: document.getElementById('ls_trash') ? document.getElementById('ls_trash').checked : true 
  });
  closeModal('modalPackSelect');
};

function openPackModal() {
  document.getElementById('modalPackSelect').style.display = 'flex';
  const searchInput = document.getElementById('packSearchInput');
  if (searchInput) searchInput.value = '';
  renderModalPacks('');
  if (searchInput) searchInput.focus();
}

function filterPacks() {
  const query = document.getElementById('packSearchInput').value.toLocaleLowerCase('tr-TR');
  renderModalPacks(query);
}

function renderModalPacks(query) {
  const container = document.getElementById('modalPackGrid');
  if (!container || !gameState) return;
  
  let filtered = availablePacks.filter(p => {
    const pName = p.id === 'default' ? t('defaultPack') : p.id;
    return pName.toLocaleLowerCase('tr-TR').includes(query);
  });
  
  filtered.sort((a, b) => {
    if (a.id === gameState.memePack) return -1;
    if (b.id === gameState.memePack) return 1;
    return 0;
  });
  
  container.innerHTML = filtered.map(p => {
    const isSelected = gameState.memePack === p.id;
    const packName = p.id === 'default' ? t('defaultPack') : p.id;
    const imgs = (p.previews || []).map(url => {
      if(!url) return `<div class="empty-slot"></div>`;
      if(/\.(mp4|webm|mov)$/i.test(url)) return `<video src="${url}#t=0.5" autoplay loop muted playsinline preload="metadata" style="width:100%;height:100%;object-fit:cover;"></video>`;
      return `<img src="${url}" loading="lazy" onerror="this.onerror=null;this.style.opacity='0.3';this.src='data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#888"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>')}'">`;
    }).join('');
    return `
      <div class="pack-item ${isSelected ? 'selected' : ''}" onclick="selectPack('${p.id}')" style="margin-bottom:6px">
        <div class="pack-grid">${imgs}</div>
        <div class="pack-name-pill">${packName}</div>
      </div>
    `;
  }).join('');
}

let _settingsTimer = null;
function sendSettings() {
  clearTimeout(_settingsTimer);
  _settingsTimer = setTimeout(() => {
    const rounds = document.getElementById('ls_rounds'); const write = document.getElementById('ls_write');
    const vote = document.getElementById('ls_vote'); const chg = document.getElementById('ls_change');
    const pass = document.getElementById('ls_pass');
    const mode = document.getElementById('ls_gamemode');
    if (!rounds) return;
    const changeVal = +chg.value;
    socket.emit('room:update_settings', { 
      roomCode: myRoomCode, maxRounds: +rounds.value, writingTime: +write.value, votingTime: +vote.value, 
      changeAllowed: changeVal > 0, changeCount: changeVal, password: pass.value || null, memePack: gameState.memePack, 
      gameMode: mode ? mode.value : 'classic',
      trashAllowed: document.getElementById('ls_trash') ? document.getElementById('ls_trash').checked : true
    });
  }, 300);
}

function startGame(){ socket.emit('game:start',{roomCode:myRoomCode}); socket.emit('community:start',{serverId:myRoomCode}); }

function renderWriting(state){
  hasSubmitted=false; myMeme=null; hasTrashed=false;
  
  if (state.gameMode === 'king_long_live' && state.kingId === myId) {
    document.getElementById('writingControlsCard').style.display='none';
    document.getElementById('writingWaitingCard').style.display='block';
    
    const waitTitle = document.querySelector('#writingWaitingCard h3');
    if(waitTitle) waitTitle.textContent = "Kral Bekliyor...";
    const waitSub = document.querySelector('#writingWaitingCard p');
    if(waitSub) waitSub.textContent = "(Halk capsleri hazırlarken kral tahtında dinleniyor)";
    
    document.getElementById('wRound').textContent=`${t('roundText')} ${state.round}/${state.maxRounds}`;
    document.getElementById('wBar').style.width='100%'; 
    document.getElementById('wBar').classList.remove('boosted');
    document.getElementById('wTimerNum').classList.remove('boosted'); 
    
    const cw = document.getElementById('writingCanvasWrap');
    if(cw) cw.style.display = 'none';
    
    return;
  }
  
  const cw = document.getElementById('writingCanvasWrap');
  if(cw) cw.style.display = 'block';
  const waitTitle = document.querySelector('#writingWaitingCard h3');
  if(waitTitle) waitTitle.textContent = t('waitingOthers');
  const waitSub = document.querySelector('#writingWaitingCard p');
  if(waitSub) waitSub.textContent = t('waitingOthersSub');

  document.getElementById('writingControlsCard').style.display='block';
  document.getElementById('writingWaitingCard').style.display='none';
  if(state.gameMode === 'meme_hunter'){
    document.getElementById('textControls1').style.display = 'block';
    document.getElementById('captionText').style.display = 'none';
    document.getElementById('textControls2').style.display = 'none';
    document.getElementById('textControls3').style.display = 'none';
    document.getElementById('btnAddText').style.display = 'none';
    const capLabel = document.querySelector('#writingControlsCard .card-label');
    if (capLabel) capLabel.textContent = window.myLang === 'tr' ? "Görselini Seç ve Gönder" : "Select and Submit Image";
    const mc = document.getElementById('memeHandContainer');
    if(mc) mc.style.display = 'block';
  } else {
    document.getElementById('textControls1').style.display = 'block';
    document.getElementById('captionText').style.display = 'block';
    document.getElementById('btnAddText').style.display = 'block';
    const capLabel = document.querySelector('#writingControlsCard .card-label');
    if (capLabel) capLabel.textContent = t('writeCaptionLabel');
    const mc = document.getElementById('memeHandContainer');
    if(mc) mc.style.display = 'none';
  }
  document.getElementById('wRound').textContent=`${t('roundText')} ${state.round}/${state.maxRounds}`;
  document.getElementById('wBar').style.width='100%'; document.getElementById('wBar').classList.remove('boosted');
  document.getElementById('wTimerNum').classList.remove('boosted'); document.getElementById('speedBadge').classList.remove('active');
  document.getElementById('captionText').value=''; document.getElementById('captionText').disabled=false;
  const sizeSlider = document.getElementById('captionSizeSlider'); if (sizeSlider) sizeSlider.value = 3;
  const dragEl = document.getElementById('captionDrag');
  if (dragEl) { dragEl.textContent = ''; dragEl.style.top = '12px'; dragEl.style.left = '50%'; dragEl.style.transform = 'translateX(-50%)'; dragEl.style.display = 'block'; }
  const dragEl2 = document.getElementById('captionDrag2'); if(dragEl2) dragEl2.style.display='block';
  const dragEl3 = document.getElementById('captionDrag3'); if(dragEl3) dragEl3.style.display='block';
  updateCaptionSize();
  removeSecondText(); // This hides the second text and shows the +Metin Ekle button
  if(state.gameMode === 'meme_hunter'){
    document.getElementById('btnAddText').style.display = 'none';
  }
  document.getElementById('btnSubmit').textContent=t('submitBtn'); document.getElementById('btnSubmit').disabled=false;
  document.getElementById('submitCountBadge').style.display='none';
  changeRemaining = state.changeCount || 1;
  const cb = document.getElementById('btnChange'); const cbBadge = document.getElementById('changeCountBadge');
  if(state.changeAllowed && state.gameMode !== 'meme_hunter'){ cb.style.display=''; cb.disabled=false; cb.textContent=t('changeMemeBtn'); cbBadge.style.display=''; cbBadge.textContent=changeRemaining+' '+t('rightsLeft'); }
  else { cb.style.display='none'; cbBadge.style.display='none'; }
  // (Artık görselin silinmesine gerek yok, game:your_meme olayı doğrudan güncelliyor)
}

let hasSubmittedTopic = false;
let hasSubmittedMedia = false;
let currentCustomMedia = null;

function clearMediaPreview() {
  currentCustomMedia = null;
  document.getElementById('previewImg').style.display = 'none';
  document.getElementById('previewImg').src = '';
  document.getElementById('previewVideo').style.display = 'none';
  document.getElementById('previewVideo').src = '';
  document.getElementById('previewArea').style.display = 'none';
  document.getElementById('mediaInitialButtons').style.display = 'flex';
  document.getElementById('mediaErrorTxt').textContent = '';
}

function handleFileUpload(e) {
  const file = e.target.files[0];
  if(!file) return;
  processMediaFile(file);
}

function processMediaFile(file) {
  if (file.size > 8 * 1024 * 1024) { // 8MB limit
    document.getElementById('mediaErrorTxt').textContent = t('errFileTooLarge');
    return;
  }
  document.getElementById('mediaErrorTxt').textContent = '';
  const reader = new FileReader();
  reader.onload = function(evt) {
    const dataUrl = evt.target.result;
    currentCustomMedia = { url: dataUrl, name: file.name, id: 'custom_' + Date.now() };
    document.getElementById('mediaInitialButtons').style.display = 'none';
    document.getElementById('previewArea').style.display = 'block';
    if(file.type.startsWith('video/')) {
      document.getElementById('previewImg').style.display = 'none';
      const vid = document.getElementById('previewVideo');
      vid.style.display = 'block';
      vid.src = dataUrl;
      vid.play().catch(e => console.warn('Preview play prevented:', e));
    } else {
      document.getElementById('previewVideo').style.display = 'none';
      const img = document.getElementById('previewImg');
      img.style.display = 'block';
      img.src = dataUrl;
    }
  };
  reader.readAsDataURL(file);
}

document.addEventListener('paste', function(e) {
  if (!gameState || gameState.state !== 'media_selection') return;
  if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
    processMediaFile(e.clipboardData.files[0]);
  }
});

function openArchiveModal() {
  document.getElementById('modalMemeSelect').style.display = 'flex';
  const searchInput = document.getElementById('memeSearchInput');
  if (searchInput) searchInput.value = '';
  
  if (Object.keys(allMemesData).length === 0) {
    document.getElementById('modalMemeGrid').innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">Arşiv yükleniyor... Lütfen bekleyin.</div>';
    socket.emit("system:get_all_memes");
  } else {
    renderModalMemes('');
  }
  
  if (searchInput) searchInput.focus();
}

function filterMemes() {
  const query = document.getElementById('memeSearchInput').value.toLocaleLowerCase('tr-TR');
  renderModalMemes(query);
}

function renderModalMemes(query) {
  const container = document.getElementById('modalMemeGrid');
  if (!container) return;
  
  let allMemesFlat = [];
  Object.keys(allMemesData).forEach(packName => {
    allMemesFlat = allMemesFlat.concat(allMemesData[packName]);
  });
  
  let filtered = allMemesFlat.filter(m => {
    return m.name.toLocaleLowerCase('tr-TR').includes(query);
  });
  
  if (filtered.length === 0) {
    container.innerHTML = `<p class="muted" style="text-align:center; grid-column:1/-1;">Sonuç bulunamadı.</p>`;
    return;
  }
  
  // Sadece ilk 100 sonucu gösterelim (performans için)
  filtered = filtered.slice(0, 100);
  
  container.innerHTML = filtered.map(m => {
    const isVideo = /\.(mp4|webm|mov)$/i.test(m.url) || (typeof m.url === 'string' && m.url.startsWith('data:video/'));
    const mediaHtml = isVideo ? 
      `<video src="${m.url}" autoplay loop muted playsinline style="width:100%; height:120px; object-fit:cover; border-radius:8px;"></video>` :
      `<img src="${m.url}" loading="lazy" style="width:100%; height:120px; object-fit:cover; border-radius:8px;" onerror="console.error('Yüklenemedi:',this.src);this.onerror=null;this.style.opacity='0.3';this.style.objectFit='scale-down';this.style.padding='15%';this.src='data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#888"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>')}'"/>`;
      
    return `
      <div class="pack-item" onclick="selectArchiveMeme('${m.id}')" style="padding:4px; text-align:center; cursor:pointer; background:rgba(255,255,255,0.05); border-radius:8px; transition:transform 0.2s;">
        ${mediaHtml}
        <div style="font-size:0.7rem; color:rgba(255,255,255,0.7); margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${m.name}">${m.name}</div>
      </div>
    `;
  }).join('');
}

window.selectArchiveMeme = function(id) {
  let selectedMeme = null;
  Object.keys(allMemesData).forEach(packName => {
    const found = allMemesData[packName].find(m => m.id === id);
    if(found) selectedMeme = found;
  });
  
  if(selectedMeme) {
    currentCustomMedia = { url: selectedMeme.url, name: selectedMeme.name, id: 'arch_' + Date.now() };
    document.getElementById('mediaInitialButtons').style.display = 'none';
    document.getElementById('previewArea').style.display = 'block';
    
    if(/\.(mp4|webm|mov)$/i.test(selectedMeme.url) || (typeof selectedMeme.url === 'string' && selectedMeme.url.startsWith('data:video/'))) {
      document.getElementById('previewImg').style.display = 'none';
      const vid = document.getElementById('previewVideo');
      vid.style.display = 'block';
      vid.src = selectedMeme.url;
      vid.play().catch(e => console.warn('Preview play prevented:', e));
    } else {
      document.getElementById('previewVideo').style.display = 'none';
      const img = document.getElementById('previewImg');
      img.style.display = 'block';
      img.src = selectedMeme.url;
    }
  }
  closeModal('modalMemeSelect');
};

window.selectPack = function(id) {
  const rounds = document.getElementById('ls_rounds'); const write = document.getElementById('ls_write');
  const vote = document.getElementById('ls_vote'); const chg = document.getElementById('ls_change');
  const pass = document.getElementById('ls_pass');
  const mode = document.getElementById('ls_gamemode');
  if (!rounds) return;
  const changeVal = +chg.value;
  socket.emit('room:update_settings', { 
    roomCode: myRoomCode, maxRounds: +rounds.value, writingTime: +write.value, votingTime: +vote.value, 
    changeAllowed: changeVal > 0, changeCount: changeVal, password: pass.value || null, memePack: id, 
    gameMode: mode ? mode.value : 'classic',
    trashAllowed: document.getElementById('ls_trash') ? document.getElementById('ls_trash').checked : true
  });
  closeModal('modalPackSelect');
};

function submitCustomMedia() {
  if(hasSubmittedMedia || !currentCustomMedia) return;
  hasSubmittedMedia = true;
  document.getElementById('mediaControlsCard').style.display = 'none';
  document.getElementById('mediaWaitingCard').style.display = 'block';
  socket.emit('game:submit_media', { roomCode: myRoomCode, mediaObj: currentCustomMedia });
}

function submitTopic() {
  if(hasSubmittedTopic) return;
  const t = document.getElementById('topicText').value.trim();
  if(!t) return;
  hasSubmittedTopic = true;
  document.getElementById('topicText').disabled = true;
  document.getElementById('btnSubmitTopic').disabled = true;
  document.getElementById('topicControlsCard').style.display = 'none';
  document.getElementById('topicWaitingCard').style.display = 'block';
  socket.emit('game:submit_topic', { roomCode: myRoomCode, topic: t });
}

function submitCaption(){
  if(hasSubmitted)return;
  const isHunter = gameState && gameState.gameMode === 'meme_hunter';
  const cap = isHunter ? (document.getElementById('captionDrag').textContent || "...") : document.getElementById('captionText').value.trim();
  const cap2 = document.getElementById('captionText2') ? document.getElementById('captionText2').value.trim() : '';
  const cap3 = document.getElementById('captionText3') ? document.getElementById('captionText3').value.trim() : '';
  if(!cap && !cap2 && !cap3)return;
  
  hasSubmitted=true; document.getElementById('captionText').disabled=true;
  if(document.getElementById('captionText2')) document.getElementById('captionText2').disabled=true;
  if(document.getElementById('captionText3')) document.getElementById('captionText3').disabled=true;
  document.getElementById('btnSubmit').textContent=t('submittedBtn'); document.getElementById('btnSubmit').disabled=true;
  document.getElementById('btnChange').disabled=true;
  document.getElementById('btnAddText').style.display='none';
  const btn3 = document.getElementById('btnAddThirdText'); if(btn3) btn3.style.display='none';
  
  document.getElementById('writingControlsCard').style.display='none';
  document.getElementById('writingWaitingCard').style.display='block';
  const mc = document.getElementById('memeHandContainer');
  if(mc) mc.style.display='none';
  
  const dEl = document.getElementById('captionDrag');
  const dEl2 = document.getElementById('captionDrag2');
  const dEl3 = document.getElementById('captionDrag3');
  const oEl = document.getElementById('captionOverlay');
  const pR = oEl.getBoundingClientRect();
  
  const leftCenter = dEl.offsetLeft;
  const x = (leftCenter / pR.width) * 100;
  const y = (dEl.offsetTop / pR.height) * 100;
  let size = 3;
  const sizeSlider = document.getElementById('captionSizeSlider');
  if(sizeSlider) size = parseFloat(sizeSlider.value);

  let style2 = null;
  if (!isHunter && cap2 && dEl2) {
    const leftCenter2 = dEl2.offsetLeft;
    const x2 = (leftCenter2 / pR.width) * 100;
    const y2 = (dEl2.offsetTop / pR.height) * 100;
    let size2 = 3;
    const sizeSlider2 = document.getElementById('captionSizeSlider2');
    if(sizeSlider2) size2 = parseFloat(sizeSlider2.value);
    style2 = { x: x2, y: y2, size: size2 };
  }

  let style3 = null;
  if (!isHunter && cap3 && dEl3) {
    const leftCenter3 = dEl3.offsetLeft;
    const x3 = (leftCenter3 / pR.width) * 100;
    const y3 = (dEl3.offsetTop / pR.height) * 100;
    let size3 = 3;
    const sizeSlider3 = document.getElementById('captionSizeSlider3');
    if(sizeSlider3) size3 = parseFloat(sizeSlider3.value);
    style3 = { x: x3, y: y3, size: size3 };
  }
  
  let payload = {roomCode:myRoomCode,caption:cap, style:{x, y, size}, caption2: cap2, style2: style2, caption3: cap3, style3: style3};
  if(isHunter && window.selectedMemeForHunter) payload.selectedMeme = window.selectedMemeForHunter;
  
  socket.emit('game:submit', payload);
}
function changeMeme(){ if(hasSubmitted)return; socket.emit('game:change',{roomCode:myRoomCode}); }

function renderShowcase(state){
  hasVoted=false; const sub = state.showcaseList[state.showcaseIndex]; currentShowcaseSubmission = sub;
  const isOwnMeme = sub.playerId === myId;
  const vbTrash = document.getElementById('vbTrash');
  if (vbTrash) {
    vbTrash.style.display = state.trashAllowed === false ? 'none' : 'flex';
    vbTrash.disabled = hasTrashed || isOwnMeme;
  }
  document.getElementById('voteLoading').classList.remove('active'); 
  document.getElementById('scRound').textContent=`${t('roundText')} ${state.round}/${state.maxRounds}`;
  document.getElementById('scProgress').textContent=(state.showcaseIndex+1)+'/'+state.showcaseList.length;
  document.getElementById('scBar').style.width='100%';
  const isOwn = sub.playerId === myId; document.getElementById('ownMemeNote').style.display = isOwn ? '' : 'none';
  
  if (state.gameMode === 'king_long_live') {
    document.getElementById('normalVoteBtns').style.display = 'none';
    if(vbTrash) vbTrash.style.display = 'none';
    
    document.getElementById('kingBlindRankingUi').style.display = 'flex';
    const slotsContainer = document.getElementById('kingBlindSlots');
    slotsContainer.innerHTML = '';
    const numMemes = state.showcaseList.length;
    for(let i=1; i<=numMemes; i++) {
       const pid = state.kingSlots ? state.kingSlots[i] : null;
       let contentHTML = `<div class="kbs-icon">+</div>`;
       let slotClass = 'king-blind-slot';
       let isFilled = false;
       
       if (pid) {
         const matchedSub = state.showcaseList.find(x => x.playerId === pid);
         if (matchedSub) {
            contentHTML = `<div id="kbsPreview_${i}" style="width:100%; height:100%; pointer-events:none; border-radius:12px; overflow:hidden;"></div>`;
            slotClass += ' filled';
            isFilled = true;
         }
       }
       
       slotsContainer.innerHTML += `
         <div class="${slotClass}" id="kbSlot_${i}" onclick="kingBlindVote(${i})">
           <div class="kbs-rank">${i}.</div>
           <div class="kbs-content" id="kbsContent_${i}">${contentHTML}</div>
         </div>
       `;
    }
    
    // Render meme previews for filled slots
    for(let i=1; i<=numMemes; i++) {
       const pid = state.kingSlots ? state.kingSlots[i] : null;
       if (pid) {
          const matchedSub = state.showcaseList.find(x => x.playerId === pid);
          if (matchedSub) {
             setTimeout(() => {
                const previewEl = document.getElementById(`kbsPreview_${i}`);
                if (previewEl) renderMemeDOM(previewEl, matchedSub.meme.url, matchedSub.caption, matchedSub.style, matchedSub.caption2, matchedSub.style2, true, matchedSub.caption3, matchedSub.style3);
             }, 50);
          }
       }
    }
    const isKing = state.kingId === myId;
    document.getElementById('kingBlindSlots').style.pointerEvents = isKing ? 'auto' : 'none';
    document.getElementById('kbPassBtn').style.display = isKing ? 'inline-block' : 'none';
  } else {
    document.getElementById('normalVoteBtns').style.display = 'flex';
    document.getElementById('kingBlindRankingUi').style.display = 'none';
    ['vbDislike','vbNeutral','vbLike'].forEach(id=>{ const b=document.getElementById(id); b.disabled=isOwn; b.classList.remove('selected'); });
  }
  
  const topicBanner = document.getElementById('showcaseTopicBanner');
  if (sub.topic) {
    document.getElementById('scAssignedTopic').textContent = sub.topic.text || sub.topic;
    topicBanner.style.display = 'block';
  } else {
    topicBanner.style.display = 'none';
  }
  
  renderMemeDOM(document.getElementById('showcaseContainer'), sub.meme.url, sub.caption, sub.style, sub.caption2, sub.style2, false, sub.caption3, sub.style3);
}

function kingBlindVote(vote) {
  if (hasVoted) return;
  const state = gameState;
  if (!state || state.kingId !== myId) return;
  if (vote !== 0 && state.kingSlots && state.kingSlots[vote]) return; 
  
  hasVoted = true;
  document.getElementById('voteLoading').classList.add('active');
  socket.emit('game:king_blind_vote', { roomCode: myRoomCode, vote: vote });
}


function castVote(v){
  if(hasVoted)return; hasVoted=true;
  ['vbDislike','vbNeutral','vbLike'].forEach(id=>{ document.getElementById(id).disabled=true; });
  document.getElementById('vb'+v[0].toUpperCase()+v.slice(1)).classList.add('selected');
  document.getElementById('voteLoading').classList.add('active'); 
  socket.emit('game:showcase_vote',{roomCode:myRoomCode,vote:v});
}

function castTrashVote(){
  if(hasTrashed)return; 
  const sub = gameState.showcaseList[gameState.showcaseIndex];
  if (sub && sub.playerId === myId) return; // kendi memen
  
  hasTrashed = true;
  document.getElementById('vbTrash').disabled = true;
  socket.emit('game:cast_trash_vote', { roomCode: myRoomCode });
}

function renderRoundSummary(state, roundVoteTotals){
  document.getElementById('voteLoading').classList.remove('active'); 
  document.getElementById('summaryTitle').textContent = `${t('roundText')} ${state.round} ${t('roundSummaryPhase')}`;
  document.getElementById('nextRoundTxt').textContent = state.round >= state.maxRounds ? t('gameOverPhase') : t('nextRoundIn') + '...';

  const sortedMemes = [...state.showcaseList].sort((a,b) => {
    const aTrashed = state.trashedMemes && state.trashedMemes[a.playerId];
    const bTrashed = state.trashedMemes && state.trashedMemes[b.playerId];
    if (aTrashed && !bTrashed) return 1;
    if (!aTrashed && bTrashed) return -1;
    return (roundVoteTotals[b.playerId]?.pts || 0) - (roundVoteTotals[a.playerId]?.pts || 0);
  });

  const scoresSorted = [...state.players]
    .filter(p => !(state.viewers || []).includes(p.id) && !(state.gameMode === 'king_long_live' && p.id === state.kingId))
    .sort((a,b) => (state.scores[b.id]||0) - (state.scores[a.id]||0));
  document.getElementById('summaryScoreList').innerHTML = scoresSorted.map((p,i) => {
    const s = state.scores[p.id] || 0;
    const clr = s > 0 ? 'var(--green)' : s < 0 ? 'var(--red)' : 'inherit';
    return `
    <div class="sum-score-row${p.id === myId ? ' me' : ''}">
      <span class="sum-s-rank">#${i+1}</span>
      <span class="sum-s-name">${esc(p.name)}</span>
      <span class="sum-s-pts" style="color:${clr}">${s}</span>
    </div>`;
  }).join('');

  const listContainer = document.getElementById('summaryMemeList');
  listContainer.innerHTML = sortedMemes.map((sub, i) => {
    const vt = roundVoteTotals[sub.playerId] || { pts: 0 };
    const ptsClass = vt.pts > 0 ? 'pos' : vt.pts < 0 ? 'neg' : 'zero';
    const topicHtml = sub.topic ? `<div class="summary-topic" style="font-size:1.1rem; color:var(--primary-golden); margin-bottom:12px; text-transform:uppercase; text-align:center; background:rgba(255,107,107,0.15); border:1px solid rgba(255,107,107,0.4); padding:10px; border-radius:var(--r);">Konu: <b style="color:#fff; font-size:1.3rem;">${esc(sub.topic.text || sub.topic)}</b> <span style="display:${state.gameMode === 'meme_hunter' ? 'none' : 'block'}; color:rgba(255,255,255,0.6); text-transform:none; font-size:0.9rem; margin-top:4px;">(Yazan: ${esc(sub.topic.authorName || 'Bilinmiyor')})</span></div>` : '';
    const authorName = (state.gameMode === 'meme_hunter' && sub.topic) ? sub.topic.authorName || 'Bilinmiyor' : sub.playerName;
    const authorIsMe = (state.gameMode === 'meme_hunter' && sub.topic) ? (sub.topic.authorId === myId) : (sub.playerId === myId);
    
    const canDownload = (state.activePlayers || []).includes(myId);
    const downloadBtnHtml = canDownload ? `<button class="btn btn-ghost" style="padding:6px 10px; font-size:.8rem;" onclick="downloadMeme('${sub.meme.url}', '${esc(sub.caption)}', ${JSON.stringify(sub.style).replace(/"/g, '&quot;')}, '${esc(sub.caption2 || '')}', ${JSON.stringify(sub.style2 || null).replace(/"/g, '&quot;')}, 'meme_${esc(sub.playerName)}.gif', '${esc(sub.caption3 || '')}', ${JSON.stringify(sub.style3 || null).replace(/"/g, '&quot;')})" title="${t('downloadBtn')}">${t('downloadBtn')}</button>` : '';
    
    return `
      <div class="summary-meme-card" data-player-id="${sub.playerId}">
        ${topicHtml}
        <div class="summary-meme-wrap" id="sum_cv_${i}"></div>
        <div class="summary-meme-footer">
          <div class="summary-by">${t('byText')} <strong>${esc(authorName)}${authorIsMe ? ` ${t('youText')}` : ''}</strong></div>
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="sum-card-pts ${ptsClass}">${vt.pts > 0 ? '+' : ''}${vt.pts} ${t('pointsText')}</div>
            ${downloadBtnHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');

  sortedMemes.forEach((sub, i) => {
    renderMemeDOM(document.getElementById(`sum_cv_${i}`), sub.meme.url, sub.caption, sub.style, sub.caption2, sub.style2, true, sub.caption3, sub.style3);
  });
}

function renderGameover(state){
  const sorted=[...state.players]
    .filter(p => !(state.viewers || []).includes(p.id) && !(state.gameMode === 'king_long_live' && p.id === state.kingId))
    .sort((a,b)=>(state.scores[b.id]||0)-(state.scores[a.id]||0));
  
  let html = '<div class="podium-container">';
  const p1 = sorted[0], p2 = sorted[1], p3 = sorted[2];
  const c2 = p2 ? ((state.scores[p2.id]||0)>0?'var(--green)':(state.scores[p2.id]||0)<0?'var(--red)':'inherit') : '';
  const c1 = p1 ? ((state.scores[p1.id]||0)>0?'var(--green)':(state.scores[p1.id]||0)<0?'var(--red)':'inherit') : '';
  const c3 = p3 ? ((state.scores[p3.id]||0)>0?'var(--green)':(state.scores[p3.id]||0)<0?'var(--red)':'inherit') : '';

  if(p2) html += `<div class="podium-col podium-2"><div class="podium-name">${esc(p2.name)}</div><div class="podium-pts" style="color:${c2}">${state.scores[p2.id]||0}</div><div class="podium-bar">2</div></div>`;
  if(p1) html += `<div class="podium-col podium-1"><div class="podium-name" style="font-size:1.1rem;color:var(--yellow)">${esc(p1.name)} \u{1F451}</div><div class="podium-pts" style="color:${c1}">${state.scores[p1.id]||0}</div><div class="podium-bar">1</div></div>`;
  if(p3) html += `<div class="podium-col podium-3"><div class="podium-name">${esc(p3.name)}</div><div class="podium-pts" style="color:${c3}">${state.scores[p3.id]||0}</div><div class="podium-bar">3</div></div>`;
  html += '</div><div class="final-list">';
  
  for(let i=3; i<sorted.length; i++){
    const p = sorted[i];
    const s = state.scores[p.id] || 0;
    const clr = s > 0 ? 'var(--green)' : s < 0 ? 'var(--red)' : 'inherit';
    const dly = 0.8 + (i-3)*0.15;
    html += `
      <div class="final-row" style="animation-delay:${dly}s">
        <span class="f-rank">#${i+1}</span>
        <span class="f-name">${esc(p.name)}${p.id===myId?` <small style="opacity:.4">${t('youText')}</small>`:''}</span>
        <span class="f-pts" style="color:${clr}">${s}</span>
      </div>`;
  }
  html += '</div>';
  
  document.getElementById('finalList').innerHTML = html;
  document.getElementById('btnRestart').style.display=state.host===myId?'':'none';
}
function restartGame(){ 
  socket.emit('game:restart',{roomCode:myRoomCode}); 
}
function goHome(){
  myRoomCode=null;
  gameState=null;
  show('Home');
  // Reset active menu class to Home
  document.querySelectorAll('.dash-sidebar .nav-item').forEach(item => item.classList.remove('active'));
  const homeTab = document.querySelector('.dash-sidebar .nav-item[onclick*="home"]');
  if (homeTab) homeTab.classList.add('active');
}

function changeSidebarTab(el, tabName) {
  if (!el) {
    el = document.querySelector(`.dash-sidebar .nav-item[onclick*="'${tabName}'"]`) || 
         document.querySelector(`.dash-sidebar .nav-item[onclick*='"${tabName}"']`);
  }
  document.querySelectorAll('.dash-sidebar .nav-item').forEach(item => item.classList.remove('active'));
  if (el) el.classList.add('active');

  if (tabName === 'home') {
    goHome();
  } else if (tabName === 'play') {
    quickGame();
  } else if (tabName === 'rooms') {
    show('Rooms');
    loadCommunityListBrowse();
  } else if (tabName === 'ranks') {
    show('Ranks');
  } else if (tabName === 'tasks') {
    show('Tasks');
  } else if (tabName === 'collection') {
    show('Collection');
  } else if (tabName === 'stats') {
    show('Stats');
  } else if (tabName === 'help') {
    openModal('modalHelp');
    // Remove active class from help since it's a modal, not a screen
    el.classList.remove('active');
  }
}

socket.on('room:joined',({roomCode,playerId})=>{ myId=playerId; myRoomCode=roomCode; });
socket.on('game:state', state => {
  gameState = state; updateSidebar(state);
  
  const amIViewer = (state.viewers || []).includes(myId);
  const streamerMode = state.streamerMode === true;

  // For viewers in streamer mode, show them showcase/spectator depending on phase
  if (streamerMode && amIViewer) {
    if (state.state === 'lobby') {
      show('Lobby'); renderLobby(state);
      return;
    }
    if (state.state === 'showcase') {
      // Viewers can watch and vote
      show('Showcase'); renderShowcase(state);
      return;
    }
    if (state.state === 'round_summary') {
      show('RoundSummary'); renderRoundSummary(state, state.roundVoteTotals||{}); return;
    }
    if (state.state === 'gameover') {
      show('Gameover'); renderGameover(state); return;
    }
    // During writing/topic phases, show viewer waiting screen
    show('Spectator');
    const msg = document.getElementById('spectatorMsg');
    if (msg) msg.textContent = (myLang === 'tr' ? 'Oyuncular capslarını hazırlıyor, oylama için bekleyin...' : 'Players are creating captions, wait for voting...');
    return;
  }

  const isSpectator = state.state !== 'lobby' && state.state !== 'gameover' && state.state !== 'round_summary' && !state.activePlayers.includes(myId) && !amIViewer;
  
  if (isSpectator) {
    show('Spectator');
    return;
  }

  switch(state.state){
    case 'lobby': show('Lobby'); renderLobby(state); break;
    case 'topic_writing': 
      show('Topic');
      hasSubmittedTopic = false;
      document.getElementById('topicText').value = '';
      document.getElementById('topicText').disabled = false;
      document.getElementById('btnSubmitTopic').disabled = false;
      document.getElementById('topicControlsCard').style.display = 'block';
      document.getElementById('topicWaitingCard').style.display = 'none';
      break;
    case 'media_selection':
      show('MediaSelection');
      hasSubmittedMedia = false;
      clearMediaPreview();
      document.getElementById('mediaInitialButtons').style.display = 'flex';
      document.getElementById('mediaControlsCard').style.display = 'block';
      document.getElementById('mediaWaitingCard').style.display = 'none';
      break;
    case 'writing': show('Writing'); renderWriting(state); break;
    case 'king_ranking': 
      if (myId === state.kingId) { show('KingRanking'); renderKingRanking(state); }
      else { show('KingWaiting'); }
      break;
    case 'reveal': show('KingReveal'); renderKingReveal(state); break;
    case 'showcase': show('Showcase'); renderShowcase(state); break;
    case 'round_summary': show('RoundSummary'); renderRoundSummary(state, state.roundVoteTotals||{}); break;
    case 'gameover': show('Gameover'); renderGameover(state); break;
  }
});

socket.on('room_users_update', (players) => {
  if (gameState) {
    gameState.players = players;
    if (gameState.state === 'lobby') {
      renderLobby(gameState);
      const searchInput = document.getElementById('playerSearchInput');
      if (searchInput && searchInput.value) {
        filterPlayersGrid(searchInput.value);
      }
    }
  }
});

socket.on('game:playerTrashExplosion', (trashedPlayers) => {
  const audio = new Audio('/sounds/explosion.mp3');
  audio.volume = 0.25;
  audio.play().catch(e => console.warn('Audio play prevented', e));

  trashedPlayers.forEach(tp => {
    const card = document.querySelector(`.summary-meme-card[data-player-id="${tp.playerId}"]`);
    if (card) {
      const overlay = document.createElement('div');
      overlay.className = 'trash-overlay';
      overlay.innerHTML = `
        <div class="trash-text">ÇÖPLENDİ!</div>
        <div class="trash-pts">${tp.penalty} Puan</div>
      `;
      card.appendChild(overlay);
      
      setTimeout(() => {
        if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 2500);
    }
  });
});

socket.on('game:showcase_trashed', ({ penalty }) => {
  const audio = new Audio('https://www.myinstants.com/media/sounds/metal-pipe-clang.mp3');
  audio.volume = 0.25;
  audio.play().catch(e => console.warn('Audio play prevented', e));
  
  const container = document.getElementById('showcaseContainer');
  if (container) {
    const overlay = document.createElement('div');
    overlay.className = 'trash-overlay';
    overlay.style.borderRadius = '12px'; // showcase border radius
    overlay.innerHTML = `
      <div class="trash-text">ÇÖPLENDİ!</div>
      <div class="trash-pts">${penalty} Puan</div>
    `;
    container.appendChild(overlay);
    
    setTimeout(() => {
      if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 4000);
  }
});

socket.on('game:timer',({timeLeft,phase,max,speedBoost})=>{
  if(timeLeft === 0) {
    if (typeof playBellSound === 'function') playBellSound();
  }
  if(phase==='writing'){
    document.getElementById('wTimerNum').textContent=timeLeft; document.getElementById('wBar').style.width=(timeLeft/max*100)+'%';
    if(speedBoost){ document.getElementById('wBar').classList.add('boosted'); document.getElementById('wTimerNum').classList.add('boosted'); }
  } else if(phase==='topic_writing'){
    document.getElementById('tTimerNum').textContent=timeLeft; document.getElementById('tBar').style.width=(timeLeft/max*100)+'%';
  } else if(phase==='media_selection'){
    document.getElementById('msTimerNum').textContent=timeLeft; document.getElementById('msBar').style.width=(timeLeft/max*100)+'%';
  } else if(phase==='showcase'){
    document.getElementById('scTimerNum').textContent=timeLeft; document.getElementById('scBar').style.width=(timeLeft/max*100)+'%';
  } else if(phase==='king_ranking'){
    document.getElementById('krTimerNum').textContent=timeLeft; document.getElementById('krBar').style.width=(timeLeft/max*100)+'%';
  }
});
socket.on('game:submitted_count',({count,total})=>{
  const b=document.getElementById('submitCountBadge'); if(b) { b.style.display=''; b.textContent=count+'/'+total+' '+t('ready'); }
});
socket.on('game:speed_boost', ({active}) => {
  if (!active) return;
  document.getElementById('speedBadge').classList.add('active'); document.getElementById('wBar').classList.add('boosted');
  document.getElementById('wTimerNum').classList.add('boosted'); toast(t('toastSpeedBoost'));
});

socket.on('game:your_meme',({meme,topic,remaining})=>{
  myMeme=meme; 
  const topicBanner = document.getElementById('writingTopicBanner');
  if (topic) {
    document.getElementById('wAssignedTopic').textContent = topic.text || topic;
    topicBanner.style.display = 'block';
  } else {
    topicBanner.style.display = 'none';
  }

  renderWritingMedia(meme.url, () => {
    const cap = document.getElementById('captionText').value;
    const drag = document.getElementById('captionDrag'); 
    if (drag) drag.textContent = cap.trim() ? cap.toLocaleUpperCase('tr-TR') : '';
  });
  if(remaining!==undefined){
    changeRemaining=remaining; const badge=document.getElementById('changeCountBadge');
    if(remaining<=0){ document.getElementById('btnChange').disabled=true; document.getElementById('btnChange').textContent=t('noRightsLeft'); badge.style.display='none'; }
    else { badge.textContent=remaining+' '+t('rightsLeft'); }
  }
});



socket.on('game:your_meme_hand', ({memes, topic, remaining}) => {
  myMeme = memes[0]; // Varsayılan olarak ilkini seç
  window.selectedMemeForHunter = memes[0];
  
  const topicBanner = document.getElementById('writingTopicBanner');
  if (topic) {
    document.getElementById('wAssignedTopic').textContent = topic.text || topic;
  }
  topicBanner.style.display = 'none';

  const container = document.getElementById('memeHandContainer');
  if (container) {
    container.style.display = 'flex';
    container.innerHTML = '';
    memes.forEach((m, idx) => {
      const isVideo = /\.(mp4|webm|mov)$/i.test(m.url) || (typeof m.url === 'string' && m.url.startsWith('data:video/'));
      
      if (isVideo) {
        // Video için: canvas ile ilk kareyi çıkar, img olarak göster
        const el = document.createElement('img');
        el.className = 'meme-hand-item' + (idx === 0 ? ' active' : '');
        el.style.background = '#222';
        
        // Gizli video ile ilk kareyi çek
        const tempVid = document.createElement('video');
        tempVid.muted = true;
        tempVid.playsInline = true;
        tempVid.preload = 'auto';
        tempVid.src = m.url;
        tempVid.addEventListener('loadeddata', () => {
          tempVid.currentTime = 0.1;
        }, {once: true});
        tempVid.addEventListener('seeked', () => {
          try {
            const cvs = document.createElement('canvas');
            cvs.width = tempVid.videoWidth || 320;
            cvs.height = tempVid.videoHeight || 240;
            cvs.getContext('2d').drawImage(tempVid, 0, 0, cvs.width, cvs.height);
            el.src = cvs.toDataURL('image/jpeg', 0.8);
          } catch(e) { /* tarayıcı izin vermezse boş kalır */ }
          tempVid.src = '';
          tempVid.load();
        }, {once: true});
        
        el.onclick = () => {
          container.querySelectorAll('.meme-hand-item').forEach(c => c.classList.remove('active'));
          el.classList.add('active');
          myMeme = m;
          window.selectedMemeForHunter = m;
          renderWritingMedia(m.url);
          const drag = document.getElementById('captionDrag'); 
          if (drag) drag.textContent = (topic && topic.text) ? topic.text.toLocaleUpperCase('tr-TR') : (topic ? topic.toLocaleUpperCase('tr-TR') : '');
        };
        container.appendChild(el);
      } else {
        // Resim için: normal img
        const el = document.createElement('img');
        el.className = 'meme-hand-item' + (idx === 0 ? ' active' : '');
        el.src = m.url;
        el.onclick = () => {
          container.querySelectorAll('.meme-hand-item').forEach(c => c.classList.remove('active'));
          el.classList.add('active');
          myMeme = m;
          window.selectedMemeForHunter = m;
          renderWritingMedia(m.url);
          const drag = document.getElementById('captionDrag'); 
          if (drag) drag.textContent = (topic && topic.text) ? topic.text.toLocaleUpperCase('tr-TR') : (topic ? topic.toLocaleUpperCase('tr-TR') : '');
        };
        container.appendChild(el);
      }
    });
  }

  renderWritingMedia(memes[0].url);
  const drag = document.getElementById('captionDrag'); 
  if (drag) drag.textContent = (topic && topic.text) ? topic.text.toLocaleUpperCase('tr-TR') : (topic ? topic.toLocaleUpperCase('tr-TR') : '');

  if(remaining!==undefined){
    changeRemaining=remaining; const badge=document.getElementById('changeCountBadge');
    if(remaining<=0){ document.getElementById('btnChange').disabled=true; document.getElementById('btnChange').textContent=t('noRightsLeft'); badge.style.display='none'; }
    else { badge.textContent=remaining+' '+t('rightsLeft'); }
  }
});

socket.on('error',({msg})=>{
  const map={room_not_found:t('roomNotFound'),game_started:t('gameStarted'),room_full:t('roomFull'),wrong_password:t('wrongPassword'),need_more_players:t('needMorePlayers'),already_changed:t('alreadyChanged'),kicked:t('kicked'),banned:t('banned'),name_taken:t('nameTaken')};
  if(msg==='wrong_password') openModal('modalJoin'); else toast(map[msg]||msg);
  if(msg==='kicked' || msg==='banned') goHome();
});

document.body.classList.add('home-active');
setLang(myLang);

// Initialize username sync & storage
const savedName = localStorage.getItem('gs_username') || '';
const nameInput = document.getElementById('inputName');
if (nameInput) {
  nameInput.value = savedName;
  nameInput.addEventListener('input', (e) => {
    const val = e.target.value;
    localStorage.setItem('gs_username', val);
  });
}

// Fetch active rooms on start & periodically
socket.emit('community:list');
setInterval(() => {
  if (document.getElementById('sHome').classList.contains('active')) {
    socket.emit('community:list');
  }
}, 15000);

function updateCaptionSize() {
  const overlay = document.getElementById('captionOverlay');
  if (!overlay) return;
  overlay.style.containerType = 'inline-size';

  const val = document.getElementById('captionSizeSlider').value;
  const drag = document.getElementById('captionDrag');
  if (drag) drag.style.fontSize = (val * 2.5) + 'cqw';
  
  const slider2 = document.getElementById('captionSizeSlider2');
  const drag2 = document.getElementById('captionDrag2');
  if (drag2 && slider2) drag2.style.fontSize = (slider2.value * 2.5) + 'cqw';
  
  const slider3 = document.getElementById('captionSizeSlider3');
  const drag3 = document.getElementById('captionDrag3');
  if (drag3 && slider3) drag3.style.fontSize = (slider3.value * 2.5) + 'cqw';
}

const dragEls = [document.getElementById('captionDrag'), document.getElementById('captionDrag2'), document.getElementById('captionDrag3')];
const overlayEl = document.getElementById('captionOverlay');
let isDragging = false;
let activeDragEl = null;
let startX, startY, startLeft, startTop;

dragEls.forEach(el => {
  if(el) {
    el.addEventListener('mousedown', dragStart);
    el.addEventListener('touchstart', dragStart, {passive:false});
  }
});

if(overlayEl) {
  overlayEl.style.containerType = 'inline-size';
  
  document.addEventListener('mousemove', dragMove);
  document.addEventListener('touchmove', dragMove, {passive:false});
  document.addEventListener('mouseup', dragEnd);
  document.addEventListener('touchend', dragEnd);
}

function dragStart(e) {
  const target = e.target;
  if (!target || target.textContent.trim() === '') return;
  activeDragEl = target;
  isDragging = true;
  const evt = e.touches ? e.touches[0] : e;
  startX = evt.clientX; startY = evt.clientY;
  startLeft = activeDragEl.offsetLeft; startTop = activeDragEl.offsetTop;
}
function dragMove(e) {
  if (!isDragging || !activeDragEl) return;
  e.preventDefault();
  const evt = e.touches ? e.touches[0] : e;
  let dx = evt.clientX - startX;
  let dy = evt.clientY - startY;
  
  let newLeft = startLeft + dx;
  let newTop = startTop + dy;
  
  const pRect = overlayEl.getBoundingClientRect();
  const dRect = activeDragEl.getBoundingClientRect();
  const hw = dRect.width / 2;
  
  if (newLeft < hw) newLeft = hw;
  if (newLeft > pRect.width - hw) newLeft = pRect.width - hw;
  if (newTop < 0) newTop = 0;
  if (newTop > pRect.height - dRect.height) newTop = pRect.height - dRect.height;
  
  activeDragEl.style.left = newLeft + 'px';
  activeDragEl.style.top = newTop + 'px';
}
function dragEnd() {
  isDragging = false;
  activeDragEl = null;
}

window.kickPlayer = function(id) {
  if (confirm(t('confirmKick'))) {
    socket.emit('room:kick', { roomCode: myRoomCode, targetId: id });
  }
};

window.banPlayer = function(id) {
  if (confirm(t('confirmBan'))) {
    socket.emit('room:ban', { roomCode: myRoomCode, targetId: id });
  }
};

// ── Keyboard vote shortcuts for streamer chat mode (1/2/3) ──
document.addEventListener('keydown', (e) => {
  if (!gameState || gameState.state !== 'showcase') return;
  if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
  if (!gameState.streamerMode) return;
  if (e.key === '1') castVote('like');
  else if (e.key === '2') castVote('neutral');
  else if (e.key === '3') castVote('dislike');
});

// Socket: streamer settings updated by host
socket.on('room:streamer_update', (data) => {
  if (gameState) {
    gameState.streamerMode = data.streamerMode;
    gameState.streamerOption = data.streamerOption;
    gameState.viewers = data.viewers;
    if (gameState.state === 'lobby') renderLobby(gameState);
  }
});

// --- Sound Effects ---
let audioCtx;
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playClickSound() {
  try {
    initAudio();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
  } catch(e){}
}

function playBellSound() {
  try {
    initAudio();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); 
    oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 1.0);
    
    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.0);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 1.0);
  } catch(e){}
}

// Trigger audio init on first user interaction to bypass browser autoplay policy
document.addEventListener('click', () => {
  initAudio();
}, { once: true });

document.addEventListener('click', (e) => {
  const target = e.target.closest('button, .btn, .nav-item, .mode-card, .slider-play-btn, .new-card-btn, [onclick]');
  if (target) {
    playClickSound();
  }
});
// --------------------

window.openFolderUploadModal = function() {
  document.getElementById('uploadPackName').value = '';
  document.getElementById('modalUploadFolder').style.display = 'flex';
};

document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('uploadDropZone');
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const fileInput = document.getElementById('packUploadInput');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        fileInput.dispatchEvent(new Event('change'));
      }
    });
  }
});

window.handlePackFolderUpload = async function(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  const rawName = document.getElementById('uploadPackName').value.trim();
  const firstPath = files[0].webkitRelativePath || '';
  const folderName = rawName || firstPath.split('/')[0] || 'YeniPaket';
  
  if (availablePacks && availablePacks.some(p => p.id.toLowerCase() === folderName.toLowerCase())) {
    toast(window.myLang === 'tr' ? 'Bu isimde bir paket zaten var! Başka bir isim girin.' : 'Pack name already exists!');
    e.target.value = '';
    return;
  }
  
  let validFiles = [];
  let totalSize = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (/\.(jpg|jpeg|png|gif|webp|mp4|webm)$/i.test(f.name)) {
      validFiles.push(f);
      totalSize += f.size;
    }
  }

  if (totalSize > 150 * 1024 * 1024) {
    toast(window.myLang === 'tr' ? 'Klasör boyutu çok büyük! En fazla 150 MB yükleyebilirsiniz.' : 'Folder size too large! Max 150 MB allowed.');
    e.target.value = '';
    return;
  }

  if (validFiles.length === 0) {
    toast(window.myLang === 'tr' ? 'Klasörde uygun resim/video bulunamadı!' : 'No valid images/videos found in folder!');
    e.target.value = '';
    return;
  }

  toast(window.myLang === 'tr' ? `Paket yükleniyor (${validFiles.length} dosya)...` : `Uploading pack (${validFiles.length} files)...`);
  closeModal('modalUploadFolder');
  
  const formData = new FormData();
  formData.append('packName', folderName);
  validFiles.forEach(f => formData.append('files', f));

  try {
    const res = await fetch('/api/upload-pack', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      toast(window.myLang === 'tr' ? 'Paket başarıyla yüklendi!' : 'Pack uploaded successfully!');
      setTimeout(() => {
        const packEl = document.getElementById('setting_memePack');
        if (packEl) {
          packEl.value = data.packId;
          updateSetting('memePack', data.packId);
        }
        closeModal('modalPackSelect');
        if(window.renderModalPacks) renderModalPacks(document.getElementById('packSearchInput').value.toLowerCase());
      }, 500);
    } else {
      toast('Hata: ' + (data.error || 'Bilinmeyen hata'));
    }
  } catch (err) {
    console.error(err);
    toast(window.myLang === 'tr' ? 'Yükleme hatası!' : 'Upload error!');
  }
  e.target.value = '';
};

// --- KING LONG LIVE LOGIC ---
let kingRankSelections = {}; // slot -> subIdx

function setKing(pid) {
  if (myId !== gameState.host) return;
  socket.emit('room:set_king', { roomCode: myRoomCode, targetId: pid });
  if (pid === null) {
    const div = document.getElementById('kingManualPick');
    if (div) div.style.display = 'none';
  }
}

function showKingManualPick() {
  const div = document.getElementById('kingManualPick');
  div.style.display = div.style.display === 'none' ? 'flex' : 'none';
}

function updateKingManualPickUI(players) {
  const div = document.getElementById('kingManualPick');
  if(!div) return;
  div.innerHTML = players.map(p => {
    const isSel = gameState && gameState.kingId === p.id;
    return `<button class="king-player-pick-btn ${isSel?'active':''}" onclick="setKing('${p.id}')">${esc(p.name)}</button>`;
  }).join('');
}



// Quick theme initialize to prevent FOUC
  const savedTheme = localStorage.getItem('gs_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const target = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', target);
    localStorage.setItem('gs_theme', target);
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = target === 'dark' ? '🌙' : '☀️';
  }
  
  window.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = localStorage.getItem('gs_theme') === 'light' ? '☀️' : '🌙';
  });
