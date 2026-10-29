const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'database.json');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

let db = {
  users: [
    { username: 'Léo A', password: 'Poiscaildu20', role: 'creator' },
    { username: 'Joueur1', password: '123', role: 'player' }
  ],
  tournaments: [],
  history: []
};

if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!db.history) db.history = [];
  } catch (err) {
    console.error("Erreur lecture DB", err);
  }
}

function saveData() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
  if (user) res.json({ success: true, user: { username: user.username, role: user.role } });
  else res.status(401).json({ success: false, message: 'Identifiants incorrects' });
});

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ success: false, message: 'Pseudo déjà pris' });
  }
  const newUser = { username, password, role: 'player' };
  db.users.push(newUser);
  saveData();
  res.json({ success: true, user: { username: newUser.username, role: newUser.role } });
});

app.get('/api/users', (req, res) => res.json(db.users));
app.delete('/api/users/:username', (req, res) => {
  if (req.params.username === 'Léo A') return res.status(403).json({ success: false });
  db.users = db.users.filter(u => u.username !== req.params.username);
  saveData();
  res.json({ success: true, users: db.users });
});
app.put('/api/users/:username/password', (req, res) => {
  const user = db.users.find(u => u.username === req.params.username);
  if (!user) return res.status(404).json({ success: false });
  user.password = req.body.newPassword;
  saveData();
  res.json({ success: true });
});

app.get('/api/tournaments', (req, res) => res.json(db.tournaments));
app.get('/api/history', (req, res) => res.json(db.history));

app.post('/api/tournaments', (req, res) => {
  const { name, format, min, max, groupSize, qualifiersPerGroup, allowBestThirds, creator } = req.body;
  if (creator !== 'Léo A') return res.status(403).json({ success: false });

  const newTourney = {
    id: Date.now(),
    name, format,
    min: parseInt(min), max: parseInt(max),
    groupSize: parseInt(groupSize) || 4,
    qualifiersPerGroup: parseInt(qualifiersPerGroup) || 2,
    allowBestThirds: !!allowBestThirds,
    players: [], groups: [], status: 'draft', matches: [], finalRanking: []
  };
  db.tournaments.push(newTourney);
  saveData();
  res.json({ success: true, tournament: newTourney });
});

app.post('/api/tournaments/:id/join', (req, res) => {
  const tourney = db.tournaments.find(t => t.id == req.params.id);
  if (!tourney || tourney.status !== 'draft') return res.status(400).json({ success: false });
  if (!tourney.players.includes(req.body.username) && tourney.players.length < tourney.max) {
    tourney.players.push(req.body.username);
    saveData();
  }
  res.json({ success: true, tournament: tourney });
});

app.post('/api/tournaments/:id/leave', (req, res) => {
  const tourney = db.tournaments.find(t => t.id == req.params.id);
  if (!tourney) return res.status(404).json({ success: false });
  tourney.players = tourney.players.filter(p => p !== req.body.username);
  saveData();
  res.json({ success: true, tournament: tourney });
});

app.post('/api/tournaments/:id/kick', (req, res) => {
  if (req.body.creator !== 'Léo A') return res.status(403).json({ success: false });
  const tourney = db.tournaments.find(t => t.id == req.params.id);
  tourney.players = tourney.players.filter(p => p !== req.body.playerToKick);
  saveData();
  res.json({ success: true, tournament: tourney });
});

app.put('/api/tournaments/:id', (req, res) => {
  if (req.body.creator !== 'Léo A') return res.status(403).json({ success: false });
  const tourney = db.tournaments.find(t => t.id == req.params.id);
  Object.assign(tourney, req.body);
  saveData();
  res.json({ success: true, tournament: tourney });
});

app.delete('/api/tournaments/:id', (req, res) => {
  if (req.body.creator !== 'Léo A') return res.status(403).json({ success: false });
  db.tournaments = db.tournaments.filter(t => t.id != req.params.id);
  saveData();
  res.json({ success: true });
});

app.post('/api/tournaments/:id/setup-groups', (req, res) => {
  if (req.body.creator !== 'Léo A') return res.status(403).json({ success: false });
  const tourney = db.tournaments.find(t => t.id == req.params.id);
  const shuffled = [...tourney.players].sort(() => 0.5 - Math.random());
  const nbGroups = Math.ceil(shuffled.length / tourney.groupSize);
  tourney.groups = [];
  for (let i = 0; i < nbGroups; i++) {
    tourney.groups.push({ name: `Poule ${String.fromCharCode(65 + i)}`, players: shuffled.slice(i * tourney.groupSize, (i + 1) * tourney.groupSize) });
  }
  saveData();
  res.json({ success: true, tournament: tourney });
});

app.post('/api/tournaments/:id/start', (req, res) => {
  if (req.body.creator !== 'Léo A') return res.status(403).json({ success: false });
  const tourney = db.tournaments.find(t => t.id == req.params.id);
  tourney.status = tourney.format === 'league' ? 'active_league' : 'active_groups';
  tourney.matches = [];
  if (tourney.format === 'league') {
    for (let i = 0; i < tourney.players.length; i++) {
      for (let j = i + 1; j < tourney.players.length; j++) {
        tourney.matches.push({ id: Date.now() + Math.random(), stage: 'Championnat', p1: tourney.players[i], p2: tourney.players[j], s1: null, s2: null });
      }
    }
  } else {
    tourney.groups.forEach(g => {
      for (let i = 0; i < g.players.length; i++) {
        for (let j = i + 1; j < g.players.length; j++) {
          tourney.matches.push({ id: Date.now() + Math.random(), stage: g.name, p1: g.players[i], p2: g.players[j], s1: null, s2: null });
        }
      }
    });
  }
  saveData();
  res.json({ success: true, tournament: tourney });
});

app.post('/api/tournaments/:id/close-groups', (req, res) => {
  if (req.body.creator !== 'Léo A') return res.status(403).json({ success: false });
  const tourney = db.tournaments.find(t => t.id == req.params.id);
  tourney.status = 'knockout_setup';
  saveData();
  res.json({ success: true, tournament: tourney });
});

app.post('/api/tournaments/:id/create-knockout', (req, res) => {
  if (req.body.creator !== 'Léo A') return res.status(403).json({ success: false });
  const tourney = db.tournaments.find(t => t.id == req.params.id);
  tourney.status = 'active_knockout';
  req.body.matchups.forEach(m => {
    tourney.matches.push({ id: Date.now() + Math.random(), stage: m.stage, p1: m.p1, p2: m.p2, s1: null, s2: null });
  });
  saveData();
  res.json({ success: true, tournament: tourney });
});

app.post('/api/tournaments/:id/score', (req, res) => {
  if (req.body.creator !== 'Léo A') return res.status(403).json({ success: false });
  const tourney = db.tournaments.find(t => t.id == req.params.id);
  const match = tourney.matches.find(m => m.id == req.body.matchId);
  if (match) {
    match.s1 = parseInt(req.body.s1);
    match.s2 = parseInt(req.body.s2);
    saveData();
  }
  res.json({ success: true, tournament: tourney });
});

// Clôturer et archiver le tournoi
app.post('/api/tournaments/:id/finish', (req, res) => {
  if (req.body.creator !== 'Léo A') return res.status(403).json({ success: false });
  const idx = db.tournaments.findIndex(t => t.id == req.params.id);
  if (idx === -1) return res.status(404).json({ success: false });

  const tourney = db.tournaments[idx];
  tourney.status = 'finished';

  // Calcul du classement final
  let ranking = [];
  const getMatchWinner = (stageName) => {
    const m = tourney.matches.find(item => item.stage.toLowerCase().includes(stageName.toLowerCase()) && item.s1 !== null);
    if (!m) return null;
    return m.s1 > m.s2 ? m.p1 : m.p2;
  };
  const getMatchLoser = (stageName) => {
    const m = tourney.matches.find(item => item.stage.toLowerCase().includes(stageName.toLowerCase()) && item.s1 !== null);
    if (!m) return null;
    return m.s1 < m.s2 ? m.p1 : m.p2;
  };

  const winner = getMatchWinner('finale');
  const finalist = getMatchLoser('finale');
  const third = getMatchWinner('petite');
  const fourth = getMatchLoser('petite');

  if (winner) ranking.push(winner);
  if (finalist) ranking.push(finalist);
  if (third) ranking.push(third);
  if (fourth) ranking.push(fourth);

  // Ajouter les autres joueurs n'étant pas dans le top 4
  tourney.players.forEach(p => {
    if (!ranking.includes(p)) ranking.push(p);
  });

  tourney.finalRanking = ranking;
  db.history.push(tourney);
  db.tournaments.splice(idx, 1);
  saveData();

  res.json({ success: true });
});

app.listen(PORT, () => console.log(`Serveur FIFA lancé sur http://192.168.1.14`));