/**
 * Sprite Forge — Background Removal Panel
 * Handles background removal and edge cleanup for approved sprites
 */

const Segmenter = (() => {
    let originalImage = null;   // base64 data URL of original
    let processedImage = null;  // base64 data URL after bg removal
    let showingOriginal = true;
    let currentFilename = null;

    function init() {
        bindEvents();
    }

    function bindEvents() {
        document.getElementById('remove-bg-btn').addEventListener('click', removeBg);

        document.getElementById('bg-toggle-btn').addEventListener('click', toggleView);

        document.getElementById('edge-cleanup').addEventListener('input', (e) => {
            document.getElementById('edge-cleanup-val').textContent = e.target.value;
        });

        document.getElementById('bg-apply-btn').addEventListener('click', apply);
        document.getElementById('bg-revert-btn').addEventListener('click', revert);
    }

    function onActivate() {
        loadApprovedSprite();
    }

    function onProjectChange(project) {
        originalImage = null;
        processedImage = null;
        showingOriginal = true;
        currentFilename = null;
        if (document.getElementById('panel-bg-remove').classList.contains('active')) {
            loadApprovedSprite();
        }
    }

    function loadApprovedSprite() {
        const project = App.getProject();
        const noSprite = document.getElementById('bg-no-sprite');
        const workspace = document.getElementById('bg-workspace');

        if (!project || !project.approvedSprite) {
            noSprite.classList.remove('hidden');
            workspace.classList.add('hidden');
            return;
        }

        noSprite.classList.add('hidden');
        workspace.classList.remove('hidden');

        // Load the approved image
        const img = document.getElementById('bg-preview-img');

        // Check if we have a base64 image stored
        if (project.approvedImage) {
            img.src = project.approvedImage;
            originalImage = project.approvedImage;
        } else {
            // Load from file path
            const spritePath = project.approvedSprite;
            img.src = `/projects/${spritePath}`;
            originalImage = img.src;
        }

        // Extract filename from approved sprite path
        const parts = project.approvedSprite.split('/');
        currentFilename = parts[parts.length - 1];

        // Check if we already have a bg-removed version
        if (project.bgRemovedSprite) {
            const processedSrc = `/projects/${project.id}/${project.bgRemovedSprite}`;
            processedImage = processedSrc;
            showProcessed();
            enablePostControls();
        } else {
            showOriginal();
            resetPostControls();
        }
    }

    async function removeBg() {
        const project = App.getProject();
        if (!project || !currentFilename) return;

        const loading = document.getElementById('bg-loading');
        const btn = document.getElementById('remove-bg-btn');
        loading.classList.remove('hidden');
        btn.disabled = true;
        App.setStatus('Removing background...');

        try {
            const edgeCleanup = parseInt(document.getElementById('edge-cleanup').value);
            const result = await App.api('POST', '/remove-bg', {
                projectId: project.id,
                filename: currentFilename,
                edgeCleanup
            });

            processedImage = result.image;
            showProcessed();
            enablePostControls();
            App.setStatus('Background removed');
            await App.refreshProject();
        } catch (err) {
            App.setStatus(`Error: ${err.message}`);
        } finally {
            loading.classList.add('hidden');
            btn.disabled = false;
        }
    }

    function showOriginal() {
        const img = document.getElementById('bg-preview-img');
        img.src = originalImage;
        document.getElementById('bg-view-label').textContent = 'Original';
        showingOriginal = true;
    }

    function showProcessed() {
        if (!processedImage) return;
        const img = document.getElementById('bg-preview-img');
        img.src = processedImage;
        document.getElementById('bg-view-label').textContent = 'Background Removed';
        showingOriginal = false;
    }

    function toggleView() {
        if (showingOriginal && processedImage) {
            showProcessed();
        } else {
            showOriginal();
        }
    }

    function enablePostControls() {
        document.getElementById('bg-toggle-btn').disabled = false;
        document.getElementById('bg-apply-btn').disabled = false;
        document.getElementById('bg-revert-btn').disabled = false;
    }

    function resetPostControls() {
        document.getElementById('bg-toggle-btn').disabled = true;
        document.getElementById('bg-apply-btn').disabled = true;
        document.getElementById('bg-revert-btn').disabled = true;
    }

    async function apply() {
        const project = App.getProject();
        if (!project || !processedImage) return;

        await App.api('PUT', `/projects/${project.id}`, {
            bgRemovedSprite: project.bgRemovedSprite
        });
        await App.refreshProject();
        App.setStatus('Background removal applied');
    }

    async function revert() {
        const project = App.getProject();
        if (!project) return;

        processedImage = null;
        showOriginal();
        resetPostControls();

        await App.api('PUT', `/projects/${project.id}`, {
            bgRemovedSprite: null
        });
        await App.refreshProject();
        App.setStatus('Reverted to original');
    }

    return { init, onActivate, onProjectChange };
})();
