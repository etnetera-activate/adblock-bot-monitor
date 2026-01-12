(function() {
    // 🔴 CONFIGURATION
    const TURNSTILE_SITE_KEY = "0x4AAAAAACDFJFkgBiwww4ZT";
    const ENDPOINT = "https://adblock-bot-detector-272425173894.europe-central2.run.app";

    // Global state to track data for immediate sending on exit
    let dataSent = false;
    let turnstileToken = null;
    let detectedBrowser = 'Unknown';
    
    // Store network check results globally so they are ready anytime
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

    // --- 1. The Passive Network Check ---
    async function checkResourceBlocked(url) {
        try {
            await fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store' });
            return 0; 
        } catch (error) {
            return 1; 
        }
    }

    function getScriptParams() {
        if (document.currentScript) {
            return new URLSearchParams(document.currentScript.src.split('?')[1]);
        }
        const script = document.querySelector('script[src*="adblock-collector.js"]') || 
                       document.querySelector('script[src*="adblock-tracker.js"]');
        if (script && script.src.includes('?')) {
            return new URLSearchParams(script.src.split('?')[1]);
        }
        return new URLSearchParams();
    }
    const scriptParams = getScriptParams();

    function getQueryParam(name) {
        const params = new URLSearchParams(window.location.search);
        return params.get(name) || '';
    }

    // --- 2. Fire and Forget Data Sender ---
    function sendAnalyticsData() {
        if (dataSent) return; 
        dataSent = true;

        // Check AdBlock Bait (Cosmetic)
        let adBlockDetected = 0;
        const bait = document.querySelector('.pub_300x250');
        if (bait && (bait.offsetHeight === 0 || bait.offsetWidth === 0 || window.getComputedStyle(bait).display === 'none')) {
            adBlockDetected = 1;
        }

        const payload = {
            recaptchaToken: turnstileToken || '', 
            browser: detectedBrowser,
            adBlockDetected: adBlockDetected,
            
            // Map global results to payload fields
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

        // Convert to URLSearchParams for Simple Request (No Preflight)
        const urlParams = new URLSearchParams();
        for (const key in payload) {
            urlParams.append(key, payload[key]);
        }

        // Method A: sendBeacon (Best for Unload/Exit)
        if (navigator.sendBeacon) {
            const success = navigator.sendBeacon(ENDPOINT, urlParams);
            if (success) return; 
        }

        // Method B: Fetch with keepalive (Fallback)
        fetch(ENDPOINT, {
            method: 'POST',
            body: urlParams,
            keepalive: true 
        }).catch(err => {
            if (!document.hidden) console.warn("Analytics send failed", err);
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

    // C. Turnstile Loader
    function loadTurnstileToken() {
        return new Promise((resolve) => {
            const uniqueId = 'cf-wrapper-' + Math.random().toString(36).substr(2, 9);
            const container = document.createElement('div');
            container.id = uniqueId;
            container.style.marginTop = '20px';
            container.style.marginBottom = '20px';
            document.body.appendChild(container);

            const existingScript = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
            if (!existingScript && !window.turnstile) {
                const script = document.createElement('script');
                script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
                script.async = true;
                script.defer = true;
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
                                sendAnalyticsData(); // Success! Send immediately.
                            },
                            'error-callback': function() {
                                // On error, we still send data (token will be null)
                                sendAnalyticsData();
                            }
                        });
                    } catch (e) {
                        // Ignore render errors
                    }
                } else {
                    setTimeout(checkTurnstile, 100);
                }
            };
            
            checkTurnstile();
            
            // Timeout Safety (10s as per your previous script)
            // If Turnstile hangs, we send whatever data we have
            setTimeout(() => { if(!dataSent) sendAnalyticsData(); }, 10000); 
        });
    }

    loadTurnstileToken();

    // D. BEACON ON EXIT: If user leaves, send what we have immediately
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && !dataSent) {
            sendAnalyticsData();
        }
    });

})();
