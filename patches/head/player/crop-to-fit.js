// Crop-to-fit: remove letterbox / pillarbox bars in the player.
// Modes cycle Fit -> Crop (fill, keep aspect, crop edges) -> Stretch (fill, distort).
//   * On-screen button (top-right of the player, focusable, appears with any input)
//   * Remote: Up (while the button shows) then OK, or Green then Blue within 1.5s
//   * Keyboard: Z
(function() {
    var RT = window.__vidaaRuntime;
    var log = RT.logger('crop');
    var KEY = 'stremio_video_fit_mode';
    var MODES = ['contain', 'cover', 'fill'];
    var LABELS = { contain: 'Fit', cover: 'Crop to fill', fill: 'Stretch' };
    var button = null;
    var hideTimer = null;

    function getMode() {
        var m = RT.store.get(KEY, 'contain');
        return MODES.indexOf(m) !== -1 ? m : 'contain';
    }

    // TV video planes often ignore object-fit, so scale the element itself.
    // The element fills its container and the picture is letterboxed inside it,
    // so work out the picture's on-screen size, then scale it to fill.
    function computeTransform(video, mode) {
        var cw = video.clientWidth || window.innerWidth;
        var ch = video.clientHeight || window.innerHeight;
        var vw = video.videoWidth, vh = video.videoHeight;
        if (mode === 'contain' || !vw || !vh || !cw || !ch) return '';
        var pw = Math.min(cw, ch * vw / vh); // picture size when fitted
        var ph = Math.min(ch, cw * vh / vw);
        var sx, sy;
        if (mode === 'fill') { sx = cw / pw; sy = ch / ph; }
        else { sx = sy = Math.max(cw / pw, ch / ph); }
        if (Math.abs(sx - 1) < 0.005 && Math.abs(sy - 1) < 0.005) return '';
        return 'scale(' + sx.toFixed(4) + ',' + sy.toFixed(4) + ')';
    }

    function applyToVideo(video) {
        if (!video) return;
        var mode = getMode();
        video.style.objectFit = '';
        video.style.transformOrigin = 'center center';
        video.style.transform = computeTransform(video, mode);
        if (video.parentElement) video.parentElement.style.overflow = mode === 'contain' ? '' : 'hidden';
        video.setAttribute('data-vidaa-fit', mode);
        if (!video.__vidaaCropBound) {
            video.__vidaaCropBound = true;
            video.addEventListener('loadedmetadata', function() { applyToVideo(video); });
            video.addEventListener('resize', function() { applyToVideo(video); });
        }
    }

    function applyAll() {
        var vids = document.querySelectorAll('video');
        for (var i = 0; i < vids.length; i++) applyToVideo(vids[i]);
        if (button) button.textContent = '⤢ ' + LABELS[getMode()];
    }

    function toast(msg) {
        try { window.__vidaaUI.toastCenter(msg, { ms: 1500 }); } catch (e) {}
    }

    function cycle() {
        var next = MODES[(MODES.indexOf(getMode()) + 1) % MODES.length];
        RT.store.set(KEY, next);
        applyAll();
        toast('Video: ' + LABELS[next]);
        log('mode ->', next);
        showButton();
    }

    function showButton() {
        if (!button || !RT.inPlayer()) return;
        button.style.opacity = '1';
        button.style.pointerEvents = 'auto';
        clearTimeout(hideTimer);
        hideTimer = setTimeout(function() {
            if (document.activeElement === button) { showButton(); return; }
            button.style.opacity = '0';
            button.style.pointerEvents = 'none';
        }, 4000);
    }

    function buildButton() {
        button = document.createElement('button');
        button.id = 'vidaa-crop-btn';
        button.type = 'button';
        button.tabIndex = 0;
        button.style.cssText = 'position:fixed;top:24px;right:24px;z-index:99998;padding:10px 18px;'
            + 'font-size:18px;font-weight:600;color:#fff;background:rgba(12,12,16,0.85);'
            + 'border:2px solid rgba(255,255,255,0.35);border-radius:10px;opacity:0;'
            + 'pointer-events:none;transition:opacity .25s;cursor:pointer;outline:none;';
        button.addEventListener('focus', function() { button.style.borderColor = '#7b5bf5'; });
        button.addEventListener('blur', function() { button.style.borderColor = 'rgba(255,255,255,0.35)'; });
        button.addEventListener('click', cycle);
        document.body.appendChild(button);
        applyAll();
    }

    function init() {
        if (!document.body) { document.addEventListener('DOMContentLoaded', init); return; }
        buildButton();
        RT.dom.onVideoAdded(function(v) {
            applyToVideo(v);
            // Stremio re-applies inline styles on some state changes; keep ours.
            try {
                new MutationObserver(function() {
                    if (getMode() !== 'contain' && !v.style.transform) applyToVideo(v);
                }).observe(v, { attributes: true, attributeFilter: ['style'] });
            } catch (e) {}
        });
        // D-pad reach: Stremio owns the arrow keys, so while the button is showing
        // Up focuses it, OK/Enter activates it, anything else hands focus back.
        document.addEventListener('keydown', function(e) {
            if (!RT.inPlayer() || !button) return;
            var visible = button.style.opacity === '1';
            var focused = document.activeElement === button;
            var k = e.keyCode;
            if (visible && !focused && k === 38) {
                button.focus();
                showButton();
                e.preventDefault(); e.stopPropagation();
                return;
            }
            if (focused) {
                if (k === 13) {
                    cycle();
                    e.preventDefault(); e.stopPropagation();
                } else if (k === 40 || k === 37 || k === 39 || k === 38 || k === 8 || k === 27 || k === 461 || k === 10009) {
                    button.blur();
                    e.preventDefault(); e.stopPropagation();
                }
            }
        }, true);
        ['keydown', 'mousemove', 'click'].forEach(function(ev) {
            document.addEventListener(ev, function() { showButton(); }, true);
        });
        window.addEventListener('resize', applyAll);
        window.addEventListener('hashchange', function() {
            if (!RT.inPlayer() && button) { button.style.opacity = '0'; button.style.pointerEvents = 'none'; }
            else showButton();
        });
    }

    window.__vidaaKeys.on('green+blue', cycle, { route: 'player', priority: 600, suppress: true, window: 1500 });
    window.__vidaaKeys.on('z', cycle, { route: 'player' });

    window.__vidaaCropToFit = { cycle: cycle, mode: getMode };
    init();
})();
