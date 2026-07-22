const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
if (ffmpegPath && fs.existsSync(ffmpegPath)) {
  ffmpeg.setFfmpegPath(ffmpegPath);
} else {
  console.warn("ffmpeg-static binary bulunamadı, sistemdeki ffmpeg kullanılacak.");
}
const rateLimit = require("express-rate-limit");
const app = express();
app.set('trust proxy', 1); // Get real IP behind Cloudflare/Nginx
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 }); // 10MB limit

// ── HTTP Rate Limiting ──
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 750, // 15 dakikada 750 istek
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Sunucu meşgul, çok fazla istek." },
  skip: (req, res) => {
    // Medya ve statik dosyaları atla
    if (req.path.includes('/memes/') || req.path.includes('/uploads/') || /\.(jpg|jpeg|png|gif|webp|mp4|webm|css|js|html)$/i.test(req.path)) {
      return true;
    }
    return false;
  }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 750,              
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "API istek limitine ulaştınız. Lütfen bekleyin." },
});

const PUBLIC_PATH = path.join(__dirname, "public");

// ── Memes Dosya Sunucu (express.static'in UTF-8 sorunlarını bypass eder) ──
app.get('/memes/:pack/:file', (req, res, next) => {
  try {
    const pack = req.params.pack;
    const file = req.params.file;
    // Güvenlik: directory traversal engelle
    if (pack.includes('..') || file.includes('..') || pack.includes('/') || file.includes('/') || pack.includes('\\') || file.includes('\\')) {
      return res.status(400).send('Bad request');
    }
    const filePath = path.join(PUBLIC_PATH, 'memes', pack, file);
    // Dosyanın PUBLIC_PATH/memes altında olduğunu doğrula
    const resolved = path.resolve(filePath);
    const memesRoot = path.resolve(path.join(PUBLIC_PATH, 'memes'));
    if (!resolved.startsWith(memesRoot)) {
      return res.status(403).send('Forbidden');
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Not found');
    }
    // Content-Type belirle
    const ext = path.extname(file).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4',
      '.webm': 'video/webm', '.mov': 'video/quicktime'
    };
    if (mimeTypes[ext]) {
      res.setHeader('Content-Type', mimeTypes[ext]);
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(resolved);
  } catch (err) {
    console.error('Meme dosya sunucu hatası:', err.message);
    next();
  }
});

app.use(express.static(PUBLIC_PATH, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    else if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
    else if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css; charset=UTF-8');
    else if (filePath.endsWith('.json')) res.setHeader('Content-Type', 'application/json; charset=UTF-8');
    
    if (/\.(mp4|webm|mov|jpg|jpeg|png|gif|webp)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

app.use(express.json({ limit: '150mb' }));
app.use(express.urlencoded({ limit: '150mb', extended: true, parameterLimit: 100000 }));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
}));

// Sadece API rotalarına genel rate limit uygula
app.use('/api/', generalLimiter);

app.get("/", (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=UTF-8');
  res.sendFile(path.join(PUBLIC_PATH, "index.html"));
});

// ── Upload ──
const UPLOAD_DIR = path.join(PUBLIC_PATH, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname).toLowerCase()),
});
const upload = multer({ storage, limits: { fileSize: 150 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, /\.(jpg|jpeg|png|gif|webp|mp4|webm)$/i.test(file.originalname)) });

app.post('/api/upload-pack', (req, res) => {
  try {
    upload.array('files')(req, res, function (err) {
      if (err) {
        return res.status(400).json({ success: false, error: err.message });
      }
      try {
        const packName = req.body.packName;
        if (!packName || !req.files || req.files.length === 0) {
          return res.status(400).json({ success: false, error: 'Pack name or files missing.' });
        }
        const safeName = slugifyPackName(packName.trim()) || 'pack_' + uuidv4().substring(0, 8);
        const packDir = path.join(PUBLIC_PATH, 'memes', safeName);
        if (fs.existsSync(packDir)) {
          return res.status(400).json({ success: false, error: 'Bu isimde bir paket zaten var.' });
        }
        fs.mkdirSync(packDir, { recursive: true });
        req.files.forEach(file => {
          const ext = path.extname(file.originalname).toLowerCase();
          const newFilename = uuidv4() + ext;
          fs.renameSync(file.path, path.join(packDir, newFilename));
        });
        loadMemePacks();
        const packData = Object.keys(memePacks).map(pn => ({
          id: pn,
          count: memePacks[pn].length,
          previews: memePacks[pn].slice(0, 4).map(m => m.url)
        }));
        io.emit("system:packs", packData);
        res.json({ success: true, packId: safeName });
      } catch (e) {
        res.status(500).json({ success: false, error: e.message || 'Bilinmeyen sunucu hatası.' });
      }
    });
  } catch (globalErr) {
    res.status(500).json({ success: false, error: 'Yükleme sırasında beklenmeyen bir hata oluştu.' });
  }
});

let memeLibrary = [];
function loadUploadedMemes() {
  if (!fs.existsSync(UPLOAD_DIR)) return;
  fs.readdirSync(UPLOAD_DIR).forEach(f => {
    if (!/\.(jpg|jpeg|png|gif|webp|mp4|webm)$/i.test(f)) return;
    const id = "u_" + f.replace(/\.[^.]+$/, "");
    if (!memeLibrary.find(m => m.id === id))
      memeLibrary.push({ id, url: "/uploads/" + f, name: f });
  });
}
loadUploadedMemes();

let memePacks = {};
let packPreviews = {};
let packDisplayNames = {}; // slug → original display name

// Türkçe karakterleri ASCII'ye çevir ve slug oluştur
function slugifyPackName(name) {
  return name
    .replace(/ü/gi, 'u').replace(/Ü/g, 'U')
    .replace(/ö/gi, 'o').replace(/Ö/g, 'O')
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/ğ/gi, 'g').replace(/Ğ/g, 'G')
    .replace(/ş/gi, 's').replace(/Ş/g, 'S')
    .replace(/ç/gi, 'c').replace(/Ç/g, 'C')
    .replace(/â/gi, 'a').replace(/î/gi, 'i').replace(/û/gi, 'u')
    .replace(/[^a-zA-Z0-9-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 80);
}

// Dosya adı URL-safe mi kontrol et (sadece ASCII alfanümerik, tire, alt çizgi, nokta)
function isFilenameSafe(filename) {
  const base = filename.replace(/\.[^.]+$/, "");
  return /^[a-zA-Z0-9._-]+$/.test(base);
}

function loadMemePacks() {
  const MEMES_DIR = path.join(PUBLIC_PATH, "memes");
  if (!fs.existsSync(MEMES_DIR)) fs.mkdirSync(MEMES_DIR, { recursive: true });
  
  // Önce mevcut verileri sıfırla
  memePacks = {};
  packPreviews = {};
  packDisplayNames = {};

  let dirs = fs.readdirSync(MEMES_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  // ── Klasör adlarını sanitize et ──
  const sanitizedDirs = [];
  dirs.forEach(originalName => {
    const slug = slugifyPackName(originalName);
    if (slug !== originalName) {
      const oldPath = path.join(MEMES_DIR, originalName);
      let newPath = path.join(MEMES_DIR, slug);
      // Çakışma varsa sonuna sayı ekle
      let finalSlug = slug;
      let counter = 2;
      while (fs.existsSync(newPath) && newPath !== oldPath) {
        finalSlug = slug + '_' + counter;
        newPath = path.join(MEMES_DIR, finalSlug);
        counter++;
      }
      if (newPath !== oldPath) {
        try {
          fs.renameSync(oldPath, newPath);
          console.log(`[Sanitize Klasör] "${originalName}" → "${finalSlug}"`);
          packDisplayNames[finalSlug] = originalName;
          sanitizedDirs.push(finalSlug);
        } catch (e) {
          console.error(`[Sanitize Klasör HATA] "${originalName}": ${e.message}`);
          sanitizedDirs.push(originalName); // Hata olursa orijinali kullan
        }
      } else {
        packDisplayNames[finalSlug] = originalName;
        sanitizedDirs.push(finalSlug);
      }
    } else {
      sanitizedDirs.push(originalName);
    }
  });

  // Sıralama: "tum memeler" veya "varsayilan" içeren en başa
  sanitizedDirs.sort((a, b) => {
    const aDisplay = (packDisplayNames[a] || a).toLowerCase();
    const bDisplay = (packDisplayNames[b] || b).toLowerCase();
    const isA = aDisplay.includes("tüm memeler") || aDisplay.includes("tm memeler") || aDisplay.includes("tum memeler") || a.toLowerCase().includes("tum_memeler");
    const isB = bDisplay.includes("tüm memeler") || bDisplay.includes("tm memeler") || bDisplay.includes("tum memeler") || b.toLowerCase().includes("tum_memeler");
    if (isA && !isB) return -1;
    if (!isA && isB) return 1;
    return a.localeCompare(b);
  });

  // ── Dosyaları oku ve gerekirse yeniden adlandır ──
  sanitizedDirs.forEach(packName => {
    const packMemes = [];
    const packPath = path.join(MEMES_DIR, packName);
    
    fs.readdirSync(packPath).forEach(f => {
      if (!/\.(jpg|jpeg|png|gif|webp|mp4|webm)$/i.test(f)) return;
      
      let actualFilename = f;
      
      // Dosya adı güvenli değilse UUID'ye dönüştür
      if (!isFilenameSafe(f)) {
        const ext = path.extname(f).toLowerCase();
        const newName = uuidv4() + ext;
        const oldFilePath = path.join(packPath, f);
        const newFilePath = path.join(packPath, newName);
        try {
          fs.renameSync(oldFilePath, newFilePath);
          actualFilename = newName;
        } catch (e) {
          console.error(`[Sanitize Dosya HATA] "${f}": ${e.message}`);
          // Hata olursa orijinal adı kullanmaya devam et (encoding ile dene)
        }
      }
      
      const id = "p_" + packName + "_" + actualFilename.replace(/\.[^.]+$/, "");
      packMemes.push({ id, url: "/memes/" + packName + "/" + actualFilename, name: actualFilename });
    });
    
    if (packMemes.length > 0) {
      memePacks[packName] = packMemes;
    }
  });

  // ── Pack önizlemeleri oluştur ──
  Object.keys(memePacks).forEach(packName => {
    const memes = memePacks[packName];
    const imageMemes = memes.filter(m => !/\.(mp4|webm|mov)$/i.test(m.url));
    const shuffled = [...imageMemes].sort(() => 0.5 - Math.random());
    const previews = shuffled.slice(0, 4).map(m => m.url);
    if (previews.length > 0) {
      let i = 0;
      while (previews.length < 4) { previews.push(previews[i]); i++; }
    } else {
      while(previews.length < 4) previews.push('');
    }
    packPreviews[packName] = previews;
  });
  
  const totalMemes = Object.values(memePacks).reduce((s, p) => s + p.length, 0);
  console.log(`[Memes] ${Object.keys(memePacks).length} paket, ${totalMemes} meme yüklendi.`);
}
loadMemePacks();

let memeReloadTimer = null;
const MEMES_DIR_GLOBAL = path.join(PUBLIC_PATH, "memes");
try {
  fs.watch(MEMES_DIR_GLOBAL, { recursive: true }, (eventType, filename) => {
    if (memeReloadTimer) clearTimeout(memeReloadTimer);
    memeReloadTimer = setTimeout(() => {
      console.log(`[Memes] Değişiklik algılandı (${filename || 'bilinmeyen dosya'}), yeniden yükleniyor...`);
      loadMemePacks();
      io.emit('server:packs_updated', { packs: Object.keys(memePacks).map(k => ({id: k, name: packDisplayNames[k] || k})), packPreviews });
    }, 3000); // 3 saniye debounce (çoklu dosya yüklemelerinde çökmeyi önler)
  });
} catch(e) {
  console.log('[Memes] Uyarı: fs.watch recursive desteklenmiyor olabilir, sadece ana klasör izlenecek.');
  fs.watch(MEMES_DIR_GLOBAL, (eventType, filename) => {
    if (memeReloadTimer) clearTimeout(memeReloadTimer);
    memeReloadTimer = setTimeout(() => {
      console.log(`[Memes] Değişiklik algılandı (${filename || 'bilinmeyen dosya'}), yeniden yükleniyor...`);
      loadMemePacks();
      io.emit('server:packs_updated', { packs: Object.keys(memePacks).map(k => ({id: k, name: packDisplayNames[k] || k})), packPreviews });
    }, 3000);
  });
}

app.post('/api/download-video-meme', apiLimiter, (req, res) => {
  const { videoUrl, caption, style, caption2, style2, caption3, style3 } = req.body;
  let parsedUrl = videoUrl;
  try {
    const u = new URL(videoUrl);
    if (u.hostname.includes('girgirsamata.com') || u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      parsedUrl = u.pathname;
    }
  } catch(e) {} // Not a full URL
  
  // URL decode if needed (e.g. %20 to space)
  parsedUrl = decodeURIComponent(parsedUrl);
  
  let inputPath = parsedUrl.startsWith('http') ? parsedUrl : path.join(PUBLIC_PATH, parsedUrl.replace(/^\//, ''));
  const outputPath = path.join(UPLOAD_DIR, `render_${Date.now()}.mp4`);
  let filters = [];
  const fontPath = path.join(__dirname, 'fonts', 'impact.ttf').replace(/\\/g, '/');

  if (caption && caption.trim() !== '...') {
    const text1 = caption.toLocaleUpperCase('tr-TR').replace(/'/g, "\\\\'").replace(/:/g, "\\\\:");
    const fontSize = Math.max(24, (style?.size || 3) * 15); 
    const xPos = `(w-text_w)/2`; const yPos = `h*${(style?.y || 5)}/100`;
    filters.push(`drawtext=text='${text1}':fontfile='${fontPath}':fontsize=${fontSize}:fontcolor=white:borderw=3:bordercolor=black:x=${xPos}:y=${yPos}`);
  }
  if (caption2 && caption2.trim() !== '...') {
    const text2 = caption2.toLocaleUpperCase('tr-TR').replace(/'/g, "\\\\'").replace(/:/g, "\\\\:");
    const fontSize = Math.max(24, (style2?.size || 3) * 15);
    const xPos = `(w-text_w)/2`; const yPos = `h*${(style2?.y || 50)}/100`;
    filters.push(`drawtext=text='${text2}':fontfile='${fontPath}':fontsize=${fontSize}:fontcolor=white:borderw=3:bordercolor=black:x=${xPos}:y=${yPos}`);
  }
  if (caption3 && caption3.trim() !== '...') {
    const text3 = caption3.toLocaleUpperCase('tr-TR').replace(/'/g, "\\\\'").replace(/:/g, "\\\\:");
    const fontSize = Math.max(24, (style3?.size || 3) * 15);
    const xPos = `(w-text_w)/2`; const yPos = `h*${(style3?.y || 80)}/100`;
    filters.push(`drawtext=text='${text3}':fontfile='${fontPath}':fontsize=${fontSize}:fontcolor=white:borderw=3:bordercolor=black:x=${xPos}:y=${yPos}`);
  }
  let command = ffmpeg(inputPath);
  if (filters.length > 0) command.videoFilters(filters);
  command.output(outputPath)
    .on('end', () => { res.download(outputPath, 'meme.mp4', () => { if(fs.existsSync(outputPath)) fs.unlinkSync(outputPath); }); })
    .on('error', (err) => { console.error('FFmpeg render hatası:', err); res.status(500).json({ error: 'Video render edilemedi: ' + (err.message || err) }); })
    .run();
});

app.post("/admin/upload", apiLimiter, upload.array("memes", 200), (req, res) => {
  const added = [];
  req.files.forEach(f => {
    const id = "u_" + f.filename.replace(/\.[^.]+$/, "");
    const entry = { id, url: "/uploads/" + f.filename, name: f.originalname };
    memeLibrary.push(entry); added.push(entry);
  });
  res.json({ ok: true, added });
});
app.delete("/admin/meme/:id", (req, res) => {
  const idx = memeLibrary.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.json({ ok: false });
  const meme = memeLibrary[idx];
  if (meme.url.startsWith("/uploads/")) {
    const fp = path.join(PUBLIC_PATH, meme.url);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  memeLibrary.splice(idx, 1);
  res.json({ ok: true });
});
app.get("/admin/memes", (req, res) => res.json(memeLibrary));

function getRandomMeme(poolMemes, usedIds = []) {
  const pool = poolMemes.filter(m => !usedIds.includes(m.id));
  const src = pool.length ? pool : poolMemes;
  if (!src.length) return { id: "error", url: "", name: "Hata: Meme Yok" };
  return src[Math.floor(Math.random() * src.length)];
}

function assignMemesForRound(room) {
  const viewers = room.viewers || [];
  const pids = Object.keys(room.players).filter(pid => !viewers.includes(pid) && !(room.gameMode === "king_long_live" && pid === room.kingId));
  const assignment = {}; const usedInRound = [];
  const selectedPackName = room.memePack && memePacks[room.memePack] ? room.memePack : Object.keys(memePacks)[0];
  const packMemes = memePacks[selectedPackName];
  
  pids.forEach(pid => {
    if (room.gameMode === "custom_mode" && room.customMedia && room.customMedia[pid]) {
      assignment[pid] = room.customMedia[pid];
    } else {
      let pool = packMemes;
      if (room.round === 1) {
        const isVideoRegex = /\.(mp4|webm|mov)$/i;
        const imagesOnly = pool.filter(m => !isVideoRegex.test(m.url));
        if (imagesOnly.length > 0) pool = imagesOnly;
      }
      const meme = getRandomMeme(pool, [...room.usedMemeIds, ...usedInRound]);
      assignment[pid] = meme; usedInRound.push(meme.id); room.usedMemeIds.push(meme.id);
    }
  });
  return assignment;
}

function assignMemeHandsForRound(room, count = 5) {
  const viewers = room.viewers || [];
  const pids = Object.keys(room.players).filter(pid => !viewers.includes(pid) && !(room.gameMode === "king_long_live" && pid === room.kingId));
  const assignment = {};
  const selectedPackName = room.memePack && memePacks[room.memePack] ? room.memePack : Object.keys(memePacks)[0];
  const packMemes = memePacks[selectedPackName];
  
  pids.forEach(pid => {
    let hand = []; let pool = [...packMemes];
    for(let i = 0; i < count; i++) {
      let available;
      if (i === 0) {
        const isVideoRegex = /\.(mp4|webm|mov)$/i;
        available = pool.filter(m => !room.usedMemeIds.includes(m.id) && !isVideoRegex.test(m.url));
        if (available.length === 0) available = pool.filter(m => !isVideoRegex.test(m.url));
      } else {
        available = pool.filter(m => !room.usedMemeIds.includes(m.id));
      }
      const src = available.length ? available : pool;
      if (!src.length) { hand.push({ id: "error", url: "", name: "Hata: Meme Yok" }); continue; }
      const rIdx = Math.floor(Math.random() * src.length); const m = src[rIdx];
      hand.push(m); room.usedMemeIds.push(m.id); pool = pool.filter(x => x.id !== m.id);
    }
    assignment[pid] = hand;
  });
  return assignment;
}

function getRoomState(room) {
  return {
    code: room.code || room.id, id: room.id || room.code,
    state: room.state, round: room.round, maxRounds: room.maxRounds,
    host: room.host, players: Object.values(room.players), scores: room.scores,
    activePlayers: (room.state === "topic_writing" || room.state === "media_selection") ? Object.keys(room.players).filter(pid => !(room.viewers || []).includes(pid)) : ((room.gameMode === "meme_hunter" && room.hands) ? Object.keys(room.hands) : (room.gameMode === "king_long_live" && room.kingId ? [...Object.keys(room.memeAssignments || {}), room.kingId] : Object.keys(room.memeAssignments || {}))),
    writingTime: room.writingTime, votingTime: room.votingTime,
    changeAllowed: room.changeAllowed, changeCount: room.changeCount,
    trashAllowed: room.trashAllowed !== undefined ? room.trashAllowed : true,
    memePack: room.memePack || "default", gameMode: room.gameMode || "classic",
    isPublic: room.isPublic, name: room.name, lang: room.lang,
    showcaseIndex: room.showcaseIndex, showcaseList: room.showcaseList,
    showcaseVotes: room.state === "showcase_result" ? room.showcaseVotes : null,
    streamerMode: room.streamerMode || false, viewers: room.viewers || [],
    trashedMemes: room.trashedMemes || {},
    kingId: room.kingId || null, kingSlots: room.kingSlots || null, kingRankings: room.kingRankings || [],
  };
}

function startTopicPhase(room, nsp) {
  room.state = "topic_writing"; room.topics = {}; room.assignedTopics = {};
  const roomId = room.code || room.id; nsp.to(roomId).emit("game:state", getRoomState(room));
  let timeLeft = 30;
  room.timer = setInterval(() => {
    timeLeft--; nsp.to(roomId).emit("game:timer", { timeLeft, phase: "topic_writing", max: 30 });
    if (timeLeft <= 0) { clearInterval(room.timer); assignTopicsAndStartWriting(room, nsp); }
  }, 1000);
}

function startMediaSelectionPhase(room, nsp) {
  room.state = "media_selection"; room.customMedia = {};
  const roomId = room.code || room.id; nsp.to(roomId).emit("game:state", getRoomState(room));
  let timeLeft = 60;
  room.timer = setInterval(() => {
    timeLeft--; nsp.to(roomId).emit("game:timer", { timeLeft, phase: "media_selection", max: 60 });
    if (timeLeft <= 0) { clearInterval(room.timer); startWritingPhase(room, nsp); }
  }, 1000);
}

function assignTopicsAndStartWriting(room, nsp) {
  const pids = Object.keys(room.players).filter(pid => !(room.viewers || []).includes(pid));
  let submittedTopics = Object.values(room.topics);
  const fallbacks = ["Uzaylıların İstilası", "Pazartesi Sendromu", "Kötü Bir Şaka", "Bitmeyen Toplantı", "Diyetin İlk Günü", "Sınav Gecesi"];
  while (submittedTopics.length < pids.length) {
    submittedTopics.push({ text: fallbacks[Math.floor(Math.random() * fallbacks.length)], authorId: "system", authorName: "Sistem" });
  }
  submittedTopics.sort(() => Math.random() - 0.5);
  pids.forEach((pid, i) => { room.assignedTopics[pid] = submittedTopics[i]; });
  startWritingPhase(room, nsp);
}

function startWritingPhase(room, nsp) {
  room.state = "writing"; room.submissions = {}; room.changes = {}; room.speedBoostActive = false;
  if (room.gameMode === "meme_hunter") {
    room.hands = assignMemeHandsForRound(room, 5); room.memeAssignments = {};
  } else {
    room.memeAssignments = assignMemesForRound(room);
  }
  const roomId = room.code || room.id; const viewers = room.viewers || [];
  const pids = Object.keys(room.players).filter(pid => !viewers.includes(pid) && !(room.gameMode === "king_long_live" && pid === room.kingId));
  nsp.to(roomId).emit("game:state", getRoomState(room));
  
  pids.forEach(pid => {
    const s = nsp.sockets.sockets ? nsp.sockets.sockets.get(pid) : null;
    const topic = room.assignedTopics ? room.assignedTopics[pid] : null;
    if (s) {
      if (room.gameMode === "meme_hunter") s.emit("game:your_meme_hand", { memes: room.hands[pid], topic, remaining: room.changeCount });
      else s.emit("game:your_meme", { meme: room.memeAssignments[pid], topic });
    }
  });

  let timeLeft = room.writingTime;
  room.timer = setInterval(() => {
    timeLeft -= room.speedBoostActive ? 2 : 1;
    nsp.to(roomId).emit("game:timer", { timeLeft, phase: "writing", max: room.writingTime, speedBoost: room.speedBoostActive });
    if (timeLeft <= 0) { clearInterval(room.timer); beginShowcase(room, nsp); }
  }, 1000);
}

function beginShowcase(room, nsp) {
  const playersInRound = room.gameMode === "meme_hunter" && room.hands ? Object.keys(room.hands) : Object.keys(room.memeAssignments || {});
  playersInRound.forEach(pid => {
    if (!room.players[pid]) return;
    if (!room.submissions[pid]) {
      let fallbackMeme = room.memeAssignments[pid] || memeLibrary[0];
      if (room.gameMode === "meme_hunter" && room.hands && room.hands[pid] && room.hands[pid].length > 0) fallbackMeme = room.hands[pid][0];
      room.submissions[pid] = {
        playerId: pid, playerName: room.players[pid].name,
        caption: room.gameMode === "meme_hunter" && room.assignedTopics && room.assignedTopics[pid] ? room.assignedTopics[pid].text.toLocaleUpperCase('tr-TR') : "...",
        style: {x: 50, y: 12, size: 3}, meme: fallbackMeme, topic: room.assignedTopics ? room.assignedTopics[pid] : null
      };
    }
  });
  room.showcaseList = Object.values(room.submissions).sort(() => Math.random() - 0.5);
  room.showcaseIndex = 0; room.roundVoteTotals = {}; room.hasTrashed = {}; room.trashVotes = {}; room.trashedMemes = {};
  room.showcaseList.forEach(s => { room.roundVoteTotals[s.playerId] = { like:0, neutral:0, dislike:0, pts:0 }; });
  
  if (room.gameMode === "king_long_live") {
    room.kingSlots = {};
    // Dinamik yuva sayısını hazırlıyoruz (Meme sayısı kadar yuva açılacak)
    for (let i = 1; i <= room.showcaseList.length; i++) {
      room.kingSlots[i] = null;
    }
  }
  startShowcaseItem(room, nsp);
}

function startShowcaseItem(room, nsp) {
  room.state = "showcase"; room.showcaseVotes = {}; room.isTrashing = false;
  const roomId = room.code || room.id; nsp.to(roomId).emit("game:state", getRoomState(room));
  let timeLeft = room.votingTime;
  room.timer = setInterval(() => {
    timeLeft--; nsp.to(roomId).emit("game:timer", { timeLeft, phase: "showcase", max: room.votingTime });
    if (timeLeft <= 0) { clearInterval(room.timer); if (!room.isTrashing) showShowcaseResult(room, nsp); }
  }, 1000);
}

function showShowcaseResult(room, nsp) {
  const sub = room.showcaseList[room.showcaseIndex];
  let pts = 0;
  if (sub && room.gameMode !== "king_long_live") {
    const totalPlayers = Object.keys(room.players).length;
    if (totalPlayers > 1) {
      const tally = { like: 0, neutral: 0, dislike: 0 };
      Object.entries(room.showcaseVotes).forEach(([voterId, v]) => {
        if (voterId === sub.playerId) return;
        tally[v]++;
      });
      const pointPerVote = 100 / (totalPlayers - 1);
      const roundScore = Math.round((tally.like - tally.dislike) * pointPerVote);
      pts = roundScore;
      let penalty = 0;
      const trashVoters = room.trashVotes && room.trashVotes[sub.playerId] ? room.trashVotes[sub.playerId].length : 0;
      if (trashVoters > totalPlayers / 2) penalty = -150;
      room.scores[sub.playerId] = (room.scores[sub.playerId] || 0) + (roundScore + penalty);
      room.roundVoteTotals[sub.playerId] = { ...tally, pts: roundScore, penalty };
    }
  }

  room.showcaseIndex++;
  if (room.showcaseIndex >= room.showcaseList.length) {
    if (room.gameMode === "king_long_live") {
      const N = room.showcaseList.length;
      Object.entries(room.kingSlots).forEach(([rank, pid]) => {
        if (pid) {
          const rankNum = parseInt(rank);
          let rankPts = 0;
          if (N <= 1) {
            rankPts = 100;
          } else {
            // Tam istediğin dinamik azalan formül (Bölme hatası engellendi)
            rankPts = Math.round(100 - ((rankNum - 1) * (100 / (N - 1))));
          }
          if (room.scores[pid] !== undefined) room.scores[pid] += rankPts;
          if (room.roundVoteTotals[pid]) room.roundVoteTotals[pid].pts = rankPts;
        }
      });
    }
    const trashedPlayers = [];
    Object.entries(room.roundVoteTotals).forEach(([targetId, result]) => {
        if (result.penalty === -150) trashedPlayers.push({ playerId: targetId, penalty: -150 });
    });
    showRoundSummary(room, nsp, trashedPlayers);
  } else {
    startShowcaseItem(room, nsp);
  }
}

function showRoundSummary(room, nsp, trashedPlayers = []) {
  const roomId = room.code || room.id;
  room.state = "round_summary";
  nsp.to(roomId).emit("game:state", { ...getRoomState(room), roundVoteTotals: room.roundVoteTotals });
  setTimeout(() => {
    if (trashedPlayers.length > 0) nsp.to(roomId).emit("game:playerTrashExplosion", trashedPlayers);
    setTimeout(() => {
      room.submissions = {}; room.showcaseList = []; room.showcaseVotes = {}; room.roundVoteTotals = {};
      room.hasTrashed = {}; room.trashVotes = {}; room.trashedMemes = {};
      if (room.hands) room.hands = {}; if (room.topics) room.topics = {};
      if (room.assignedTopics) room.assignedTopics = {}; if (room.customMedia) room.customMedia = {};
      room.round++;
      if (room.round > room.maxRounds) endGame(room, nsp);
      else {
        if (room.gameMode === "king_long_live") startWritingPhase(room, nsp);
        else if (room.gameMode === "topic_mode" || room.gameMode === "meme_hunter") startTopicPhase(room, nsp);
        else if (room.gameMode === "custom_mode") startMediaSelectionPhase(room, nsp);
        else startWritingPhase(room, nsp);
      }
    }, 8000);
  }, 100);
}

function endGame(room, nsp) {
  room.state = "gameover"; room._gameoverAt = Date.now();
  room.submissions = {}; room.showcaseList = []; room.showcaseVotes = {};
  room.hasTrashed = {}; room.trashVotes = {}; room.trashedMemes = {};
  room.memeAssignments = {}; room.usedMemeIds = [];
  if (room.hands) room.hands = {}; if (room.topics) room.topics = {};
  if (room.assignedTopics) room.assignedTopics = {}; if (room.customMedia) room.customMedia = {};
  nsp.to(room.code || room.id).emit("game:state", getRoomState(room));
}

const rooms = {}; const communityServers = {};

function makeRoomData(hostId, hostName, opts, isComm) {
  const obj = {
    host: hostId, lang: opts.lang || "tr", password: opts.password || null,
    writingTime: opts.writingTime || 60, votingTime: opts.votingTime || 30, maxRounds: opts.maxRounds || 5,
    changeAllowed: opts.changeAllowed !== undefined ? opts.changeAllowed : true,
    changeCount: opts.changeCount !== undefined ? opts.changeCount : 5, trashAllowed: true,
    memePack: opts.memePack || Object.keys(memePacks)[0] || "default", gameMode: opts.gameMode || "classic",
    maxPlayers: opts.maxPlayers || 16, players: {}, scores: {}, state: "lobby", round: 1,
    submissions: {}, changes: {}, memeAssignments: {}, topics: {}, assignedTopics: {}, customMedia: {},
    showcaseList: [], showcaseIndex: 0, showcaseVotes: {}, roundVoteTotals: {},
    usedMemeIds: [], timer: null, bannedIps: [], isPublic: !opts.password,
    streamerMode: false, viewers: [], kingId: null, kingRankings: [],
  };
  if (isComm) { obj.name = opts.name; obj.hostName = hostName; }
  obj.players[hostId] = { id: hostId, name: hostName, isHost: true };
  obj.scores[hostId] = 0;
  return obj;
}

function createRoom(hostId, hostName, opts = {}) {
  const code = Math.random().toString(36).substring(2, 7).toUpperCase();
  rooms[code] = { code, ...makeRoomData(hostId, hostName, opts, false) };
  return rooms[code];
}

function createCommunityServer(hostId, hostName, opts = {}) {
  const id = uuidv4().substring(0, 8).toUpperCase();
  communityServers[id] = { id, ...makeRoomData(hostId, hostName, opts, true) };
  return communityServers[id];
}

function getRealIp(socket) {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return socket.handshake.address;
}
const socketConnectionsPerIp = {}; 
const roomsPerIp = {}; 
const MAX_SOCKETS_PER_IP = 5; 
const MAX_EVENTS_PER_SECOND = 15;
const MAX_ROOMS_PER_IP = 4;
const MAX_GLOBAL_ROOMS = 500;

io.use((socket, next) => {
  const ip = getRealIp(socket);
  if (!socketConnectionsPerIp[ip]) socketConnectionsPerIp[ip] = 0;
  if (socketConnectionsPerIp[ip] >= MAX_SOCKETS_PER_IP) return next(new Error("Bağlantı limiti aşıldı"));
  socketConnectionsPerIp[ip]++; next();
});

io.on("connection", (socket) => {
  let eventTimestamps = []; const originalEmit = socket.onevent;
  socket.onevent = function(packet) {
    const now = Date.now(); eventTimestamps.push(now);
    eventTimestamps = eventTimestamps.filter(ts => now - ts < 1000);
    if (eventTimestamps.length > MAX_EVENTS_PER_SECOND) {
      console.warn(`[SPAM] Soket ${socket.id} bağlantısı kesiliyor.`);
      socket.disconnect(true); return;
    }
    originalEmit.call(socket, packet);
  };

  function getRoom(id) { return rooms[id] || communityServers[id]; }

  socket.on("room:create", (opts) => {
    const ip = getRealIp(socket);
    if (Object.keys(rooms).length + Object.keys(communityServers).length >= MAX_GLOBAL_ROOMS) return socket.emit("error", { msg: "Sunucu kapasitesi dolu." });
    if ((roomsPerIp[ip] || 0) >= MAX_ROOMS_PER_IP) return socket.emit("error", { msg: "Çok fazla oda kurdunuz. Lütfen biraz bekleyin." });
    roomsPerIp[ip] = (roomsPerIp[ip] || 0) + 1;
    const room = createRoom(socket.id, opts.playerName, opts); room.creatorIp = ip; socket.join(room.code);
    socket.emit("room:joined", { roomCode: room.code, playerId: socket.id });
    io.to(room.code).emit("game:state", getRoomState(room));
  });

  socket.on("room:join", ({ roomCode, playerName, password }) => {
    const room = rooms[roomCode];
    if (!room) return socket.emit("error", { msg: "room_not_found" });
    if (room.state === "gameover") return socket.emit("error", { msg: "game_started" });
    if (!room.streamerMode) {
      const activeCount = Object.keys(room.players).filter(pid => !(room.viewers || []).includes(pid)).length;
      if (activeCount >= room.maxPlayers) return socket.emit("error", { msg: "room_full" });
    }
    if (room.password && room.password !== password) return socket.emit("error", { msg: "wrong_password" });
    if (room.bannedIps && room.bannedIps.includes(getRealIp(socket))) return socket.emit("error", { msg: "banned" });
    const nameTaken = Object.values(room.players).some(p => p.name.toLocaleLowerCase('tr-TR') === playerName.toLocaleLowerCase('tr-TR'));
    if (nameTaken) return socket.emit("error", { msg: "name_taken" });
    room.players[socket.id] = { id: socket.id, name: playerName, isHost: false };
    room.scores[socket.id] = 0;
    if (room.streamerMode) { if (!room.viewers) room.viewers = []; room.viewers.push(socket.id); }
    socket.join(roomCode); socket.emit("room:joined", { roomCode: room.code, playerId: socket.id });
    io.to(roomCode).emit("game:state", getRoomState(room));
    io.to(roomCode).emit("room_users_update", Object.values(room.players));
  });

  socket.on("game:start", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.host !== socket.id) return;
    if (Object.keys(room.players).length < 2) return socket.emit("error", { msg: "need_more_players" });
    if (room.gameMode === "king_long_live") {
      const activePids = Object.keys(room.players).filter(pid => !(room.viewers || []).includes(pid));
      if (!room.kingId || !room.players[room.kingId]) room.kingId = activePids[Math.floor(Math.random() * activePids.length)];
    }
    if (room.gameMode === "topic_mode" || room.gameMode === "meme_hunter") startTopicPhase(room, io);
    else if (room.gameMode === "custom_mode") startMediaSelectionPhase(room, io);
    else startWritingPhase(room, io);
  });

  socket.on("community:list", () => {
    socket.emit("community:list", Object.values(communityServers).filter(s => s.state !== "gameover").map(s => ({ id: s.id, name: s.name, hostName: s.hostName, players: Object.keys(s.players).length, maxPlayers: s.maxPlayers, state: s.state, isPublic: s.isPublic, round: s.round, maxRounds: s.maxRounds })));
  });

  socket.on("community:create", (opts) => {
    const ip = getRealIp(socket);
    if (Object.keys(rooms).length + Object.keys(communityServers).length >= MAX_GLOBAL_ROOMS) return socket.emit("error", { msg: "Sunucu kapasitesi dolu." });
    if ((roomsPerIp[ip] || 0) >= MAX_ROOMS_PER_IP) return socket.emit("error", { msg: "Çok fazla oda kurdunuz. Lütfen biraz bekleyin." });
    roomsPerIp[ip] = (roomsPerIp[ip] || 0) + 1;
    const srv = createCommunityServer(socket.id, opts.playerName, { ...opts, name: opts.serverName || opts.playerName + "'in Sunucusu" }); srv.creatorIp = ip;
    socket.join(srv.id); socket.emit("room:joined", { roomCode: srv.id, playerId: socket.id });
    io.to(srv.id).emit("game:state", getRoomState(srv)); io.emit("community:update");
  });

  socket.on("community:join", ({ serverId, playerName, password }) => {
    const srv = communityServers[serverId];
    if (!srv) return socket.emit("error", { msg: "room_not_found" });
    if (srv.state === "gameover") return socket.emit("error", { msg: "game_started" });
    if (!srv.streamerMode) {
      const activeCount = Object.keys(srv.players).filter(pid => !(srv.viewers || []).includes(pid)).length;
      if (activeCount >= srv.maxPlayers) return socket.emit("error", { msg: "room_full" });
    }
    if (srv.password && srv.password !== password) return socket.emit("error", { msg: "wrong_password" });
    if (srv.bannedIps && srv.bannedIps.includes(getRealIp(socket))) return socket.emit("error", { msg: "banned" });
    const nameTaken = Object.values(srv.players).some(p => p.name.toLocaleLowerCase('tr-TR') === playerName.toLocaleLowerCase('tr-TR'));
    if (nameTaken) return socket.emit("error", { msg: "name_taken" });
    srv.players[socket.id] = { id: socket.id, name: playerName, isHost: false }; srv.scores[socket.id] = 0;
    if (srv.streamerMode) { if (!srv.viewers) srv.viewers = []; srv.viewers.push(socket.id); }
    socket.join(serverId); socket.emit("room:joined", { roomCode: srv.id, playerId: socket.id });
    io.to(serverId).emit("game:state", getRoomState(srv)); io.emit("community:update");
    io.to(serverId).emit("room_users_update", Object.values(srv.players));
  });

  socket.on("community:start", ({ serverId }) => {
    const srv = communityServers[serverId];
    if (!srv || srv.host !== socket.id) return;
    if (Object.keys(srv.players).length < 2) return socket.emit("error", { msg: "need_more_players" });
    if (srv.gameMode === "king_long_live") {
      const activePids = Object.keys(srv.players).filter(pid => !(srv.viewers || []).includes(pid));
      if (!srv.kingId || !srv.players[srv.kingId]) srv.kingId = activePids[Math.floor(Math.random() * activePids.length)];
    }
    if (srv.gameMode === "topic_mode" || srv.gameMode === "meme_hunter") startTopicPhase(srv, io);
    else if (srv.gameMode === "custom_mode") startMediaSelectionPhase(srv, io);
    else startWritingPhase(srv, io);
    io.emit("community:update");
  });

  socket.on("game:submit_topic", ({ roomCode, topic }) => {
    const room = getRoom(roomCode); if (!room || room.state !== "topic_writing") return;
    const player = room.players[socket.id]; if (!player || room.topics[socket.id]) return;
    if (room.gameMode === "king_long_live" && socket.id !== room.kingId) return;
    room.topics[socket.id] = { text: topic.trim().substring(0, 100), authorId: socket.id, authorName: player.name };
    if (room.gameMode === "king_long_live") { clearInterval(room.timer); assignTopicsAndStartWriting(room, io); return; }
    const submitted = Object.keys(room.topics).length;
    const total = Object.keys(room.players).filter(pid => !(room.viewers || []).includes(pid)).length;
    io.to(roomCode).emit("game:submitted_count", { count: submitted, total });
    if (submitted >= total) { clearInterval(room.timer); assignTopicsAndStartWriting(room, io); }
  });

  socket.on("game:submit_media", ({ roomCode, mediaObj }) => {
    const room = getRoom(roomCode); if (!room || room.state !== "media_selection") return;
    const player = room.players[socket.id]; if (!player || room.customMedia[socket.id]) return;
    room.customMedia[socket.id] = mediaObj;
    const submitted = Object.keys(room.customMedia).length;
    const total = Object.keys(room.players).filter(pid => !(room.viewers || []).includes(pid)).length;
    io.to(roomCode).emit("game:submitted_count", { count: submitted, total });
    if (submitted >= total) { clearInterval(room.timer); startWritingPhase(room, io); }
  });

  socket.on("game:submit", ({ roomCode, caption, style, caption2, style2, caption3, style3, selectedMeme }) => {
    const room = getRoom(roomCode); if (!room || room.state !== "writing") return;
    const player = room.players[socket.id]; if (!player || room.submissions[socket.id]) return;
    let chosenMeme = room.memeAssignments[socket.id] || memeLibrary[0];
    if (room.gameMode === "meme_hunter" && selectedMeme) chosenMeme = selectedMeme;
    room.submissions[socket.id] = {
      playerId: socket.id, playerName: player.name, caption: caption ? caption.trim().substring(0, 200) : "", style: style || null,
      caption2: caption2 ? caption2.trim().substring(0, 200) : null, style2: style2 || null,
      caption3: caption3 ? caption3.trim().substring(0, 200) : null, style3: style3 || null,
      meme: chosenMeme, topic: room.assignedTopics ? room.assignedTopics[socket.id] : null
    };
    const submitted = Object.keys(room.submissions).length;
    const total = room.gameMode === "meme_hunter" ? Object.keys(room.hands).length : Object.keys(room.memeAssignments).length;
    if (!room.speedBoostActive && submitted >= Math.ceil(total / 2)) { room.speedBoostActive = true; io.to(roomCode).emit("game:speed_boost", { active: true }); }
    io.to(roomCode).emit("game:submitted_count", { count: submitted, total });
    if (submitted >= total) { clearInterval(room.timer); beginShowcase(room, io); }
  });

  socket.on("game:change", ({ roomCode }) => {
    const room = getRoom(roomCode); if (!room || room.state !== "writing" || !room.changeAllowed || room.gameMode === "custom_mode") return;
    const used = room.changes[socket.id] || 0; if (used >= room.changeCount) return socket.emit("error", { msg: "already_changed" });
    room.changes[socket.id] = used + 1; const remaining = room.changeCount - room.changes[socket.id];
    const selectedPackName = room.memePack && memePacks[room.memePack] ? room.memePack : Object.keys(memePacks)[0];
    if (room.gameMode === "meme_hunter") {
      const packMemes = memePacks[selectedPackName]; let pool = [...packMemes]; let hand = [];
      for(let i = 0; i < 5; i++) {
        const available = pool.filter(m => !room.usedMemeIds.includes(m.id)); const src = available.length ? available : pool;
        if (!src.length) { hand.push({ id: "error", url: "", name: "Hata: Meme Yok" }); continue; }
        const rIdx = Math.floor(Math.random() * src.length); const m = src[rIdx]; hand.push(m);
        room.usedMemeIds.push(m.id); pool = pool.filter(x => x.id !== m.id);
      }
      room.hands[socket.id] = hand; socket.emit("game:your_meme_hand", { memes: hand, remaining, topic: room.assignedTopics ? room.assignedTopics[socket.id] : null });
    } else {
      const newMeme = getRandomMeme(memePacks[selectedPackName], room.usedMemeIds); room.memeAssignments[socket.id] = newMeme; room.usedMemeIds.push(newMeme.id);
      socket.emit("game:your_meme", { meme: newMeme, remaining, topic: room.assignedTopics ? room.assignedTopics[socket.id] : null });
    }
  });

  socket.on("game:speed_boost", ({ roomCode }) => {
    const room = getRoom(roomCode); if (!room || room.state !== "writing") return;
    if (room.players[socket.id]) room.speedBoostActive = true;
  });

  // ── King Mode Actions ──
  socket.on("room:set_king", ({ roomCode, targetId }) => {
    const room = getRoom(roomCode);
    if (!room || room.host !== socket.id || room.state !== "lobby") return;
    // GÜVENLİK AÇIĞI DÜZELTİLDİ: targetId'nin gerçekten odada olan biri olması doğrulanıyor
    if (targetId && !room.players[targetId]) return;
    room.kingId = targetId || null;
    io.to(roomCode).emit("game:state", getRoomState(room));
  });

  socket.on("game:king_blind_vote", ({ roomCode, vote }) => {
    const room = getRoom(roomCode);
    if (!room || room.state !== "showcase" || room.gameMode !== "king_long_live" || room.kingId !== socket.id) return;
    const sub = room.showcaseList[room.showcaseIndex]; if (!sub) return;
    
    const numMemes = room.showcaseList.length;
    // ARTIK KİLİTLENME OLMUYOR: Dinamik olarak 1 ile toplam meme sayısı arası doğrulanıyor
    if (vote >= 1 && vote <= numMemes) {
      if (!room.kingSlots[vote]) room.kingSlots[vote] = sub.playerId;
      else return; 
    }
    io.to(roomCode).emit("game:state", getRoomState(room));
    clearInterval(room.timer); showShowcaseResult(room, io);
  });

  socket.on("game:showcase_vote", ({ roomCode, vote }) => {
    const room = getRoom(roomCode); if (!room || room.state !== "showcase") return;
    if (room.showcaseVotes[socket.id]) return; room.showcaseVotes[socket.id] = vote;
    const sub = room.showcaseList[room.showcaseIndex]; const allVoters = Object.keys(room.players);
    if (room.streamerMode) { (room.viewers || []).forEach(vid => { if (!allVoters.includes(vid)) allVoters.push(vid); }); }
    const eligibleVoters = allVoters.filter(pid => pid !== sub.playerId);
    const votedCount = Object.keys(room.showcaseVotes).filter(pid => pid !== sub.playerId).length;
    if (eligibleVoters.length > 0 && votedCount >= eligibleVoters.length) { if (!room.isTrashing) { clearInterval(room.timer); showShowcaseResult(room, io); } }
  });

  socket.on("game:cast_trash_vote", ({ roomCode }) => {
    const room = getRoom(roomCode); if (!room || room.state !== "showcase" || room.trashAllowed === false) return;
    if (room.hasTrashed[socket.id]) return; const sub = room.showcaseList[room.showcaseIndex];
    if (!sub || sub.playerId === socket.id) return;
    room.hasTrashed[socket.id] = true;
    if (!room.trashVotes[sub.playerId]) room.trashVotes[sub.playerId] = [];
    room.trashVotes[sub.playerId].push(socket.id);
    const activePlayersCount = Object.keys(room.players).length;
    if (room.trashVotes[sub.playerId].length > activePlayersCount / 2) {
      if (!room.trashedMemes) room.trashedMemes = {};
      if (!room.trashedMemes[sub.playerId]) {
        room.trashedMemes[sub.playerId] = true; room.isTrashing = true;
        io.to(room.id || room.code).emit("game:showcase_trashed", { penalty: -150 });
        clearInterval(room.timer);
        setTimeout(() => { if (room.state === "showcase" && room.showcaseList[room.showcaseIndex] === sub) showShowcaseResult(room, io); }, 3000);
      }
    }
  });

  // ── Streamer Mode Handlers ──
  socket.on("room:streamer_settings", ({ roomCode, streamerMode }) => {
    const room = getRoom(roomCode); if (!room || room.host !== socket.id) return;
    // İstek Kuralları Gereği: Eğer Kral modu aktifse yayıncı modu zorla kapatılır
    if (room.gameMode === "king_long_live") { room.streamerMode = false; }
    else { room.streamerMode = !!streamerMode; }
    if (!room.viewers) room.viewers = [];
    io.to(roomCode || room.id).emit("room:streamer_update", { streamerMode: room.streamerMode, viewers: room.viewers });
    io.to(roomCode || room.id).emit("game:state", getRoomState(room));
  });

  socket.on("room:set_viewer_role", ({ roomCode, targetId, makeViewer }) => {
    const room = getRoom(roomCode); if (!room || room.host !== socket.id) return;
    if (!room.viewers) room.viewers = [];
    if (makeViewer) { 
      if (!room.viewers.includes(targetId)) room.viewers.push(targetId); 
    } else { 
      const activeCount = Object.keys(room.players).filter(pid => !room.viewers.includes(pid)).length;
      if (activeCount >= room.maxPlayers) return socket.emit("error", { msg: "room_full" });
      room.viewers = room.viewers.filter(id => id !== targetId); 
    }
    io.to(roomCode || room.id).emit("room:streamer_update", { streamerMode: room.streamerMode, viewers: room.viewers });
    io.to(roomCode || room.id).emit("game:state", getRoomState(room));
  });

  socket.on("room:update_settings", (req) => {
    const room = getRoom(req.roomCode); if (!room || room.host !== socket.id || room.state !== "lobby") return;
    if (req.maxRounds) room.maxRounds = Math.min(Math.max(+req.maxRounds || 3, 1), 12);
    if (req.writingTime) room.writingTime = Math.min(Math.max(+req.writingTime || 60, 20), 120);
    if (req.votingTime) room.votingTime = Math.min(Math.max(+req.votingTime || 20, 10), 60);
    if (req.changeAllowed !== undefined) room.changeAllowed = !!req.changeAllowed;
    if (req.changeCount !== undefined) room.changeCount = Math.min(Math.max(+req.changeCount || 1, 1), 30);
    if (req.password !== undefined) room.password = req.password || null;
    if (req.memePack !== undefined) room.memePack = req.memePack;
    if (req.gameMode !== undefined) {
      room.gameMode = req.gameMode;
      // Kral Çok Yaşa modunda yayıncı modu kilitleniyor
      if (room.gameMode === "king_long_live") room.streamerMode = false;
    }
    if (req.trashAllowed !== undefined) room.trashAllowed = !!req.trashAllowed;
    room.isPublic = !room.password;
    io.to(req.roomCode).emit("game:state", getRoomState(room));
  });

  socket.on("game:restart", ({ roomCode }) => {
    const room = getRoom(roomCode); if (!room || room.host !== socket.id) return;
    clearInterval(room.timer); room.round = 1; room.usedMemeIds = []; room.submissions = {};
    room.changes = {}; room.memeAssignments = {}; Object.keys(room.scores).forEach(k => { room.scores[k] = 0; });
    room.state = "lobby"; io.to(room.code || room.id).emit("game:state", getRoomState(room));
  });

  socket.on("system:get_packs", () => {
    const packData = Object.keys(memePacks).map(packName => ({ id: packName, previews: packPreviews[packName] || [] }));
    socket.emit("system:packs", packData);
  });
  socket.on("system:get_all_memes", () => { socket.emit("system:all_memes", memePacks); });

  socket.on("disconnect", () => {
    const ip = getRealIp(socket);
    if (socketConnectionsPerIp[ip]) { socketConnectionsPerIp[ip]--; if (socketConnectionsPerIp[ip] <= 0) delete socketConnectionsPerIp[ip]; }
    [...Object.entries(rooms), ...Object.entries(communityServers)].forEach(([code, room]) => {
      if (!room.players[socket.id]) return; const pid = socket.id;
      delete room.players[pid]; delete room.scores[pid];
      if (room.viewers) room.viewers = room.viewers.filter(id => id !== pid);
      if (room.submissions) delete room.submissions[pid]; if (room.changes) delete room.changes[pid];
      if (room.memeAssignments) delete room.memeAssignments[pid]; if (room.showcaseVotes) delete room.showcaseVotes[pid];
      if (room.hasTrashed) delete room.hasTrashed[pid]; if (room.topics) delete room.topics[pid];
      if (room.assignedTopics) delete room.assignedTopics[pid]; if (room.customMedia) delete room.customMedia[pid];
      if (room.hands) delete room.hands[pid]; if (room.roundVoteTotals) delete room.roundVoteTotals[pid];
      if (room.trashVotes) { delete room.trashVotes[pid]; Object.keys(room.trashVotes).forEach(targetId => { room.trashVotes[targetId] = room.trashVotes[targetId].filter(id => id !== pid); }); }
      if (room.trashedMemes) delete room.trashedMemes[pid];
      if (room.showcaseList) room.showcaseList = room.showcaseList.filter(s => s.playerId !== pid);
      if (Object.keys(room.players).length === 0) { 
        clearInterval(room.timer); 
        if (rooms[code]) { const ip = rooms[code].creatorIp; if (ip && roomsPerIp[ip]) roomsPerIp[ip]--; delete rooms[code]; }
        if (communityServers[code]) { const ip = communityServers[code].creatorIp; if (ip && roomsPerIp[ip]) roomsPerIp[ip]--; delete communityServers[code]; }
        return; 
      }
      if (room.host === pid) { const newHost = Object.keys(room.players)[0]; room.host = newHost; room.players[newHost].isHost = true; }
      io.to(code).emit("game:state", getRoomState(room)); if (communityServers[code]) io.emit("community:update");
      io.to(code).emit("room_users_update", Object.values(room.players));
    });
  });

  socket.on("room:kick", ({ roomCode, targetId }) => {
    const room = getRoom(roomCode); if (!room || room.host !== socket.id || socket.id === targetId) return;
    const target = io.sockets.sockets.get(targetId); if (target) { target.emit("error", { msg: "kicked" }); target.leave(roomCode || room.id); }
    delete room.players[targetId]; delete room.scores[targetId];
    io.to(roomCode || room.id).emit("game:state", getRoomState(room)); if (communityServers[room.id]) io.emit("community:update");
    io.to(roomCode || room.id).emit("room_users_update", Object.values(room.players));
  });

  socket.on("room:ban", ({ roomCode, targetId }) => {
    const room = getRoom(roomCode); if (!room || room.host !== socket.id || socket.id === targetId) return;
    if (!room.bannedIps) room.bannedIps = []; const target = io.sockets.sockets.get(targetId);
    if (target) { room.bannedIps.push(getRealIp(target)); target.emit("error", { msg: "banned" }); target.leave(roomCode || room.id); }
    delete room.players[targetId]; delete room.scores[targetId];
    io.to(roomCode || room.id).emit("game:state", getRoomState(room)); if (communityServers[room.id]) io.emit("community:update");
    io.to(roomCode || room.id).emit("room_users_update", Object.values(room.players));
  });
});

setInterval(() => {
  const now = Date.now();
  [rooms, communityServers].forEach(store => {
    Object.entries(store).forEach(([code, room]) => {
      if (Object.keys(room.players).length === 0) { clearInterval(room.timer); delete store[code]; return; }
      if (room.state === "gameover") { if (!room._gameoverAt) room._gameoverAt = now; else if (now - room._gameoverAt > 5 * 60 * 1000) { clearInterval(room.timer); delete store[code]; } return; }
      if (!room._lastStateChange) { room._lastStateChange = now; room._lastState = room.state; } else if (room.state !== room._lastState) { room._lastStateChange = now; room._lastState = room.state; } else if (room.state !== "lobby" && now - room._lastStateChange > 10 * 60 * 1000) {
        clearInterval(room.timer); room.state = "lobby"; room.round = 1; room.usedMemeIds = []; room.submissions = {}; room.changes = {}; room.memeAssignments = {}; Object.keys(room.scores).forEach(k => { room.scores[k] = 0; }); io.to(code).emit("game:state", getRoomState(room));
      }
    });
  });
  Object.keys(socketConnectionsPerIp).forEach(ip => { if (socketConnectionsPerIp[ip] <= 0) delete socketConnectionsPerIp[ip]; });
}, 60 * 1000);

const PORT = process.env.PORT || 3000;

app.use((err, req, res, next) => {
  console.error("Global error handler:", err);
  if (err instanceof multer.MulterError || err.message === 'File too large' || err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: "Yükleme çok büyük. Dosya limitlerini kontrol edin." });
  }
  res.status(500).json({ success: false, error: err.message || "Sunucu hatası" });
});
server.listen(PORT, () => console.log(`MemeWar running on http://localhost:${PORT}`));
app.get(/.*/, (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    res.sendFile(path.join(PUBLIC_PATH, 'index.html'));
});