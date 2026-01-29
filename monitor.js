(function() {
    // 🔴 CONFIGURATION: Your Cloud Run Endpoint
    const ENDPOINT = "https://abdc-272425173894.europe-central2.run.app";

    // Global state
    let dataSent = false;
    let detectedBrowser = 'Unknown';
    
    // Store network check results
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
        if (userAgent.indexOf("Trident") > -1 || userAgent.indexOf("MSIE") > -1) return "Internet Explorer";
        return "Other";
    }

    // Pre-calculate browser immediately
    getBrowser().then(b => detectedBrowser = b);

    // --- 1. Passive Network Check ---
    async function checkResourceBlocked(url) {
        try {
            await fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store' });
            return 0; 
        } catch (error) {
            return 1; 
        }
    }

    // --- 2. Data Collection & Sending ---
    function getScriptParams() {
        // Fallback-safe parameter extraction
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
            // Removed isBotDetected to avoid Fingerprinting flags in Brave
            
            browser: detectedBrowser,
            adBlockDetected: adBlockDetected,
            
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

    // --- 3. Execution Logic ---

    var bait = document.createElement('div');
    bait.className = 'pub_300x250 pub_728x90 text-ad textAd text_ad text_ads text-ads text-ad-links';
    bait.style.cssText = 'width:1px;height:1px;position:absolute;left:-10000px;top:-10000px;';
    document.body.appendChild(bait);

    const updateNet = (key, prom) => prom.then(v => networkResults[key] = v);
    
    Promise.all([
        updateNet('gtm', checkResourceBlocked('https://www.googletagmanager.com/gtm.js?id=GTM-TQP4WV7B')),
        updateNet('fb', checkResourceBlocked('https://connect.facebook.net/en_US/fbevents.js')),
        updateNet('ga', checkResourceBlocked('https://www.google-analytics.com/analytics.js')),
        updateNet('ads', checkResourceBlocked('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js')),
        updateNet('bing', checkResourceBlocked('https://bat.bing.com/bat.js')),
        updateNet('cookie', checkResourceBlocked('https://consent.cookiebot.com/uc.js'))
    ]).then(() => {
        setTimeout(sendAnalyticsData, 250);
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && !dataSent) {
            sendAnalyticsData();
        }
    });

})();
