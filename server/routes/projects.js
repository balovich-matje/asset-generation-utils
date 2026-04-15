const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const projectsDir = path.join(__dirname, '..', '..', 'projects');

function getProjectPath(id) {
    return path.join(projectsDir, id);
}

function getProjectFile(id) {
    return path.join(getProjectPath(id), 'project.json');
}

function readProject(id) {
    const file = getProjectFile(id);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeProject(project) {
    const dir = getProjectPath(project.id);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(getProjectFile(project.id), JSON.stringify(project, null, 2));
}

// GET /api/projects — list all projects
router.get('/', (req, res) => {
    if (!fs.existsSync(projectsDir)) {
        return res.json([]);
    }
    const dirs = fs.readdirSync(projectsDir).filter(d => {
        if (d.startsWith('.')) return false;
        const stat = fs.statSync(path.join(projectsDir, d));
        return stat.isDirectory() && fs.existsSync(path.join(projectsDir, d, 'project.json'));
    });
    const projects = dirs.map(d => readProject(d)).filter(Boolean);
    projects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(projects);
});

// POST /api/projects — create a new project
router.post('/', (req, res) => {
    const { name, description } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'name is required' });
    }
    const id = uuidv4();
    const project = {
        id,
        name: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        displayName: name,
        description: description || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        generations: [],
        approvedSprite: null,
        bgRemovedSprite: null,
        parts: {}
    };

    // Create project directory structure
    const dir = getProjectPath(id);
    fs.mkdirSync(path.join(dir, 'generations'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'parts'), { recursive: true });

    writeProject(project);
    res.json(project);
});

// GET /api/projects/:id — get a single project
router.get('/:id', (req, res) => {
    const project = readProject(req.params.id);
    if (!project) {
        return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
});

// PUT /api/projects/:id — update project fields
router.put('/:id', (req, res) => {
    const project = readProject(req.params.id);
    if (!project) {
        return res.status(404).json({ error: 'Project not found' });
    }

    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
        if (key !== 'id' && key !== 'createdAt') {
            project[key] = value;
        }
    }
    project.updatedAt = new Date().toISOString();

    writeProject(project);
    res.json(project);
});

// DELETE /api/projects/:id — soft-delete (rename dir)
router.delete('/:id', (req, res) => {
    const dir = getProjectPath(req.params.id);
    if (!fs.existsSync(dir)) {
        return res.status(404).json({ error: 'Project not found' });
    }
    const trashDir = path.join(projectsDir, `.trash_${req.params.id}_${Date.now()}`);
    fs.renameSync(dir, trashDir);
    res.json({ success: true });
});

module.exports = router;
