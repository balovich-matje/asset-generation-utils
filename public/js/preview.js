/**
 * Sprite Forge — Animation Preview Panel
 * Phaser 3.70 canvas for assembling body parts and previewing tween animations.
 * Generates exportable Phaser tween code that updates live with parameter changes.
 */

const Preview = (() => {
    let game = null;
    let scene = null;
    let partSprites = {};
    let currentPreset = 'idle';
    let activeTweens = [];
    let pendingTimers = [];
    let playing = false;
    let animGeneration = 0;  // bumped on each playAnimation, guards stale callbacks
    let customAnimations = [];  // loaded from API
    let currentCustomAnim = null;  // the active custom animation data
    let speed = 1.0;
    let looping = true;
    let partsManifest = null;

    // --- Animation Presets ---

    const PRESETS = {
        idle: {
            name: 'Idle',
            params: {
                breatheAmplitude: { label: 'Breathe Amplitude', min: 0.01, max: 0.05, step: 0.005, default: 0.02 },
                breatheSpeed:     { label: 'Breathe Speed (ms)', min: 500, max: 1500, step: 50, default: 800 },
                armSwayRange:     { label: 'Arm Sway (deg)', min: 1, max: 5, step: 0.5, default: 2 }
            }
        },
        walk: {
            name: 'Walk',
            params: {
                stepSpeed:     { label: 'Step Speed (ms)', min: 300, max: 800, step: 50, default: 500 },
                bobHeight:     { label: 'Bob Height (px)', min: 1, max: 5, step: 0.5, default: 2 },
                armSwingRange: { label: 'Arm Swing (deg)', min: 5, max: 20, step: 1, default: 10 }
            }
        },
        attack: {
            name: 'Attack',
            params: {
                windupAngle:   { label: 'Windup Angle (deg)', min: 10, max: 45, step: 5, default: 30 },
                swingSpeed:    { label: 'Swing Speed (ms)', min: 100, max: 400, step: 25, default: 200 },
                recoveryTime:  { label: 'Recovery (ms)', min: 200, max: 600, step: 50, default: 400 },
                lungeDistance:  { label: 'Lunge Distance (px)', min: 5, max: 20, step: 1, default: 10 }
            }
        },
        hit: {
            name: 'Hit / Flinch',
            params: {
                knockbackDist: { label: 'Knockback (px)', min: 5, max: 20, step: 1, default: 10 },
                flashDuration: { label: 'Flash Duration (ms)', min: 50, max: 200, step: 10, default: 100 },
                recoveryTime:  { label: 'Recovery (ms)', min: 200, max: 600, step: 50, default: 400 }
            }
        },
        death: {
            name: 'Death',
            params: {
                fallAngle:    { label: 'Fall Angle (deg)', min: 45, max: 90, step: 5, default: 75 },
                fallDuration: { label: 'Fall Duration (ms)', min: 500, max: 2000, step: 100, default: 1000 },
                fadeSpeed:    { label: 'Fade Speed (ms)', min: 500, max: 1500, step: 100, default: 800 }
            }
        }
    };

    let paramValues = {};

    function init() {
        bindEvents();
        resetParamValues('idle');
    }

    function bindEvents() {
        document.getElementById('anim-preset').addEventListener('change', (e) => {
            currentPreset = e.target.value;
            // Check if it's a custom animation (prefixed with "custom:")
            if (currentPreset.startsWith('custom:')) {
                const name = currentPreset.slice(7);
                currentCustomAnim = customAnimations.find(a => a.name === name) || null;
                renderParams();
                if (currentCustomAnim) playAnimation();
                updateCode();
            } else {
                currentCustomAnim = null;
                resetParamValues(currentPreset);
                renderParams();
                if (playing) playAnimation();
                updateCode();
            }
        });

        document.getElementById('anim-refresh-btn').addEventListener('click', loadCustomAnimations);

        document.getElementById('anim-play-btn').addEventListener('click', playAnimation);
        document.getElementById('anim-pause-btn').addEventListener('click', pauseAnimation);
        document.getElementById('anim-step-btn').addEventListener('click', stepAnimation);

        document.getElementById('anim-loop').addEventListener('change', (e) => {
            looping = e.target.checked;
            if (playing) playAnimation();
        });

        document.getElementById('anim-speed').addEventListener('input', (e) => {
            speed = parseInt(e.target.value) / 10;
            document.getElementById('anim-speed-val').textContent = speed.toFixed(1);
            if (playing) playAnimation();
            updateCode();
        });

        document.getElementById('anim-bg-color').addEventListener('input', (e) => {
            if (game) {
                const hex = e.target.value.replace('#', '0x');
                game.scene.scenes[0].cameras.main.setBackgroundColor(parseInt(hex));
            }
        });

        document.getElementById('anim-copy-btn').addEventListener('click', () => {
            const code = document.getElementById('anim-code').textContent;
            navigator.clipboard.writeText(code).then(() => {
                App.setStatus('Code copied to clipboard');
            });
        });
    }

    function resetParamValues(preset) {
        paramValues = {};
        const def = PRESETS[preset];
        if (!def) return;
        for (const [key, cfg] of Object.entries(def.params)) {
            paramValues[key] = cfg.default;
        }
    }

    function renderParams() {
        const container = document.getElementById('anim-params');
        container.innerHTML = '';

        // Custom animation — show description + step summary
        if (currentCustomAnim) {
            if (currentCustomAnim.description) {
                const desc = document.createElement('p');
                desc.style.cssText = 'font-size:12px; color:var(--text-secondary); margin-bottom:8px;';
                desc.textContent = currentCustomAnim.description;
                container.appendChild(desc);
            }
            const info = document.createElement('div');
            info.style.cssText = 'font-size:11px; color:var(--text-muted);';
            info.textContent = `${currentCustomAnim.steps.length} tween steps — targets: ${[...new Set(currentCustomAnim.steps.map(s => s.target))].join(', ')}`;
            container.appendChild(info);
            return;
        }

        const def = PRESETS[currentPreset];
        if (!def) return;

        for (const [key, cfg] of Object.entries(def.params)) {
            const div = document.createElement('div');
            div.className = 'param-slider';
            const val = paramValues[key] !== undefined ? paramValues[key] : cfg.default;
            div.innerHTML = `
                <label>
                    <span>${cfg.label}</span>
                    <span id="pval-${key}">${val}</span>
                </label>
                <input type="range" min="${cfg.min}" max="${cfg.max}" step="${cfg.step}" value="${val}" data-key="${key}">
            `;
            div.querySelector('input').addEventListener('input', (e) => {
                paramValues[key] = parseFloat(e.target.value);
                document.getElementById(`pval-${key}`).textContent = paramValues[key];
                if (playing) playAnimation();
                updateCode();
            });
            container.appendChild(div);
        }
    }

    function onActivate() {
        loadParts();
    }

    function onProjectChange(project) {
        partsManifest = null;
        destroyGame();
        if (document.getElementById('panel-animation').classList.contains('active')) {
            loadParts();
        }
    }

    function loadParts() {
        const project = App.getProject();
        const noParts = document.getElementById('anim-no-parts');
        const workspace = document.getElementById('anim-workspace');

        if (!project || !project.parts || !project.parts.parts) {
            noParts.classList.remove('hidden');
            workspace.classList.add('hidden');
            return;
        }

        noParts.classList.add('hidden');
        workspace.classList.remove('hidden');

        // Always refresh custom animations list
        loadCustomAnimations();

        // Only reinit Phaser if parts changed
        const newManifest = project.parts;
        if (game && partsManifest === newManifest) return;
        partsManifest = newManifest;

        initGame();
        renderParams();
        updateCode();
    }

    async function loadCustomAnimations() {
        const project = App.getProject();
        if (!project) return;

        try {
            customAnimations = await App.api('GET', `/projects/${project.id}/animations`);
        } catch {
            customAnimations = [];
        }

        // Populate the custom optgroup in the dropdown
        const group = document.getElementById('anim-custom-group');
        group.innerHTML = '';
        customAnimations.forEach(anim => {
            const opt = document.createElement('option');
            opt.value = `custom:${anim.name}`;
            opt.textContent = `${anim.name}${anim.description ? ' — ' + anim.description : ''}`;
            group.appendChild(opt);
        });

        // If currently viewing a custom anim, refresh its data
        if (currentPreset.startsWith('custom:')) {
            const name = currentPreset.slice(7);
            currentCustomAnim = customAnimations.find(a => a.name === name) || null;
            if (currentCustomAnim && playing) playAnimation();
            updateCode();
        }
    }

    function destroyGame() {
        if (game) {
            game.destroy(true);
            game = null;
            scene = null;
            partSprites = {};
            activeTweens = [];
            playing = false;
        }
    }

    function initGame() {
        destroyGame();

        const project = App.getProject();
        if (!project || !partsManifest) return;

        const bgColor = document.getElementById('anim-bg-color').value.replace('#', '0x');

        game = new Phaser.Game({
            type: Phaser.AUTO,
            width: 256,
            height: 256,
            parent: 'phaser-container',
            backgroundColor: parseInt(bgColor),
            scene: {
                preload: function () {
                    scene = this;
                    for (const [name, info] of Object.entries(partsManifest.parts)) {
                        // Always use file path — Phaser loader doesn't support data URIs
                        this.load.image(`part_${name}`, `/projects/${project.id}/parts/${info.file}`);
                    }
                },
                create: function () {
                    assembleParts(this);
                    playAnimation();
                }
            },
            pixelArt: true
        });
    }

    function assembleParts(sc) {
        scene = sc;
        partSprites = {};

        if (!partsManifest) return;

        const anchorX = partsManifest.anchorX || 128;
        const anchorY = partsManifest.anchorY || 128;

        const partOrder = ['legs', 'torso', 'left_arm', 'right_arm', 'head'];
        for (const name of partOrder) {
            const info = partsManifest.parts[name];
            if (!info) continue;

            const cx = info.x + info.width / 2;
            const cy = info.y + info.height / 2;

            const sprite = scene.add.image(cx, cy, `part_${name}`);
            sprite.setOrigin(0.5, 0.5);
            sprite._baseX = cx;
            sprite._baseY = cy;
            sprite._baseAngle = 0;
            sprite._baseScaleX = 1;
            sprite._baseScaleY = 1;
            partSprites[name] = sprite;
        }
    }

    function killTweens() {
        if (scene) {
            scene.tweens.killAll();
        }
        activeTweens = [];
        // Cancel any pending delayed calls (used by attack/hit/death for looping)
        pendingTimers.forEach(t => { if (t && t.remove) t.remove(); });
        pendingTimers = [];
        // Reset positions
        for (const [name, sprite] of Object.entries(partSprites)) {
            sprite.x = sprite._baseX;
            sprite.y = sprite._baseY;
            sprite.angle = 0;
            sprite.scaleX = 1;
            sprite.scaleY = 1;
            sprite.alpha = 1;
            if (sprite.clearTint) sprite.clearTint();
        }
    }

    function playAnimation() {
        if (!scene) return;
        killTweens();
        playing = true;
        animGeneration++;
        const gen = animGeneration;

        const repeat = looping ? -1 : 0;
        const p = paramValues;
        const s = speed;

        // Custom animation from API
        if (currentCustomAnim) {
            playCustomSteps(currentCustomAnim, s, gen);
            updateCode();
            return;
        }

        switch (currentPreset) {
            case 'idle':
                if (partSprites.torso) {
                    scene.tweens.add({
                        targets: partSprites.torso,
                        scaleY: { from: 1.0, to: 1.0 + p.breatheAmplitude },
                        duration: p.breatheSpeed / s,
                        yoyo: true, repeat, ease: 'Sine.easeInOut'
                    });
                }
                if (partSprites.head) {
                    scene.tweens.add({
                        targets: partSprites.head,
                        y: { from: partSprites.head._baseY, to: partSprites.head._baseY - p.breatheAmplitude * 40 },
                        duration: p.breatheSpeed / s,
                        yoyo: true, repeat, ease: 'Sine.easeInOut'
                    });
                }
                ['left_arm', 'right_arm'].forEach((arm, i) => {
                    if (partSprites[arm]) {
                        scene.tweens.add({
                            targets: partSprites[arm],
                            angle: { from: -p.armSwayRange, to: p.armSwayRange },
                            duration: (p.breatheSpeed * 1.2) / s,
                            yoyo: true, repeat, ease: 'Sine.easeInOut',
                            delay: i * 100
                        });
                    }
                });
                break;

            case 'walk':
                if (partSprites.torso) {
                    scene.tweens.add({
                        targets: partSprites.torso,
                        y: { from: partSprites.torso._baseY, to: partSprites.torso._baseY - p.bobHeight },
                        duration: p.stepSpeed / 2 / s,
                        yoyo: true, repeat, ease: 'Sine.easeInOut'
                    });
                }
                if (partSprites.head) {
                    scene.tweens.add({
                        targets: partSprites.head,
                        y: { from: partSprites.head._baseY, to: partSprites.head._baseY - p.bobHeight },
                        duration: p.stepSpeed / 2 / s,
                        yoyo: true, repeat, ease: 'Sine.easeInOut'
                    });
                }
                if (partSprites.legs) {
                    scene.tweens.add({
                        targets: partSprites.legs,
                        angle: { from: -3, to: 3 },
                        duration: p.stepSpeed / s,
                        yoyo: true, repeat, ease: 'Sine.easeInOut'
                    });
                }
                ['left_arm', 'right_arm'].forEach((arm, i) => {
                    if (partSprites[arm]) {
                        scene.tweens.add({
                            targets: partSprites[arm],
                            angle: { from: -p.armSwingRange, to: p.armSwingRange },
                            duration: p.stepSpeed / s,
                            yoyo: true, repeat, ease: 'Sine.easeInOut',
                            delay: i * (p.stepSpeed / s / 2)
                        });
                    }
                });
                break;

            case 'attack':
                if (partSprites.right_arm) {
                    scene.tweens.add({
                        targets: partSprites.right_arm,
                        angle: -p.windupAngle,
                        duration: p.swingSpeed / s,
                        ease: 'Back.easeIn',
                        onComplete: () => {
                            if (gen !== animGeneration) return;
                            scene.tweens.add({
                                targets: partSprites.right_arm,
                                angle: p.windupAngle * 0.5,
                                duration: (p.swingSpeed * 0.6) / s,
                                ease: 'Power2',
                                onComplete: () => {
                                    if (gen !== animGeneration) return;
                                    scene.tweens.add({
                                        targets: partSprites.right_arm,
                                        angle: 0,
                                        duration: p.recoveryTime / s,
                                        ease: 'Sine.easeOut',
                                        onComplete: () => { if (gen === animGeneration && looping) playAnimation(); }
                                    });
                                }
                            });
                        }
                    });
                }
                if (partSprites.torso) {
                    scene.tweens.add({
                        targets: partSprites.torso,
                        x: partSprites.torso._baseX - p.lungeDistance,
                        duration: p.swingSpeed / s,
                        yoyo: true,
                        ease: 'Sine.easeInOut'
                    });
                }
                break;

            case 'hit':
                const allParts = Object.values(partSprites);
                allParts.forEach(sprite => {
                    scene.tweens.add({
                        targets: sprite,
                        x: sprite._baseX + p.knockbackDist,
                        duration: p.flashDuration / s,
                        yoyo: true,
                        ease: 'Power2'
                    });
                    sprite.setTint(0xff4444);
                    pendingTimers.push(scene.time.delayedCall(p.flashDuration / s, () => {
                        if (gen !== animGeneration) return;
                        sprite.clearTint();
                    }));
                });
                pendingTimers.push(scene.time.delayedCall((p.flashDuration + p.recoveryTime) / s, () => {
                    if (gen !== animGeneration) return;
                    allParts.forEach(sprite => {
                        sprite.x = sprite._baseX;
                        sprite.y = sprite._baseY;
                    });
                    if (looping) playAnimation();
                }));
                break;

            case 'death':
                const deathParts = Object.values(partSprites);
                deathParts.forEach(sprite => {
                    scene.tweens.add({
                        targets: sprite,
                        angle: p.fallAngle,
                        duration: p.fallDuration / s,
                        ease: 'Bounce.easeOut'
                    });
                    scene.tweens.add({
                        targets: sprite,
                        alpha: 0,
                        duration: p.fadeSpeed / s,
                        delay: p.fallDuration / s * 0.5,
                        ease: 'Linear',
                        onComplete: () => {
                            if (gen !== animGeneration) return;
                            if (looping) {
                                pendingTimers.push(scene.time.delayedCall(500 / s, () => {
                                    if (gen !== animGeneration) return;
                                    deathParts.forEach(sp => {
                                        sp.angle = 0;
                                        sp.alpha = 1;
                                    });
                                    playAnimation();
                                }));
                            }
                        }
                    });
                });
                break;
        }

        updateCode();
    }

    function playCustomSteps(anim, spd, gen) {
        const steps = anim.steps || [];
        const animSpeed = (anim.speed || 1) * spd;

        steps.forEach(step => {
            const sprite = partSprites[step.target];
            if (!sprite) return;

            const tweenConfig = {
                targets: sprite,
                duration: (step.duration || 300) / animSpeed,
                ease: step.ease || 'Sine.easeInOut',
                yoyo: step.yoyo || false,
                repeat: step.repeat !== undefined ? step.repeat : 0,
                delay: (step.delay || 0) / animSpeed,
                hold: (step.hold || 0) / animSpeed
            };

            // Map tween properties
            if (step.angle !== undefined) {
                if (typeof step.angle === 'object') {
                    tweenConfig.angle = step.angle; // { from, to }
                } else {
                    tweenConfig.angle = step.angle;
                }
            }
            if (step.x !== undefined) {
                if (typeof step.x === 'string' && step.x.startsWith('+=')) {
                    tweenConfig.x = sprite._baseX + parseFloat(step.x.slice(2));
                } else if (typeof step.x === 'string' && step.x.startsWith('-=')) {
                    tweenConfig.x = sprite._baseX - parseFloat(step.x.slice(2));
                } else {
                    tweenConfig.x = step.x;
                }
            }
            if (step.y !== undefined) {
                if (typeof step.y === 'string' && step.y.startsWith('+=')) {
                    tweenConfig.y = sprite._baseY + parseFloat(step.y.slice(2));
                } else if (typeof step.y === 'string' && step.y.startsWith('-=')) {
                    tweenConfig.y = sprite._baseY - parseFloat(step.y.slice(2));
                } else {
                    tweenConfig.y = step.y;
                }
            }
            if (step.scaleX !== undefined) tweenConfig.scaleX = step.scaleX;
            if (step.scaleY !== undefined) tweenConfig.scaleY = step.scaleY;
            if (step.alpha !== undefined) tweenConfig.alpha = step.alpha;

            if (step.tint) {
                const tintColor = parseInt(step.tint.replace('#', '0x'));
                sprite.setTint(tintColor);
                if (step.duration) {
                    pendingTimers.push(scene.time.delayedCall(tweenConfig.duration, () => {
                        if (gen !== animGeneration) return;
                        sprite.clearTint();
                    }));
                }
            }

            scene.tweens.add(tweenConfig);
        });

        // If looping and no steps have repeat:-1, replay after total duration
        const hasInfiniteRepeat = steps.some(s => s.repeat === -1);
        if (anim.loop && !hasInfiniteRepeat && steps.length > 0) {
            const maxDuration = Math.max(...steps.map(s =>
                ((s.delay || 0) + (s.duration || 300) * (s.yoyo ? 2 : 1)) / animSpeed
            ));
            pendingTimers.push(scene.time.delayedCall(maxDuration + 100, () => {
                if (gen !== animGeneration) return;
                if (anim.loop) playAnimation();
            }));
        }
    }

    function pauseAnimation() {
        if (!scene) return;
        playing = false;
        scene.tweens.pauseAll();
    }

    function stepAnimation() {
        if (!scene) return;
        if (!playing) {
            playAnimation();
            scene.tweens.pauseAll();
        }
        // Advance tweens by one frame (~16ms)
        const tweens = scene.tweens.getAllTweens();
        tweens.forEach(t => {
            t.resume();
        });
        scene.time.delayedCall(16, () => {
            scene.tweens.pauseAll();
        });
    }

    // --- Code Generation ---

    function updateCode() {
        const codeEl = document.getElementById('anim-code');
        codeEl.textContent = generateCode();
    }

    function generateCode() {
        // Custom animation — generate code from steps
        if (currentCustomAnim) {
            return generateCustomCode(currentCustomAnim);
        }

        const p = paramValues;
        const preset = currentPreset;
        const repeat = looping ? -1 : 0;

        let code = `function create${capitalize(preset)}Animation(scene, parts, speed) {\n    speed = speed || 1;\n`;

        switch (preset) {
            case 'idle':
                code += tweenCode('parts.torso', {
                    scaleY: `{ from: 1.0, to: ${(1 + p.breatheAmplitude).toFixed(3)} }`,
                    duration: `${p.breatheSpeed} / speed`,
                    yoyo: true, repeat, ease: `'Sine.easeInOut'`
                });
                code += tweenCode('parts.head', {
                    y: `parts.head.y - ${(p.breatheAmplitude * 40).toFixed(1)}`,
                    duration: `${p.breatheSpeed} / speed`,
                    yoyo: true, repeat, ease: `'Sine.easeInOut'`
                });
                code += tweenCode('parts.left_arm', {
                    angle: `{ from: -${p.armSwayRange}, to: ${p.armSwayRange} }`,
                    duration: `${Math.round(p.breatheSpeed * 1.2)} / speed`,
                    yoyo: true, repeat, ease: `'Sine.easeInOut'`
                });
                code += tweenCode('parts.right_arm', {
                    angle: `{ from: -${p.armSwayRange}, to: ${p.armSwayRange} }`,
                    duration: `${Math.round(p.breatheSpeed * 1.2)} / speed`,
                    yoyo: true, repeat, ease: `'Sine.easeInOut'`,
                    delay: 100
                });
                break;

            case 'walk':
                code += tweenCode('parts.torso', {
                    y: `parts.torso.y - ${p.bobHeight}`,
                    duration: `${Math.round(p.stepSpeed / 2)} / speed`,
                    yoyo: true, repeat, ease: `'Sine.easeInOut'`
                });
                code += tweenCode('parts.head', {
                    y: `parts.head.y - ${p.bobHeight}`,
                    duration: `${Math.round(p.stepSpeed / 2)} / speed`,
                    yoyo: true, repeat, ease: `'Sine.easeInOut'`
                });
                code += tweenCode('parts.legs', {
                    angle: `{ from: -3, to: 3 }`,
                    duration: `${p.stepSpeed} / speed`,
                    yoyo: true, repeat, ease: `'Sine.easeInOut'`
                });
                code += tweenCode('parts.left_arm', {
                    angle: `{ from: -${p.armSwingRange}, to: ${p.armSwingRange} }`,
                    duration: `${p.stepSpeed} / speed`,
                    yoyo: true, repeat, ease: `'Sine.easeInOut'`
                });
                code += tweenCode('parts.right_arm', {
                    angle: `{ from: -${p.armSwingRange}, to: ${p.armSwingRange} }`,
                    duration: `${p.stepSpeed} / speed`,
                    yoyo: true, repeat, ease: `'Sine.easeInOut'`,
                    delay: `${Math.round(p.stepSpeed / 2)} / speed`
                });
                break;

            case 'attack':
                code += `    // Windup\n`;
                code += tweenCode('parts.right_arm', {
                    angle: -p.windupAngle,
                    duration: `${p.swingSpeed} / speed`,
                    ease: `'Back.easeIn'`
                });
                code += `    // Swing forward (chain after windup)\n`;
                code += `    scene.time.delayedCall(${p.swingSpeed} / speed, () => {\n`;
                code += `        scene.tweens.add({\n            targets: parts.right_arm,\n            angle: ${Math.round(p.windupAngle * 0.5)},\n            duration: ${Math.round(p.swingSpeed * 0.6)} / speed,\n            ease: 'Power2'\n        });\n    });\n`;
                code += tweenCode('parts.torso', {
                    x: `parts.torso.x - ${p.lungeDistance}`,
                    duration: `${p.swingSpeed} / speed`,
                    yoyo: true,
                    ease: `'Sine.easeInOut'`
                });
                break;

            case 'hit':
                code += `    const allParts = Object.values(parts);\n`;
                code += `    allParts.forEach(sprite => {\n`;
                code += `        scene.tweens.add({\n            targets: sprite,\n            x: sprite.x + ${p.knockbackDist},\n            duration: ${p.flashDuration} / speed,\n            yoyo: true,\n            ease: 'Power2'\n        });\n`;
                code += `        sprite.setTint(0xff4444);\n`;
                code += `        scene.time.delayedCall(${p.flashDuration} / speed, () => sprite.clearTint());\n`;
                code += `    });\n`;
                break;

            case 'death':
                code += `    Object.values(parts).forEach(sprite => {\n`;
                code += `        scene.tweens.add({\n            targets: sprite,\n            angle: ${p.fallAngle},\n            duration: ${p.fallDuration} / speed,\n            ease: 'Bounce.easeOut'\n        });\n`;
                code += `        scene.tweens.add({\n            targets: sprite,\n            alpha: 0,\n            duration: ${p.fadeSpeed} / speed,\n            delay: ${Math.round(p.fallDuration * 0.5)} / speed,\n            ease: 'Linear'\n        });\n`;
                code += `    });\n`;
                break;
        }

        code += `}`;
        return code;
    }

    function tweenCode(target, props) {
        let lines = [`    scene.tweens.add({\n        targets: ${target}`];
        for (const [key, val] of Object.entries(props)) {
            if (key === 'targets') continue;
            lines.push(`        ${key}: ${val}`);
        }
        return lines.join(',\n') + '\n    });\n';
    }

    function generateCustomCode(anim) {
        const name = anim.name.replace(/[^a-zA-Z0-9]/g, '_');
        let code = `function create${capitalize(name)}Animation(scene, parts, speed) {\n    speed = speed || 1;\n`;

        for (const step of anim.steps) {
            const target = `parts.${step.target}`;
            const props = {};
            if (step.angle !== undefined) {
                props.angle = typeof step.angle === 'object'
                    ? `{ from: ${step.angle.from}, to: ${step.angle.to} }`
                    : step.angle;
            }
            if (step.x !== undefined) {
                props.x = typeof step.x === 'string'
                    ? `${target}.x ${step.x.startsWith('-') ? '' : '+'}${step.x.replace('+=', '+ ').replace('-=', '- ')}`
                    : step.x;
            }
            if (step.y !== undefined) {
                props.y = typeof step.y === 'string'
                    ? `${target}.y ${step.y.startsWith('-') ? '' : '+'}${step.y.replace('+=', '+ ').replace('-=', '- ')}`
                    : step.y;
            }
            if (step.scaleX !== undefined) props.scaleX = step.scaleX;
            if (step.scaleY !== undefined) props.scaleY = step.scaleY;
            if (step.alpha !== undefined) props.alpha = step.alpha;
            props.duration = `${step.duration || 300} / speed`;
            if (step.delay) props.delay = `${step.delay} / speed`;
            if (step.ease) props.ease = `'${step.ease}'`;
            if (step.yoyo) props.yoyo = true;
            if (step.repeat !== undefined) props.repeat = step.repeat;

            code += tweenCode(target, props);
        }

        code += '}';
        return code;
    }

    function capitalize(s) {
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    return { init, onActivate, onProjectChange, loadCustomAnimations };
})();
