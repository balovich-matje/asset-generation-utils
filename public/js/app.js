/**
 * Sprite Forge — Main app logic
 * Panel switching, project management, shared state, API helpers
 */

const App = (() => {
    let currentProject = null;
    let projects = [];
    let config = null;

    // --- API Helpers ---

    async function api(method, path, body) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(`/api${path}`, opts);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return data;
    }

    function setStatus(msg) {
        const el = document.getElementById('status-text');
        el.textContent = msg;
        if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 4000);
    }

    // --- Panel Switching ---

    function initPanels() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const panel = btn.dataset.panel;
                switchPanel(panel);
            });
        });
    }

    function switchPanel(name) {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

        const btn = document.querySelector(`.nav-btn[data-panel="${name}"]`);
        const panel = document.getElementById(`panel-${name}`);
        if (btn) btn.classList.add('active');
        if (panel) panel.classList.add('active');

        // Notify panels when activated
        if (name === 'bg-remove' && typeof Segmenter !== 'undefined') {
            Segmenter.onActivate();
        }
        if (name === 'bodyparts' && typeof BodyParts !== 'undefined') {
            BodyParts.onActivate();
        }
        if (name === 'animation' && typeof Preview !== 'undefined') {
            Preview.onActivate();
        }
        if (name === 'export' && typeof Exporter !== 'undefined') {
            Exporter.onActivate();
        }
        if (name === 'settings') {
            loadSettingsUI();
        }
    }

    // --- Project Management ---

    async function loadProjects() {
        projects = await api('GET', '/projects');
        renderProjectSelector();
    }

    function renderProjectSelector() {
        const sel = document.getElementById('project-selector');
        const current = currentProject ? currentProject.id : '';
        sel.innerHTML = '<option value="">-- Select Project --</option>';
        projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.displayName || p.name;
            if (p.id === current) opt.selected = true;
            sel.appendChild(opt);
        });
    }

    function selectProject(id) {
        currentProject = projects.find(p => p.id === id) || null;
        if (currentProject) {
            setStatus(`Project: ${currentProject.displayName}`);
        }
        // Notify panels
        if (typeof Generator !== 'undefined') Generator.onProjectChange(currentProject);
        if (typeof Segmenter !== 'undefined') Segmenter.onProjectChange(currentProject);
        if (typeof BodyParts !== 'undefined') BodyParts.onProjectChange(currentProject);
        if (typeof Preview !== 'undefined') Preview.onProjectChange(currentProject);
        if (typeof Exporter !== 'undefined') Exporter.onProjectChange(currentProject);
    }

    async function createProject(name, description) {
        const project = await api('POST', '/projects', { name, description });
        await loadProjects();
        document.getElementById('project-selector').value = project.id;
        selectProject(project.id);
        setStatus(`Created: ${name}`);
        return project;
    }

    function initProjectUI() {
        document.getElementById('project-selector').addEventListener('change', (e) => {
            selectProject(e.target.value);
        });

        document.getElementById('new-project-btn').addEventListener('click', () => {
            document.getElementById('new-project-modal').classList.remove('hidden');
            document.getElementById('project-name-input').focus();
        });

        document.getElementById('modal-cancel-btn').addEventListener('click', () => {
            document.getElementById('new-project-modal').classList.add('hidden');
        });

        document.getElementById('modal-create-btn').addEventListener('click', async () => {
            const name = document.getElementById('project-name-input').value.trim();
            if (!name) return;
            const desc = document.getElementById('project-desc-input').value.trim();
            await createProject(name, desc);
            document.getElementById('new-project-modal').classList.add('hidden');
            document.getElementById('project-name-input').value = '';
            document.getElementById('project-desc-input').value = '';
        });

        // Close modal on backdrop click
        document.getElementById('new-project-modal').addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.classList.add('hidden');
            }
        });
    }

    // --- Settings UI ---

    async function loadSettingsUI() {
        if (!config) {
            config = await api('GET', '/settings/raw');
        }
        document.getElementById('set-api-key').value = config.pollinations.apiKey || '';
        document.getElementById('set-model').value = config.pollinations.defaultModel || 'flux';
        document.getElementById('set-width').value = config.pollinations.width || 256;
        document.getElementById('set-height').value = config.pollinations.height || 256;
        document.getElementById('set-custom-url').value = config.customEndpoint?.url || '';
        document.getElementById('set-custom-headers').value =
            config.customEndpoint?.headers ? JSON.stringify(config.customEndpoint.headers, null, 2) : '';

        renderTemplateList();
    }

    function renderTemplateList() {
        const list = document.getElementById('template-list');
        list.innerHTML = '';
        (config.styleTemplates || []).forEach(t => {
            const div = document.createElement('div');
            div.className = 'template-item';
            div.innerHTML = `
                <span class="template-item-name">${t.name}</span>
                <button data-id="${t.id}" title="Delete">&times;</button>
            `;
            div.querySelector('button').addEventListener('click', async () => {
                await api('DELETE', `/settings/templates/${t.id}`);
                config = await api('GET', '/settings/raw');
                renderTemplateList();
                if (typeof Generator !== 'undefined') Generator.loadTemplates();
            });
            list.appendChild(div);
        });
    }

    function initSettings() {
        document.getElementById('save-settings-btn').addEventListener('click', async () => {
            let customHeaders = {};
            try {
                const raw = document.getElementById('set-custom-headers').value.trim();
                if (raw) customHeaders = JSON.parse(raw);
            } catch { /* ignore parse error */ }

            await api('PUT', '/settings', {
                pollinations: {
                    apiKey: document.getElementById('set-api-key').value,
                    defaultModel: document.getElementById('set-model').value,
                    width: parseInt(document.getElementById('set-width').value) || 256,
                    height: parseInt(document.getElementById('set-height').value) || 256
                },
                customEndpoint: {
                    url: document.getElementById('set-custom-url').value,
                    headers: customHeaders
                }
            });
            config = await api('GET', '/settings/raw');
            setStatus('Settings saved');
        });

        document.getElementById('add-template-btn').addEventListener('click', async () => {
            const name = document.getElementById('new-tmpl-name').value.trim();
            const prompt = document.getElementById('new-tmpl-prompt').value.trim();
            if (!name || !prompt) return;
            await api('POST', '/settings/templates', { name, prompt });
            config = await api('GET', '/settings/raw');
            renderTemplateList();
            document.getElementById('new-tmpl-name').value = '';
            document.getElementById('new-tmpl-prompt').value = '';
            if (typeof Generator !== 'undefined') Generator.loadTemplates();
            setStatus('Template added');
        });
    }

    // --- Init ---

    async function init() {
        config = await api('GET', '/settings/raw');
        initPanels();
        initProjectUI();
        initSettings();
        await loadProjects();

        if (typeof Generator !== 'undefined') Generator.init(config);
        if (typeof Segmenter !== 'undefined') Segmenter.init();
        if (typeof BodyParts !== 'undefined') BodyParts.init();
        if (typeof Preview !== 'undefined') Preview.init();
        if (typeof Exporter !== 'undefined') Exporter.init();
    }

    document.addEventListener('DOMContentLoaded', init);

    return {
        api,
        setStatus,
        getProject: () => currentProject,
        getConfig: () => config,
        refreshProject: async () => {
            if (!currentProject) return;
            currentProject = await api('GET', `/projects/${currentProject.id}`);
            const idx = projects.findIndex(p => p.id === currentProject.id);
            if (idx >= 0) projects[idx] = currentProject;
        },
        selectProject,
        switchPanel
    };
})();
