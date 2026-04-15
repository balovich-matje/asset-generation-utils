const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const configPath = path.join(__dirname, '..', '..', 'config.json');
const projectsDir = path.join(__dirname, '..', '..', 'projects');

function readConfig() {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function fetchImage(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { headers }, (res) => {
            // Follow redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchImage(res.headers.location, headers).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${body}`)));
                return;
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(90000, () => {
            req.destroy();
            reject(new Error('Request timed out'));
        });
    });
}

// POST /api/generate — generate an image via Pollinations
router.post('/', async (req, res) => {
    try {
        const config = readConfig();
        const { prompt, styleTemplate, seed, projectId } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'prompt is required' });
        }

        const pol = config.pollinations;
        const useSeed = seed || Math.floor(Math.random() * 2147483647);
        const fullPrompt = styleTemplate ? `${styleTemplate}, ${prompt}` : prompt;
        const encodedPrompt = encodeURIComponent(fullPrompt);

        const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=${pol.defaultModel}&width=${pol.width}&height=${pol.height}&seed=${useSeed}&nologo=true&enhance=false`;

        const headers = {};
        if (pol.apiKey) {
            headers['Authorization'] = `Bearer ${pol.apiKey}`;
        }

        const imageBuffer = await fetchImage(url, headers);

        // Save to project if projectId provided
        let savedPath = null;
        if (projectId) {
            const genDir = path.join(projectsDir, projectId, 'generations');
            if (!fs.existsSync(genDir)) {
                fs.mkdirSync(genDir, { recursive: true });
            }
            const filename = `gen_${useSeed}_${Date.now()}.png`;
            savedPath = path.join(genDir, filename);
            fs.writeFileSync(savedPath, imageBuffer);

            // Update project generations list
            const projectFile = path.join(projectsDir, projectId, 'project.json');
            if (fs.existsSync(projectFile)) {
                const project = JSON.parse(fs.readFileSync(projectFile, 'utf-8'));
                project.generations.push({
                    id: uuidv4(),
                    filename,
                    seed: useSeed,
                    prompt: fullPrompt,
                    timestamp: new Date().toISOString()
                });
                // Keep last 20
                if (project.generations.length > 20) {
                    project.generations = project.generations.slice(-20);
                }
                project.updatedAt = new Date().toISOString();
                fs.writeFileSync(projectFile, JSON.stringify(project, null, 2));
            }
        }

        // Return image as base64 + metadata
        res.json({
            image: `data:image/png;base64,${imageBuffer.toString('base64')}`,
            seed: useSeed,
            prompt: fullPrompt,
            savedPath: savedPath ? path.relative(projectsDir, savedPath) : null
        });
    } catch (err) {
        console.error('Generation error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/generate/custom — proxy to custom endpoint
router.post('/custom', async (req, res) => {
    try {
        const config = readConfig();
        const custom = config.customEndpoint;

        if (!custom || !custom.url) {
            return res.status(400).json({ error: 'Custom endpoint not configured' });
        }

        const { prompt, seed, projectId } = req.body;

        // Build request from template
        const requestBody = JSON.stringify({
            ...custom.requestTemplate,
            prompt,
            seed: seed || Math.floor(Math.random() * 2147483647)
        });

        const url = new URL(custom.url);
        const client = url.protocol === 'https:' ? https : http;

        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestBody),
                ...custom.headers
            }
        };

        const imageBuffer = await new Promise((resolve, reject) => {
            const req = client.request(options, (resp) => {
                const chunks = [];
                resp.on('data', chunk => chunks.push(chunk));
                resp.on('end', () => {
                    if (resp.statusCode !== 200) {
                        reject(new Error(`HTTP ${resp.statusCode}: ${Buffer.concat(chunks).toString()}`));
                    } else {
                        resolve(Buffer.concat(chunks));
                    }
                });
            });
            req.on('error', reject);
            req.write(requestBody);
            req.end();
        });

        res.json({
            image: `data:image/png;base64,${imageBuffer.toString('base64')}`,
            seed: seed || 0,
            prompt
        });
    } catch (err) {
        console.error('Custom generation error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
