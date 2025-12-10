(function() {
    const TURNSTILE_SITE_KEY = "0x4AAAAAACDFJFkgBiwww4ZT";
    // 🔴 UPDATE: Use your actual Cloud Run URL here
    const ENDPOINT = "https://adblock-bot-detector-272425173894.europe-central2.run.app";

    // Global state to track if we successfully sent data
    let dataSent = false;
    let turnstileToken = null;
    let detectedBrowser = 'Unknown'; // Store browser immediately to avoid async on exit
    
    // Default network results (1 = Blocked, 0 = Allowed)
    let networkResults = {
        gtm: 0, fb: 0, ga: 0, ads: 0, bing: 0, cookie: 0
    };

    async function getBrowser() {
        var userAgent = navigator.userAgent;
        if (userAgent.indexOf("Edg") > -1) return "Edge";
        if (userAgent.indexOf("Firefox") > -1) return "Firefox";
        if (userAgent.indexOf("OPR") > -1 || userAgent.indexOf("Opera") > -1) return "Opera";
        if (userAgent.indexOf("Vivaldi") > -1) return "Vivaldi";
        if (userAgent.indexOf("Brave") > -1 || (navigator.brave && await navigator.brave.isBrave())) return "Brave";
        if (userAgent.indexOf("Safari") > -1 && userAgent.indexOf("Chrome") === -1) return "Safari";
        if (userAgent.indexOf("Chrome") > -1) return "Chrome";
        return "Other";
    }

    // ⚡ Pre-calculate browser immediately so we don't await on exit
    getBrowser().then(b => detectedBrowser = b);

    // --- 1. Passive Network Check ---
    async function checkResourceBlocked(url) {
        try {
            await fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store' });
            return 0; 
        } catch (error) { return 1; }
    }

    // --- 2. Data Collection & Sending ---
    function getScriptParams() {
        if (document.currentScript) return new URLSearchParams(document.currentScript.src.split('?')[1]);
        const script = document.querySelector('script[src*="adblock-collector.js"]') || 
                       document.querySelector('script[src*="adblock-tracker.js"]');
        return (script && script.src.includes('?')) ? new URLSearchParams(script.src.split('?')[1]) : new URLSearchParams();
    }
    const scriptParams = getScriptParams();

    function getQueryParam(name) {
        return new URLSearchParams(window.location.search).get(name) || '';
    }

    // ⚡ CORE FUNCTION: Sends data using fetch + keepalive (Robust on Exit)
    function sendAnalyticsData() {
        if (dataSent) return; // Prevent double sending
        dataSent = true;

        // Check if CSS bait was hidden (Adblock detection)
        let adBlockDetected = 0;
        const bait = document.querySelector('.pub_300x250');
        if (bait && (bait.offsetHeight === 0 || bait.offsetWidth === 0 || window.getComputedStyle(bait).display === 'none')) {
            adBlockDetected = 1;
        }

        const payload = {
            recaptchaToken: turnstileToken, // Null if user leaves early
            browser: detectedBrowser, // Use pre-calculated value
            adBlockDetected: adBlockDetected,
            
            // Network results
            facebookRequestBlocked: networkResults.fb,
            googleAnalyticsRequestBlocked: networkResults.ga,
            googleAdsRequestBlocked: networkResults.ads,
            bingAdsRequestBlocked: networkResults.bing,
            cookiebotBlocked: networkResults.cookie,
            gtmRequestBlocked: networkResults.gtm,
            
            hostname: window.location.hostname,
            pageURL: window.location.href,
            event_name: scriptParams.get('event_name') || 'unknown_event',
            value: scriptParams.get('event_value') || '',
            referrer: document.referrer || '(direct)',
            utm_source: getQueryParam('utm_source'),
            utm_medium: getQueryParam('utm_medium'),
            utm_campaign: getQueryParam('utm_campaign')
        };

        const jsonPayload = JSON.stringify(payload);

        // 🟢 CHANGED: We removed sendBeacon because it struggles with CORS + JSON on exit.
        // We now exclusively use fetch with keepalive: true, which is the modern standard for this.
        fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: jsonPayload,
            keepalive: true 
        }).then(res => res.json()).then(response => {
            // Push to DataLayer (only if user is still on page)
            if (window.dataLayer) {
                window.dataLayer.push({
                    'event': 'turnstile_verified', 
                    'bot_score': response.recaptcha_score, 
                    'ad_block_detected': adBlockDetected
                });
            }
        }).catch(err => {
            // Suppress errors during unload to avoid "Cancelled" noise in console
            if (!document.hidden) {
                console.warn("Analytics send failed", err);
            }
        });
    }

    // --- 3. Execution Logic ---

    // A. Start CSS Bait
    var bait = document.createElement('div');
    bait.className = 'pub_300x250 pub_728x90 text-ad textAd text_ad text_ads text-ads text-ad-links';
    bait.style.cssText = 'width:1px;height:1px;position:absolute;left:-10000px;top:-10000px;';
    document.body.appendChild(bait);

    // B. Start Network Checks (Update global object as they finish)
    const updateNet = (key, prom) => prom.then(v => networkResults[key] = v);
    updateNet('gtm', checkResourceBlocked('https://www.googletagmanager.com/gtm.js?id=GTM-TQP4WV7B'));
    updateNet('fb', checkResourceBlocked('https://connect.facebook.net/en_US/fbevents.js'));
    updateNet('ga', checkResourceBlocked('https://www.google-analytics.com/analytics.js'));
    updateNet('ads', checkResourceBlocked('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'));
    updateNet('bing', checkResourceBlocked('https://bat.bing.com/bat.js'));
    updateNet('cookie', checkResourceBlocked('https://consent.cookiebot.com/uc.js'));

    // C. Start Turnstile
    function loadTurnstileToken() {
        const uniqueId = 'cf-wrapper-' + Math.random().toString(36).substr(2, 9);
        const container = document.createElement('div');
        container.id = uniqueId;
        container.style.marginTop = '20px';
        container.style.marginBottom = '20px';
        document.body.appendChild(container);

        if (!document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]') && !window.turnstile) {
            const script = document.createElement('script');
            script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
            script.async = true;
            document.head.appendChild(script);
        }

        const checkTurnstile = () => {
            if (window.turnstile) {
                try {
                    window.turnstile.render('#' + uniqueId, {
                        sitekey: TURNSTILE_SITE_KEY,
                        appearance: 'always', 
                        callback: function(token) {
                            turnstileToken = token;
                            sendData(); // Success! Send immediately.
                        }
                    });
                } catch (e) {}
            } else {
                setTimeout(checkTurnstile, 100);
            }
        };
        checkTurnstile();
        
        // Timeout Safety (15s)
        setTimeout(() => { if(!dataSent) sendAnalyticsData(); }, 15000);
    }

    // Helper wrapper to ensure we wait for Bait check before sending
    function sendData() {
        // Ensure we waited at least 200ms for CSS bait detection
        setTimeout(sendAnalyticsData, 250); 
    }

    loadTurnstileToken();

    // D. BEACON ON EXIT: If user leaves, send what we have immediately
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && !dataSent) {
            sendAnalyticsData();
        }
    });

})();
