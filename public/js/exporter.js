/**
 * Sprite Forge — Export Panel
 * Exports sprites, body parts, and animation code to disk or as a ZIP download.
 */

const Exporter = (() => {

    function init() {
        bindEvents();
    }

    function bindEvents() {
        document.getElementById('export-btn').addEventListener('click', exportToDisk);
        document.getElementById('export-zip-btn').addEventListener('click', downloadZip);
    }

    function onActivate() {
        refreshState();
    }

    function onProjectChange(project) {
        if (document.getElementById('panel-export').classList.contains('active')) {
            refreshState();
        }
    }

    function refreshState() {
        const project = App.getProject();
        const noProject = document.getElementById('export-no-project');
        const workspace = document.getElementById('export-workspace');

        if (!project) {
            noProject.classList.remove('hidden');
            workspace.classList.add('hidden');
            return;
        }

        noProject.classList.add('hidden');
        workspace.classList.remove('hidden');

        document.getElementById('export-project-name').textContent =
            `${project.displayName || project.name}`;

        // Enable/disable checkboxes based on what's available
        const spriteCheck = document.getElementById('export-sprite');
        const partsCheck = document.getElementById('export-parts');
        const codeCheck = document.getElementById('export-code');

        spriteCheck.disabled = !project.bgRemovedSprite;
        partsCheck.disabled = !project.parts || !project.parts.parts;
        codeCheck.disabled = !project.parts || !project.parts.parts;

        if (spriteCheck.disabled) spriteCheck.checked = false;
        if (partsCheck.disabled) partsCheck.checked = false;
        if (codeCheck.disabled) codeCheck.checked = false;

        // Clear previous log
        document.getElementById('export-log').classList.add('hidden');
    }

    function gatherAnimationCode() {
        // Generate code for all presets if Preview module is available
        if (typeof Preview === 'undefined') return '';

        const presets = ['idle', 'walk', 'attack', 'hit', 'death'];
        let allCode = '// Sprite Forge — Animation Code\n';
        allCode += '// Generated for Phaser 3.70\n';
        allCode += '// Each function takes (scene, parts, speed) where parts = { head, torso, left_arm, right_arm, legs }\n\n';

        // We can't easily call Preview's internal generateCode for each preset
        // from here, so generate simple template code for all presets
        allCode += generateAllPresetsCode();
        return allCode;
    }

    function generateAllPresetsCode() {
        let code = '';

        code += `function createIdleAnimation(scene, parts, speed) {
    speed = speed || 1;
    scene.tweens.add({
        targets: parts.torso,
        scaleY: { from: 1.0, to: 1.02 },
        duration: 800 / speed,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
    });
    scene.tweens.add({
        targets: parts.head,
        y: parts.head.y - 0.8,
        duration: 800 / speed,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
    });
    scene.tweens.add({
        targets: parts.left_arm,
        angle: { from: -2, to: 2 },
        duration: 960 / speed,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
    });
    scene.tweens.add({
        targets: parts.right_arm,
        angle: { from: -2, to: 2 },
        duration: 960 / speed,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: 100
    });
}

`;

        code += `function createWalkAnimation(scene, parts, speed) {
    speed = speed || 1;
    scene.tweens.add({
        targets: parts.torso,
        y: parts.torso.y - 2,
        duration: 250 / speed,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
    });
    scene.tweens.add({
        targets: parts.head,
        y: parts.head.y - 2,
        duration: 250 / speed,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
    });
    scene.tweens.add({
        targets: parts.legs,
        angle: { from: -3, to: 3 },
        duration: 500 / speed,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
    });
    scene.tweens.add({
        targets: parts.left_arm,
        angle: { from: -10, to: 10 },
        duration: 500 / speed,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
    });
    scene.tweens.add({
        targets: parts.right_arm,
        angle: { from: -10, to: 10 },
        duration: 500 / speed,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: 250 / speed
    });
}

`;

        code += `function createAttackAnimation(scene, parts, speed) {
    speed = speed || 1;
    scene.tweens.add({
        targets: parts.right_arm,
        angle: -30,
        duration: 200 / speed,
        ease: 'Back.easeIn',
        onComplete: () => {
            scene.tweens.add({
                targets: parts.right_arm,
                angle: 15,
                duration: 120 / speed,
                ease: 'Power2',
                onComplete: () => {
                    scene.tweens.add({
                        targets: parts.right_arm,
                        angle: 0,
                        duration: 400 / speed,
                        ease: 'Sine.easeOut'
                    });
                }
            });
        }
    });
    scene.tweens.add({
        targets: parts.torso,
        x: parts.torso.x - 10,
        duration: 200 / speed,
        yoyo: true,
        ease: 'Sine.easeInOut'
    });
}

`;

        code += `function createHitAnimation(scene, parts, speed) {
    speed = speed || 1;
    const allParts = Object.values(parts);
    allParts.forEach(sprite => {
        scene.tweens.add({
            targets: sprite,
            x: sprite.x + 10,
            duration: 100 / speed,
            yoyo: true,
            ease: 'Power2'
        });
        sprite.setTint(0xff4444);
        scene.time.delayedCall(100 / speed, () => sprite.clearTint());
    });
}

`;

        code += `function createDeathAnimation(scene, parts, speed) {
    speed = speed || 1;
    Object.values(parts).forEach(sprite => {
        scene.tweens.add({
            targets: sprite,
            angle: 75,
            duration: 1000 / speed,
            ease: 'Bounce.easeOut'
        });
        scene.tweens.add({
            targets: sprite,
            alpha: 0,
            duration: 800 / speed,
            delay: 500 / speed,
            ease: 'Linear'
        });
    });
}
`;

        return code;
    }

    async function exportToDisk() {
        const project = App.getProject();
        if (!project) return;

        const loading = document.getElementById('export-loading');
        loading.classList.remove('hidden');
        App.setStatus('Exporting...');

        try {
            const options = {
                sprite: document.getElementById('export-sprite').checked,
                parts: document.getElementById('export-parts').checked,
                code: document.getElementById('export-code').checked
            };

            if (options.code) {
                options.animationCode = gatherAnimationCode();
            }

            const pattern = document.getElementById('export-pattern').value || '{character}_{part}';

            const result = await App.api('POST', '/export', {
                projectId: project.id,
                options,
                namingPattern: pattern
            });

            renderLog(result);
            App.setStatus(`Exported ${result.files.length} files`);
        } catch (err) {
            App.setStatus(`Export error: ${err.message}`);
        } finally {
            loading.classList.add('hidden');
        }
    }

    function downloadZip() {
        const project = App.getProject();
        if (!project) return;

        // Trigger export first, then download
        exportToDisk().then(() => {
            window.open(`/api/export/zip/${project.id}`, '_blank');
        });
    }

    function renderLog(result) {
        const logEl = document.getElementById('export-log');
        const listEl = document.getElementById('export-log-list');
        logEl.classList.remove('hidden');
        listEl.innerHTML = '';

        if (result.exportDir) {
            const dirLi = document.createElement('li');
            dirLi.className = 'export-log-dir';
            dirLi.textContent = `Exported to: ${result.exportDir}`;
            listEl.appendChild(dirLi);
        }

        for (const entry of result.files) {
            const li = document.createElement('li');
            li.textContent = `${entry.type}: ${entry.file}`;
            listEl.appendChild(li);
        }
    }

    return { init, onActivate, onProjectChange };
})();
