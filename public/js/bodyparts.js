/**
 * Sprite Forge — Body Part Segmentation Panel
 * Auto-segments a bg-removed sprite into head, torso, arms, legs.
 * Supports manual cut-line adjustment and re-segmentation.
 */

const BodyParts = (() => {
    let partsData = null;   // manifest from server
    let cuts = null;        // { headY, torsoBottomY, armLeftX, armRightX }
    let imgNatW = 0;
    let imgNatH = 0;
    let dragging = null;    // which cut line is being dragged

    function init() {
        bindEvents();
    }

    function bindEvents() {
        document.getElementById('bp-auto-btn').addEventListener('click', autoSegment);
        document.getElementById('bp-resegment-btn').addEventListener('click', manualSegment);

        // Cut line dragging
        const container = document.getElementById('bp-sprite-container');
        ['cut-headY', 'cut-torsoBottomY', 'cut-armLeftX', 'cut-armRightX'].forEach(id => {
            const el = document.getElementById(id);
            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                dragging = id.replace('cut-', '');
            });
        });

        container.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const rect = container.getBoundingClientRect();
            const scaleX = imgNatW / rect.width;
            const scaleY = imgNatH / rect.height;

            if (dragging === 'headY' || dragging === 'torsoBottomY') {
                const y = Math.round((e.clientY - rect.top) * scaleY);
                cuts[dragging] = Math.max(0, Math.min(imgNatH, y));
            } else {
                const x = Math.round((e.clientX - rect.left) * scaleX);
                cuts[dragging] = Math.max(0, Math.min(imgNatW, x));
            }
            positionCutLines();
        });

        document.addEventListener('mouseup', () => {
            if (dragging) {
                dragging = null;
                document.getElementById('bp-resegment-btn').disabled = false;
            }
        });
    }

    function onActivate() {
        loadSprite();
    }

    function onProjectChange(project) {
        partsData = null;
        cuts = null;
        if (document.getElementById('panel-bodyparts').classList.contains('active')) {
            loadSprite();
        }
    }

    function loadSprite() {
        const project = App.getProject();
        const noSprite = document.getElementById('bp-no-sprite');
        const workspace = document.getElementById('bp-workspace');

        if (!project || !project.bgRemovedSprite) {
            noSprite.classList.remove('hidden');
            workspace.classList.add('hidden');
            return;
        }

        noSprite.classList.add('hidden');
        workspace.classList.remove('hidden');

        const img = document.getElementById('bp-sprite-img');
        img.src = `/projects/${project.id}/${project.bgRemovedSprite}`;
        img.onload = () => {
            imgNatW = img.naturalWidth;
            imgNatH = img.naturalHeight;

            // If project already has parts, show them
            if (project.parts && project.parts.parts) {
                partsData = project.parts;
                cuts = project.parts.cuts;
                renderOverlays();
                renderPartsList();
                showCutLines();
            } else {
                hideCutLines();
                document.getElementById('bp-overlays').innerHTML = '';
                document.getElementById('bp-parts-list').innerHTML = '';
            }
        };
    }

    async function autoSegment() {
        const project = App.getProject();
        if (!project) return;

        const loading = document.getElementById('bp-loading');
        const btn = document.getElementById('bp-auto-btn');
        loading.classList.remove('hidden');
        btn.disabled = true;
        App.setStatus('Segmenting...');

        try {
            const result = await App.api('POST', '/segment-parts', {
                projectId: project.id
            });

            partsData = result;
            cuts = result.cuts;
            renderOverlays();
            renderPartsList();
            showCutLines();
            document.getElementById('bp-resegment-btn').disabled = false;
            await App.refreshProject();
            App.setStatus('Segmentation complete');
        } catch (err) {
            App.setStatus(`Error: ${err.message}`);
        } finally {
            loading.classList.add('hidden');
            btn.disabled = false;
        }
    }

    async function manualSegment() {
        const project = App.getProject();
        if (!project || !cuts) return;

        const loading = document.getElementById('bp-loading');
        loading.classList.remove('hidden');
        App.setStatus('Re-segmenting...');

        try {
            const result = await App.api('POST', '/segment-parts/manual', {
                projectId: project.id,
                cuts
            });

            partsData = result;
            cuts = result.cuts;
            renderOverlays();
            renderPartsList();
            await App.refreshProject();
            App.setStatus('Re-segmentation complete');
        } catch (err) {
            App.setStatus(`Error: ${err.message}`);
        } finally {
            loading.classList.add('hidden');
        }
    }

    function renderOverlays() {
        const container = document.getElementById('bp-sprite-container');
        const overlay = document.getElementById('bp-overlays');
        overlay.innerHTML = '';

        if (!partsData || !partsData.parts) return;

        const rect = container.getBoundingClientRect();
        const img = document.getElementById('bp-sprite-img');
        const scaleX = img.clientWidth / imgNatW;
        const scaleY = img.clientHeight / imgNatH;

        for (const [name, info] of Object.entries(partsData.parts)) {
            const div = document.createElement('div');
            div.className = 'part-overlay';
            div.dataset.part = name;
            div.style.left = `${info.x * scaleX}px`;
            div.style.top = `${info.y * scaleY}px`;
            div.style.width = `${info.width * scaleX}px`;
            div.style.height = `${info.height * scaleY}px`;
            overlay.appendChild(div);
        }

        positionCutLines();
    }

    function renderPartsList() {
        const list = document.getElementById('bp-parts-list');
        list.innerHTML = '';

        if (!partsData || !partsData.parts) return;

        const partNames = ['head', 'left_arm', 'torso', 'right_arm', 'legs'];
        for (const name of partNames) {
            const info = partsData.parts[name];
            if (!info) continue;

            const div = document.createElement('div');
            div.className = 'bp-part-thumb';

            const img = document.createElement('img');
            if (info.image) {
                img.src = info.image;
            } else {
                const project = App.getProject();
                img.src = `/projects/${project.id}/parts/${info.file}`;
            }
            img.alt = name;

            const label = document.createElement('span');
            label.textContent = name.replace('_', ' ');

            div.appendChild(img);
            div.appendChild(label);
            list.appendChild(div);
        }
    }

    function showCutLines() {
        document.querySelectorAll('.cut-line').forEach(el => el.classList.add('active'));
        positionCutLines();
    }

    function hideCutLines() {
        document.querySelectorAll('.cut-line').forEach(el => el.classList.remove('active'));
    }

    function positionCutLines() {
        if (!cuts) return;

        const img = document.getElementById('bp-sprite-img');
        const scaleX = img.clientWidth / imgNatW;
        const scaleY = img.clientHeight / imgNatH;

        const headLine = document.getElementById('cut-headY');
        headLine.style.top = `${cuts.headY * scaleY}px`;

        const torsoLine = document.getElementById('cut-torsoBottomY');
        torsoLine.style.top = `${cuts.torsoBottomY * scaleY}px`;

        const leftLine = document.getElementById('cut-armLeftX');
        leftLine.style.left = `${cuts.armLeftX * scaleX}px`;

        const rightLine = document.getElementById('cut-armRightX');
        rightLine.style.left = `${cuts.armRightX * scaleX}px`;
    }

    return { init, onActivate, onProjectChange };
})();
