const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const projectsDir = path.join(__dirname, '..', '..', 'projects');
const configPath = path.join(__dirname, '..', '..', 'config.json');

function readConfig() {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function readProject(projectId) {
    const file = path.join(projectsDir, projectId, 'project.json');
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

// POST /api/export — export project assets to disk + return download info
router.post('/', async (req, res) => {
    try {
        const { projectId, options, namingPattern } = req.body;

        if (!projectId) {
            return res.status(400).json({ error: 'projectId required' });
        }

        const project = readProject(projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const config = readConfig();
        const exportBase = path.resolve(config.exportDir || './exports');
        const charName = project.name || 'character';
        const exportDir = path.join(exportBase, charName);
        fs.mkdirSync(exportDir, { recursive: true });

        const pattern = namingPattern || '{character}_{part}';
        const log = [];

        const opts = options || { sprite: true, parts: true, code: true };

        // Export full sprite (bg removed)
        if (opts.sprite && project.bgRemovedSprite) {
            const src = path.join(projectsDir, projectId, project.bgRemovedSprite);
            if (fs.existsSync(src)) {
                const dest = path.join(exportDir, `${charName}_sprite.png`);
                fs.copyFileSync(src, dest);
                log.push({ type: 'sprite', file: `${charName}_sprite.png` });
            }
        }

        // Export body parts
        if (opts.parts && project.parts && project.parts.parts) {
            const partsDir = path.join(projectsDir, projectId, 'parts');
            for (const [name, info] of Object.entries(project.parts.parts)) {
                const src = path.join(partsDir, info.file);
                if (fs.existsSync(src)) {
                    const filename = pattern
                        .replace('{character}', charName)
                        .replace('{part}', name) + '.png';
                    const dest = path.join(exportDir, filename);
                    fs.copyFileSync(src, dest);
                    log.push({ type: 'part', file: filename, part: name });
                }
            }

            // Export manifest
            const manifestDest = path.join(exportDir, `${charName}_manifest.json`);
            const manifest = { ...project.parts };
            delete manifest.success;
            // Remove base64 image data from manifest
            for (const info of Object.values(manifest.parts || {})) {
                delete info.image;
            }
            fs.writeFileSync(manifestDest, JSON.stringify(manifest, null, 2));
            log.push({ type: 'manifest', file: `${charName}_manifest.json` });
        }

        // Export animation code
        if (opts.code && opts.animationCode) {
            const dest = path.join(exportDir, `${charName}_animations.js`);
            fs.writeFileSync(dest, opts.animationCode);
            log.push({ type: 'code', file: `${charName}_animations.js` });
        }

        res.json({
            success: true,
            exportDir: exportDir,
            files: log
        });
    } catch (err) {
        console.error('Export error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/export/zip/:projectId — download all exports as zip
router.get('/zip/:projectId', async (req, res) => {
    try {
        const project = readProject(req.params.projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const charName = project.name || 'character';
        const config = readConfig();
        const exportBase = path.resolve(config.exportDir || './exports');
        const exportDir = path.join(exportBase, charName);

        if (!fs.existsSync(exportDir)) {
            return res.status(404).json({ error: 'No exports found. Run export first.' });
        }

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${charName}_export.zip"`);

        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.on('error', (err) => { throw err; });
        archive.pipe(res);
        archive.directory(exportDir, charName);
        archive.finalize();
    } catch (err) {
        console.error('Zip export error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
