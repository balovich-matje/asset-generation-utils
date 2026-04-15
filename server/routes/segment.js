const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const projectsDir = path.join(__dirname, '..', '..', 'projects');
const configPath = path.join(__dirname, '..', '..', 'config.json');
const scriptPath = path.join(__dirname, '..', 'scripts', 'remove_bg.py');
const segmentScriptPath = path.join(__dirname, '..', 'scripts', 'segment_parts.py');

function readConfig() {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

// POST /api/remove-bg — remove background from a sprite
router.post('/remove-bg', async (req, res) => {
    try {
        const config = readConfig();
        const { projectId, filename, edgeCleanup } = req.body;

        if (!projectId || !filename) {
            return res.status(400).json({ error: 'projectId and filename required' });
        }

        const inputPath = path.join(projectsDir, projectId, 'generations', filename);
        if (!fs.existsSync(inputPath)) {
            return res.status(404).json({ error: 'Source image not found' });
        }

        // Determine output paths
        const baseName = path.basename(filename, path.extname(filename));
        const outputDir = path.join(projectsDir, projectId);
        const originalPath = path.join(outputDir, `${baseName}_original.png`);
        const outputPath = path.join(outputDir, `${baseName}_nobg.png`);

        // Copy original
        fs.copyFileSync(inputPath, originalPath);

        // Resolve Python path
        let pythonPath = config.pythonPath || 'venv/bin/python';
        if (!path.isAbsolute(pythonPath)) {
            pythonPath = path.join(__dirname, '..', '..', pythonPath);
        }

        const cleanup = edgeCleanup !== undefined ? String(edgeCleanup) : '50';

        // Run background removal
        await new Promise((resolve, reject) => {
            execFile(pythonPath, [scriptPath, inputPath, outputPath, cleanup], {
                timeout: 120000
            }, (error, stdout, stderr) => {
                if (error) {
                    console.error('remove_bg stderr:', stderr);
                    reject(new Error(stderr || error.message));
                } else {
                    resolve(stdout);
                }
            });
        });

        // Read result as base64
        const resultBuffer = fs.readFileSync(outputPath);

        // Update project
        const projectFile = path.join(outputDir, 'project.json');
        if (fs.existsSync(projectFile)) {
            const project = JSON.parse(fs.readFileSync(projectFile, 'utf-8'));
            project.bgRemovedSprite = `${baseName}_nobg.png`;
            project.updatedAt = new Date().toISOString();
            fs.writeFileSync(projectFile, JSON.stringify(project, null, 2));
        }

        res.json({
            success: true,
            image: `data:image/png;base64,${resultBuffer.toString('base64')}`,
            outputFile: `${baseName}_nobg.png`,
            originalFile: `${baseName}_original.png`
        });
    } catch (err) {
        console.error('BG removal error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/segment-parts — auto-segment sprite into body parts
router.post('/segment-parts', async (req, res) => {
    try {
        const config = readConfig();
        const { projectId, headRatio, torsoRatio } = req.body;

        if (!projectId) {
            return res.status(400).json({ error: 'projectId required' });
        }

        const projectFile = path.join(projectsDir, projectId, 'project.json');
        if (!fs.existsSync(projectFile)) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const project = JSON.parse(fs.readFileSync(projectFile, 'utf-8'));
        if (!project.bgRemovedSprite) {
            return res.status(400).json({ error: 'No background-removed sprite. Run bg removal first.' });
        }

        const inputPath = path.join(projectsDir, projectId, project.bgRemovedSprite);
        if (!fs.existsSync(inputPath)) {
            return res.status(404).json({ error: 'BG-removed sprite file not found' });
        }

        const partsDir = path.join(projectsDir, projectId, 'parts');
        fs.mkdirSync(partsDir, { recursive: true });

        let pythonPath = config.pythonPath || 'venv/bin/python';
        if (!path.isAbsolute(pythonPath)) {
            pythonPath = path.join(__dirname, '..', '..', pythonPath);
        }

        const args = [segmentScriptPath, inputPath, partsDir];
        if (headRatio !== undefined) args.push(String(headRatio));
        if (torsoRatio !== undefined) args.push(String(torsoRatio));

        const stdout = await new Promise((resolve, reject) => {
            execFile(pythonPath, args, { timeout: 60000 }, (error, stdout, stderr) => {
                if (error) {
                    console.error('segment_parts stderr:', stderr);
                    reject(new Error(stderr || error.message));
                } else {
                    resolve(stdout);
                }
            });
        });

        const manifest = JSON.parse(stdout.trim());

        // Add base64 image data for each part
        for (const [name, info] of Object.entries(manifest.parts)) {
            const partPath = path.join(partsDir, info.file);
            if (fs.existsSync(partPath)) {
                info.image = `data:image/png;base64,${fs.readFileSync(partPath).toString('base64')}`;
            }
        }

        // Update project
        project.parts = manifest;
        project.updatedAt = new Date().toISOString();
        fs.writeFileSync(projectFile, JSON.stringify(project, null, 2));

        res.json({ success: true, ...manifest });
    } catch (err) {
        console.error('Segmentation error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/segment-parts/manual — re-segment with explicit pixel boundaries
router.post('/segment-parts/manual', async (req, res) => {
    try {
        const config = readConfig();
        const { projectId, cuts } = req.body;

        if (!projectId || !cuts) {
            return res.status(400).json({ error: 'projectId and cuts required' });
        }

        const projectFile = path.join(projectsDir, projectId, 'project.json');
        if (!fs.existsSync(projectFile)) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const project = JSON.parse(fs.readFileSync(projectFile, 'utf-8'));
        if (!project.bgRemovedSprite) {
            return res.status(400).json({ error: 'No background-removed sprite' });
        }

        const inputPath = path.join(projectsDir, projectId, project.bgRemovedSprite);
        const partsDir = path.join(projectsDir, projectId, 'parts');
        fs.mkdirSync(partsDir, { recursive: true });

        let pythonPath = config.pythonPath || 'venv/bin/python';
        if (!path.isAbsolute(pythonPath)) {
            pythonPath = path.join(__dirname, '..', '..', pythonPath);
        }

        const cutsJson = JSON.stringify(cuts);
        const args = [segmentScriptPath, inputPath, partsDir, '0.25', '0.30', cutsJson];

        const stdout = await new Promise((resolve, reject) => {
            execFile(pythonPath, args, { timeout: 60000 }, (error, stdout, stderr) => {
                if (error) {
                    console.error('manual segment stderr:', stderr);
                    reject(new Error(stderr || error.message));
                } else {
                    resolve(stdout);
                }
            });
        });

        const manifest = JSON.parse(stdout.trim());

        for (const [name, info] of Object.entries(manifest.parts)) {
            const partPath = path.join(partsDir, info.file);
            if (fs.existsSync(partPath)) {
                info.image = `data:image/png;base64,${fs.readFileSync(partPath).toString('base64')}`;
            }
        }

        project.parts = manifest;
        project.updatedAt = new Date().toISOString();
        fs.writeFileSync(projectFile, JSON.stringify(project, null, 2));

        res.json({ success: true, ...manifest });
    } catch (err) {
        console.error('Manual segmentation error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
