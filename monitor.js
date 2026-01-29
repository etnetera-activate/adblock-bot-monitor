(function() {
    // 🔴 CONFIGURATION
    const TURNSTILE_SITE_KEY = "0x4AAAAAACDFJFkgBiwww4ZT";
    const ENDPOINT = "https://abdc-272425173894.europe-central2.run.app";

    // Global state
    let dataSent = false;
    let turnstileToken = null;
    let detectedBrowser = 'Unknown';
    
    // Store network check results
    let networkResults = {
        gtm: 0, fb: 0, ga: 0, ads: 0, bing: 0, cookie: 0
    };

    // --- 1. Manual Bot Detection (Client Side) ---
    function isBot() {
        return (
            navigator.webdriver || 
            window.outerWidth === 0 || 
            window.outerHeight === 0 || 
            navigator.hardwareConcurrency === 0 ||
            (navigator.languages && navigator.languages.length === 0)
        );
    }

    async function getBrowser() {
        var userAgent = navigator.userAgent;

        // Arc Browser Detection (CSS Check - most reliable for Arc)
        if (getComputedStyle(document.documentElement).getPropertyValue('--arc-palette-title')) {
            return "Arc Browser";
        }

        if (userAgent.indexOf("Edg") > -1) return "Edge";
        if (userAgent.indexOf("Seznam.cz") > -1) return "Seznam Browser";
        if (userAgent.indexOf("SamsungBrowser") > -1) return "Samsung Internet";
        if (userAgent.indexOf("UCBrowser") > -1) return "UC Browser";
        if (userAgent.indexOf("YaBrowser") > -1) return "Yandex";
        if (userAgent.indexOf("Firefox") > -1) return "Firefox";
        if (userAgent.indexOf("OPR") > -1 || userAgent.indexOf("Opera") > -1) return "Opera";
        if (userAgent.indexOf("Vivaldi") > -1) return "Vivaldi";
        if (userAgent.indexOf("Brave") > -1 || (navigator.brave && await navigator.brave.isBrave())) return "Brave";
        if (userAgent.indexOf("DuckDuckGo") > -1) return "DuckDuckGo";
        
        // Arc fallback via User Agent
        if (userAgent.indexOf("Arc") > -1) return "Arc Browser";

        if (userAgent.indexOf("Safari") > -1 && userAgent.indexOf("Chrome") === -1) return "Safari";
        if (userAgent.indexOf("Chrome") > -1) return "Chrome";
        if (userAgent.indexOf("Trident") > -1 || userAgent.indexOf("MSIE") > -1) return "Internet Explorer";
        return "Other";
    }

    // Pre-calculate browser immediately
    getBrowser().then(b => detectedBrowser = b);

    // --- 2. Passive Network Check ---
    async function checkResourceBlocked(url) {
        try {
            await fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store' });
            return 0; 
        } catch (error) {
            return 1; 
        }
    }

    // --- 3. Data Collection & Sending ---
    function getScriptParams() {
        if (document.currentScript) return new URLSearchParams(document.currentScript.src.split('?')[1]);
        const script = document.querySelector('script[src*="event_name="]');
        return (script && script.src.includes('?')) ? new URLSearchParams(script.src.split('?')[1]) : new URLSearchParams();
    }
    const scriptParams = getScriptParams();

    function getQueryParam(name) {
        return new URLSearchParams(window.location.search).get(name) || '';
    }

    function sendAnalyticsData() {
        if (dataSent) return; 
        dataSent = true;

        // Check AdBlock Bait
        let adBlockDetected = 0;
        const bait = document.querySelector('.pub_300x250');
        if (bait && (bait.offsetHeight === 0 || bait.offsetWidth === 0 || window.getComputedStyle(bait).display === 'none')) {
            adBlockDetected = 1;
        }

        const payload = {
            recaptchaToken: turnstileToken || '', // Sent to look legitimate, even if server ignores it
            browser: detectedBrowser,
            adBlockDetected: adBlockDetected,
            isBotDetected: isBot() ? 1 : 0, // Restored manual bot detection
            
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

        const urlParams = new URLSearchParams();
        for (const key in payload) {
            urlParams.append(key, payload[key]);
        }

        // Fire and Forget
        if (navigator.sendBeacon) {
            const success = navigator.sendBeacon(ENDPOINT, urlParams);
            if (success) return; 
        }

        fetch(ENDPOINT, {
            method: 'POST',
            body: urlParams,
            keepalive: true 
        }).catch(err => {
            if (!document.hidden) console.warn("Analytics send failed", err);
        });
    }

    // --- 4. Execution Logic ---

    var bait = document.createElement('div');
    bait.className = 'pub_300x250 pub_728x90 text-ad textAd text_ad text_ads text-ads text-ad-links';
    bait.style.cssText = 'width:1px;height:1px;position:absolute;left:-10000px;top:-10000px;';
    document.body.appendChild(bait);

    const updateNet = (key, prom) => prom.then(v => networkResults[key] = v);
    
    // Start Network Checks
    const checksPromise = Promise.all([
        updateNet('gtm', checkResourceBlocked('https://www.googletagmanager.com/gtm.js?id=GTM-TQP4WV7B')),
        updateNet('fb', checkResourceBlocked('https://connect.facebook.net/en_US/fbevents.js')),
        updateNet('ga', checkResourceBlocked('https://www.google-analytics.com/analytics.js')),
        updateNet('ads', checkResourceBlocked('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js')),
        updateNet('bing', checkResourceBlocked('https://bat.bing.com/bat.js')),
        updateNet('cookie', checkResourceBlocked('https://consent.cookiebot.com/uc.js'))
    ]);

    // Turnstile Loader (Restored to bypass Brave blocking)
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
                            // Wait for network checks to finish before sending
                            checksPromise.then(() => sendAnalyticsData());
                        },
                        'error-callback': function() {
                            // On error, send anyway
                            checksPromise.then(() => sendAnalyticsData());
                        }
                    });
                } catch (e) { /* Ignore render errors */ }
            } else {
                setTimeout(checkTurnstile, 100);
            }
        };
        checkTurnstile();
        
        // Timeout Safety (15s)
        setTimeout(() => { if(!dataSent) sendAnalyticsData(); }, 15000);
    }

    loadTurnstileToken();

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && !dataSent) {
            sendAnalyticsData();
        }
    });

})();
