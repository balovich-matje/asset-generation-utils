const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const projectsDir = path.join(__dirname, '..', '..', 'projects');

function getAnimDir(projectId) {
    const dir = path.join(projectsDir, projectId, 'animations');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function readProject(projectId) {
    const file = path.join(projectsDir, projectId, 'project.json');
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

// GET /api/projects/:id/animations — list all saved animations
router.get('/:id/animations', (req, res) => {
    const project = readProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const dir = getAnimDir(req.params.id);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const animations = files.map(f => {
        const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
        return data;
    });
    res.json(animations);
});

// GET /api/projects/:id/animations/:name — get a specific animation
router.get('/:id/animations/:name', (req, res) => {
    const file = path.join(getAnimDir(req.params.id), `${req.params.name}.json`);
    if (!fs.existsSync(file)) {
        return res.status(404).json({ error: 'Animation not found' });
    }
    res.json(JSON.parse(fs.readFileSync(file, 'utf-8')));
});

// POST /api/projects/:id/animations — create or update an animation
//
// Body format:
// {
//   "name": "attack",
//   "description": "Left arm swings sword forward",
//   "speed": 1,
//   "loop": true,
//   "steps": [
//     {
//       "target": "left_arm",       — part name from manifest
//       "angle": -30,               — any Phaser tween property
//       "x": "+=10",                — relative values supported
//       "y": 50,
//       "scaleX": 1.2,
//       "scaleY": 1.0,
//       "alpha": 0.5,
//       "duration": 200,            — ms
//       "delay": 0,                 — ms, wait before starting
//       "ease": "Sine.easeInOut",   — Phaser easing
//       "yoyo": false,
//       "repeat": 0,                — -1 for infinite
//       "hold": 0                   — ms to hold at end before yoyo
//     }
//   ]
// }
router.post('/:id/animations', (req, res) => {
    const project = readProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { name, steps, description, speed, loop } = req.body;
    if (!name || !steps || !Array.isArray(steps)) {
        return res.status(400).json({ error: 'name and steps[] required' });
    }

    const anim = {
        name,
        description: description || '',
        speed: speed || 1,
        loop: loop !== undefined ? loop : true,
        steps,
        updatedAt: new Date().toISOString()
    };

    const file = path.join(getAnimDir(req.params.id), `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(anim, null, 2));

    res.json({ success: true, animation: anim });
});

// DELETE /api/projects/:id/animations/:name
router.delete('/:id/animations/:name', (req, res) => {
    const file = path.join(getAnimDir(req.params.id), `${req.params.name}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    res.json({ success: true });
});

module.exports = router;
