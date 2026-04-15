/**
 * Sprite Forge — Generator Panel
 * Handles character sprite generation via Pollinations or custom backend
 */

const Generator = (() => {
    let config = null;
    let generating = false;
    let results = [];

    function init(cfg) {
        config = cfg;
        loadTemplates();
        bindEvents();
    }

    function loadTemplates() {
        const sel = document.getElementById('style-template');
        const templates = App.getConfig()?.styleTemplates || [];
        sel.innerHTML = '';
        templates.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.prompt;
            opt.textContent = t.name;
            sel.appendChild(opt);
        });
    }

    function bindEvents() {
        document.getElementById('generate-btn').addEventListener('click', generate);

        document.getElementById('char-description').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                generate();
            }
        });

        document.getElementById('edge-cleanup').addEventListener('input', (e) => {
            document.getElementById('edge-cleanup-val').textContent = e.target.value;
        });

        document.getElementById('upload-file').addEventListener('change', uploadSprite);
    }

    async function uploadSprite(e) {
        const file = e.target.files[0];
        if (!file) return;

        const project = App.getProject();
        if (!project) {
            App.setStatus('Create a project first');
            return;
        }

        App.setStatus('Uploading...');

        const formData = new FormData();
        formData.append('sprite', file);

        try {
            const res = await fetch(`/api/projects/${project.id}/upload`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            // Show in results grid
            const grid = document.getElementById('results-grid');
            results.push(data);
            renderResultCard(grid, data, results.length - 1);

            await App.refreshProject();
            renderHistory();
            App.setStatus(`Uploaded: ${file.name}`);
        } catch (err) {
            App.setStatus(`Upload error: ${err.message}`);
        }

        // Reset file input
        e.target.value = '';
    }

    async function generate() {
        const project = App.getProject();
        if (!project) {
            App.setStatus('Create a project first');
            return;
        }

        const description = document.getElementById('char-description').value.trim();
        if (!description) {
            App.setStatus('Enter a character description');
            return;
        }

        if (generating) return;
        generating = true;

        const styleTemplate = document.getElementById('style-template').value;
        const backend = document.getElementById('backend-select').value;
        const reuseSeed = document.getElementById('reuse-seed').checked;
        const seedInput = document.getElementById('seed-input').value;

        const btn = document.getElementById('generate-btn');
        const loading = document.getElementById('generate-loading');
        btn.disabled = true;
        loading.classList.remove('hidden');
        App.setStatus('Generating...');

        const grid = document.getElementById('results-grid');
        grid.innerHTML = '';
        results = [];

        // Generate 4 variants
        const seeds = [];
        for (let i = 0; i < 4; i++) {
            if (reuseSeed && seedInput) {
                seeds.push(parseInt(seedInput) + i);
            } else {
                seeds.push(Math.floor(Math.random() * 2147483647));
            }
        }

        const endpoint = backend === 'custom' ? '/generate/custom' : '/generate';

        // Generate sequentially with delay to avoid rate limits
        for (let i = 0; i < seeds.length; i++) {
            if (i > 0) await new Promise(r => setTimeout(r, 3000));
            App.setStatus(`Generating variant ${i + 1} of ${seeds.length}...`);
            try {
                const resp = await App.api('POST', endpoint, {
                    prompt: description,
                    styleTemplate,
                    seed: seeds[i],
                    projectId: project.id
                });
                results.push(resp);
                renderResultCard(grid, resp, i);
            } catch (err) {
                renderErrorCard(grid, err.message, i);
            }
        }

        // Update history
        await App.refreshProject();
        renderHistory();

        btn.disabled = false;
        loading.classList.add('hidden');
        generating = false;
        App.setStatus(`Generated ${results.length} variants`);
    }

    function renderResultCard(grid, result, index) {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.innerHTML = `
            <img src="${result.image}" alt="Variant ${index + 1}">
            <div class="result-actions">
                <button class="btn btn-approve" data-index="${index}">Approve</button>
                <button class="btn btn-reject" data-index="${index}">Reject</button>
                <span class="result-seed">seed: ${result.seed}</span>
            </div>
        `;

        card.querySelector('.btn-approve').addEventListener('click', () => approveVariant(result));
        card.querySelector('.btn-reject').addEventListener('click', () => {
            card.style.opacity = '0.3';
            card.querySelector('.btn-approve').disabled = true;
        });

        grid.appendChild(card);
    }

    function renderErrorCard(grid, error, index) {
        const card = document.createElement('div');
        card.className = 'result-card';
        const short = error.length > 80 ? error.slice(0, 80) + '...' : error;
        card.innerHTML = `
            <div style="padding: 40px; text-align: center; color: var(--accent);">
                <p>Generation failed</p>
                <p style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">${short}</p>
            </div>
        `;
        grid.appendChild(card);
    }

    async function approveVariant(result) {
        const project = App.getProject();
        if (!project) return;

        // Find the generation entry that matches this seed
        const gen = project.generations.find(g => g.seed === result.seed);
        const filename = gen ? gen.filename : null;

        await App.api('PUT', `/projects/${project.id}`, {
            approvedSprite: result.savedPath || filename,
            approvedImage: result.image
        });

        await App.refreshProject();
        App.setStatus('Sprite approved! Go to Clean BG panel.');

        // Highlight the approved card
        document.querySelectorAll('.btn-approve').forEach(b => b.disabled = true);
    }

    function renderHistory() {
        const strip = document.getElementById('history-strip');
        strip.innerHTML = '';
        const project = App.getProject();
        if (!project) return;

        const gens = project.generations.slice().reverse();
        gens.forEach(gen => {
            const wrapper = document.createElement('div');
            wrapper.className = 'history-thumb-wrapper';

            const img = document.createElement('img');
            img.className = 'history-thumb';
            img.src = `/projects/${project.id}/generations/${gen.filename}`;
            img.title = gen.uploaded ? `Uploaded: ${gen.prompt}` : `seed: ${gen.seed}`;
            img.addEventListener('click', () => {
                // Show in results grid with Approve button
                const grid = document.getElementById('results-grid');
                grid.innerHTML = '';
                const result = {
                    image: img.src,
                    seed: gen.seed,
                    savedPath: `${project.id}/generations/${gen.filename}`
                };
                renderResultCard(grid, result, 0);
            });

            const delBtn = document.createElement('button');
            delBtn.className = 'history-delete-btn';
            delBtn.textContent = '\u00d7';
            delBtn.title = 'Delete';
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await App.api('DELETE', `/projects/${project.id}/generations/${gen.filename}`);
                await App.refreshProject();
                renderHistory();
                App.setStatus('Image deleted');
            });

            wrapper.appendChild(img);
            wrapper.appendChild(delBtn);
            strip.appendChild(wrapper);
        });
    }

    function onProjectChange(project) {
        const grid = document.getElementById('results-grid');
        grid.innerHTML = '';
        results = [];
        if (project) {
            renderHistory();
        } else {
            document.getElementById('history-strip').innerHTML = '';
        }
    }

    return { init, loadTemplates, onProjectChange };
})();
