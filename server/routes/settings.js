const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', '..', 'config.json');

function readConfig() {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function writeConfig(config) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// GET /api/settings — return config with redacted API key
router.get('/', (req, res) => {
    const config = readConfig();
    const safe = { ...config };
    if (safe.pollinations && safe.pollinations.apiKey) {
        const key = safe.pollinations.apiKey;
        safe.pollinations = {
            ...safe.pollinations,
            apiKey: key.length > 4 ? '****' + key.slice(-4) : '****'
        };
    }
    res.json(safe);
});

// GET /api/settings/raw — return full config (for internal use)
router.get('/raw', (req, res) => {
    res.json(readConfig());
});

// PUT /api/settings — update config fields
router.put('/', (req, res) => {
    const config = readConfig();
    const updates = req.body;

    // Deep merge top-level keys
    for (const [key, value] of Object.entries(updates)) {
        if (typeof value === 'object' && !Array.isArray(value) && value !== null && typeof config[key] === 'object') {
            config[key] = { ...config[key], ...value };
        } else {
            config[key] = value;
        }
    }

    writeConfig(config);
    res.json({ success: true, config });
});

// POST /api/settings/templates — add a style template
router.post('/templates', (req, res) => {
    const config = readConfig();
    const { name, prompt } = req.body;
    if (!name || !prompt) {
        return res.status(400).json({ error: 'name and prompt required' });
    }
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    config.styleTemplates.push({ id, name, prompt });
    writeConfig(config);
    res.json({ success: true, template: { id, name, prompt } });
});

// PUT /api/settings/templates/:id — update a style template
router.put('/templates/:id', (req, res) => {
    const config = readConfig();
    const idx = config.styleTemplates.findIndex(t => t.id === req.params.id);
    if (idx === -1) {
        return res.status(404).json({ error: 'Template not found' });
    }
    const { name, prompt } = req.body;
    if (name) config.styleTemplates[idx].name = name;
    if (prompt) config.styleTemplates[idx].prompt = prompt;
    writeConfig(config);
    res.json({ success: true, template: config.styleTemplates[idx] });
});

// DELETE /api/settings/templates/:id — remove a style template
router.delete('/templates/:id', (req, res) => {
    const config = readConfig();
    config.styleTemplates = config.styleTemplates.filter(t => t.id !== req.params.id);
    writeConfig(config);
    res.json({ success: true });
});

module.exports = router;
