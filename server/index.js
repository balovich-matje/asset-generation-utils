const express = require('express');
const path = require('path');
const fs = require('fs');

const configPath = path.join(__dirname, '..', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const app = express();
const PORT = config.port || 3000;

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve project images
app.use('/projects', express.static(path.join(__dirname, '..', 'projects')));

// Ensure projects directory exists
const projectsDir = path.join(__dirname, '..', 'projects');
if (!fs.existsSync(projectsDir)) {
    fs.mkdirSync(projectsDir, { recursive: true });
}

// API routes
app.use('/api/settings', require('./routes/settings'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/generate', require('./routes/generate'));
app.use('/api', require('./routes/segment'));
app.use('/api/export', require('./routes/export'));
app.use('/api/projects', require('./routes/animations'));

// Start server
app.listen(PORT, () => {
    console.log(`Sprite Forge running at http://localhost:${PORT}`);
});
