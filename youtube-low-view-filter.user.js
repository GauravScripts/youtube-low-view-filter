// ==UserScript==
// @name         YouTube Low-View Filter
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Remove YouTube videos below a view-count threshold (handles modern 2024-2026 layouts)
// @match        https://www.youtube.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /* -------------------- CONFIG -------------------- */
    const MIN_VIEWS_TO_KEEP = 999;
    const DEBUG = true;

    /* -------------------- UTILS -------------------- */
    function log(...args) { if (DEBUG) console.log('[YT-Filter]', ...args); }

    function parseViewCount(text) {
        if (!text) return -1;
        text = text.trim();
        if (/^\s*(no views?|0 views?)\s*$/i.test(text)) return 0;
        const m = text.match(/([\d,.]+)\s*([KMBkmb]?)\s*(?:view|views)?/i);
        if (!m) return -1;
        let num = parseFloat(m[1].replace(/,/g, ''));
        if (isNaN(num)) return -1;
        switch (m[2].toUpperCase()) {
            case 'K': num *= 1_000; break;
            case 'M': num *= 1_000_000; break;
            case 'B': num *= 1_000_000_000; break;
        }
        return Math.floor(num);
    }

    function getViewCount(video) {
        // ── Strategy 0 (NEW): aria-label "No views" on the new lockup ──
        // The 2025-2026 lockup renders "0" as text but "No views" as aria-label.
        const noView = video.querySelector('[aria-label="No views" i]');
        if (noView) return 0;

        // ── Strategy 1: aria-label attributes with a number + "views" ──
        for (const el of video.querySelectorAll('[aria-label]')) {
            const label = el.getAttribute('aria-label');
            if (label && /\b\d[\d,.]*\s*[KMBkmb]?\s*views?\b/i.test(label)) {
                const c = parseViewCount(label);
                if (c !== -1) return c;
            }
        }

        // ── Strategy 2: new metadata text classes ──
        for (const el of video.querySelectorAll(
            '.ytContentMetadataViewModelMetadataText, ' +
            '.yt-lockup-metadata-view-model .ytAttributedStringHost'
        )) {
            const txt = el.textContent;
            if (txt && /\b\d[\d,.]*\s*[KMBkmb]?\s*views?\b/i.test(txt)) {
                const c = parseViewCount(txt);
                if (c !== -1) return c;
            }
        }

        // ── Strategy 3: legacy metadata ──
        for (const el of video.querySelectorAll(
            '#metadata-line span, ytd-video-meta-block span, ' +
            '.ytd-video-meta-block span, #metadata span'
        )) {
            const txt = el.textContent;
            if (txt && /\b\d[\d,.]*\s*[KMBkmb]?\s*views?\b/i.test(txt)) {
                const c = parseViewCount(txt);
                if (c !== -1) return c;
            }
        }

        return -1;
    }

    /* -------------------- HELPERS -------------------- */
    function IsMembersOnly(video) {
        return !!video.querySelector(
            '.badge-style-type-members-only, [aria-label*="Members only" i], [aria-label*="Member-only" i]'
        );
    }
    const IsShorts = () => location.pathname.startsWith('/shorts');

    function RemoveVideoCard(video, reason) {
        if (video.style.display === 'none') return;
        log('Removing video:', reason);
        video.style.display = 'none';
        video.setAttribute('data-yt-filter-removed', '1');
    }

    /* -------------------- MAIN FILTER -------------------- */
    function UpdateVideoFiltering() {
        if (IsShorts()) return;

        const selectors = [
            'ytd-video-renderer',
            'ytd-rich-item-renderer',
            'ytd-compact-video-renderer',
            'ytd-grid-video-renderer',
            'ytd-playlist-video-renderer',
            'yt-lockup-view-model'
        ].join(', ');

        document.querySelectorAll(selectors).forEach(video => {
            if (video.getAttribute('data-lowview-checked') === '1') return;
            if (video.getAttribute('data-yt-filter-removed') === '1') return;
            if (video.tagName.toLowerCase() === 'ytd-reel-item-renderer') return;
            if (video.querySelector('a[href^="/shorts/"]')) return;

            try {
                const count = getViewCount(video);
                const viewText = count === -1 ? 'unknown' : count.toLocaleString();
                log('Checked:', viewText, 'views |', video.tagName.toLowerCase());

                if (count !== -1) video.setAttribute('data-lowview-checked', '1');

                if ((count !== -1 && count < MIN_VIEWS_TO_KEEP) || IsMembersOnly(video)) {
                    RemoveVideoCard(video, `views: ${viewText}`);
                }
            } catch (e) { log('Filtering error:', e); }
        });
    }

    /* -------------------- TRIGGERS (performance-friendly) -------------------- */
    let debounceTimer;
    function scheduleUpdate(delay = 250) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(UpdateVideoFiltering, delay);
    }

    document.addEventListener('yt-navigate-finish', () => setTimeout(UpdateVideoFiltering, 400));

    let scrollTick = false;
    window.addEventListener('scroll', () => {
        if (scrollTick || IsShorts()) return;
        scrollTick = true;
        requestAnimationFrame(() => { scrollTick = false; scheduleUpdate(200); });
    }, { passive: true });

    // Cheap URL-change detection instead of observing the entire document
    let lastUrl = location.href;
    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            if (!IsShorts()) scheduleUpdate(300);
        }
    }, 500);

    // Observe ONLY the page manager, not document.body — far fewer mutations
    const pageManager = document.querySelector('ytd-page-manager') || document.body;
    const contentObserver = new MutationObserver(() => {
        if (IsShorts()) return;
        scheduleUpdate(250); // debounced; unchecked cards are skipped instantly
    });
    contentObserver.observe(pageManager, { childList: true, subtree: true });

    setTimeout(UpdateVideoFiltering, 600);
})();