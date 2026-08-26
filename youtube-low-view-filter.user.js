// ==UserScript==
// @name         YouTube Low-View Filter
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Remove YouTube videos below a view-count threshold (handles modern 2024-2026 layouts)
// @author       You
// @match        https://www.youtube.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    /* -------------------- CONFIG -------------------- */
    const MIN_VIEWS_TO_KEEP = 999;   // Videos with fewer views are hidden
    const DEBUG = true;              // Set to false to disable console logs

    /* -------------------- UTILS -------------------- */
    function log(...args) {
        if (DEBUG) console.log('[YT-Filter]', ...args);
    }

    /**
     * Parse a view-count string into a number.
     * Handles: "737 views", "1.2K views", "1,234", "No views", "0 views", "2.5M", etc.
     */
    function parseViewCount(text) {
        if (!text) return -1;
        text = text.trim();

        // "No views" / "0 views"
        if (/^\s*no views?\s*$/i.test(text)) return 0;

        // Extract number + optional K/M/B suffix, followed by optional "view(s)"
        const m = text.match(/([\d,.]+)\s*([KMBkmb]?)\s*(?:view|views)?/i);
        if (!m) return -1;

        let numStr = m[1].replace(/,/g, ''); // strip commas
        let suffix = m[2].toUpperCase();
        let num = parseFloat(numStr);

        if (isNaN(num)) return -1;

        switch (suffix) {
            case 'K': num *= 1_000; break;
            case 'M': num *= 1_000_000; break;
            case 'B': num *= 1_000_000_000; break;
        }
        return Math.floor(num);
    }

    /**
     * Try several strategies to find the view count inside a video card.
     * YouTube A/B tests layouts constantly, so we use multiple fallbacks.
     */
    function getViewCount(video) {
        // ── Strategy 1: aria-label attributes often hold the raw count ──
        const ariaEls = video.querySelectorAll('[aria-label]');
        for (const el of ariaEls) {
            const label = el.getAttribute('aria-label');
            if (label && /\b\d[\d,.]*\s*[KMBkmb]?\s*views?\b/i.test(label)) {
                const c = parseViewCount(label);
                if (c !== -1) return c;
            }
        }

        // ── Strategy 2: new 2024-2026 metadata text classes ──
        const metaTexts = video.querySelectorAll(
            '.ytContentMetadataViewModelMetadataText, ' +
            '.yt-lockup-metadata-view-model .ytAttributedStringHost'
        );
        for (const el of metaTexts) {
            const txt = el.textContent || el.innerText;
            if (txt && /\b\d[\d,.]*\s*[KMBkmb]?\s*views?\b/i.test(txt)) {
                const c = parseViewCount(txt);
                if (c !== -1) return c;
            }
        }

        // ── Strategy 3: legacy ytd-video-meta-block / metadata-line ──
        const legacy = video.querySelectorAll(
            '#metadata-line span, ytd-video-meta-block span, ' +
            '.ytd-video-meta-block span, #metadata span'
        );
        for (const el of legacy) {
            const txt = el.textContent || el.innerText;
            if (txt && /\b\d[\d,.]*\s*[KMBkmb]?\s*views?\b/i.test(txt)) {
                const c = parseViewCount(txt);
                if (c !== -1) return c;
            }
        }

        // ── Strategy 4: any child span/div that looks like a view count ──
        // We scope this narrowly to avoid matching "preview", "interview", etc.
        const all = video.querySelectorAll('span, div, p');
        for (const el of all) {
            const txt = el.textContent || el.innerText;
            // Must contain a number followed by optional K/M/B and the word "view(s)"
            if (/\b\d[\d,.]*\s*[KMBkmb]?\s+views?\b/i.test(txt)) {
                const c = parseViewCount(txt);
                if (c !== -1) return c;
            }
        }

        return -1; // not found
    }

    /* -------------------- HELPERS -------------------- */
    function IsMembersOnly(video) {
        // Members-only badge detection (SVG path or text)
        return !!video.querySelector(
            '.badge-style-type-members-only, ' +
            '[aria-label*="Members only" i], ' +
            '[aria-label*="Member-only" i]'
        );
    }

    function IsShorts() {
        return location.pathname.startsWith('/shorts');
    }

    function IsWatch() {
        return location.pathname === '/watch';
    }

    function RemoveVideoCard(video, reason) {
        if (video.style.display === 'none') return;
        log('Removing video:', reason);
        video.style.display = 'none';
        video.setAttribute('data-yt-filter-removed', '1');
    }

    /* -------------------- MAIN FILTER -------------------- */
    function UpdateVideoFiltering() {
        if (IsShorts()) return;

        // Selectors that cover search, home, subscriptions, sidebar, channel grids
        const selectors = [
            'ytd-video-renderer',            // Search / home (legacy & new lockup inside)
            'ytd-rich-item-renderer',        // Home / subscriptions rich grid
            'ytd-compact-video-renderer',    // Watch-page sidebar / Up next
            'ytd-grid-video-renderer',       // Channel videos tab grid
            'ytd-playlist-video-renderer',   // Playlist pages
            'yt-lockup-view-model',          // Experimental 2025-2026 lockup
            'ytd-reel-item-renderer'         // Shorts in search (we skip these below)
        ].join(', ');

        const videos = document.querySelectorAll(selectors);

        videos.forEach(video => {
            // Already processed or already removed?
            if (video.getAttribute('data-lowview-checked') === '1') return;
            if (video.getAttribute('data-yt-filter-removed') === '1') return;

            // Skip Shorts
            if (video.tagName.toLowerCase() === 'ytd-reel-item-renderer') return;
            if (video.querySelector('a[href^="/shorts/"]')) return;

            try {
                const count = getViewCount(video);
                const viewText = count === -1 ? 'unknown' : count.toLocaleString();

                log('Checked:', viewText, 'views | tag:', video.tagName.toLowerCase());

                // Mark as checked only when we successfully parsed a number
                if (count !== -1) {
                    video.setAttribute('data-lowview-checked', '1');
                }

                // Remove if below threshold OR members-only
                if ((count !== -1 && count < MIN_VIEWS_TO_KEEP) || IsMembersOnly(video)) {
                    RemoveVideoCard(video, `views: ${viewText} (threshold: ${MIN_VIEWS_TO_KEEP})`);
                }
            } catch (e) {
                log('Filtering error:', e);
            }
        });
    }

    /* -------------------- TRIGGERS -------------------- */
    let debounceTimer;

    function scheduleUpdate(delay = 200) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(UpdateVideoFiltering, delay);
    }

    // YouTube's internal navigation event
    document.addEventListener('yt-navigate-finish', () => {
        setTimeout(UpdateVideoFiltering, 350);
    });

    window.addEventListener('message', () => {
        if (!IsShorts()) scheduleUpdate(200);
    });

    window.addEventListener('load', () => {
        if (!IsShorts()) scheduleUpdate(200);
    });

    window.addEventListener('scrollend', () => {
        if (!IsShorts()) scheduleUpdate(0);
    });

    window.addEventListener('click', () => {
        if (!IsShorts()) scheduleUpdate(200);
    });

    // Detect SPA URL changes
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            if (IsWatch()) {
                setTimeout(UpdateVideoFiltering, 500);
            }
        }
    }).observe(document, { subtree: true, childList: true });

    // Detect dynamic content injection (related videos, continue watching, etc.)
    const contentObserver = new MutationObserver((mutations) => {
        if (IsShorts()) return;
        let shouldFilter = false;
        for (const m of mutations) {
            if (m.type === 'childList' && m.addedNodes.length > 0) {
                shouldFilter = true;
                break;
            }
        }
        if (shouldFilter) scheduleUpdate(150);
    });

    if (document.body) {
        contentObserver.observe(document.body, { childList: true, subtree: true });
    } else {
        window.addEventListener('DOMContentLoaded', () => {
            contentObserver.observe(document.body, { childList: true, subtree: true });
        });
    }

    // First run
    setTimeout(UpdateVideoFiltering, 600);

})();