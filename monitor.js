(function() {
    const TURNSTILE_SITE_KEY = "0x4AAAAAACDB4EPBzvAxPOxV";
    const ENDPOINT = "https://adblock-data-collector-922954175378.europe-west1.run.app";

    // State tracking to handle "Exit before finished"
    let turnstileToken = null;
    let networkResults = [0, 0, 0, 0, 0]; // Default to "Not Blocked"
    let adBlockDetected = 0;
    let dataSent = false;

    // --- 1. Browser Detection ---
    async function getBrowser() {
        var userAgent = navigator.userAgent;
        if (userAgent.indexOf("Edg") > -1) return "Edge";
        if (userAgent.indexOf("Firefox") > -1) return "Firefox";
        if (userAgent.indexOf("OPR") > -1 || userAgent.indexOf("Opera") > -1) return "Opera";
        if (userAgent.indexOf("Vivaldi") > -1) return "Vivaldi";
        if (userAgent.indexOf("Brave") > -1 || (navigator.brave && await navigator.brave.isBrave())) return "Brave";
        if (userAgent.indexOf("Safari") > -1 && userAgent.indexOf("Chrome") === -1) return "Safari";
        if (userAgent.indexOf("Chrome") > -1) return "Chrome";
        if (userAgent.indexOf("Trident") > -1 || userAgent.indexOf("MSIE") > -1) return "Internet Explorer";
        return "Other";
    }

    // --- 2. Network Checks ---
    async function checkResourceBlocked(url) {
        try {
            await fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store' });
            return 0;
        } catch { return 1; }
    }

    // --- 3. Parameter Helpers ---
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

    // --- 4. The Data Sender (Handles Normal & Exit sends) ---
    async function sendData() {
        if (dataSent) return;
        dataSent = true;

        const browser = await getBrowser();
        const [gtm, fb, ga, ads, bing] = networkResults;

        const payload = {
            recaptchaToken: turnstileToken, // Might be null if exiting early
            browser: browser,
            adBlockDetected: adBlockDetected,
            facebookRequestBlocked: fb,
            googleAnalyticsRequestBlocked: ga,
            googleAdsRequestBlocked: ads,
            bingAdsRequestBlocked: bing,
            gtmRequestBlocked: gtm,
            hostname: window.location.hostname,
            pageURL: window.location.href,
            event_name: scriptParams.get('event_name') || 'unknown_event',
            value: scriptParams.get('event_value') || '',
            referrer: document.referrer || '(direct)',
            utm_source: getQueryParam('utm_source'),
            utm_medium: getQueryParam('utm_medium'),
            utm_campaign: getQueryParam('utm_campaign')
        };

        // Use 'keepalive: true' to ensure request survives page close
        fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true 
        }).then(res => res.json()).then(response => {
            // Push to DataLayer if successful (and user is still here)
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push({
                'event': 'turnstile_verified', 
                'bot_score': response.recaptcha_score, 
                'ad_block_detected': adBlockDetected
            });
        }).catch(err => console.warn("Analytics send failed", err));
    }

    // --- 5. Turnstile Loader ---
    function loadTurnstileToken() {
        const uniqueId = 'cf-wrapper-' + Math.random().toString(36).substr(2, 9);
        const container = document.createElement('div');
        container.id = uniqueId;
        container.style.marginTop = '20px';
        container.style.marginBottom = '20px';
        document.body.appendChild(container);

        if (!window.turnstile) {
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
                            turnstileToken = token; // Store token immediately
                            sendData(); // Send immediately on success
                        }
                    });
                } catch (e) { /* Ignore render errors */ }
            } else {
                setTimeout(checkTurnstile, 100);
            }
        };
        checkTurnstile();
    }

    // --- 6. Execution & Safety Nets ---
    
    // A. Start Network Checks immediately
    Promise.all([
        checkResourceBlocked('https://www.googletagmanager.com/gtm.js?id=GTM-TEST'),
        checkResourceBlocked('https://connect.facebook.net/en_US/fbevents.js'),
        checkResourceBlocked('https://www.google-analytics.com/analytics.js'),
        checkResourceBlocked('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'),
        checkResourceBlocked('https://bat.bing.com/bat.js')
    ]).then(results => {
        networkResults = results; // Update global state
    });

    // B. Start CSS Bait
    var bait = document.createElement('div');
    bait.className = 'pub_300x250 pub_728x90 text-ad textAd';
    bait.style.cssText = 'width:1px;height:1px;position:absolute;left:-10000px;top:-10000px;';
    document.body.appendChild(bait);
    setTimeout(() => {
        if (bait.offsetHeight === 0 || bait.offsetWidth === 0 || window.getComputedStyle(bait).display === 'none') {
            adBlockDetected = 1;
        }
        document.body.removeChild(bait);
    }, 200);

    // C. Start Turnstile (Triggers sendData on success)
    loadTurnstileToken();

    // D. "Safety Valve" - If nothing happens in 15s, send what we have
    setTimeout(() => {
        if (!dataSent) sendData();
    }, 15000);

    // E. "Exit Valve" - If user leaves, send what we have IMMEDIATELY
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && !dataSent) {
            sendData(); // Sends with null token if Turnstile wasn't done
        }
    });

})();
