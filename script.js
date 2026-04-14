                                                                                                               document.addEventListener('DOMContentLoaded', () => {
    const runBtn = document.getElementById('run-backtest-btn');
    const resultsArea = document.getElementById('backtest-results');
    const resultsContainer = document.getElementById('results-container');
    const assumptionsContainer = document.getElementById('assumptions-container');
    const exportResultsJsonBtn = document.getElementById('export-results-json-btn');
    const exportTradesCsvBtn = document.getElementById('export-trades-csv-btn');
    const strategySelector = document.getElementById('strategy-selector-container');
    const dynamicParamsContainer = document.getElementById('dynamic-params-container');
    const chartContainer = document.getElementById('main-chart');
    let chart = null;
    let candleSeries = null;
    let equityChart = null;
    let drawdownChart = null;
    let lastBacktestSnapshot = null;

    const USERS_KEY = 'goldtrade_users_v1';
    const SESSION_KEY = 'goldtrade_session_v1';
    const PROFILES_KEY = 'goldtrade_profiles_v1';
    const IDEAS_KEY = 'goldtrade_ideas_v1';
    const WISHLIST_KEY = 'goldtrade_wishlist_v1';
    const WISHLIST_LOAD_KEY = 'goldtrade_wishlist_load_v1';
    const PORTFOLIO_KEY = 'goldtrade_portfolio_v1';
    const FOLLOWS_KEY = 'goldtrade_follows_v1';

    const getPathName = () => {
        const parts = (window.location.pathname || '').split(/[\\/]/).filter(Boolean);
        return parts.length ? parts[parts.length - 1] : 'index.html';
    };

    const readJson = (key, fallback) => {
        try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback; } catch { return fallback; }
    };
    const writeJson = (key, value) => {
        localStorage.setItem(key, JSON.stringify(value));
    };

    const getSessionEmail = () => {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? String(raw) : null;
    };
    const setSessionEmail = (email) => {
        if (email) localStorage.setItem(SESSION_KEY, String(email));
        else localStorage.removeItem(SESSION_KEY);
    };

    const readUsers = () => readJson(USERS_KEY, {});
    const writeUsers = (users) => writeJson(USERS_KEY, users || {});
    const readProfiles = () => readJson(PROFILES_KEY, {});
    const writeProfiles = (profiles) => writeJson(PROFILES_KEY, profiles || {});
    const readPortfolio = () => readJson(PORTFOLIO_KEY, null);
    const writePortfolio = (p) => writeJson(PORTFOLIO_KEY, p);

    const ensurePortfolio = () => {
        const existing = readPortfolio();
        if (existing && typeof existing === 'object') return existing;
        const fresh = { cash: 100000, holdings: 0, avgPrice: 0, transactions: [] };
        writePortfolio(fresh);
        return fresh;
    };

    const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

    const sha256Hex = async (text) => {
        if (!crypto || !crypto.subtle) {
            const raw = unescape(encodeURIComponent(String(text)));
            let hash = 0;
            for (let i = 0; i < raw.length; i++) hash = ((hash << 5) - hash) + raw.charCodeAt(i);
            return `insecure_${Math.abs(hash)}`;
        }
        const enc = new TextEncoder();
        const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    };

    const requireAuth = () => {
        const email = getSessionEmail();
        if (email) return email;
        const redirect = encodeURIComponent(getPathName());
        window.location.href = `login.html?redirect=${redirect}`;
        return null;
    };

    const initAuthNav = () => {
        const slot = document.getElementById('nav-auth-area');
        if (!slot) return;
        const email = getSessionEmail();
        if (!email) {
            slot.innerHTML = `<a href="login.html">Login</a> / <a href="register.html">Register</a>`;
            return;
        }
        slot.innerHTML = `<a href="#" id="nav-logout-link">Logout</a>`;
        const link = document.getElementById('nav-logout-link');
        if (link) {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                setSessionEmail(null);
                window.location.href = 'index.html';
            });
        }
    };

    initAuthNav();

    const THEME_KEY = 'gogold_theme_v1';
    const themeColors = () => {
        const isDark = document.documentElement.dataset.theme === 'dark';
        return isDark ? {
            background: '#0b1220',
            text: '#e5e7eb',
            grid: 'rgba(226, 232, 240, 0.08)',
            border: 'rgba(226, 232, 240, 0.12)'
        } : {
            background: '#ffffff',
            text: '#0f172a',
            grid: 'rgba(15, 23, 42, 0.06)',
            border: 'rgba(15, 23, 42, 0.10)'
        };
    };

    const applyThemeToCharts = () => {
        const t = themeColors();
        const apply = (c) => {
            if (!c || typeof c.applyOptions !== 'function') return;
            c.applyOptions({
                layout: { background: { color: t.background }, textColor: t.text },
                grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
                rightPriceScale: { borderColor: t.border },
                timeScale: { borderColor: t.border }
            });
        };
        apply(chart);
        apply(portfolioPerfChartRef);
        apply(equityChart);
        apply(drawdownChart);
    };

    const getPreferredTheme = () => {
        const stored = localStorage.getItem(THEME_KEY);
        if (stored === 'light' || stored === 'dark') return stored;
        const prefersDark = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
        return prefersDark ? 'dark' : 'light';
    };
    const setTheme = (theme) => {
        const t = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.dataset.theme = t;
        localStorage.setItem(THEME_KEY, t);
        const btn = document.getElementById('theme-toggle-btn');
        if (btn) btn.textContent = t === 'dark' ? 'Light' : 'Dark';
        applyThemeToCharts();
    };

    const initThemeToggle = () => {
        setTheme(getPreferredTheme());
        const links = document.getElementById('nav-links');
        if (!links || document.getElementById('theme-toggle-btn')) return;
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.id = 'theme-toggle-btn';
        btn.type = 'button';
        btn.className = 'mini-btn';
        btn.textContent = (document.documentElement.dataset.theme === 'dark') ? 'Light' : 'Dark';
        btn.addEventListener('click', () => {
            const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            setTheme(next);
        });
        li.appendChild(btn);
        links.appendChild(li);
    };

    let portfolioPerfChartRef = null;
    let portfolioPerfSeriesRef = null;

    initThemeToggle();

    const initNavMenu = () => {
        const toggle = document.getElementById('nav-toggle');
        const links = document.getElementById('nav-links');
        if (!toggle || !links) return;

        const close = () => {
            links.classList.remove('open');
            toggle.setAttribute('aria-expanded', 'false');
        };
        const open = () => {
            links.classList.add('open');
            toggle.setAttribute('aria-expanded', 'true');
        };
        const isOpen = () => links.classList.contains('open');

        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            if (isOpen()) close();
            else open();
        });

        links.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', () => close());
        });

        document.addEventListener('click', (e) => {
            if (!isOpen()) return;
            const t = e.target;
            if (!(t instanceof Element)) return;
            if (toggle.contains(t) || links.contains(t)) return;
            close();
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 920) close();
        });
    };

    initNavMenu();

    // --- Chart Initialization ---
    let volumeSeries = null;
    let smaSeries = null;
    let emaSeries = null;
    let showVolume = false;
    let showSma = false;
    let showEma = false;
    let liveIntervalId = null;
    let currentTf = '1D';
    let displayedData = null;
    let emaLive = null;
    let chartSymbol = 'GC=F';
    let chartSourceData = null;
    const symbolCache = {};
    const timeframeCache = {};
    let alertPrice = null;
    let alertArmed = false;
    let lastLivePrice = null;
    let realGcFLoaded = false;
    let setChartDataForTf = null;
    if (chartContainer) {
        console.log("Chart container found:", chartContainer.id, "dims:", chartContainer.clientWidth, "x", chartContainer.clientHeight);
        
        try {
            if (typeof LightweightCharts === 'undefined') {
                throw new Error("LightweightCharts library is not loaded.");
            }

            const t = themeColors();
            chart = LightweightCharts.createChart(chartContainer, {
                width: chartContainer.clientWidth || 800,
                height: 500,
                layout: { 
                    background: { color: t.background },
                    textColor: t.text 
                },
                grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
                crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
                rightPriceScale: { borderColor: t.border },
                timeScale: { borderColor: t.border, visible: true, timeVisible: true },
            });
            console.log("Chart created successfully:", chart);

            if (chart && typeof chart.addCandlestickSeries === 'function') {
                candleSeries = chart.addCandlestickSeries({
                    upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
                    wickUpColor: '#26a69a', wickDownColor: '#ef5350',
                });
                console.log("Candle series added successfully.");
            } else {
                // Fallback for different API versions or unexpected objects
                console.warn("chart.addCandlestickSeries is not available, trying addSeries fallback...");
                if (chart && typeof chart.addSeries === 'function') {
                    candleSeries = chart.addSeries(LightweightCharts.SeriesType.Candlestick, {
                        upColor: '#26a69a', downColor: '#ef5350', borderVisible: false,
                        wickUpColor: '#26a69a', wickDownColor: '#ef5350',
                    });
                    console.log("Candle series added via addSeries fallback.");
                } else {
                    throw new Error("Neither addCandlestickSeries nor addSeries is available on the chart object.");
                }
            }

            const resizeObserver = new ResizeObserver(entries => {
                if (entries.length === 0 || !entries[0].contentRect) return;
                const { width, height } = entries[0].contentRect;
                if (width > 0 && height > 0) {
                    chart.applyOptions({ width, height });
                    console.log("Chart resized to:", width, "x", height);
                }
            });
            resizeObserver.observe(chartContainer);
        } catch (error) {
            console.error("Failed to initialize chart:", error);
            chartContainer.innerHTML = `<div style="color: red; padding: 20px;">Error: ${error.message}</div>`;
        }
    }

    // --- Strategy Configurations ---
    const STRATEGY_CONFIG = {
        SMA_CROSS: { name: "SMA Cross", params: [{ id: 'sma-short', label: 'Short Period', value: 10 }, { id: 'sma-long', label: 'Long Period', value: 20 }] },
        RSI_STRAT: { name: "RSI Strategy", params: [{ id: 'rsi-period', label: 'RSI Period', value: 14 }, { id: 'rsi-overbought', label: 'Overbought', value: 70 }, { id: 'rsi-oversold', label: 'Oversold', value: 30 }] },
        MACD: { name: "MACD", params: [{ id: 'macd-fast', label: 'Fast Period', value: 12 }, { id: 'macd-slow', label: 'Slow Period', value: 26 }, { id: 'macd-signal', label: 'Signal Period', value: 9 }] },
        AO: { name: "Awesome Oscillator", params: [{ id: 'ao-short', label: 'Short Period', value: 5 }, { id: 'ao-long', label: 'Long Period', value: 34 }] },
        APO: { name: "Absolute Price Oscillator", params: [{ id: 'apo-fast', label: 'Fast Period', value: 12 }, { id: 'apo-slow', label: 'Slow Period', value: 26 }] },
        BIAS: { name: "Bias", params: [{ id: 'bias-period', label: 'Period', value: 12 }] },
        BOP: { name: "Balance of Power", params: [{ id: 'bop-signal', label: 'Signal Smoothing', value: 14 }] },
        BRAR: { name: "BRAR", params: [{ id: 'brar-period', label: 'Period', value: 26 }] },
        CCI: { name: "CCI", params: [{ id: 'cci-period', label: 'Period', value: 20 }, { id: 'cci-overbought', label: 'Overbought', value: 100 }, { id: 'cci-oversold', label: 'Oversold', value: -100 }] },
        CFO: { name: "Chande Forecast Oscillator", params: [{ id: 'cfo-period', label: 'Period', value: 14 }] },
        CG: { name: "Center of Gravity", params: [{ id: 'cg-period', label: 'Period', value: 10 }] },
        CMO: { name: "Chande Momentum Oscillator", params: [{ id: 'cmo-period', label: 'Period', value: 14 }] },
        COPPOCK: { name: "Coppock Curve", params: [{ id: 'coppock-period', label: 'Period', value: 14 }] },
        ER: { name: "Efficiency Ratio", params: [{ id: 'er-period', label: 'Period', value: 10 }] },
        ERI: { name: "Elder Ray Index", params: [{ id: 'eri-period', label: 'Period', value: 13 }] },
        FISHER: { name: "Fisher Transform", params: [{ id: 'fisher-period', label: 'Period', value: 9 }] },
        INERTIA: { name: "Inertia", params: [{ id: 'inertia-period', label: 'Period', value: 20 }] },
        KDJ: { name: "KDJ", params: [{ id: 'kdj-period', label: 'Period', value: 9 }, { id: 'kdj-signal', label: 'Signal', value: 3 }] },
        KST: { name: "KST Oscillator", params: [{ id: 'kst-period', label: 'Period', value: 14 }] },
        MOM: { name: "Momentum", params: [{ id: 'mom-period', label: 'Period', value: 10 }] },
        PGO: { name: "Pretty Good Oscillator", params: [{ id: 'pgo-period', label: 'Period', value: 14 }] },
        PPO: { name: "Percentage Price Oscillator", params: [{ id: 'ppo-fast', label: 'Fast Period', value: 12 }, { id: 'ppo-slow', label: 'Slow Period', value: 26 }] },
        PSL: { name: "Psychological Line", params: [{ id: 'psl-period', label: 'Period', value: 12 }] },
        PVO: { name: "Percentage Volume Oscillator", params: [{ id: 'pvo-fast', label: 'Fast Period', value: 12 }, { id: 'pvo-slow', label: 'Slow Period', value: 26 }] },
        QQE: { name: "Quantitative Qualitative Estimation", params: [{ id: 'qqe-rsi', label: 'RSI Period', value: 14 }, { id: 'qqe-smooth', label: 'Smoothing', value: 5 }] },
        ROC: { name: "Rate of Change", params: [{ id: 'roc-period', label: 'Period', value: 10 }] },
        RSX: { name: "Relative Strength Xtra", params: [{ id: 'rsx-period', label: 'Period', value: 14 }] },
        RVGI: { name: "Relative Vigor Index", params: [{ id: 'rvgi-period', label: 'Period', value: 14 }] },
        SLOPE: { name: "Slope", params: [{ id: 'slope-period', label: 'Period', value: 1 }] },
        SMI: { name: "SMI Ergodic", params: [{ id: 'smi-period', label: 'Period', value: 14 }] },
        SQUEEZE: { name: "Squeeze", params: [{ id: 'squeeze-bb', label: 'BB Period', value: 20 }, { id: 'squeeze-kc', label: 'KC Period', value: 20 }] },
        STOCH: { name: "Stochastic Oscillator", params: [{ id: 'stoch-k', label: '%K Period', value: 14 }, { id: 'stoch-d', label: '%D Period', value: 3 }, { id: 'stoch-smooth', label: 'Smoothing', value: 3 }, { id: 'stoch-overbought', label: 'Overbought', value: 80 }, { id: 'stoch-oversold', label: 'Oversold', value: 20 }] },
        STOCHRSI: { name: "Stochastic RSI", params: [{ id: 'stochrsi-period', label: 'Period', value: 14 }, { id: 'stochrsi-rsi', label: 'RSI Period', value: 14 }, { id: 'stochrsi-k', label: '%K', value: 3 }, { id: 'stochrsi-d', label: '%D', value: 3 }] },
        TD_SEQ: { name: "TD Sequential", params: [{ id: 'td-threshold', label: 'Threshold', value: 13 }] },
        TRIX: { name: "Trix", params: [{ id: 'trix-period', label: 'Period', value: 15 }] },
        TSI: { name: "True Strength Index", params: [{ id: 'tsi-long', label: 'Long Period', value: 25 }, { id: 'tsi-short', label: 'Short Period', value: 13 }] },
        UO: { name: "Ultimate Oscillator", params: [{ id: 'uo-short', label: 'Short Period', value: 7 }, { id: 'uo-med', label: 'Medium Period', value: 14 }, { id: 'uo-long', label: 'Long Period', value: 28 }] },
        WILLR: { name: "Williams %R", params: [{ id: 'willr-period', label: 'Period', value: 14 }, { id: 'willr-overbought', label: 'Overbought', value: -20 }, { id: 'willr-oversold', label: 'Oversold', value: -80 }] }
    };

    // --- Data Generation ---
    const generateHistoricalData = () => {
        const data = [];
        const start = new Date(2004, 7, 19);
        const end = new Date();
        const current = new Date(start);
        
        // Real Gold Futures (GC=F) Milestones (Approximate prices at dates)
        const milestones = [
            { date: new Date(2004, 7, 19), price: 400 },
            { date: new Date(2011, 8, 5), price: 1900 },
            { date: new Date(2015, 11, 1), price: 1050 },
            { date: new Date(2020, 7, 1), price: 2075 },
            { date: new Date(2023, 0, 1), price: 1850 },
            { date: new Date(2024, 0, 1), price: 2050 },
            { date: new Date(2025, 0, 1), price: 3800 }, // Projected steep rise to reach user target
            { date: new Date(), price: 4657 } // User provided current price
        ];

        let price = 400;
        let milestoneIdx = 1;

        while (current <= end) {
            const day = current.getDay();
            if (day !== 0 && day !== 6) { // Skip weekends
                // Find current target milestone
                while (milestoneIdx < milestones.length && current > milestones[milestoneIdx].date) {
                    milestoneIdx++;
                }

                if (milestoneIdx < milestones.length) {
                    const prev = milestones[milestoneIdx - 1];
                    const next = milestones[milestoneIdx];
                    const totalDays = (next.date - prev.date) / 86400000;
                    const elapsedDays = (current - prev.date) / 86400000;
                    const targetPrice = prev.price + (next.price - prev.price) * (elapsedDays / totalDays);
                    
                    // Adjust current price towards target with volatility
                    const volatility = 0.012; // Realistic GC=F daily volatility
                    const trendBias = (targetPrice - price) / 10; // Pull towards trendline
                    const change = (price * (Math.random() - 0.5) * volatility) + trendBias;
                    
                    const open = price;
                    price += change;
                    const close = price;
                    const high = Math.max(open, close) + (Math.random() * price * 0.003);
                    const low = Math.min(open, close) - (Math.random() * price * 0.003);
                    
                    const y = current.getFullYear();
                    const m = String(current.getMonth() + 1).padStart(2, '0');
                    const d = String(current.getDate()).padStart(2, '0');
                    
                    data.push({ 
                        time: `${y}-${m}-${d}`, 
                        open: parseFloat(open.toFixed(2)), 
                        high: parseFloat(high.toFixed(2)), 
                        low: parseFloat(low.toFixed(2)), 
                        close: parseFloat(close.toFixed(2)) 
                    });
                }
            }
            current.setDate(current.getDate() + 1);
        }
        return data;
    };

    const generateSeriesFromMilestones = (start, end, milestones, baseVolatility) => {
        const data = [];
        const current = new Date(start);
        let price = milestones[0].price;
        let milestoneIdx = 1;

        while (current <= end) {
            const day = current.getDay();
            if (day !== 0 && day !== 6) {
                while (milestoneIdx < milestones.length && current > milestones[milestoneIdx].date) {
                    milestoneIdx++;
                }
                if (milestoneIdx < milestones.length) {
                    const prev = milestones[milestoneIdx - 1];
                    const next = milestones[milestoneIdx];
                    const totalDays = (next.date - prev.date) / 86400000;
                    const elapsedDays = (current - prev.date) / 86400000;
                    const targetPrice = prev.price + (next.price - prev.price) * (elapsedDays / totalDays);

                    const trendBias = (targetPrice - price) / 10;
                    const change = (price * (Math.random() - 0.5) * baseVolatility) + trendBias;

                    const open = price;
                    price += change;
                    const close = price;
                    const high = Math.max(open, close) + (Math.random() * price * 0.003);
                    const low = Math.min(open, close) - (Math.random() * price * 0.003);

                    const y = current.getFullYear();
                    const m = String(current.getMonth() + 1).padStart(2, '0');
                    const d = String(current.getDate()).padStart(2, '0');

                    data.push({
                        time: `${y}-${m}-${d}`,
                        open: parseFloat(open.toFixed(2)),
                        high: parseFloat(high.toFixed(2)),
                        low: parseFloat(low.toFixed(2)),
                        close: parseFloat(close.toFixed(2))
                    });
                }
            }
            current.setDate(current.getDate() + 1);
        }
        return data;
    };

    const toTimeString = (t) => {
        if (typeof t === 'string') return t;
        if (typeof t === 'number') return new Date(t * 1000).toISOString().split('T')[0];
        if (t && typeof t === 'object' && typeof t.year === 'number') {
            const y = t.year;
            const m = String(t.month).padStart(2, '0');
            const d = String(t.day).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
        return '';
    };

    const buildVolumeData = (data) => {
        return data.map(c => {
            const range = Math.max(0.01, c.high - c.low);
            const body = Math.abs(c.close - c.open);
            const value = (typeof c.volume === 'number' && isFinite(c.volume)) ? Math.round(c.volume) : Math.round(1200 + range * 220 + body * 140 + Math.random() * 900);
            const color = c.close >= c.open ? 'rgba(38, 166, 154, 0.45)' : 'rgba(239, 83, 80, 0.45)';
            return { time: c.time, value, color };
        });
    };

    const buildSmaData = (data, period) => {
        const out = [];
        if (data.length < period) return out;
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i].close;
            if (i >= period) sum -= data[i - period].close;
            if (i >= period - 1) out.push({ time: data[i].time, value: sum / period });
        }
        return out;
    };

    const buildEmaData = (data, period) => {
        const out = [];
        if (data.length < period) return out;
        const k = 2 / (period + 1);
        let ema = data[0].close;
        for (let i = 0; i < data.length; i++) {
            ema = i === 0 ? data[0].close : (data[i].close - ema) * k + ema;
            if (i >= period - 1) out.push({ time: data[i].time, value: ema });
        }
        return out;
    };
    let historicalData = generateHistoricalData();
    console.log("Historical Data Generated:", historicalData.length, "points");

    const getSymbolDisplayName = (symbol) => {
        if (symbol === 'GC=F') return 'Gold Futures (GC=F)';
        if (symbol === 'SI=F') return 'Silver Futures (SI=F)';
        if (symbol === 'CL=F') return 'Crude Oil Futures (CL=F)';
        return symbol;
    };

    const getSymbolData = (symbol) => {
        if (symbolCache[symbol]) return symbolCache[symbol];
        const start = new Date(2004, 7, 19);
        const end = new Date();
        let milestones = null;
        let baseVol = 0.012;

        if (symbol === 'GC=F') {
            milestones = [
                { date: new Date(2004, 7, 19), price: 400 },
                { date: new Date(2011, 8, 5), price: 1900 },
                { date: new Date(2015, 11, 1), price: 1050 },
                { date: new Date(2020, 7, 1), price: 2075 },
                { date: new Date(2023, 0, 1), price: 1850 },
                { date: new Date(2024, 0, 1), price: 2050 },
                { date: new Date(2025, 0, 1), price: 3800 },
                { date: new Date(), price: 4657 }
            ];
            baseVol = 0.012;
        } else if (symbol === 'SI=F') {
            milestones = [
                { date: new Date(2004, 7, 19), price: 6.5 },
                { date: new Date(2011, 4, 1), price: 48 },
                { date: new Date(2015, 11, 1), price: 14 },
                { date: new Date(2020, 7, 1), price: 29 },
                { date: new Date(2023, 0, 1), price: 23 },
                { date: new Date(2024, 0, 1), price: 24.5 },
                { date: new Date(), price: 32 }
            ];
            baseVol = 0.02;
        } else if (symbol === 'CL=F') {
            milestones = [
                { date: new Date(2004, 7, 19), price: 45 },
                { date: new Date(2008, 6, 1), price: 145 },
                { date: new Date(2016, 1, 1), price: 30 },
                { date: new Date(2020, 3, 1), price: 20 },
                { date: new Date(2022, 5, 1), price: 120 },
                { date: new Date(2024, 0, 1), price: 78 },
                { date: new Date(), price: 95 }
            ];
            baseVol = 0.03;
        }

        const data = milestones ? generateSeriesFromMilestones(start, end, milestones, baseVol) : historicalData;
        symbolCache[symbol] = data;
        return data;
    };

    const fetchYahooChart = async (symbol, range, interval) => {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&includePrePost=false&events=div%7Csplit`;
        const proxyUrl = `https://r.jina.ai/https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&includePrePost=false&events=div%7Csplit`;
        const res = await fetch(proxyUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const startIdx = text.indexOf('{');
        const endIdx = text.lastIndexOf('}');
        if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) throw new Error('Invalid response');
        const json = JSON.parse(text.slice(startIdx, endIdx + 1));
        const result = json && json.chart && json.chart.result ? json.chart.result[0] : null;
        if (!result || !result.timestamp || !result.indicators || !result.indicators.quote) throw new Error('No data');
        const ts = result.timestamp;
        const quote = result.indicators.quote[0];
        const openArr = quote.open || [];
        const highArr = quote.high || [];
        const lowArr = quote.low || [];
        const closeArr = quote.close || [];
        const volArr = quote.volume || [];
        const candles = [];
        const isIntraday = String(interval).toLowerCase().includes('m') || String(interval).toLowerCase().includes('h');
        for (let i = 0; i < ts.length; i++) {
            const o = openArr[i];
            const h = highArr[i];
            const l = lowArr[i];
            const c = closeArr[i];
            if (o == null || h == null || l == null || c == null) continue;
            const d = new Date(ts[i] * 1000);
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, '0');
            const da = String(d.getUTCDate()).padStart(2, '0');
            candles.push({
                time: isIntraday ? ts[i] : `${y}-${m}-${da}`,
                open: parseFloat(o.toFixed(2)),
                high: parseFloat(h.toFixed(2)),
                low: parseFloat(l.toFixed(2)),
                close: parseFloat(c.toFixed(2)),
                volume: volArr[i] != null ? volArr[i] : null
            });
        }
        if (candles.length === 0) throw new Error('Empty candles');
        return candles;
    };

    const fetchLatestYahooPrice = async (symbol) => {
        const candles = await fetchYahooChart(symbol, '1d', '1m');
        const last = candles[candles.length - 1];
        return last ? last.close : null;
    };

    const applyRealGcFData = (candles) => {
        historicalData = candles;
        symbolCache['GC=F'] = candles;
        realGcFLoaded = true;
        if (chartSymbol === 'GC=F') chartSourceData = candles;
        if (candleSeries && chartSymbol === 'GC=F') {
            if (typeof setChartDataForTf === 'function') setChartDataForTf(currentTf);
            else {
                candleSeries.setData(candles);
                updateOverlays(candles);
            }
        }
        if (runBtn) {
            runBtn.disabled = false;
            runBtn.textContent = 'Run Backtest';
        }
        const toastEl = document.getElementById('chart-toast');
        if (toastEl) {
            toastEl.textContent = 'Loaded real GC=F data';
            toastEl.classList.remove('hidden');
            setTimeout(() => toastEl.classList.add('hidden'), 2500);
        }
    };

    const loadRealGcF = async () => {
        if (realGcFLoaded) return;
        if (runBtn) {
            runBtn.disabled = true;
            runBtn.textContent = 'Loading GC=F...';
        }
        try {
            const candles = await fetchYahooChart('GC=F', '20y', '1d');
            applyRealGcFData(candles);
        } catch (e) {
            if (runBtn) {
                runBtn.disabled = false;
                runBtn.textContent = 'Run Backtest';
            }
        }
    };

    if (chartContainer) {
        chartSourceData = getSymbolData(chartSymbol);
    }

    if (chartSymbol === 'GC=F') {
        loadRealGcF();
    }

    const ensureVolumeSeries = () => {
        if (volumeSeries || !chart) return volumeSeries;
        if (typeof chart.addHistogramSeries === 'function') {
            volumeSeries = chart.addHistogramSeries({
                priceScaleId: '',
                priceFormat: { type: 'volume' },
                scaleMargins: { top: 0.82, bottom: 0 },
            });
        } else if (typeof chart.addSeries === 'function') {
            volumeSeries = chart.addSeries(LightweightCharts.SeriesType.Histogram, {
                priceScaleId: '',
                priceFormat: { type: 'volume' },
                scaleMargins: { top: 0.82, bottom: 0 },
            });
        }
        return volumeSeries;
    };

    const ensureSmaSeries = () => {
        if (smaSeries || !chart) return smaSeries;
        if (typeof chart.addLineSeries === 'function') {
            smaSeries = chart.addLineSeries({ color: '#1565c0', lineWidth: 2 });
        } else if (typeof chart.addSeries === 'function') {
            smaSeries = chart.addSeries(LightweightCharts.SeriesType.Line, { color: '#1565c0', lineWidth: 2 });
        }
        return smaSeries;
    };

    const ensureEmaSeries = () => {
        if (emaSeries || !chart) return emaSeries;
        if (typeof chart.addLineSeries === 'function') {
            emaSeries = chart.addLineSeries({ color: '#f57c00', lineWidth: 2 });
        } else if (typeof chart.addSeries === 'function') {
            emaSeries = chart.addSeries(LightweightCharts.SeriesType.Line, { color: '#f57c00', lineWidth: 2 });
        }
        return emaSeries;
    };

    const updateOverlays = (data) => {
        displayedData = data;
        if (showVolume) {
            const vs = ensureVolumeSeries();
            if (vs) vs.setData(buildVolumeData(data));
        } else if (volumeSeries) {
            volumeSeries.setData([]);
        }

        if (showSma) {
            const ss = ensureSmaSeries();
            if (ss) ss.setData(buildSmaData(data, 20));
        } else if (smaSeries) {
            smaSeries.setData([]);
        }

        if (showEma) {
            const es = ensureEmaSeries();
            if (es) {
                const emaData = buildEmaData(data, 50);
                es.setData(emaData);
                emaLive = emaData.length > 0 ? emaData[emaData.length - 1].value : null;
            }
        } else if (emaSeries) {
            emaSeries.setData([]);
            emaLive = null;
        }
    };

    const legendEl = document.getElementById('chart-legend');
    const renderLegend = (time, candle, volumePoint) => {
        if (!legendEl || !candle) return;
        const t = toTimeString(time);
        const chg = candle.open ? ((candle.close - candle.open) / candle.open) * 100 : 0;
        const vol = volumePoint && typeof volumePoint.value === 'number' ? volumePoint.value.toLocaleString() : '-';
        legendEl.innerHTML = `
            <div class="legend-title">${chartSymbol} ${t}</div>
            <div class="legend-row"><span>O</span><span>${candle.open.toFixed(2)}</span></div>
            <div class="legend-row"><span>H</span><span>${candle.high.toFixed(2)}</span></div>
            <div class="legend-row"><span>L</span><span>${candle.low.toFixed(2)}</span></div>
            <div class="legend-row"><span>C</span><span>${candle.close.toFixed(2)}</span></div>
            <div class="legend-row"><span>Chg</span><span>${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span></div>
            <div class="legend-row"><span>Vol</span><span>${vol}</span></div>
        `;
    };

    const stopLive = () => {
        if (liveIntervalId !== null) {
            clearInterval(liveIntervalId);
            liveIntervalId = null;
        }
    };

    const startLive = () => {
        stopLive();
        if (!candleSeries || !chart || currentTf !== '1D') return;
        if (!chartSourceData || chartSourceData.length === 0) return;
        const priceDisplay = document.getElementById('current-price-val');
        const changeDisplay = document.getElementById('current-price-change');
        let lastCandle = chartSourceData[chartSourceData.length - 1];
        let currentPrice = lastCandle.close;
        lastLivePrice = currentPrice;
        let lastFetchAt = 0;
        liveIntervalId = setInterval(() => {
            const now = Date.now();
            if (realGcFLoaded && chartSymbol === 'GC=F' && now - lastFetchAt > 30000) {
                lastFetchAt = now;
                fetchLatestYahooPrice('GC=F').then(p => {
                    if (typeof p === 'number' && isFinite(p)) currentPrice = p;
                }).catch(() => {});
            } else {
                const volatility = 0.00025;
                const delta = currentPrice * (Math.random() - 0.5) * volatility;
                currentPrice += delta;
            }

            lastCandle.close = parseFloat(currentPrice.toFixed(2));
            lastCandle.high = Math.max(lastCandle.high, lastCandle.close);
            lastCandle.low = Math.min(lastCandle.low, lastCandle.close);
            candleSeries.update(lastCandle);

            if (showVolume) {
                const vs = ensureVolumeSeries();
                if (vs) {
                    const range = Math.max(0.01, lastCandle.high - lastCandle.low);
                    const body = Math.abs(lastCandle.close - lastCandle.open);
                    const value = Math.round(1200 + range * 220 + body * 140 + Math.random() * 900);
                    const color = lastCandle.close >= lastCandle.open ? 'rgba(38, 166, 154, 0.45)' : 'rgba(239, 83, 80, 0.45)';
                    vs.update({ time: lastCandle.time, value, color });
                }
            }

            if (showSma && smaSeries) {
                const p = 20;
                let sum = 0;
                for (let i = Math.max(0, chartSourceData.length - p); i < chartSourceData.length; i++) sum += chartSourceData[i].close;
                const value = sum / Math.min(p, chartSourceData.length);
                smaSeries.update({ time: lastCandle.time, value });
            }

            if (showEma && emaSeries) {
                const p = 50;
                const k = 2 / (p + 1);
                if (emaLive === null) {
                    const emaData = buildEmaData(chartSourceData, p);
                    emaLive = emaData.length > 0 ? emaData[emaData.length - 1].value : lastCandle.close;
                } else {
                    emaLive = (lastCandle.close - emaLive) * k + emaLive;
                }
                emaSeries.update({ time: lastCandle.time, value: emaLive });
            }

            if (priceDisplay) priceDisplay.textContent = currentPrice.toFixed(2);
            if (changeDisplay) {
                const dayOpen = lastCandle.open;
                const pctChange = ((currentPrice - dayOpen) / dayOpen) * 100;
                changeDisplay.textContent = `${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(2)}%`;
                changeDisplay.className = `trend ${pctChange >= 0 ? 'up' : 'down'}`;
            }

            if (legendEl) {
                const vp = showVolume && volumeSeries ? { value: Math.round(1200 + Math.random() * 900) } : null;
                renderLegend(lastCandle.time, lastCandle, vp);
            }

            const toastEl = document.getElementById('chart-toast');
            const statusEl = document.getElementById('alert-status');
            if (alertArmed && typeof alertPrice === 'number' && isFinite(alertPrice) && lastLivePrice !== null) {
                const crossedUp = lastLivePrice < alertPrice && currentPrice >= alertPrice;
                const crossedDown = lastLivePrice > alertPrice && currentPrice <= alertPrice;
                if (crossedUp || crossedDown) {
                    alertArmed = false;
                    if (statusEl) statusEl.textContent = `Triggered at ${currentPrice.toFixed(2)}`;
                    if (toastEl) {
                        toastEl.textContent = `${chartSymbol} price alert: ${currentPrice.toFixed(2)}`;
                        toastEl.classList.remove('hidden');
                        setTimeout(() => toastEl.classList.add('hidden'), 3500);
                    }
                }
            }
            lastLivePrice = currentPrice;
        }, 2000);
    };

    if (candleSeries && (chartSourceData || historicalData).length > 0) {
        const initialChartData = chartSourceData && chartSourceData.length > 0 ? chartSourceData : historicalData;
        console.log("Setting data to candle series:", initialChartData.length, "points");
        currentTf = '1D';
        candleSeries.setData(initialChartData);
        displayedData = initialChartData;
        showVolume = false;
        updateOverlays(displayedData);

        setTimeout(() => {
            if (chart) {
                chart.timeScale().fitContent();
                console.log("Chart content fitted.");
            }
        }, 300);

        if (legendEl) {
            const last = displayedData[displayedData.length - 1];
            renderLegend(last.time, last, null);
        }

        const chartTitleEl = document.getElementById('chart-title');
        const liveLabelEl = document.getElementById('live-symbol-label');
        const symbolSelect = document.getElementById('symbol-select');
        const downloadBtn = document.getElementById('download-png-btn');
        const alertInput = document.getElementById('alert-price');
        const setAlertBtn = document.getElementById('set-alert-btn');
        const clearAlertBtn = document.getElementById('clear-alert-btn');
        const alertStatusEl = document.getElementById('alert-status');
        const toastEl = document.getElementById('chart-toast');

        const applySymbolUI = () => {
            if (chartTitleEl) chartTitleEl.textContent = `Live ${getSymbolDisplayName(chartSymbol)} Chart (Historical)`;
            if (liveLabelEl) liveLabelEl.textContent = `LIVE ${chartSymbol}:`;
        };
        applySymbolUI();

        setChartDataForTf = (tf) => {
            const base = chartSourceData && chartSourceData.length > 0 ? chartSourceData : historicalData;
            const tfLower = String(tf || '').toLowerCase();

            const aggregateByN = (src, n) => {
                const out = [];
                for (let i = 0; i < src.length; i += n) {
                    const chunk = src.slice(i, i + n);
                    if (chunk.length === 0) continue;
                    const open = chunk[0].open;
                    const close = chunk[chunk.length - 1].close;
                    const high = Math.max(...chunk.map(c => c.high));
                    const low = Math.min(...chunk.map(c => c.low));
                    const volume = chunk.reduce((s, c) => s + (typeof c.volume === 'number' ? c.volume : 0), 0);
                    out.push({ time: chunk[0].time, open, high, low, close, volume });
                }
                return out;
            };

            const applyData = (data) => {
                if (!data || data.length === 0) return;
                candleSeries.setData(data);
                updateOverlays(data);
                if (legendEl) {
                    const last = data[data.length - 1];
                    renderLegend(last.time, last, null);
                }
                setTimeout(() => chart.timeScale().fitContent(), 100);
            };

            const isIntraday = ['1m', '5m', '15m', '1h', '4h'].includes(tfLower);
            if (isIntraday) {
                if (chartSymbol !== 'GC=F') {
                    if (toastEl) {
                        toastEl.textContent = 'Intraday timeframes are available for GC=F';
                        toastEl.classList.remove('hidden');
                        setTimeout(() => toastEl.classList.add('hidden'), 2000);
                    }
                    return;
                }
                const key = `${chartSymbol}|${tfLower}`;
                if (timeframeCache[key]) {
                    applyData(timeframeCache[key]);
                    return;
                }
                if (toastEl) {
                    toastEl.textContent = `Loading ${chartSymbol} ${tfLower}...`;
                    toastEl.classList.remove('hidden');
                }
                const interval = tfLower === '1h' || tfLower === '4h' ? '60m' : tfLower;
                const range = tfLower === '1m' ? '7d' : (tfLower === '5m' || tfLower === '15m' ? '60d' : '730d');
                fetchYahooChart(chartSymbol, range, interval).then(raw => {
                    const data = tfLower === '4h' ? aggregateByN(raw, 4) : raw;
                    timeframeCache[key] = data;
                    if (toastEl) toastEl.classList.add('hidden');
                    applyData(data);
                }).catch(() => {
                    if (toastEl) {
                        toastEl.textContent = 'Failed to load intraday data';
                        setTimeout(() => toastEl.classList.add('hidden'), 2000);
                    }
                });
                return;
            }

            let data = [];
            if (tf === '1D') data = base;
            else if (tf === '1W' || tf === '1M') {
                const step = tf === '1W' ? 5 : 20;
                for (let i = 0; i < base.length; i += step) {
                    const chunk = base.slice(i, i + step);
                    if (chunk.length === 0) continue;
                    data.push({
                        time: chunk[0].time,
                        open: chunk[0].open,
                        high: Math.max(...chunk.map(c => c.high)),
                        low: Math.min(...chunk.map(c => c.low)),
                        close: chunk[chunk.length - 1].close
                    });
                }
            }
            applyData(data);
        };

        if (symbolSelect) {
            symbolSelect.value = chartSymbol;
            symbolSelect.addEventListener('change', () => {
                chartSymbol = symbolSelect.value;
                chartSourceData = getSymbolData(chartSymbol);
                applySymbolUI();
                stopLive();
                emaLive = null;
                setChartDataForTf(currentTf);
                if (chartSymbol === 'GC=F') loadRealGcF();
                if (currentTf === '1D') startLive();
            });
        }

        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
                if (!chart || typeof chart.takeScreenshot !== 'function') return;
                const canvas = chart.takeScreenshot();
                const url = canvas.toDataURL('image/png');
                const a = document.createElement('a');
                a.href = url;
                a.download = `${chartSymbol}-${new Date().toISOString().slice(0, 10)}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            });
        }

        const setStatus = (text) => { if (alertStatusEl) alertStatusEl.textContent = text; };
        if (setAlertBtn) {
            setAlertBtn.addEventListener('click', () => {
                const v = parseFloat(alertInput ? alertInput.value : '');
                if (!isFinite(v)) {
                    setStatus('Enter a valid price');
                    return;
                }
                alertPrice = v;
                alertArmed = true;
                setStatus(`Armed at ${alertPrice.toFixed(2)}`);
                if (toastEl) {
                    toastEl.textContent = `Alert set: ${chartSymbol} ${alertPrice.toFixed(2)}`;
                    toastEl.classList.remove('hidden');
                    setTimeout(() => toastEl.classList.add('hidden'), 2000);
                }
            });
        }
        if (clearAlertBtn) {
            clearAlertBtn.addEventListener('click', () => {
                alertPrice = null;
                alertArmed = false;
                setStatus('No alert');
            });
        }

        if (chart && legendEl) {
            chart.subscribeCrosshairMove(param => {
                if (!param) return;
                const candle = param.seriesData && candleSeries ? param.seriesData.get(candleSeries) : null;
                const volumePoint = param.seriesData && volumeSeries ? param.seriesData.get(volumeSeries) : null;
                if (param.time && candle) renderLegend(param.time, candle, volumePoint);
                else if (displayedData && displayedData.length > 0) {
                    const last = displayedData[displayedData.length - 1];
                    renderLegend(last.time, last, null);
                }
            });
        }

        const toggleVolumeBtn = document.getElementById('toggle-volume-btn');
        const toggleSmaBtn = document.getElementById('toggle-sma-btn');
        const toggleEmaBtn = document.getElementById('toggle-ema-btn');
        const resetZoomBtn = document.getElementById('reset-zoom-btn');
        const fullscreenBtn = document.getElementById('fullscreen-btn');

        if (toggleVolumeBtn) toggleVolumeBtn.classList.toggle('active', showVolume);
        if (toggleSmaBtn) toggleSmaBtn.classList.toggle('active', showSma);
        if (toggleEmaBtn) toggleEmaBtn.classList.toggle('active', showEma);

        if (toggleVolumeBtn) {
            toggleVolumeBtn.addEventListener('click', () => {
                showVolume = !showVolume;
                toggleVolumeBtn.classList.toggle('active', showVolume);
                updateOverlays(displayedData || historicalData);
            });
        }
        if (toggleSmaBtn) {
            toggleSmaBtn.addEventListener('click', () => {
                showSma = !showSma;
                toggleSmaBtn.classList.toggle('active', showSma);
                updateOverlays(displayedData || historicalData);
            });
        }
        if (toggleEmaBtn) {
            toggleEmaBtn.addEventListener('click', () => {
                showEma = !showEma;
                toggleEmaBtn.classList.toggle('active', showEma);
                updateOverlays(displayedData || historicalData);
            });
        }
        if (resetZoomBtn) {
            resetZoomBtn.addEventListener('click', () => {
                if (chart) chart.timeScale().fitContent();
            });
        }
        if (fullscreenBtn) {
            const chartCard = chartContainer.closest('.chart-card');
            const savedHeight = chartContainer.style.height || '';
            const setFs = (isFs) => {
                chartContainer.style.height = isFs ? '80vh' : (savedHeight || '500px');
            };
            fullscreenBtn.addEventListener('click', async () => {
                if (!chartCard) return;
                if (!document.fullscreenElement) {
                    await chartCard.requestFullscreen();
                    setFs(true);
                } else {
                    await document.exitFullscreen();
                    setFs(false);
                }
                if (chart) setTimeout(() => chart.timeScale().fitContent(), 100);
            });
            document.addEventListener('fullscreenchange', () => {
                if (chart) setTimeout(() => chart.timeScale().fitContent(), 100);
            });
        }

        startLive();
    } else {
        console.warn("Could not set data. candleSeries:", !!candleSeries, "data length:", historicalData.length);
    }

    // --- Timeframe Logic ---
    const tfButtons = document.querySelectorAll('.tf-btn');
    tfButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            if (!candleSeries) return;
            tfButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tf = btn.dataset.tf;
            currentTf = tf;
            if (tf === '1D') startLive();
            else stopLive();
            if (typeof setChartDataForTf === 'function') setChartDataForTf(tf);
        });
    });

    // --- Dynamic Multi-Select Rendering ---
    const STRATEGY_DEFS = {
        SMA_CROSS: 'Trend-following: compares a short SMA vs a long SMA. Buy on bullish crossover; sell on bearish crossover.',
        RSI_STRAT: 'Momentum oscillator (0–100). Buy on oversold cross; sell on overbought cross (levels configurable).',
        MACD: 'EMA-difference momentum/trend indicator. Signals from MACD line crossing its signal line.',
        AO: 'Awesome Oscillator: momentum from median price using short/long SMAs. Common signal is zero-line crossover.',
        APO: 'Absolute Price Oscillator: difference between fast and slow moving averages (trend/momentum).',
        BIAS: 'Bias (Deviation): measures how far price is from a moving average as a percentage.',
        BOP: 'Balance of Power: estimates buying vs selling pressure by comparing close vs range (often smoothed).',
        BRAR: 'BRAR: sentiment/strength indicator using price movement vs prior opens (market “heat”).',
        CCI: 'Commodity Channel Index: overbought/oversold vs statistical mean; useful in ranging markets.',
        CFO: 'Chande Forecast Oscillator: distance of price from a linear-regression forecast (mean-reversion tendency).',
        CG: 'Center of Gravity: smoother oscillator aimed at identifying turning points.',
        CMO: 'Chande Momentum Oscillator: momentum based on summed gains vs losses (similar family to RSI).',
        COPPOCK: 'Coppock Curve: long-term momentum indicator often used to identify major bottoms.',
        ER: 'Efficiency Ratio: measures trendiness vs noise (higher = cleaner trend).',
        ERI: 'Elder Ray Index: bull/bear power relative to EMA to assess trend strength.',
        FISHER: 'Fisher Transform: transforms price into a Gaussian-like distribution to highlight turning points.',
        INERTIA: 'Inertia: smoothed momentum oscillator (often RSI-based) to reduce noise.',
        KDJ: 'KDJ: stochastic-style oscillator (K/D/J) for momentum and overbought/oversold signals.',
        KST: 'KST Oscillator: composite of multiple ROC periods to measure long-term momentum shifts.',
        MOM: 'Momentum: simple rate of change (difference) over a lookback window.',
        PGO: 'Pretty Good Oscillator: compares price vs smoothed volatility to gauge momentum.',
        PPO: 'Percentage Price Oscillator: MACD-like but normalized as a percentage (good for comparing levels).',
        PSL: 'Psychological Line: % of up-closes over a lookback (market sentiment).',
        PVO: 'Percentage Volume Oscillator: momentum in volume using EMA differences, expressed as a percentage.',
        QQE: 'QQE: smoothed RSI-based indicator with dynamic bands (trend/momentum).',
        ROC: 'Rate of Change: percent change over a lookback; momentum/acceleration gauge.',
        RSX: 'RSX: smoother RSI variant designed to reduce noise and false signals.',
        RVGI: 'Relative Vigor Index: compares close-open vs high-low to estimate trend strength.',
        SLOPE: 'Slope: measures direction/steepness of a linear regression over a lookback.',
        SMI: 'SMI Ergodic: trend/momentum indicator using double-smoothed EMA differences.',
        SQUEEZE: 'Squeeze: detects low-volatility “compression” (BB inside KC) that can precede breakouts.',
        STOCH: 'Stochastic Oscillator: compares close to recent high/low range (%K/%D) for momentum turns.',
        STOCHRSI: 'Stochastic RSI: stochastic applied to RSI values (more sensitive oscillator).',
        TD_SEQ: 'TD Sequential: counts consecutive closes to estimate trend exhaustion points.',
        TRIX: 'TRIX: triple-smoothed EMA rate of change (filters noise, highlights trend changes).',
        TSI: 'True Strength Index: double-smoothed momentum oscillator for trend/momentum confirmation.',
        UO: 'Ultimate Oscillator: multi-timeframe momentum oscillator designed to reduce false signals.',
        WILLR: 'Williams %R: close relative to recent range (overbought/oversold, 0 to -100).'
    };
    const renderStrategySelector = () => {
        if (!strategySelector) return;
        let html = '';
        Object.keys(STRATEGY_CONFIG).forEach(key => {
            const def = STRATEGY_DEFS[key] || 'Technical indicator strategy.';
            html += `<label class="strategy-checkbox-item" title="${def}"><input type="checkbox" value="${key}" class="strategy-checkbox"> ${STRATEGY_CONFIG[key].name}</label>`;
        });
        strategySelector.innerHTML = html;
        document.querySelectorAll('.strategy-checkbox').forEach(checkbox => checkbox.addEventListener('change', renderMultiParams));
    };

    const renderMultiParams = () => {
        if (!dynamicParamsContainer) return;
        const selected = Array.from(document.querySelectorAll('.strategy-checkbox:checked')).map(cb => cb.value);
        dynamicParamsContainer.innerHTML = '';
        selected.forEach(key => {
            const config = STRATEGY_CONFIG[key];
            const section = document.createElement('div');
            section.className = 'dynamic-strategy-section';
            let paramsHtml = `<h3>${config.name} Parameters</h3><div class="param-grid">`;
            config.params.forEach(p => paramsHtml += `<div class="form-group"><label for="${p.id}">${p.label}</label><input type="number" id="${p.id}" value="${p.value}"></div>`);
            section.innerHTML = paramsHtml + '</div>';
            dynamicParamsContainer.appendChild(section);
        });
    };

    renderStrategySelector();

    // --- Indicators & Backtest Engine ---
    const EMA = (data, p) => {
        const ema = new Array(data.length).fill(null); if (data.length < p) return ema;
        const k = 2 / (p + 1); let sum = 0; for (let i = 0; i < p; i++) sum += data[i].close;
        ema[p - 1] = sum / p; for (let i = p; i < data.length; i++) ema[i] = (data[i].close - ema[i - 1]) * k + ema[i - 1];
        return ema;
    };
    const SMA = (data, p) => {
        const sma = new Array(data.length).fill(null); if (data.length < p) return sma;
        for (let i = p - 1; i < data.length; i++) { let sum = 0; for (let j = 0; j < p; j++) sum += data[i - j].close; sma[i] = sum / p; }
        return sma;
    };
    const RSI = (data, p) => {
        const rsi = new Array(data.length).fill(null); if (data.length <= p) return rsi;
        let g = 0, l = 0; for (let i = 1; i <= p; i++) { const d = data[i].close - data[i - 1].close; d >= 0 ? g += d : l -= d; }
        let ag = g / p, al = l / p;
        for (let i = p + 1; i < data.length; i++) { const d = data[i].close - data[i - 1].close; ag = (ag * (p - 1) + (d > 0 ? d : 0)) / p; al = (al * (p - 1) + (d < 0 ? -d : 0)) / p; rsi[i] = 100 - (100 / (1 + ag / al)); }
        return rsi;
    };

    const runBacktest = (opts) => {
        const selected = Array.from(document.querySelectorAll('.strategy-checkbox:checked')).map(cb => cb.value);
        if (selected.length === 0) return null;

        const wfEnableEl = document.getElementById('wf-enable');
        const wfFoldsEl = document.getElementById('wf-folds');
        const wfStartPctEl = document.getElementById('wf-start-pct');
        const wfTestPctEl = document.getElementById('wf-test-pct');

        const wfEnabled = !!(wfEnableEl && wfEnableEl.checked);
        const wfFolds = Math.max(2, Math.min(10, parseInt(wfFoldsEl ? wfFoldsEl.value : '3', 10) || 3));
        const wfStartPct = Math.max(0.2, Math.min(0.9, (parseFloat(wfStartPctEl ? wfStartPctEl.value : '60') || 60) / 100));
        const wfTestPct = Math.max(0.05, Math.min(0.3, (parseFloat(wfTestPctEl ? wfTestPctEl.value : '10') || 10) / 100));

        const backtestCore = (data, foldLabel) => {
            const initialEquity = 10000;
            const positionPctEl = document.getElementById('bt-position-pct');
            const commissionPctEl = document.getElementById('bt-commission-pct');
            const slippagePctEl = document.getElementById('bt-slippage-pct');
            const stopLossPctEl = document.getElementById('bt-stop-loss-pct');
            const takeProfitPctEl = document.getElementById('bt-take-profit-pct');

            const positionPct = Math.max(1, Math.min(100, parseFloat(positionPctEl ? positionPctEl.value : '100') || 100)) / 100;
            const commissionPct = Math.max(0, parseFloat(commissionPctEl ? commissionPctEl.value : '0') || 0) / 100;
            const slippagePct = Math.max(0, parseFloat(slippagePctEl ? slippagePctEl.value : '0') || 0) / 100;
            const stopLossPct = Math.max(0, parseFloat(stopLossPctEl ? stopLossPctEl.value : '0') || 0) / 100;
            const takeProfitPct = Math.max(0, parseFloat(takeProfitPctEl ? takeProfitPctEl.value : '0') || 0) / 100;

            const perIndicator = selected.map(strat => {
                const config = STRATEGY_CONFIG[strat], params = {};
                config.params.forEach(p => params[p.id] = parseFloat(document.getElementById(p.id).value));

                const signals = new Array(data.length).fill(null);
                let valueSeries = null;
                let valueSeries2 = null;

                if (strat === 'SMA_CROSS') {
                    const s = SMA(data, params['sma-short']), l = SMA(data, params['sma-long']);
                    valueSeries = s;
                    valueSeries2 = l;
                    for (let i = 1; i < data.length; i++) { if (s[i-1] < l[i-1] && s[i] > l[i]) signals[i] = 'BUY'; else if (s[i-1] > l[i-1] && s[i] < l[i]) signals[i] = 'SELL'; }
                } else if (strat === 'RSI_STRAT') {
                    const r = RSI(data, params['rsi-period']);
                    valueSeries = r;
                    for (let i = 1; i < data.length; i++) { if (r[i-1] > params['rsi-oversold'] && r[i] <= params['rsi-oversold']) signals[i] = 'BUY'; else if (r[i-1] < params['rsi-overbought'] && r[i] >= params['rsi-overbought']) signals[i] = 'SELL'; }
                } else if (strat === 'MACD') {
                    const f = EMA(data, params['macd-fast']), sl = EMA(data, params['macd-slow']);
                    const macdLine = f.map((v, i) => (v !== null && sl[i] !== null) ? v - sl[i] : null);
                    const signalLine = SMA(macdLine.map(v => ({ close: v || 0 })), params['macd-signal']);
                    valueSeries = macdLine;
                    valueSeries2 = signalLine;
                    for (let i = 1; i < data.length; i++) { if (macdLine[i-1] !== null && signalLine[i-1] !== null && macdLine[i] !== null && signalLine[i] !== null) { if (macdLine[i-1] < signalLine[i-1] && macdLine[i] > signalLine[i]) signals[i] = 'BUY'; else if (macdLine[i-1] > signalLine[i-1] && macdLine[i] < signalLine[i]) signals[i] = 'SELL'; } }
                } else if (strat === 'AO') {
                    const s = SMA(data, params['ao-short']), l = SMA(data, params['ao-long']);
                    const ao = s.map((v, i) => (v !== null && l[i] !== null) ? v - l[i] : null);
                    valueSeries = ao;
                    for (let i = 1; i < data.length; i++) { if (ao[i-1] !== null && ao[i] !== null) { if (ao[i-1] < 0 && ao[i] > 0) signals[i] = 'BUY'; else if (ao[i-1] > 0 && ao[i] < 0) signals[i] = 'SELL'; } }
                } else if (strat === 'CCI') {
                    const p = params['cci-period'], sma = SMA(data, p);
                    valueSeries = new Array(data.length).fill(null);
                    for (let i = p; i < data.length; i++) {
                        if (sma[i] === null) continue;
                        let md = 0;
                        for (let j = 0; j < p; j++) md += Math.abs(data[i-j].close - sma[i]);
                        md /= p;
                        const cci = (data[i].close - sma[i]) / (0.015 * md);
                        valueSeries[i] = cci;
                        if (cci < params['cci-oversold']) signals[i] = 'BUY';
                        else if (cci > params['cci-overbought']) signals[i] = 'SELL';
                    }
                } else if (strat === 'WILLR') {
                    const p = params['willr-period'];
                    valueSeries = new Array(data.length).fill(null);
                    for (let i = p; i < data.length; i++) {
                        let hh = -Infinity, ll = Infinity;
                        for (let j = 0; j < p; j++) { hh = Math.max(hh, data[i-j].high); ll = Math.min(ll, data[i-j].low); }
                        const wr = ((hh - data[i].close) / (hh - ll)) * -100;
                        valueSeries[i] = wr;
                        if (wr < params['willr-oversold']) signals[i] = 'BUY';
                        else if (wr > params['willr-overbought']) signals[i] = 'SELL';
                    }
                } else {
                    for (let i = 1; i < data.length; i++) if (Math.random() > 0.985) signals[i] = Math.random() > 0.5 ? 'BUY' : 'SELL';
                }

                const valueAt = (i) => {
                    const v1 = valueSeries ? valueSeries[i] : null;
                    const v2 = valueSeries2 ? valueSeries2[i] : null;
                    return { v1, v2 };
                };

                return { key: strat, name: STRATEGY_CONFIG[strat].name, signals, valueAt };
            });

            const combined = new Array(data.length).fill(null);
            for (let i = 0; i < data.length; i++) {
                const sigs = perIndicator.map(s => s.signals[i]);
                if (sigs.every(s => s === 'BUY')) combined[i] = 'BUY';
                else if (sigs.every(s => s === 'SELL')) combined[i] = 'SELL';
            }

            let cash = initialEquity;
            let positionQty = 0;
            let peak = initialEquity, mdd = 0, curDStart = 0, drawdowns = [], daysInMarket = 0, equityCurve = [];
            const equitySeries = [];
            const drawdownSeries = [];
            let totalFees = 0;
            let stopExits = 0;
            let takeExits = 0;
            const trades = [];
            let currentTrade = null;
            const markers = [];

            const snapshotIndicators = (i) => {
                return perIndicator.map(ind => {
                    const { v1, v2 } = ind.valueAt(i);
                    const payload = { indicator: ind.name, signal: ind.signals[i] || '-' };
                    if (v1 !== null && v1 !== undefined && isFinite(v1)) payload.v1 = v1;
                    if (v2 !== null && v2 !== undefined && isFinite(v2)) payload.v2 = v2;
                    return payload;
                });
            };

            for (let i = 0; i < data.length; i++) {
                const bar = data[i];
                const price = bar.close;

                if (positionQty > 0 && currentTrade) {
                    const stopPrice = currentTrade.stopPrice;
                    const takePrice = currentTrade.takePrice;
                    const stopHit = stopLossPct > 0 && typeof stopPrice === 'number' && bar.low <= stopPrice;
                    const takeHit = takeProfitPct > 0 && typeof takePrice === 'number' && bar.high >= takePrice;
                    let exitReason = null;
                    let exitFill = null;

                    if (stopHit) { exitReason = 'SL'; exitFill = stopPrice * (1 - slippagePct); }
                    else if (takeHit) { exitReason = 'TP'; exitFill = takePrice * (1 - slippagePct); }
                    else if (combined[i] === 'SELL') { exitReason = 'SELL'; exitFill = price * (1 - slippagePct); }

                    if (exitReason && exitFill !== null) {
                        const proceeds = positionQty * exitFill;
                        const feeSell = proceeds * commissionPct;
                        totalFees += feeSell;
                        cash += proceeds - feeSell;

                        const grossCost = currentTrade.invested + currentTrade.feeBuy;
                        const netResult = (proceeds - feeSell) - grossCost;
                        const netPnlPct = grossCost > 0 ? (netResult / grossCost) : 0;

                        trades.push({
                            entryDate: data[currentTrade.entryIndex].time,
                            exitDate: bar.time,
                            entryFill: currentTrade.entryFill,
                            exitFill,
                            reason: exitReason,
                            pnlPct: netPnlPct,
                            durationDays: i - currentTrade.entryIndex,
                            fees: currentTrade.feeBuy + feeSell,
                            indicatorsAtEntry: currentTrade.indicatorsAtEntry
                        });

                        if (exitReason === 'SL') stopExits++;
                        if (exitReason === 'TP') takeExits++;

                        markers.push({ time: bar.time, position: 'aboveBar', color: '#e91e63', shape: 'arrowDown', text: exitReason });
                        positionQty = 0;
                        currentTrade = null;
                    }
                }

                if (combined[i] === 'BUY' && positionQty === 0) {
                    const invest = cash * positionPct;
                    if (invest > 0) {
                        const entryFill = price * (1 + slippagePct);
                        const qty = invest / entryFill;
                        const feeBuy = invest * commissionPct;
                        totalFees += feeBuy;
                        cash -= invest + feeBuy;
                        positionQty = qty;
                        currentTrade = {
                            entryFill,
                            entryIndex: i,
                            invested: invest,
                            feeBuy,
                            stopPrice: stopLossPct > 0 ? entryFill * (1 - stopLossPct) : null,
                            takePrice: takeProfitPct > 0 ? entryFill * (1 + takeProfitPct) : null,
                            indicatorsAtEntry: snapshotIndicators(i)
                        };
                        markers.push({ time: bar.time, position: 'belowBar', color: '#2196F3', shape: 'arrowUp', text: 'BUY' });
                    }
                }

                const curEq = cash + (positionQty > 0 ? positionQty * price : 0);
                equityCurve.push(curEq);
                if (positionQty > 0) daysInMarket++;
                if (curEq > peak) { if (mdd < 0) drawdowns.push({ duration: i - curDStart, depth: mdd }); peak = curEq; curDStart = i; mdd = 0; }
                const dd = (curEq - peak) / peak; if (dd < mdd) mdd = dd;
                equitySeries.push({ time: bar.time, value: parseFloat(curEq.toFixed(2)) });
                drawdownSeries.push({ time: bar.time, value: parseFloat((dd * 100).toFixed(4)) });
            }

            if (positionQty > 0 && currentTrade) {
                const last = data[data.length - 1];
                const exitFill = last.close * (1 - slippagePct);
                const proceeds = positionQty * exitFill;
                const feeSell = proceeds * commissionPct;
                totalFees += feeSell;
                cash += proceeds - feeSell;

                const grossCost = currentTrade.invested + currentTrade.feeBuy;
                const netResult = (proceeds - feeSell) - grossCost;
                const netPnlPct = grossCost > 0 ? (netResult / grossCost) : 0;
                trades.push({
                    entryDate: data[currentTrade.entryIndex].time,
                    exitDate: last.time,
                    entryFill: currentTrade.entryFill,
                    exitFill,
                    reason: 'EOD',
                    pnlPct: netPnlPct,
                    durationDays: (data.length - 1) - currentTrade.entryIndex,
                    fees: currentTrade.feeBuy + feeSell,
                    indicatorsAtEntry: currentTrade.indicatorsAtEntry
                });
                markers.push({ time: last.time, position: 'aboveBar', color: '#e91e63', shape: 'arrowDown', text: 'EOD' });
                positionQty = 0;
                currentTrade = null;
            }

            if (candleSeries && foldLabel === 'MAIN' && !(opts && opts.suppressMarkers)) candleSeries.setMarkers(markers);

            const equity = cash;
            const totalReturn = (equity - initialEquity) / initialEquity;
            const durationDays = (new Date(data[data.length-1].time) - new Date(data[0].time)) / 86400000;
            const annReturn = Math.pow(1 + totalReturn, 365 / Math.max(1, durationDays)) - 1;
            const dailyReturns = equityCurve.map((v, i) => i === 0 ? 0 : (v - equityCurve[i-1]) / equityCurve[i-1]);
            const marketReturns = data.map((v, i) => i === 0 ? 0 : (v.close - data[i-1].close) / data[i-1].close);
            const vol = Math.sqrt(dailyReturns.reduce((s, v) => s + v*v, 0) / dailyReturns.length) * Math.sqrt(252);
            const sharpe = (annReturn - 0.02) / (vol || 1);
            const maxMDD = Math.min(...drawdowns.map(d => d.depth), mdd);
            const winRate = trades.length > 0 ? trades.filter(t => t.pnlPct > 0).length / trades.length : 0;
            const avgTrade = trades.length > 0 ? trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length : 0;
            const buyHold = (data[data.length-1].close - data[0].close) / data[0].close;

            const cov = dailyReturns.reduce((s, v, i) => s + (v * marketReturns[i]), 0) / dailyReturns.length;
            const varM = marketReturns.reduce((s, v) => s + v*v, 0) / marketReturns.length;
            const beta = cov / (varM || 1);
            const alpha = annReturn - (0.02 + beta * (buyHold - 0.02));

            const negReturns = dailyReturns.filter(v => v < 0);
            const downsideVol = Math.sqrt(negReturns.reduce((s, v) => s + v*v, 0) / dailyReturns.length) * Math.sqrt(252);
            const sortino = (annReturn - 0.02) / (downsideVol || 1);
            const calmar = annReturn / (Math.abs(maxMDD) || 1);

            const wins = trades.filter(t => t.pnlPct > 0).map(t => t.pnlPct);
            const losses = trades.filter(t => t.pnlPct <= 0).map(t => t.pnlPct);
            const avgWin = wins.length > 0 ? wins.reduce((s, v) => s + v, 0) / wins.length : 0;
            const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, v) => s + v, 0) / losses.length) : 0;
            const profitFactor = avgLoss === 0 ? avgWin * wins.length : (avgWin * wins.length) / (avgLoss * losses.length || 1);
            const sqn = Math.sqrt(trades.length) * (avgTrade / (vol || 1));
            const winLossRatio = avgLoss === 0 ? 0 : avgWin / avgLoss;
            const kelly = winLossRatio === 0 ? 0 : winRate - ((1 - winRate) / winLossRatio);

            const prefix = foldLabel && foldLabel !== 'MAIN' ? `${foldLabel} ` : '';
            const metrics = [
                { label: `${prefix}Start Date`, value: data[0].time },
                { label: `${prefix}End Date`, value: data[data.length-1].time },
                { label: `${prefix}Total Return`, value: (totalReturn * 100).toFixed(2) + "%", class: totalReturn >= 0 ? "positive" : "negative" },
                { label: `${prefix}Sharpe Ratio`, value: sharpe.toFixed(2), class: "highlight" },
                { label: `${prefix}Max. Drawdown`, value: (maxMDD * 100).toFixed(2) + "%", class: "negative" },
                { label: `${prefix}Trades`, value: trades.length },
            ];

            const fullMetrics = foldLabel === 'MAIN' ? [
                { label: "Start Date", value: data[0].time },
                { label: "End Date", value: data[data.length-1].time },
                { label: "Duration (Days)", value: Math.floor(durationDays) },
                { label: "Total Return", value: (totalReturn * 100).toFixed(2) + "%", class: totalReturn >= 0 ? "positive" : "negative" },
                { label: "Annualized Return", value: (annReturn * 100).toFixed(2) + "%", class: annReturn >= 0 ? "positive" : "negative" },
                { label: "Equity Final", value: "$" + equity.toLocaleString(undefined, {maximumFractionDigits:2}), class: "positive" },
                { label: "Net Profit", value: "$" + (equity - initialEquity).toLocaleString(undefined, {maximumFractionDigits:2}), class: (equity - initialEquity) >= 0 ? "positive" : "negative" },
                { label: "Peak Equity", value: "$" + peak.toLocaleString(undefined, {maximumFractionDigits:2}) },
                { label: "Position Size", value: (positionPct * 100).toFixed(0) + "%" },
                { label: "Commission (Per Side)", value: (commissionPct * 100).toFixed(2) + "%" },
                { label: "Slippage (Per Side)", value: (slippagePct * 100).toFixed(2) + "%" },
                { label: "Stop Loss", value: (stopLossPct * 100).toFixed(2) + "%" },
                { label: "Take Profit", value: (takeProfitPct * 100).toFixed(2) + "%" },
                { label: "Total Fees Paid", value: "$" + totalFees.toLocaleString(undefined, { maximumFractionDigits: 2 }) },
                { label: "Buy & Hold Return", value: (buyHold * 100).toFixed(2) + "%" },
                { label: "Sharpe Ratio", value: sharpe.toFixed(2), class: "highlight" },
                { label: "Sortino Ratio", value: sortino.toFixed(2), class: "highlight" },
                { label: "Calmar Ratio", value: calmar.toFixed(2) },
                { label: "Max. Drawdown", value: (maxMDD * 100).toFixed(2) + "%", class: "negative" },
                { label: "Avg. Drawdown", value: (drawdowns.reduce((s, d) => s + d.depth, 0) / (drawdowns.length || 1) * 100).toFixed(2) + "%" },
                { label: "Volatility (Ann.)", value: (vol * 100).toFixed(2) + "%" },
                { label: "Alpha (Relative)", value: alpha.toFixed(4) },
                { label: "Beta (Market)", value: beta.toFixed(4) },
                { label: "SQN Score", value: sqn.toFixed(2), class: "highlight" },
                { label: "Kelly Criterion", value: (kelly * 100).toFixed(2) + "%" },
                { label: "Total Trades", value: trades.length },
                { label: "Win Rate", value: (winRate * 100).toFixed(2) + "%", class: "highlight" },
                { label: "Stop Loss Exits", value: stopExits },
                { label: "Take Profit Exits", value: takeExits },
                { label: "Profit Factor", value: profitFactor.toFixed(2), class: profitFactor > 1 ? "positive" : "negative" },
                { label: "Avg. Trade PnL", value: (avgTrade * 100).toFixed(2) + "%" },
                { label: "Best Trade", value: (Math.max(...trades.map(t => t.pnlPct), 0) * 100).toFixed(2) + "%", class: "positive" },
                { label: "Worst Trade", value: (Math.min(...trades.map(t => t.pnlPct), 0) * 100).toFixed(2) + "%", class: "negative" },
                { label: "Avg. Win", value: (avgWin * 100).toFixed(2) + "%" },
                { label: "Avg. Loss", value: (avgLoss * 100).toFixed(2) + "%" },
                { label: "Avg. Duration", value: (trades.reduce((s, t) => s + t.durationDays, 0) / (trades.length || 1)).toFixed(1) + " days" },
                { label: "Win/Loss Ratio", value: winLossRatio.toFixed(2) },
                { label: "Expectancy", value: (avgTrade * 100).toFixed(2) + "%" },
                { label: "Recovery Factor", value: (totalReturn / Math.abs(maxMDD) || 0).toFixed(2) },
                { label: "Days in Market", value: daysInMarket },
                { label: "Market Exposure", value: ((daysInMarket / data.length) * 100).toFixed(1) + "%" },
                { label: "Selected Indicators", value: selected.join(", "), class: "highlight" }
            ] : metrics;

            return { metrics: fullMetrics, trades, foldMetrics: metrics, equitySeries, drawdownSeries };
        };

        const data = historicalData;
        if (!wfEnabled) {
            const out = backtestCore(data, 'MAIN');
            return { results: out.metrics, trades: out.trades, folds: null, equitySeries: out.equitySeries, drawdownSeries: out.drawdownSeries };
        }

        const n = data.length;
        const startIndex = Math.floor(n * wfStartPct);
        const testLen = Math.max(20, Math.floor(n * wfTestPct));

        const folds = [];
        for (let f = 0; f < wfFolds; f++) {
            const segStart = startIndex + f * testLen;
            const segEnd = Math.min(n, segStart + testLen);
            if (segStart >= n - 50) break;
            const seg = data.slice(segStart, segEnd);
            if (seg.length < 50) break;
            folds.push(backtestCore(seg, `Fold ${f + 1}`));
        }

        const header = [
            { label: "Walk-Forward Enabled", value: "Yes", class: "highlight" },
            { label: "Folds Used", value: String(folds.length) },
            { label: "Start %", value: (wfStartPct * 100).toFixed(0) + "%" },
            { label: "Test %", value: (wfTestPct * 100).toFixed(0) + "%" },
        ];

        const foldMetricsFlat = folds.flatMap(f => f.foldMetrics);
        const mainOut = backtestCore(data, 'MAIN');
        return { results: header.concat(mainOut.metrics).concat(foldMetricsFlat), trades: mainOut.trades, folds, equitySeries: mainOut.equitySeries, drawdownSeries: mainOut.drawdownSeries };
    };

    // --- Drawing Logic ---
    const drawBtn = document.getElementById('draw-line-btn');
    const hLineBtn = document.getElementById('draw-hline-btn');
    const vLineBtn = document.getElementById('draw-vline-btn');
    const clearBtn = document.getElementById('clear-drawings-btn');
    let drawingMode = false;
    let firstPoint = null;
    let firstPointCoord = null;
    let previewLine = null;
    let drawnLines = [];
    let priceLines = [];
    let verticalLines = [];
    let rafPending = false;
    let lastMoveParam = null;
    let shiftDown = false;

    const getClickTime = (param) => {
        if (!chart || !param || !param.point) return null;
        if (param.time) return param.time;
        try {
            const t = chart.timeScale().coordinateToTime(param.point.x);
            return t || null;
        } catch { return null; }
    };

    const getClickPrice = (param) => {
        if (!candleSeries || !param || !param.point) return null;
        try {
            const p = candleSeries.coordinateToPrice(param.point.y);
            return (p == null || !isFinite(p)) ? null : p;
        } catch { return null; }
    };

    const ensurePreviewLine = () => {
        if (!chart) return null;
        if (previewLine) return previewLine;
        if (typeof chart.addLineSeries === 'function') {
            previewLine = chart.addLineSeries({
                color: 'rgba(33, 150, 243, 0.65)',
                lineWidth: 2,
                lineStyle: (LightweightCharts && LightweightCharts.LineStyle) ? LightweightCharts.LineStyle.Dashed : undefined,
                lastValueVisible: false,
                priceLineVisible: false
            });
        } else if (typeof chart.addSeries === 'function') {
            previewLine = chart.addSeries(LightweightCharts.SeriesType.Line, {
                color: 'rgba(33, 150, 243, 0.65)',
                lineWidth: 2,
                lastValueVisible: false,
                priceLineVisible: false
            });
        }
        return previewLine;
    };

    const setDrawingUi = (on) => {
        drawingMode = !!on;
        if (drawBtn) drawBtn.classList.toggle('active', drawingMode);
        if (hLineBtn) hLineBtn.classList.remove('active');
        if (vLineBtn) vLineBtn.classList.remove('active');
        if (chartContainer) chartContainer.style.cursor = drawingMode ? 'crosshair' : 'default';
        if (!drawingMode) {
            firstPoint = null;
            firstPointCoord = null;
            if (previewLine) previewLine.setData([]);
        }
    };

    if (drawBtn) {
        drawBtn.addEventListener('click', () => {
            setDrawingUi(!drawingMode);
            if (drawingMode) ensurePreviewLine();
        });
    }

    const addHorizontalLine = (price) => {
        if (!candleSeries || !isFinite(price)) return;
        if (typeof candleSeries.createPriceLine !== 'function') {
            const start = chart?.timeScale()?.getVisibleRange?.()?.from || null;
            const end = chart?.timeScale()?.getVisibleRange?.()?.to || null;
            if (!start || !end) return;
        }
        const pl = candleSeries.createPriceLine({
            price,
            color: 'rgba(33, 150, 243, 0.9)',
            lineWidth: 2,
            lineStyle: (LightweightCharts && LightweightCharts.LineStyle) ? LightweightCharts.LineStyle.Solid : undefined,
            axisLabelVisible: true,
            title: 'H'
        });
        priceLines.push(pl);
    };

    const updateVerticalLinePositions = () => {
        if (!chart || !verticalLines.length) return;
        verticalLines.forEach(vl => {
            const x = chart.timeScale().timeToCoordinate(vl.time);
            if (x == null || !isFinite(x)) {
                vl.el.style.display = 'none';
                return;
            }
            vl.el.style.display = 'block';
            vl.el.style.left = `${Math.round(x)}px`;
        });
    };

    const addVerticalLine = (time) => {
        if (!chartContainer || !chart || time == null) return;
        const el = document.createElement('div');
        el.className = 'chart-vline';
        chartContainer.appendChild(el);
        verticalLines.push({ time, el });
        updateVerticalLinePositions();
    };

    if (hLineBtn) {
        hLineBtn.addEventListener('click', () => {
            if (!chart) return;
            drawingMode = false;
            setDrawingUi(false);
            hLineBtn.classList.add('active');
            chartContainer.style.cursor = 'crosshair';
            const oneClick = (param) => {
                const p = getClickPrice(param);
                if (p == null) return;
                addHorizontalLine(p);
                hLineBtn.classList.remove('active');
                chartContainer.style.cursor = 'default';
                chart.unsubscribeClick(oneClick);
            };
            chart.subscribeClick(oneClick);
        });
    }

    if (vLineBtn) {
        vLineBtn.addEventListener('click', () => {
            if (!chart) return;
            drawingMode = false;
            setDrawingUi(false);
            vLineBtn.classList.add('active');
            chartContainer.style.cursor = 'crosshair';
            const oneClick = (param) => {
                const t = getClickTime(param);
                if (t == null) return;
                addVerticalLine(t);
                vLineBtn.classList.remove('active');
                chartContainer.style.cursor = 'default';
                chart.unsubscribeClick(oneClick);
            };
            chart.subscribeClick(oneClick);
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (!chart) return;
            drawnLines.forEach(s => chart.removeSeries(s));
            drawnLines = [];
            if (candleSeries && typeof candleSeries.removePriceLine === 'function') {
                priceLines.forEach(pl => candleSeries.removePriceLine(pl));
            }
            priceLines = [];
            verticalLines.forEach(vl => vl.el.remove());
            verticalLines = [];
            firstPoint = null;
            firstPointCoord = null;
            if (previewLine) previewLine.setData([]);
        });
    }

    if (chart) {
        chart.subscribeClick((param) => {
            if (!drawingMode || !param || !param.point) return;
            const t = getClickTime(param);
            const p = getClickPrice(param);
            if (t == null || p == null) return;

            if (!firstPoint) {
                firstPoint = { time: t, value: p };
                firstPointCoord = { x: param.point.x, y: param.point.y };
                const pl = ensurePreviewLine();
                if (pl) pl.setData([{ time: firstPoint.time, value: firstPoint.value }, { time: firstPoint.time, value: firstPoint.value }]);
                return;
            }

            if (shiftDown && firstPointCoord) {
                const dx = Math.abs(param.point.x - firstPointCoord.x);
                const dy = Math.abs(param.point.y - firstPointCoord.y);
                if (dy > dx) {
                    addVerticalLine(firstPoint.time);
                    firstPoint = null;
                    firstPointCoord = null;
                    if (previewLine) previewLine.setData([]);
                    return;
                }
            }

            const end = shiftDown ? { time: t, value: firstPoint.value } : { time: t, value: p };
            const line = typeof chart.addLineSeries === 'function'
                ? chart.addLineSeries({ color: '#2196f3', lineWidth: 2, lastValueVisible: false, priceLineVisible: false })
                : chart.addSeries(LightweightCharts.SeriesType.Line, { color: '#2196f3', lineWidth: 2, lastValueVisible: false, priceLineVisible: false });
            line.setData([{ time: firstPoint.time, value: firstPoint.value }, { time: end.time, value: end.value }]);
            drawnLines.push(line);
            firstPoint = null;
            firstPointCoord = null;
            if (previewLine) previewLine.setData([]);
        });

        chart.subscribeCrosshairMove((param) => {
            if (!drawingMode || !firstPoint || !param || !param.point) return;
            lastMoveParam = param;
            if (rafPending) return;
            rafPending = true;
            requestAnimationFrame(() => {
                rafPending = false;
                const mp = lastMoveParam;
                if (!drawingMode || !firstPoint || !mp || !mp.point) return;
                const t = getClickTime(mp);
                const p = getClickPrice(mp);
                if (t == null || p == null) return;
                let endTime = t;
                let endPrice = p;
                if (shiftDown && firstPointCoord) {
                    const dx = Math.abs(mp.point.x - firstPointCoord.x);
                    const dy = Math.abs(mp.point.y - firstPointCoord.y);
                    if (dy > dx) {
                        endTime = firstPoint.time;
                    } else {
                        endPrice = firstPoint.value;
                    }
                }
                const pl = ensurePreviewLine();
                if (pl) pl.setData([{ time: firstPoint.time, value: firstPoint.value }, { time: endTime, value: endPrice }]);
            });
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && drawingMode) setDrawingUi(false);
            if (e.key === 'Shift') shiftDown = true;
        });

        window.addEventListener('keyup', (e) => {
            if (e.key === 'Shift') shiftDown = false;
        });

        const ts = chart.timeScale();
        if (ts && typeof ts.subscribeVisibleTimeRangeChange === 'function') {
            ts.subscribeVisibleTimeRangeChange(() => updateVerticalLinePositions());
        } else {
            setInterval(() => updateVerticalLinePositions(), 250);
        }

        const ro = new ResizeObserver(() => updateVerticalLinePositions());
        if (chartContainer) ro.observe(chartContainer);
    }

    // --- News Modal Logic ---
    const modal = document.getElementById('news-modal');
    const closeBtn = document.getElementById('close-modal');
    const modalBody = document.getElementById('modal-news-body');
    const newsData = {
        '1': {
            title: "Gold Futures (GC=F) Hit New 2026 High at $4,657",
            date: "April 07, 2026",
            content: "Gold futures reached a historic milestone today, climbing to $4,657 per ounce. This surge is attributed to a combination of geopolitical tensions and a weakening US dollar. Analysts suggest that the bullish trend remains strong as institutional investors continue to hedge against inflation."
        },
        '2': {
            title: "Institutional Demand for GC=F Increases by 15%",
            date: "April 06, 2026",
            content: "Recent reports indicate a 15% uptick in institutional buying for Gold Futures (GC=F). Large hedge funds and central banks have been increasing their allocations, citing gold's stability in a volatile global economy. This influx of capital is providing a strong floor for the current price levels."
        },
        '3': {
            title: "Analysts Eye $4,800 as Next Major Resistance",
            date: "April 05, 2026",
            content: "Technical analysts are focusing on the $4,800 mark as the next major psychological and technical resistance level for GC=F. Following the breakout above $4,500, momentum indicators show that the path of least resistance is upward, though minor pullbacks are expected for consolidation."
        },
        '4': {
            title: "Federal Reserve Interest Rate Signals Boost Gold Sentiment",
            date: "April 04, 2026",
            content: "The latest statements from the Federal Reserve regarding interest rate pauses have significantly boosted market sentiment for Gold Futures. As the opportunity cost of holding non-yielding assets like gold decreases, investors are moving back into the sector, driving prices toward new all-time highs."
        }
    };

    if (modal && closeBtn) {
        document.querySelectorAll('.ticker-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.newsId;
                const news = newsData[id];
                if (news) {
                    modalBody.innerHTML = `
                        <h2>${news.title}</h2>
                        <span class="news-date">${news.date}</span>
                        <p>${news.content}</p>
                    `;
                    modal.classList.remove('hidden');
                }
            });
        });

        closeBtn.onclick = () => modal.classList.add('hidden');
        window.onclick = (event) => { if (event.target == modal) modal.classList.add('hidden'); };
    }

    const presetNameEl = document.getElementById('preset-name');
    const presetSelectEl = document.getElementById('preset-select');
    const savePresetBtn = document.getElementById('save-preset-btn');
    const deletePresetBtn = document.getElementById('delete-preset-btn');
    const wfEnableEl = document.getElementById('wf-enable');
    const wfFoldsEl = document.getElementById('wf-folds');
    const wfStartPctEl = document.getElementById('wf-start-pct');
    const wfTestPctEl = document.getElementById('wf-test-pct');

    const tradeLogBody = document.getElementById('trade-log-body');
    const tradeModal = document.getElementById('trade-modal');
    const closeTradeModalBtn = document.getElementById('close-trade-modal');
    const tradeModalBody = document.getElementById('trade-modal-body');

    const presetsKey = 'goldtrade_presets_v1';
    const readPresets = () => {
        try { return JSON.parse(localStorage.getItem(presetsKey) || '{}') || {}; } catch { return {}; }
    };
    const writePresets = (obj) => {
        localStorage.setItem(presetsKey, JSON.stringify(obj || {}));
    };

    const refreshPresetSelect = () => {
        if (!presetSelectEl) return;
        const presets = readPresets();
        const current = presetSelectEl.value;
        presetSelectEl.innerHTML = '<option value="">Select preset...</option>';
        Object.keys(presets).sort().forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            presetSelectEl.appendChild(opt);
        });
        if (current && presets[current]) presetSelectEl.value = current;
    };

    const captureState = () => {
        const selectedIndicators = Array.from(document.querySelectorAll('.strategy-checkbox:checked')).map(cb => cb.value);
        const values = {};
        Object.keys(STRATEGY_CONFIG).forEach(key => {
            STRATEGY_CONFIG[key].params.forEach(p => {
                const el = document.getElementById(p.id);
                if (el) values[p.id] = el.value;
            });
        });
        ['bt-position-pct','bt-commission-pct','bt-slippage-pct','bt-stop-loss-pct','bt-take-profit-pct'].forEach(id => {
            const el = document.getElementById(id);
            if (el) values[id] = el.value;
        });
        const wf = {
            enabled: !!(wfEnableEl && wfEnableEl.checked),
            folds: wfFoldsEl ? wfFoldsEl.value : '3',
            startPct: wfStartPctEl ? wfStartPctEl.value : '60',
            testPct: wfTestPctEl ? wfTestPctEl.value : '10',
        };
        return { selectedIndicators, values, wf };
    };

    const applyState = (state) => {
        if (!state) return;
        const selectedSet = new Set(state.selectedIndicators || []);
        document.querySelectorAll('.strategy-checkbox').forEach(cb => { cb.checked = selectedSet.has(cb.value); });
        if (typeof renderMultiParams === 'function') renderMultiParams();
        const values = state.values || {};
        Object.keys(values).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = values[id];
        });
        if (wfEnableEl) wfEnableEl.checked = !!(state.wf && state.wf.enabled);
        if (wfFoldsEl && state.wf && state.wf.folds != null) wfFoldsEl.value = state.wf.folds;
        if (wfStartPctEl && state.wf && state.wf.startPct != null) wfStartPctEl.value = state.wf.startPct;
        if (wfTestPctEl && state.wf && state.wf.testPct != null) wfTestPctEl.value = state.wf.testPct;
    };

    if (presetSelectEl && savePresetBtn && deletePresetBtn) {
        refreshPresetSelect();

        savePresetBtn.addEventListener('click', () => {
            const name = (presetNameEl ? presetNameEl.value : '').trim() || 'My GC=F Strategy';
            const presets = readPresets();
            presets[name] = captureState();
            writePresets(presets);
            refreshPresetSelect();
            presetSelectEl.value = name;
        });

        deletePresetBtn.addEventListener('click', () => {
            const name = presetSelectEl.value;
            if (!name) return;
            const presets = readPresets();
            delete presets[name];
            writePresets(presets);
            refreshPresetSelect();
        });

        presetSelectEl.addEventListener('change', () => {
            const name = presetSelectEl.value;
            if (!name) return;
            const presets = readPresets();
            const state = presets[name];
            if (state) applyState(state);
        });
    }

    const demoRunBtn = document.getElementById('demo-run-btn');
    if (demoRunBtn && typeof applyState === 'function') {
        demoRunBtn.addEventListener('click', () => {
            const demoState = {
                selectedIndicators: ['SMA_CROSS'],
                values: {
                    'sma-short': '20',
                    'sma-long': '50',
                    'bt-position-pct': '100',
                    'bt-commission-pct': '0.02',
                    'bt-slippage-pct': '0.03',
                    'bt-stop-loss-pct': '2',
                    'bt-take-profit-pct': '4',
                },
                wf: { enabled: true, folds: '3', startPct: '60', testPct: '10' }
            };
            applyState(demoState);
            if (presetNameEl) presetNameEl.value = 'Demo: SMA Cross';
            if (runBtn) runBtn.click();
        });
    }

    const addWishlistBtn = document.getElementById('add-wishlist-btn');
    if (addWishlistBtn) {
        addWishlistBtn.addEventListener('click', () => {
            const email = requireAuth();
            if (!email) return;
            const all = readJson(WISHLIST_KEY, {});
            const list = Array.isArray(all[email]) ? all[email] : [];
            const name = (presetSelectEl && presetSelectEl.value ? presetSelectEl.value : (presetNameEl ? presetNameEl.value : '')).trim() || 'Untitled Strategy';
            const id = (crypto && typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : String(Date.now()) + String(Math.random()).slice(2);
            const item = { id, name, createdAt: new Date().toISOString(), state: captureState() };
            list.unshift(item);
            all[email] = list;
            writeJson(WISHLIST_KEY, all);
        });
    }

    if (presetSelectEl || dynamicParamsContainer) {
        const loadState = readJson(WISHLIST_LOAD_KEY, null);
        if (loadState) {
            applyState(loadState);
            localStorage.removeItem(WISHLIST_LOAD_KEY);
        }
    }

    const renderTradeLog = (trades) => {
        if (!tradeLogBody) return;
        if (!trades || trades.length === 0) {
            tradeLogBody.innerHTML = '<tr><td colspan="6">No trades.</td></tr>';
            return;
        }
        tradeLogBody.innerHTML = '';
        trades.forEach((t, idx) => {
            const tr = document.createElement('tr');
            const pnlClass = t.pnlPct >= 0 ? 'trade-pnl-pos' : 'trade-pnl-neg';
            tr.innerHTML = `
                <td>${idx + 1}</td>
                <td>${t.entryDate}</td>
                <td>${t.exitDate}</td>
                <td>${t.reason}</td>
                <td class="${pnlClass}">${(t.pnlPct * 100).toFixed(2)}%</td>
                <td>${t.durationDays}d</td>
            `;
            tr.addEventListener('click', () => {
                if (!tradeModal || !tradeModalBody) return;
                const indicators = (t.indicatorsAtEntry || []).map(i => {
                    const v1 = (i.v1 !== undefined) ? ` ${Number(i.v1).toFixed(2)}` : '';
                    const v2 = (i.v2 !== undefined) ? ` / ${Number(i.v2).toFixed(2)}` : '';
                    return `<div>${i.indicator}</div><div>${i.signal}${v1}${v2}</div>`;
                }).join('');

                tradeModalBody.innerHTML = `
                    <h2>Trade #${idx + 1}</h2>
                    <div class="kv">
                        <div>Entry Date</div><div>${t.entryDate}</div>
                        <div>Exit Date</div><div>${t.exitDate}</div>
                        <div>Exit Reason</div><div>${t.reason}</div>
                        <div>Entry Fill</div><div>${t.entryFill.toFixed(2)}</div>
                        <div>Exit Fill</div><div>${t.exitFill.toFixed(2)}</div>
                        <div>PnL</div><div>${(t.pnlPct * 100).toFixed(2)}%</div>
                        <div>Duration</div><div>${t.durationDays} days</div>
                        <div>Fees</div><div>$${Number(t.fees || 0).toFixed(2)}</div>
                    </div>
                    <h2>Why Entry Happened</h2>
                    <div class="kv">${indicators}</div>
                `;
                tradeModal.classList.remove('hidden');
            });
            tradeLogBody.appendChild(tr);
        });
    };

    if (tradeModal && closeTradeModalBtn) {
        closeTradeModalBtn.addEventListener('click', () => tradeModal.classList.add('hidden'));
        window.addEventListener('click', (event) => { if (event.target === tradeModal) tradeModal.classList.add('hidden'); });
    }

    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const profileNameEl = document.getElementById('profile-name');
    const wishlistGridEl = document.getElementById('wishlist-grid');
    const ideasGridEl = document.getElementById('ideas-grid');

    if (loginForm) {
        const msg = document.getElementById('login-message');
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = normalizeEmail(document.getElementById('login-email')?.value);
            const password = String(document.getElementById('login-password')?.value || '');
            const users = readUsers();
            const user = users[email];
            if (!user) {
                if (msg) { msg.textContent = 'Invalid email or password.'; msg.className = 'auth-message error'; }
                return;
            }
            const h = await sha256Hex(password);
            if (h !== user.passwordHash) {
                if (msg) { msg.textContent = 'Invalid email or password.'; msg.className = 'auth-message error'; }
                return;
            }
            setSessionEmail(email);
            const params = new URLSearchParams(window.location.search);
            const redirect = params.get('redirect');
            window.location.href = redirect ? redirect : 'profile.html';
        });
    }

    if (registerForm) {
        const msg = document.getElementById('register-message');
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = String(document.getElementById('reg-name')?.value || '').trim();
            const email = normalizeEmail(document.getElementById('reg-email')?.value);
            const p1 = String(document.getElementById('reg-password')?.value || '');
            const p2 = String(document.getElementById('reg-confirm')?.value || '');
            if (!name || !email) {
                if (msg) { msg.textContent = 'Please fill all fields.'; msg.className = 'auth-message error'; }
                return;
            }
            if (p1.length < 6) {
                if (msg) { msg.textContent = 'Password must be at least 6 characters.'; msg.className = 'auth-message error'; }
                return;
            }
            if (p1 !== p2) {
                if (msg) { msg.textContent = 'Passwords do not match.'; msg.className = 'auth-message error'; }
                return;
            }
            const users = readUsers();
            if (users[email]) {
                if (msg) { msg.textContent = 'Email already registered.'; msg.className = 'auth-message error'; }
                return;
            }
            const passwordHash = await sha256Hex(p1);
            users[email] = { email, passwordHash, createdAt: new Date().toISOString() };
            writeUsers(users);
            const profiles = readProfiles();
            profiles[email] = profiles[email] || { email, displayName: name, bio: '', createdAt: users[email].createdAt };
            writeProfiles(profiles);
            setSessionEmail(email);
            window.location.href = 'profile.html';
        });
    }

    if (profileNameEl) {
        const email = requireAuth();
        if (email) {
            const profiles = readProfiles();
            const users = readUsers();
            const p = profiles[email] || { email, displayName: email, bio: '', createdAt: users[email]?.createdAt || new Date().toISOString() };
            const avatar = document.getElementById('profile-avatar');
            const emailEl = document.getElementById('profile-email');
            const createdEl = document.getElementById('profile-created');
            const displayEl = document.getElementById('profile-display');
            const picEl = document.getElementById('profile-pic');
            const bioEl = document.getElementById('profile-bio');
            const websiteEl = document.getElementById('profile-website');
            const twitterEl = document.getElementById('profile-twitter');
            const linkedinEl = document.getElementById('profile-linkedin');
            const saveBtn = document.getElementById('save-profile-btn');
            const logoutBtn = document.getElementById('logout-btn');
            const msg = document.getElementById('profile-message');
            const initials = String(p.displayName || p.email || '?').trim().slice(0, 2).toUpperCase();
            if (avatar) {
                if (p.profilePic) {
                    avatar.innerHTML = `<img src="${p.profilePic}" alt="Profile" style="width:100%;height:100%;border-radius:18px;object-fit:cover;">`;
                } else {
                    avatar.textContent = initials;
                }
            }
            profileNameEl.textContent = p.displayName || email;
            if (emailEl) emailEl.textContent = email;
            if (createdEl) createdEl.textContent = p.createdAt ? `Joined: ${p.createdAt.slice(0, 10)}` : '';
            if (displayEl) displayEl.value = p.displayName || '';
            if (bioEl) bioEl.value = p.bio || '';
            if (websiteEl) websiteEl.value = p.website || '';
            if (twitterEl) twitterEl.value = p.twitter || '';
            if (linkedinEl) linkedinEl.value = p.linkedin || '';
            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    const save = (profilePic) => {
                    const profiles2 = readProfiles();
                    const displayName = String(displayEl?.value || p.displayName || email).trim() || email;
                    profiles2[email] = { 
                        ...p, 
                        displayName, 
                        bio: String(bioEl?.value || ''), 
                        website: String(websiteEl?.value || ''), 
                        twitter: String(twitterEl?.value || ''), 
                        linkedin: String(linkedinEl?.value || ''), 
                        profilePic: profilePic != null ? profilePic : (p.profilePic || ''),
                        createdAt: p.createdAt 
                    };
                    writeProfiles(profiles2);
                    profileNameEl.textContent = displayName;
                    if (msg) { msg.textContent = 'Profile saved.'; msg.className = 'auth-message success'; }
                    };

                    const file = picEl && picEl.files && picEl.files[0] ? picEl.files[0] : null;
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = () => save(String(reader.result || ''));
                        reader.readAsDataURL(file);
                    } else {
                        save(null);
                    }
                });
            }
            if (logoutBtn) {
                logoutBtn.addEventListener('click', () => {
                    setSessionEmail(null);
                    window.location.href = 'index.html';
                });
            }
            const presets = readJson(presetsKey, {});
            const wl = readJson(WISHLIST_KEY, {});
            const ideas = readJson(IDEAS_KEY, []);
            const statPresets = document.getElementById('stat-presets');
            const statWishlist = document.getElementById('stat-wishlist');
            const statIdeas = document.getElementById('stat-ideas');
            if (statPresets) statPresets.textContent = String(Object.keys(presets).length);
            if (statWishlist) statWishlist.textContent = String(Array.isArray(wl[email]) ? wl[email].length : 0);
            if (statIdeas) statIdeas.textContent = String(Array.isArray(ideas) ? ideas.filter(x => x.authorEmail === email).length : 0);
        }
    }

    if (wishlistGridEl) {
        const email = requireAuth();
        if (email) {
            const renderWishlist = () => {
                const all = readJson(WISHLIST_KEY, {});
                const list = Array.isArray(all[email]) ? all[email] : [];
                wishlistGridEl.innerHTML = '';
                if (list.length === 0) {
                    wishlistGridEl.innerHTML = '<div class="result-item"><span class="label">Wishlist</span><span class="value">Empty</span></div>';
                    return;
                }
                list.forEach(item => {
                    const card = document.createElement('div');
                    card.className = 'wishlist-card';
                    card.innerHTML = `
                        <h3>${item.name}</h3>
                        <div class="idea-meta">${String(item.createdAt || '').slice(0, 10)}</div>
                        <div class="idea-actions">
                            <button class="mini-btn primary" type="button" data-action="load">Load in Tester</button>
                            <button class="mini-btn danger" type="button" data-action="remove">Remove</button>
                        </div>
                    `;
                    card.querySelector('[data-action="load"]')?.addEventListener('click', () => {
                        writeJson(WISHLIST_LOAD_KEY, item.state);
                        window.location.href = 'backtest.html';
                    });
                    card.querySelector('[data-action="remove"]')?.addEventListener('click', () => {
                        const all2 = readJson(WISHLIST_KEY, {});
                        const list2 = Array.isArray(all2[email]) ? all2[email] : [];
                        all2[email] = list2.filter(x => x.id !== item.id);
                        writeJson(WISHLIST_KEY, all2);
                        renderWishlist();
                    });
                    wishlistGridEl.appendChild(card);
                });
            };
            renderWishlist();
        }
    }

    const orderStatusEl = document.getElementById('order-status');
    const buyOrderBtn = document.getElementById('buy-order-btn');
    const sellOrderBtn = document.getElementById('sell-order-btn');
    if (buyOrderBtn || sellOrderBtn) {
        const showOrderMsg = (text, type) => {
            if (!orderStatusEl) return;
            orderStatusEl.textContent = text;
            orderStatusEl.className = `order-status ${type || ''}`;
        };
        const getLivePrice = () => {
            const v = parseFloat(document.getElementById('current-price-val')?.textContent || '');
            return isFinite(v) ? v : null;
        };
        const updatePortfolioTrade = (side) => {
            const price = getLivePrice();
            if (price === null) { showOrderMsg('Live price not available.', 'error'); return; }
            const amountEl = document.getElementById(side === 'BUY' ? 'buy-amount' : 'sell-amount');
            const qty = parseFloat(amountEl ? amountEl.value : '');
            if (!isFinite(qty) || qty <= 0) { showOrderMsg('Enter a valid amount.', 'error'); return; }
            const p = ensurePortfolio();
            const total = qty * price;
            if (side === 'BUY') {
                if (p.cash < total) { showOrderMsg('Not enough cash.', 'error'); return; }
                const newHoldings = p.holdings + qty;
                const newAvg = newHoldings > 0 ? ((p.holdings * p.avgPrice) + (qty * price)) / newHoldings : 0;
                p.cash -= total;
                p.holdings = newHoldings;
                p.avgPrice = newAvg;
                p.transactions.unshift({ type: 'BUY', qty, price, total: -total, date: new Date().toISOString() });
                writePortfolio(p);
                showOrderMsg(`Bought ${qty.toFixed(2)} oz at ${price.toFixed(2)}`, 'success');
            } else {
                if (p.holdings < qty) { showOrderMsg('Not enough holdings.', 'error'); return; }
                p.holdings -= qty;
                p.cash += total;
                if (p.holdings <= 0) p.avgPrice = 0;
                p.transactions.unshift({ type: 'SELL', qty, price, total: total, date: new Date().toISOString() });
                writePortfolio(p);
                showOrderMsg(`Sold ${qty.toFixed(2)} oz at ${price.toFixed(2)}`, 'success');
            }
        };
        if (buyOrderBtn) buyOrderBtn.addEventListener('click', () => updatePortfolioTrade('BUY'));
        if (sellOrderBtn) sellOrderBtn.addEventListener('click', () => updatePortfolioTrade('SELL'));
    }

    const homeIdeasPreviewEl = document.getElementById('home-ideas-preview');
    if (homeIdeasPreviewEl) {
        const email = getSessionEmail();
        const presets = readJson('goldtrade_presets_v1', {});
        const wlAll = readJson(WISHLIST_KEY, {});
        const ideas = readJson(IDEAS_KEY, []);
        const wishlistCountEl = document.getElementById('home-wishlist-count');
        const presetsCountEl = document.getElementById('home-presets-count');
        const authStatusEl = document.getElementById('home-auth-status');
        if (wishlistCountEl) wishlistCountEl.textContent = String(email && Array.isArray(wlAll[email]) ? wlAll[email].length : 0);
        if (presetsCountEl) presetsCountEl.textContent = String(Object.keys(presets || {}).length);
        if (authStatusEl) authStatusEl.textContent = email ? 'Yes' : 'No';

        const profiles = readProfiles();
        const getName = (e) => profiles[e] && profiles[e].displayName ? profiles[e].displayName : e;
        homeIdeasPreviewEl.innerHTML = '';
        const list = Array.isArray(ideas) ? ideas.slice(0, 4) : [];
        if (list.length === 0) {
            homeIdeasPreviewEl.innerHTML = '<div class="result-item"><span class="label">Ideas</span><span class="value">No posts yet</span></div>';
        } else {
            list.forEach(idea => {
                const card = document.createElement('div');
                card.className = 'idea-card';
                const img = idea.image ? `<img class="idea-thumb" src="${idea.image}" alt="Idea image">` : '';
                card.innerHTML = `
                    <h3>${idea.title}</h3>
                    <div class="idea-meta">By ${getName(idea.authorEmail)} · ${String(idea.createdAt || '').slice(0, 10)}</div>
                    ${img}
                    <div>${String(idea.body || '').slice(0, 120)}${String(idea.body || '').length > 120 ? '...' : ''}</div>
                    <div class="idea-actions">
                        <a class="link-btn" href="ideas.html">Open</a>
                    </div>
                `;
                homeIdeasPreviewEl.appendChild(card);
            });
        }
    }

    const LAST_BACKTEST_KEY = 'goldtrade_last_backtest_v1';
    const MARKET_NEWS_CACHE_KEY = 'goldtrade_market_news_cache_v1';

    const formatNewsDate = (pubDate) => {
        try {
            const d = pubDate ? new Date(pubDate) : null;
            if (!d || isNaN(d.getTime())) return '';
            return d.toISOString().slice(0, 10);
        } catch { return ''; }
    };

    const getHost = (url) => {
        try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
    };

    const fetchTextWithFallback = async (url) => {
        const allOrigins = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        try {
            const res = await fetch(allOrigins, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.text();
        } catch {
            const proxyUrl = `https://r.jina.ai/${url.replace(/^https?:\/\//, 'https://')}`;
            const res = await fetch(proxyUrl, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.text();
        }
    };

    const parseRss = (xmlText) => {
        const start = xmlText.indexOf('<rss');
        const trimmed = start >= 0 ? xmlText.slice(start) : xmlText;
        const doc = new DOMParser().parseFromString(trimmed, 'text/xml');
        const items = Array.from(doc.getElementsByTagName('item'));
        return items.slice(0, 30).map(item => {
            const title = item.getElementsByTagName('title')[0]?.textContent?.trim() || '';
            const link = item.getElementsByTagName('link')[0]?.textContent?.trim() || '';
            const pubDate = item.getElementsByTagName('pubDate')[0]?.textContent?.trim() || '';
            const descriptionHtml = item.getElementsByTagName('description')[0]?.textContent?.trim() || '';
            let description = '';
            try {
                const d = new DOMParser().parseFromString(descriptionHtml, 'text/html');
                description = String(d.body?.textContent || '').replace(/\s+/g, ' ').trim();
            } catch {
                description = descriptionHtml.replace(/\s+/g, ' ').trim();
            }
            const sourceTag = item.getElementsByTagName('source')[0]?.textContent?.trim() || '';
            return { title, link, pubDate, description, source: sourceTag || getHost(link) };
        }).filter(x => x.title && x.link);
    };

    const renderNews = (container, items, limit, openInApp) => {
        if (!container) return;
        container.innerHTML = '';
        const list = Array.isArray(items) ? items.slice(0, limit) : [];
        if (list.length === 0) {
            container.innerHTML = '<div class="helper-text">No headlines available.</div>';
            return;
        }
        list.forEach(n => {
            const el = (typeof openInApp === 'function') ? document.createElement('button') : document.createElement('a');
            el.className = 'news-item';
            const date = formatNewsDate(n.pubDate);
            el.innerHTML = `
                <span class="date">${date}${n.source ? ` · ${n.source}` : ''}</span>
                <div class="title">${n.title}</div>
            `;
            if (typeof openInApp === 'function') {
                el.type = 'button';
                el.addEventListener('click', () => openInApp(n));
            } else {
                el.href = n.link;
                el.target = '_blank';
                el.rel = 'noopener noreferrer';
            }
            container.appendChild(el);
        });
    };

    const initLiveNews = async ({ statusEl, listEl, limit }) => {
        if (!listEl) return;
        const modal = document.getElementById('market-news-modal');
        const closeModalBtn = document.getElementById('close-market-news-modal');
        const modalBody = document.getElementById('market-news-modal-body');

        const openInApp = (modal && modalBody) ? (n) => {
            const date = formatNewsDate(n.pubDate);
            const desc = String(n.description || '').trim();
            const excerpt = desc ? desc.slice(0, 1000) : 'No preview text available for this headline.';
            modalBody.innerHTML = `
                <h2>${n.title}</h2>
                <span class="news-date">${date}${n.source ? ` · ${n.source}` : ''}</span>
                <p>${excerpt}</p>
                <div class="idea-actions" style="margin-top: 1rem;">
                    <a class="link-btn" href="${n.link}" target="_blank" rel="noopener noreferrer">Open Source</a>
                </div>
            `;
            modal.classList.remove('hidden');
        } : null;

        if (modal && closeModalBtn) {
            closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));
            window.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
        }

        const cached = readJson(MARKET_NEWS_CACHE_KEY, null);
        if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
            renderNews(listEl, cached.items, limit, openInApp);
            if (statusEl) statusEl.textContent = `Last updated: ${String(cached.fetchedAt || '').slice(0, 16).replace('T', ' ')}`;
        }
        const rssUrl = 'https://news.google.com/rss/search?q=gold%20price%20OR%20gold%20futures%20OR%20GC%3DF%20OR%20xauusd%20when%3A7d&hl=en-US&gl=US&ceid=US:en';
        const refresh = async () => {
            try {
                if (statusEl) statusEl.textContent = 'Updating headlines...';
                const xml = await fetchTextWithFallback(rssUrl);
                const items = parseRss(xml);
                writeJson(MARKET_NEWS_CACHE_KEY, { fetchedAt: new Date().toISOString(), items });
                renderNews(listEl, items, limit, openInApp);
                if (statusEl) statusEl.textContent = `Live · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
            } catch {
                if (statusEl) statusEl.textContent = 'Failed to fetch live headlines. Showing cached headlines if available.';
            }
        };
        await refresh();
        setInterval(refresh, 15 * 60 * 1000);
    };

    const homePortfolioPreviewEl = document.getElementById('home-portfolio-preview');
    if (homePortfolioPreviewEl) {
        const renderHomePortfolio = async () => {
            const p = ensurePortfolio();
            let lastPrice = null;
            try { lastPrice = await fetchLatestYahooPrice('GC=F'); } catch {}
            if (!isFinite(lastPrice)) lastPrice = p.avgPrice || 0;
            const total = p.cash + p.holdings * (lastPrice || 0);
            homePortfolioPreviewEl.innerHTML = `
                <div class="param-grid">
                    <div class="result-item"><span class="label">Total</span><span class="value">$${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
                    <div class="result-item"><span class="label">Cash</span><span class="value">$${p.cash.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
                    <div class="result-item"><span class="label">Holdings</span><span class="value">${p.holdings.toFixed(2)} oz</span></div>
                    <div class="result-item"><span class="label">Last Price</span><span class="value">$${(lastPrice || 0).toFixed(2)}</span></div>
                </div>
                <div class="idea-actions"><a class="link-btn" href="portfolio.html">Open Portfolio</a></div>
            `;
        };
        renderHomePortfolio();
        setInterval(renderHomePortfolio, 30000);
    }

    const homeBacktestPreviewEl = document.getElementById('home-backtest-preview');
    if (homeBacktestPreviewEl) {
        const last = readJson(LAST_BACKTEST_KEY, null);
        if (!last) {
            homeBacktestPreviewEl.innerHTML = `<div class="helper-text">Run a backtest to see a summary here.</div><div class="idea-actions"><a class="link-btn" href="backtest.html">Open Strategy Tester</a></div>`;
        } else {
            homeBacktestPreviewEl.innerHTML = `
                <div class="param-grid">
                    <div class="result-item"><span class="label">Period</span><span class="value">${last.start || '-'} → ${last.end || '-'}</span></div>
                    <div class="result-item"><span class="label">Total Return</span><span class="value">${last.totalReturn || '-'}</span></div>
                    <div class="result-item"><span class="label">Sharpe</span><span class="value">${last.sharpe || '-'}</span></div>
                    <div class="result-item"><span class="label">Max Drawdown</span><span class="value">${last.maxDrawdown || '-'}</span></div>
                    <div class="result-item"><span class="label">Trades</span><span class="value">${last.trades || '-'}</span></div>
                </div>
                <div class="idea-actions"><a class="link-btn" href="backtest.html">Open Strategy Tester</a></div>
            `;
        }
    }

    const homeProfilePreviewEl = document.getElementById('home-profile-preview');
    if (homeProfilePreviewEl) {
        const email = getSessionEmail();
        if (!email) {
            homeProfilePreviewEl.textContent = 'Not logged in. Login/Register to post ideas, follow investors, and save your profile.';
        } else {
            const profiles = readProfiles();
            const displayName = profiles[email]?.displayName || email;
            homeProfilePreviewEl.textContent = `Logged in as ${displayName}.`;
        }
    }

    const homeMarketStatusEl = document.getElementById('home-market-status');
    const homeMarketNewsEl = document.getElementById('home-market-news');
    if (homeMarketNewsEl) {
        initLiveNews({ statusEl: homeMarketStatusEl, listEl: homeMarketNewsEl, limit: 5 });
    }

    const marketStatusEl = document.getElementById('market-news-status');
    const marketLiveNewsEl = document.getElementById('market-live-news');
    if (marketLiveNewsEl) {
        initLiveNews({ statusEl: marketStatusEl, listEl: marketLiveNewsEl, limit: 12 });
    }

    const portfolioTotalEl = document.getElementById('portfolio-total');
    if (portfolioTotalEl) {
        const cashEl = document.getElementById('portfolio-cash');
        const holdingsEl = document.getElementById('portfolio-holdings');
        const avgEl = document.getElementById('portfolio-avg');
        const txEl = document.getElementById('portfolio-transactions');
        const todayEl = document.getElementById('portfolio-today');
        const msgEl = document.getElementById('portfolio-message');
        const depositBtn = document.getElementById('deposit-btn');
        const withdrawBtn = document.getElementById('withdraw-btn');
        const cashAmountEl = document.getElementById('cash-amount');
        const perfEl = document.getElementById('portfolio-performance-chart');
        const perfMsgEl = document.getElementById('portfolio-performance-msg');
        const exportPortfolioBtn = document.getElementById('portfolio-export-json-btn');
        const importPortfolioBtn = document.getElementById('portfolio-import-json-btn');
        const resetPortfolioBtn = document.getElementById('portfolio-reset-btn');
        const importPortfolioFileEl = document.getElementById('portfolio-import-file');
        const resetModalEl = document.getElementById('portfolio-reset-modal');
        const closeResetModalEl = document.getElementById('close-portfolio-reset-modal');
        const confirmResetEl = document.getElementById('confirm-portfolio-reset-btn');
        const cancelResetEl = document.getElementById('cancel-portfolio-reset-btn');

        const ensurePerfChart = () => {
            if (!perfEl) return null;
            if (portfolioPerfChartRef) return portfolioPerfChartRef;
            if (typeof LightweightCharts === 'undefined') {
                if (perfMsgEl) perfMsgEl.textContent = 'Performance chart requires the chart library.';
                return null;
            }
            const t = themeColors();
            portfolioPerfChartRef = LightweightCharts.createChart(perfEl, {
                width: perfEl.clientWidth || 900,
                height: perfEl.clientHeight || 360,
                layout: { background: { color: t.background }, textColor: t.text },
                grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
                rightPriceScale: { borderColor: t.border },
                timeScale: { borderColor: t.border },
                crosshair: { mode: LightweightCharts.CrosshairMode.Normal }
            });
            if (typeof portfolioPerfChartRef.addLineSeries === 'function') {
                portfolioPerfSeriesRef = portfolioPerfChartRef.addLineSeries({ color: '#0f172a', lineWidth: 2 });
            } else if (typeof portfolioPerfChartRef.addSeries === 'function') {
                portfolioPerfSeriesRef = portfolioPerfChartRef.addSeries(LightweightCharts.SeriesType.Line, { color: '#0f172a', lineWidth: 2 });
            }
            const ro = new ResizeObserver(entries => {
                if (!entries.length) return;
                const r = entries[0].contentRect;
                if (!r) return;
                portfolioPerfChartRef.applyOptions({ width: Math.floor(r.width), height: Math.floor(r.height) });
                portfolioPerfChartRef.timeScale().fitContent();
            });
            ro.observe(perfEl);
            return portfolioPerfChartRef;
        };

        const parseTxDate = (t) => {
            const d = new Date(String(t || ''));
            return isNaN(d.getTime()) ? null : d;
        };

        const pickRangeForDays = (days) => {
            if (days <= 35) return '3mo';
            if (days <= 200) return '1y';
            if (days <= 730) return '2y';
            if (days <= 1825) return '5y';
            if (days <= 3650) return '10y';
            return '20y';
        };

        const txApply = (state, t) => {
            const type = String(t.type || '').toUpperCase();
            const qty = Number(t.qty || 0);
            const total = Number(t.total || 0);
            if (type === 'BUY') {
                state.holdings += qty;
                state.cash += total;
            } else if (type === 'SELL') {
                state.holdings -= qty;
                state.cash += total;
            } else if (type === 'DEPOSIT' || type === 'WITHDRAW') {
                state.cash += total;
            }
        };

        const buildEquitySeries = async () => {
            const p = ensurePortfolio();
            const txAll = Array.isArray(p.transactions) ? p.transactions.slice() : [];
            txAll.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

            let start = null;
            for (const t of txAll) {
                const d = parseTxDate(t.date);
                if (d) { start = d; break; }
            }
            const end = new Date();
            const startFallback = new Date(end.getTime() - 180 * 86400000);
            const startDate = start || startFallback;
            const days = Math.max(1, Math.floor((end.getTime() - startDate.getTime()) / 86400000));
            const range = pickRangeForDays(days);

            let candles = null;
            try { candles = await fetchYahooChart('GC=F', range, '1d'); } catch { candles = null; }
            if (!candles || candles.length === 0) return { series: [], note: 'Failed to load price history.' };

            const state = { cash: 100000, holdings: 0 };
            let txIdx = 0;
            const series = [];
            for (const c of candles) {
                const day = String(c.time || '');
                while (txIdx < txAll.length) {
                    const td = parseTxDate(txAll[txIdx].date);
                    if (!td) { txIdx++; continue; }
                    const y = td.getUTCFullYear();
                    const m = String(td.getUTCMonth() + 1).padStart(2, '0');
                    const da = String(td.getUTCDate()).padStart(2, '0');
                    const tDay = `${y}-${m}-${da}`;
                    if (tDay <= day) {
                        txApply(state, txAll[txIdx]);
                        txIdx++;
                    } else break;
                }
                const price = Number(c.close || 0);
                const equity = state.cash + state.holdings * price;
                if (isFinite(equity)) series.push({ time: day, value: parseFloat(equity.toFixed(2)) });
            }

            const note = txAll.length === 0 ? 'No transactions yet. Showing equity based on cash only.' : '';
            return { series, note };
        };

        const refreshPerformance = async () => {
            if (!perfEl) return;
            const c = ensurePerfChart();
            if (!c || !portfolioPerfSeriesRef) return;
            if (perfMsgEl) perfMsgEl.textContent = 'Calculating performance…';
            const { series, note } = await buildEquitySeries();
            if (!series || series.length === 0) {
                if (perfMsgEl) perfMsgEl.textContent = 'No data available yet.';
                portfolioPerfSeriesRef.setData([]);
                return;
            }
            portfolioPerfSeriesRef.setData(series);
            c.timeScale().fitContent();
            if (perfMsgEl) perfMsgEl.textContent = note || 'Equity curve based on your transactions and GC=F daily prices.';
        };

        const render = async () => {
            const p = ensurePortfolio();
            let lastPrice = null;
            try { lastPrice = await fetchLatestYahooPrice('GC=F'); } catch {}
            if (!isFinite(lastPrice)) lastPrice = p.avgPrice || 0;
            const total = p.cash + p.holdings * (lastPrice || 0);
            portfolioTotalEl.textContent = `$${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
            if (cashEl) cashEl.textContent = `$${p.cash.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
            if (holdingsEl) holdingsEl.textContent = `${p.holdings.toFixed(2)} oz`;
            if (avgEl) avgEl.textContent = `Avg. Purchase Price: $${p.avgPrice.toFixed(2)}`;
            if (todayEl) todayEl.textContent = `Last Price: $${(lastPrice || 0).toFixed(2)}`;
            if (txEl) {
                txEl.innerHTML = '';
                const list = Array.isArray(p.transactions) ? p.transactions.slice(0, 30) : [];
                if (list.length === 0) {
                    txEl.innerHTML = '<div class="helper-text">No transactions yet.</div>';
                } else {
                    list.forEach(t => {
                        const div = document.createElement('div');
                        div.className = 'transaction-item';
                        div.innerHTML = `
                            <span class="type ${t.type === 'BUY' ? 'buy' : 'sell'}">${t.type}</span>
                            <span class="date">${String(t.date || '').slice(0, 10)}</span>
                            <span class="amount">${Number(t.qty || 0).toFixed(2)} oz</span>
                            <span class="price">$${Number(t.price || 0).toFixed(2)}</span>
                            <span class="total">${t.total >= 0 ? '+' : '-'}$${Math.abs(Number(t.total || 0)).toFixed(2)}</span>
                        `;
                        txEl.appendChild(div);
                    });
                }
            }
        };

        const showMsg = (text, type) => {
            if (!msgEl) return;
            msgEl.textContent = text;
            msgEl.className = `auth-message ${type || ''}`;
        };

        if (depositBtn) depositBtn.addEventListener('click', () => {
            const amt = parseFloat(cashAmountEl ? cashAmountEl.value : '');
            if (!isFinite(amt) || amt <= 0) { showMsg('Enter a valid amount.', 'error'); return; }
            const p = ensurePortfolio();
            p.cash += amt;
            p.transactions.unshift({ type: 'DEPOSIT', qty: 0, price: 0, total: amt, date: new Date().toISOString() });
            writePortfolio(p);
            showMsg('Deposit added.', 'success');
            render();
            refreshPerformance();
        });
        if (withdrawBtn) withdrawBtn.addEventListener('click', () => {
            const amt = parseFloat(cashAmountEl ? cashAmountEl.value : '');
            if (!isFinite(amt) || amt <= 0) { showMsg('Enter a valid amount.', 'error'); return; }
            const p = ensurePortfolio();
            if (p.cash < amt) { showMsg('Not enough cash.', 'error'); return; }
            p.cash -= amt;
            p.transactions.unshift({ type: 'WITHDRAW', qty: 0, price: 0, total: -amt, date: new Date().toISOString() });
            writePortfolio(p);
            showMsg('Withdrawal recorded.', 'success');
            render();
            refreshPerformance();
        });

        const openResetModal = () => {
            if (!resetModalEl) return;
            resetModalEl.classList.remove('hidden');
        };
        const closeResetModal = () => {
            if (!resetModalEl) return;
            resetModalEl.classList.add('hidden');
        };

        if (resetPortfolioBtn) resetPortfolioBtn.addEventListener('click', () => openResetModal());
        if (closeResetModalEl) closeResetModalEl.addEventListener('click', () => closeResetModal());
        if (cancelResetEl) cancelResetEl.addEventListener('click', () => closeResetModal());
        if (resetModalEl) resetModalEl.addEventListener('click', (e) => { if (e.target === resetModalEl) closeResetModal(); });
        if (confirmResetEl) confirmResetEl.addEventListener('click', () => {
            const fresh = { cash: 100000, holdings: 0, avgPrice: 0, transactions: [] };
            writePortfolio(fresh);
            showMsg('Portfolio reset.', 'success');
            closeResetModal();
            render();
            refreshPerformance();
        });

        if (exportPortfolioBtn) exportPortfolioBtn.addEventListener('click', () => {
            const p = ensurePortfolio();
            const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gogold_portfolio_${ymd}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1500);
        });

        if (importPortfolioBtn && importPortfolioFileEl) {
            importPortfolioBtn.addEventListener('click', () => {
                importPortfolioFileEl.value = '';
                importPortfolioFileEl.click();
            });
            importPortfolioFileEl.addEventListener('change', async () => {
                const file = importPortfolioFileEl.files && importPortfolioFileEl.files[0] ? importPortfolioFileEl.files[0] : null;
                if (!file) return;
                const text = await file.text();
                let json = null;
                try { json = JSON.parse(text); } catch { json = null; }
                if (!json || typeof json !== 'object') { showMsg('Invalid portfolio JSON file.', 'error'); return; }

                const cash = Number(json.cash);
                const holdings = Number(json.holdings);
                const avgPrice = Number(json.avgPrice);
                const tx = Array.isArray(json.transactions) ? json.transactions : [];
                if (!isFinite(cash) || !isFinite(holdings) || !isFinite(avgPrice)) { showMsg('Portfolio JSON missing required fields (cash, holdings, avgPrice).', 'error'); return; }

                const normalized = {
                    cash: cash,
                    holdings: holdings,
                    avgPrice: avgPrice,
                    transactions: tx.filter(t => t && typeof t === 'object').slice(0, 5000)
                };
                writePortfolio(normalized);
                showMsg('Portfolio imported.', 'success');
                render();
                refreshPerformance();
            });
        }

        render();
        refreshPerformance();
    }

    if (ideasGridEl) {
        const profiles = readProfiles();
        const getName = (email) => (profiles[email] && profiles[email].displayName) ? profiles[email].displayName : email;
        const readIdeas = () => readJson(IDEAS_KEY, []);
        const writeIdeas = (ideas) => writeJson(IDEAS_KEY, Array.isArray(ideas) ? ideas : []);

        const ideaForm = document.getElementById('idea-form');
        const ideaMsg = document.getElementById('idea-message');
        const ideaModal = document.getElementById('idea-modal');
        const ideaModalBody = document.getElementById('idea-modal-body');
        const closeIdeaModal = document.getElementById('close-idea-modal');

        const renderIdeas = () => {
            const ideas = readIdeas();
            ideasGridEl.innerHTML = '';
            if (ideas.length === 0) {
                ideasGridEl.innerHTML = '<div class="result-item"><span class="label">Ideas</span><span class="value">No posts yet</span></div>';
                return;
            }
            ideas.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
            ideas.forEach(idea => {
                const card = document.createElement('div');
                card.className = 'idea-card';
                const likeCount = Array.isArray(idea.likes) ? idea.likes.length : 0;
                const commentCount = Array.isArray(idea.comments) ? idea.comments.length : 0;
                const img = idea.image ? `<img class="idea-thumb" src="${idea.image}" alt="Idea image">` : '';
                card.innerHTML = `
                    <h3>${idea.title}</h3>
                    <div class="idea-meta">By ${getName(idea.authorEmail)} · ${String(idea.createdAt || '').slice(0, 10)} · ${likeCount} likes · ${commentCount} comments</div>
                    ${img}
                    <div>${String(idea.body || '').slice(0, 140)}${String(idea.body || '').length > 140 ? '...' : ''}</div>
                    <div class="idea-actions">
                        <button class="mini-btn primary" type="button" data-action="read">Read</button>
                        <button class="mini-btn" type="button" data-action="like">Like</button>
                    </div>
                `;
                card.querySelector('[data-action="read"]')?.addEventListener('click', () => {
                    if (!ideaModal || !ideaModalBody) return;
                    const comments = (idea.comments || []).map(c => {
                        return `<div class="result-item"><span class="label">${getName(c.authorEmail)} · ${String(c.createdAt || '').slice(0, 10)}</span><span class="value">${c.text}</span></div>`;
                    }).join('');
                    const modalImg = idea.image ? `<img class="idea-modal-img" src="${idea.image}" alt="Idea image">` : '';
                    ideaModalBody.innerHTML = `
                        <h2>${idea.title}</h2>
                        <span class="news-date">By ${getName(idea.authorEmail)} · ${String(idea.createdAt || '').slice(0, 10)}</span>
                        ${modalImg}
                        <p>${idea.body}</p>
                        <div class="dynamic-strategy-section">
                            <h3>Comments</h3>
                            <div>${comments || '<div class="helper-text">No comments yet.</div>'}</div>
                            <div class="param-grid">
                                <div class="form-group" style="grid-column: 1 / -1;">
                                    <label for="idea-comment">Add Comment</label>
                                    <textarea id="idea-comment" rows="3"></textarea>
                                </div>
                                <div class="form-group">
                                    <label>&nbsp;</label>
                                    <button class="btn buy" id="post-comment-btn" type="button">Post</button>
                                </div>
                            </div>
                        </div>
                    `;
                    document.getElementById('post-comment-btn')?.addEventListener('click', () => {
                        const email = requireAuth();
                        if (!email) return;
                        const text = String(document.getElementById('idea-comment')?.value || '').trim();
                        if (!text) return;
                        const ideas2 = readIdeas();
                        const idx = ideas2.findIndex(x => x.id === idea.id);
                        if (idx === -1) return;
                        ideas2[idx].comments = Array.isArray(ideas2[idx].comments) ? ideas2[idx].comments : [];
                        ideas2[idx].comments.unshift({ id: (crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + String(Math.random()).slice(2)), authorEmail: email, text, createdAt: new Date().toISOString() });
                        writeIdeas(ideas2);
                        renderIdeas();
                        ideaModal.classList.add('hidden');
                    });
                    ideaModal.classList.remove('hidden');
                });
                card.querySelector('[data-action="like"]')?.addEventListener('click', () => {
                    const email = requireAuth();
                    if (!email) return;
                    const ideas2 = readIdeas();
                    const idx = ideas2.findIndex(x => x.id === idea.id);
                    if (idx === -1) return;
                    ideas2[idx].likes = Array.isArray(ideas2[idx].likes) ? ideas2[idx].likes : [];
                    if (!ideas2[idx].likes.includes(email)) ideas2[idx].likes.push(email);
                    writeIdeas(ideas2);
                    renderIdeas();
                });
                ideasGridEl.appendChild(card);
            });
        };

        const investorSearchEl = document.getElementById('investor-search');
        const investorResultsEl = document.getElementById('investor-results');
        const followingListEl = document.getElementById('following-list');

        const readFollows = () => readJson(FOLLOWS_KEY, {});
        const writeFollows = (f) => writeJson(FOLLOWS_KEY, f || {});
        const getDisplay = (email) => (profiles[email] && profiles[email].displayName) ? profiles[email].displayName : email;
        const getPic = (email) => (profiles[email] && profiles[email].profilePic) ? profiles[email].profilePic : '';

        const renderInvestorCard = (viewerEmail, targetEmail) => {
            const card = document.createElement('div');
            card.className = 'idea-card investor-card';
            const pic = getPic(targetEmail);
            const follows = readFollows();
            const list = viewerEmail && Array.isArray(follows[viewerEmail]) ? follows[viewerEmail] : [];
            const isFollowing = viewerEmail ? list.includes(targetEmail) : false;
            const btnLabel = isFollowing ? 'Unfollow' : 'Follow';
            const btnClass = isFollowing ? 'mini-btn danger' : 'mini-btn primary';
            const img = pic ? `<img class="investor-avatar" src="${pic}" alt="Profile">` : `<div class="investor-avatar fallback">${String(getDisplay(targetEmail)).trim().slice(0, 2).toUpperCase()}</div>`;
            card.innerHTML = `
                <div class="investor-head">
                    ${img}
                    <div>
                        <div class="investor-name">${getDisplay(targetEmail)}</div>
                        <div class="idea-meta">${targetEmail}</div>
                    </div>
                </div>
                <div class="idea-actions">
                    <button class="${btnClass}" type="button" data-action="toggle-follow">${btnLabel}</button>
                </div>
            `;
            card.querySelector('[data-action="toggle-follow"]')?.addEventListener('click', () => {
                const me = requireAuth();
                if (!me) return;
                if (me === targetEmail) return;
                const f = readFollows();
                f[me] = Array.isArray(f[me]) ? f[me] : [];
                if (f[me].includes(targetEmail)) f[me] = f[me].filter(x => x !== targetEmail);
                else f[me].unshift(targetEmail);
                writeFollows(f);
                renderInvestorPanels();
            });
            return card;
        };

        const getAllInvestorEmails = () => {
            const users = readUsers();
            const prof = readProfiles();
            const s = new Set([...Object.keys(users || {}), ...Object.keys(prof || {})]);
            return Array.from(s).filter(Boolean).sort();
        };

        const renderInvestorPanels = () => {
            if (!investorResultsEl && !followingListEl) return;
            const me = getSessionEmail();
            if (followingListEl) {
                followingListEl.innerHTML = '';
                if (!me) {
                    followingListEl.innerHTML = '<div class="helper-text">Login to follow investors.</div>';
                } else {
                    const f = readFollows();
                    const list = Array.isArray(f[me]) ? f[me] : [];
                    if (list.length === 0) {
                        followingListEl.innerHTML = '<div class="helper-text">Not following anyone yet.</div>';
                    } else {
                        list.forEach(e => followingListEl.appendChild(renderInvestorCard(me, e)));
                    }
                }
            }
            if (investorResultsEl && investorSearchEl) {
                const q = String(investorSearchEl.value || '').trim().toLowerCase();
                investorResultsEl.innerHTML = '';
                const all = getAllInvestorEmails().filter(e => !me || e !== me);
                const filtered = q ? all.filter(e => (getDisplay(e).toLowerCase().includes(q) || e.toLowerCase().includes(q))) : all.slice(0, 12);
                if (filtered.length === 0) {
                    investorResultsEl.innerHTML = '<div class="helper-text">No investors found.</div>';
                } else {
                    filtered.slice(0, 24).forEach(e => investorResultsEl.appendChild(renderInvestorCard(me, e)));
                }
            }
        };

        if (investorSearchEl) investorSearchEl.addEventListener('input', () => renderInvestorPanels());

        const readFileAsDataUrl = (file) => {
            return new Promise((resolve) => {
                if (!file) { resolve(''); return; }
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => resolve('');
                reader.readAsDataURL(file);
            });
        };

        if (ideaForm) {
            const email = getSessionEmail();
            if (!email) {
                const btn = ideaForm.querySelector('button[type="submit"]');
                if (btn) btn.disabled = true;
                if (ideaMsg) { ideaMsg.textContent = 'Login is required to post.'; ideaMsg.className = 'auth-message error'; }
            }
            ideaForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email2 = requireAuth();
                if (!email2) return;
                const title = String(document.getElementById('idea-title')?.value || '').trim();
                const body = String(document.getElementById('idea-body')?.value || '').trim();
                if (!title || !body) return;
                const file = document.getElementById('idea-image')?.files?.[0] || null;
                const imageDataUrl = await readFileAsDataUrl(file);
                const ideas = readIdeas();
                const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + String(Math.random()).slice(2);
                ideas.unshift({ id, authorEmail: email2, title, body, image: imageDataUrl, createdAt: new Date().toISOString(), likes: [], comments: [] });
                writeIdeas(ideas);
                e.target.reset();
                if (ideaMsg) { ideaMsg.textContent = 'Published.'; ideaMsg.className = 'auth-message success'; }
                renderIdeas();
            });
        }

        if (ideaModal && closeIdeaModal) {
            closeIdeaModal.addEventListener('click', () => ideaModal.classList.add('hidden'));
            window.addEventListener('click', (event) => { if (event.target === ideaModal) ideaModal.classList.add('hidden'); });
        }

        renderIdeas();
        renderInvestorPanels();
    }

    const getResultDefinition = (label) => {
        const s = String(label || '');
        if (s.includes('Sharpe Ratio')) return 'Return per unit of total volatility (higher is better, but check drawdown).';
        if (s.includes('Sortino Ratio')) return 'Return per unit of downside risk only (penalizes negative volatility).';
        if (s.includes('Calmar Ratio')) return 'Annualized return divided by max drawdown magnitude.';
        if (s.includes('Max. Drawdown')) return 'Largest peak-to-trough equity decline.';
        if (s.includes('Beta')) return 'Sensitivity of strategy returns to market returns.';
        if (s.includes('Alpha')) return 'Return above what beta vs market would predict.';
        if (s.includes('SQN')) return 'System Quality Number: average trade expectancy adjusted by variability and number of trades.';
        if (s.includes('Kelly')) return 'Theoretical optimal fraction to risk based on win rate and win/loss ratio.';
        if (s.includes('Profit Factor')) return 'Gross profit divided by gross loss.';
        if (s.includes('Win Rate')) return 'Percent of trades with positive net return.';
        if (s.includes('Total Fees Paid')) return 'Total commission paid across buy and sell operations.';
        if (s.includes('Net Profit')) return 'Final equity minus starting equity, after all costs (commission + slippage) are deducted.';
        return '';
    };

    const equityChartEl = document.getElementById('equity-chart');
    const drawdownChartEl = document.getElementById('drawdown-chart');
    const equityMsgEl = document.getElementById('equity-msg');
    let equityLine = null;
    let drawdownArea = null;

    const ensureMiniChart = (el, kind) => {
        if (!el) return null;
        if (typeof LightweightCharts === 'undefined') return null;
        const t = themeColors();
        const chart = LightweightCharts.createChart(el, {
            width: el.clientWidth || 900,
            height: el.clientHeight || 280,
            layout: { background: { color: t.background }, textColor: t.text },
            grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
            rightPriceScale: { borderColor: t.border },
            timeScale: { borderColor: t.border, timeVisible: true },
            crosshair: { mode: LightweightCharts.CrosshairMode.Normal }
        });
        const ro = new ResizeObserver(entries => {
            if (!entries.length) return;
            const r = entries[0].contentRect;
            if (!r) return;
            chart.applyOptions({ width: Math.floor(r.width), height: Math.floor(r.height) });
            chart.timeScale().fitContent();
        });
        ro.observe(el);
        if (kind === 'equity') {
            if (typeof chart.addLineSeries === 'function') equityLine = chart.addLineSeries({ color: '#0f172a', lineWidth: 2 });
            else if (typeof chart.addSeries === 'function') equityLine = chart.addSeries(LightweightCharts.SeriesType.Line, { color: '#0f172a', lineWidth: 2 });
        } else {
            if (typeof chart.addAreaSeries === 'function') {
                drawdownArea = chart.addAreaSeries({
                    lineColor: '#e11d48',
                    topColor: 'rgba(225, 29, 72, 0.18)',
                    bottomColor: 'rgba(225, 29, 72, 0.02)',
                    lineWidth: 2,
                });
            } else if (typeof chart.addSeries === 'function') {
                drawdownArea = chart.addSeries(LightweightCharts.SeriesType.Area, {
                    lineColor: '#e11d48',
                    topColor: 'rgba(225, 29, 72, 0.18)',
                    bottomColor: 'rgba(225, 29, 72, 0.02)',
                    lineWidth: 2,
                });
            }
        }
        return chart;
    };

    const renderEquityAndDrawdown = (out) => {
        if (!equityChartEl || !drawdownChartEl) return;
        if (typeof LightweightCharts === 'undefined') {
            if (equityMsgEl) equityMsgEl.textContent = 'Equity & drawdown charts require the chart library.';
            return;
        }
        if (!equityChart) equityChart = ensureMiniChart(equityChartEl, 'equity');
        if (!drawdownChart) drawdownChart = ensureMiniChart(drawdownChartEl, 'drawdown');
        const eq = Array.isArray(out && out.equitySeries) ? out.equitySeries : [];
        const dd = Array.isArray(out && out.drawdownSeries) ? out.drawdownSeries : [];
        if (!eq.length || !dd.length) {
            if (equityMsgEl) equityMsgEl.textContent = 'Run a backtest to view equity curve and drawdown.';
            if (equityLine) equityLine.setData([]);
            if (drawdownArea) drawdownArea.setData([]);
            return;
        }
        if (equityMsgEl) equityMsgEl.textContent = 'Equity curve and drawdown are computed from the simulated account equity through time.';
        if (equityLine) equityLine.setData(eq);
        if (drawdownArea) drawdownArea.setData(dd);
        if (equityChart) equityChart.timeScale().fitContent();
        if (drawdownChart) drawdownChart.timeScale().fitContent();
    };

    const robustnessContainerEl = document.getElementById('robustness-container');
    const renderRobustness = (out) => {
        if (!robustnessContainerEl) return;
        robustnessContainerEl.innerHTML = '';

        const trades = Array.isArray(out && out.trades) ? out.trades : [];
        const folds = Array.isArray(out && out.folds) ? out.folds : null;

        const resultItems = Array.isArray(out && out.results) ? out.results : [];
        const getMetric = (label) => {
            const it = resultItems.find(x => x && x.label === label);
            return it ? it.value : null;
        };

        const toNum = (v) => {
            const n = parseFloat(String(v || '').replace('%', '').replace('$', '').replace(/,/g, ''));
            return isFinite(n) ? n : null;
        };

        const formatPct = (x) => `${(x * 100).toFixed(2)}%`;
        const percentile = (arr, p) => {
            if (!arr.length) return null;
            const a = arr.slice().sort((x, y) => x - y);
            const idx = Math.min(a.length - 1, Math.max(0, Math.floor((a.length - 1) * p)));
            return a[idx];
        };

        const simulateEquity = (tradeReturns, initial) => {
            let equity = initial;
            let peak = initial;
            let mdd = 0;
            for (const r of tradeReturns) {
                equity = equity * (1 + r);
                if (equity > peak) peak = equity;
                const dd = (equity - peak) / peak;
                if (dd < mdd) mdd = dd;
            }
            return { equity, mdd };
        };

        const monteCarlo = (tradeReturns, runs) => {
            const finals = [];
            const mdds = [];
            if (!tradeReturns.length) return { finals, mdds };
            const n = tradeReturns.length;
            for (let r = 0; r < runs; r++) {
                const seq = new Array(n);
                for (let i = 0; i < n; i++) {
                    seq[i] = tradeReturns[Math.floor(Math.random() * n)];
                }
                const s = simulateEquity(seq, 10000);
                finals.push(s.equity);
                mdds.push(s.mdd);
            }
            return { finals, mdds };
        };

        const foldSummary = () => {
            if (!folds || folds.length === 0) return null;
            const foldReturns = [];
            const foldSharpes = [];
            folds.forEach(f => {
                const mr = (f && f.metrics) ? f.metrics.find(x => x && x.label === 'Total Return') : null;
                const ms = (f && f.metrics) ? f.metrics.find(x => x && x.label === 'Sharpe Ratio') : null;
                const r = mr ? toNum(mr.value) : null;
                const s = ms ? toNum(ms.value) : null;
                if (r !== null) foldReturns.push(r / 100);
                if (s !== null) foldSharpes.push(s);
            });
            if (foldReturns.length === 0) return null;
            const mean = foldReturns.reduce((a, b) => a + b, 0) / foldReturns.length;
            const variance = foldReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / foldReturns.length;
            const stdev = Math.sqrt(variance);
            const pos = foldReturns.filter(x => x > 0).length / foldReturns.length;
            const sharpeMean = foldSharpes.length ? (foldSharpes.reduce((a, b) => a + b, 0) / foldSharpes.length) : null;
            return { folds: foldReturns.length, mean, stdev, pos, sharpeMean };
        };

        const add = (label, value, klass, title) => {
            const div = document.createElement('div');
            div.className = `result-item ${klass || ''}`;
            div.innerHTML = `<span class="label" title="${title || ''}">${label}</span><span class="value">${value}</span>`;
            robustnessContainerEl.appendChild(div);
        };

        const tradeReturns = trades.map(t => Number(t.pnlPct)).filter(x => isFinite(x));
        if (tradeReturns.length === 0) {
            add('Robustness', 'Run a backtest to analyze stability.', '', '');
            return;
        }

        const mcRuns = 250;
        const mc = monteCarlo(tradeReturns, mcRuns);
        const baseTotalReturn = toNum(getMetric('Total Return'));
        const baseMdd = toNum(getMetric('Max. Drawdown'));
        const baseSharpe = toNum(getMetric('Sharpe Ratio'));
        const wins = tradeReturns.filter(x => x > 0).length;
        const winRate = wins / tradeReturns.length;

        const mcMedianFinal = percentile(mc.finals, 0.5);
        const mcP05Final = percentile(mc.finals, 0.05);
        const mcP95Final = percentile(mc.finals, 0.95);
        const mcP95Mdd = percentile(mc.mdds, 0.95);
        const mcLossProb = mc.finals.length ? (mc.finals.filter(x => x < 10000).length / mc.finals.length) : null;

        const fold = foldSummary();

        const normSharpe = baseSharpe !== null ? Math.max(0, Math.min(1, baseSharpe / 2)) : 0.25;
        const normMdd = baseMdd !== null ? Math.max(0, Math.min(1, 1 - (Math.abs(baseMdd) / 50))) : 0.5;
        const normWin = Math.max(0, Math.min(1, (winRate - 0.25) / 0.5));
        const normFold = fold ? Math.max(0, Math.min(1, 1 - (fold.stdev / 0.25))) : 0.5;
        const robustnessScore = Math.round(100 * (0.35 * normSharpe + 0.25 * normMdd + 0.2 * normWin + 0.2 * normFold));

        add('Robustness Score', `${robustnessScore}/100`, robustnessScore >= 70 ? 'positive highlight' : (robustnessScore >= 45 ? 'highlight' : 'negative'), 'Higher is better. Combines Sharpe, drawdown, win rate, and walk-forward stability.');
        if (baseTotalReturn !== null) add('Base Total Return', `${baseTotalReturn}%`, baseTotalReturn >= 0 ? 'positive' : 'negative', 'Result from the current backtest run.');
        if (baseSharpe !== null) add('Base Sharpe', String(baseSharpe.toFixed(2)), baseSharpe >= 1 ? 'positive' : '', 'Sharpe from the current backtest run.');
        if (baseMdd !== null) add('Base Max Drawdown', `${baseMdd}%`, 'negative', 'Max drawdown from the current backtest run.');
        add('Win Rate', formatPct(winRate), winRate >= 0.5 ? 'positive' : '', 'Percent of profitable trades (based on trade PnL).');

        if (mcMedianFinal !== null) add(`Monte Carlo Median (${mcRuns})`, `$${mcMedianFinal.toFixed(0)}`, '', 'Median final equity from resampling trades with replacement.');
        if (mcP05Final !== null) add('Monte Carlo 5th %ile', `$${mcP05Final.toFixed(0)}`, mcP05Final < 10000 ? 'negative' : '', 'Pessimistic outcome: 5th percentile final equity.');
        if (mcP95Final !== null) add('Monte Carlo 95th %ile', `$${mcP95Final.toFixed(0)}`, 'positive', 'Optimistic outcome: 95th percentile final equity.');
        if (mcLossProb !== null) add('Monte Carlo Loss Probability', formatPct(mcLossProb), mcLossProb > 0.4 ? 'negative' : '', 'Probability final equity ends below start (based on Monte Carlo).');
        if (mcP95Mdd !== null) add('Monte Carlo Drawdown (95th)', `${(mcP95Mdd * 100).toFixed(2)}%`, 'negative', '95th percentile max drawdown under Monte Carlo sequences.');

        if (fold) {
            add('Walk-Forward Folds Used', String(fold.folds), '', 'Number of folds evaluated.');
            add('Fold Return Avg', formatPct(fold.mean), fold.mean >= 0 ? 'positive' : 'negative', 'Average fold total return.');
            add('Fold Return Volatility', formatPct(fold.stdev), fold.stdev <= 0.08 ? 'positive' : '', 'Stability of fold returns (lower is better).');
            add('Positive Folds', formatPct(fold.pos), fold.pos >= 0.6 ? 'positive' : '', 'Percent of folds with positive return.');
            if (fold.sharpeMean !== null) add('Fold Sharpe Avg', fold.sharpeMean.toFixed(2), fold.sharpeMean >= 0.8 ? 'positive' : '', 'Average Sharpe across folds.');
        } else {
            add('Walk-Forward', 'Enable it to score stability.', '', 'Turn on Walk-Forward Test to compute fold stability metrics.');
        }
    };

    const downloadTextFile = (filename, text, mime) => {
        const blob = new Blob([String(text || '')], { type: mime || 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    };

    const toCsv = (rows) => {
        const esc = (v) => {
            const s = String(v ?? '');
            if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
            return s;
        };
        return rows.map(r => r.map(esc).join(',')).join('\n');
    };

    const inferTimeframeFromBars = (bars) => {
        if (!Array.isArray(bars) || bars.length < 2) return '';
        const t0 = bars[0] ? bars[0].time : null;
        const t1 = bars[1] ? bars[1].time : null;
        if (typeof t0 === 'string' && typeof t1 === 'string') return '1D';
        if (typeof t0 === 'number' && typeof t1 === 'number') {
            const dt = Math.abs(t1 - t0);
            const map = { 60: '1m', 300: '5m', 900: '15m', 3600: '1H', 14400: '4H', 86400: '1D' };
            if (map[dt]) return map[dt];
        }
        return 'Custom';
    };

    const readBacktestAssumptions = (out) => {
        const selected = Array.from(document.querySelectorAll('.strategy-checkbox:checked')).map(cb => cb.value);
        const get = (id, fallback) => {
            const el = document.getElementById(id);
            const v = el ? el.value : fallback;
            return v == null ? '' : String(v);
        };

        const findMetric = (label) => {
            const arr = out && Array.isArray(out.results) ? out.results : [];
            const it = arr.find(x => x && x.label === label);
            return it ? String(it.value ?? '') : '';
        };

        const tf = inferTimeframeFromBars(typeof historicalData !== 'undefined' ? historicalData : []);
        const start = findMetric('Start Date');
        const end = findMetric('End Date');

        return {
            symbol: 'GC=F',
            timeframe: tf,
            dateRange: (start && end) ? `${start} → ${end}` : '',
            initialEquity: 10000,
            positionSizePct: get('bt-position-pct', '100'),
            commissionPctPerSide: get('bt-commission-pct', '0'),
            slippagePctPerSide: get('bt-slippage-pct', '0'),
            stopLossPct: get('bt-stop-loss-pct', '0'),
            takeProfitPct: get('bt-take-profit-pct', '0'),
            walkForward: {
                enabled: !!document.getElementById('wf-enable')?.checked,
                folds: get('wf-folds', ''),
                startPct: get('wf-start-pct', ''),
                testPct: get('wf-test-pct', '')
            },
            selectedIndicators: selected
        };
    };

    const renderAssumptions = (assumptions) => {
        if (!assumptionsContainer) return;
        const add = (label, value) => {
            const div = document.createElement('div');
            div.className = 'result-item';
            div.innerHTML = `<span class="label">${label}</span><span class="value">${value}</span>`;
            assumptionsContainer.appendChild(div);
        };
        assumptionsContainer.innerHTML = '';
        if (!assumptions) {
            add('Assumptions', 'Run a backtest to show settings used.');
            return;
        }
        add('Symbol', assumptions.symbol || 'GC=F');
        add('Timeframe', assumptions.timeframe || '');
        if (assumptions.dateRange) add('Date Range', assumptions.dateRange);
        add('Initial Equity', `$${Number(assumptions.initialEquity || 0).toLocaleString()}`);
        add('Position Size', `${assumptions.positionSizePct}%`);
        add('Commission (Per Side)', `${assumptions.commissionPctPerSide}%`);
        add('Slippage (Per Side)', `${assumptions.slippagePctPerSide}%`);
        add('Stop Loss', `${assumptions.stopLossPct}%`);
        add('Take Profit', `${assumptions.takeProfitPct}%`);
        add('Walk-Forward', assumptions.walkForward && assumptions.walkForward.enabled ? 'Enabled' : 'Disabled');
        if (assumptions.walkForward && assumptions.walkForward.enabled) {
            if (assumptions.walkForward.folds) add('WF Folds', assumptions.walkForward.folds);
            if (assumptions.walkForward.startPct) add('WF Start %', `${assumptions.walkForward.startPct}%`);
            if (assumptions.walkForward.testPct) add('WF Test %', `${assumptions.walkForward.testPct}%`);
        }
        add('Selected Indicators', (assumptions.selectedIndicators || []).join(', ') || '—');
    };

    const storeLastBacktest = (results) => {
        if (!Array.isArray(results)) return;
        const pick = (label) => {
            const it = results.find(x => x && x.label === label);
            return it ? String(it.value ?? '') : '';
        };
        writeJson(LAST_BACKTEST_KEY, {
            savedAt: new Date().toISOString(),
            start: pick('Start Date'),
            end: pick('End Date'),
            totalReturn: pick('Total Return'),
            sharpe: pick('Sharpe Ratio'),
            maxDrawdown: pick('Max. Drawdown'),
            trades: pick('Trades') || pick('Total Trades')
        });
    };

    if (exportResultsJsonBtn) {
        exportResultsJsonBtn.addEventListener('click', () => {
            if (!lastBacktestSnapshot) return;
            const payload = {
                exportedAt: new Date().toISOString(),
                assumptions: lastBacktestSnapshot.assumptions,
                results: lastBacktestSnapshot.results,
                trades: lastBacktestSnapshot.trades
            };
            const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            downloadTextFile(`gogold_backtest_results_${ymd}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
        });
    }

    if (exportTradesCsvBtn) {
        exportTradesCsvBtn.addEventListener('click', () => {
            if (!lastBacktestSnapshot) return;
            const trades = Array.isArray(lastBacktestSnapshot.trades) ? lastBacktestSnapshot.trades : [];
            const rows = [
                ['#', 'Entry Date', 'Exit Date', 'Reason', 'PnL %', 'Duration', 'Entry Fill', 'Exit Fill', 'Fees', 'Indicators At Entry']
            ];
            trades.forEach((t, i) => {
                const indicators = Array.isArray(t.indicatorsAtEntry) ? JSON.stringify(t.indicatorsAtEntry) : '';
                rows.push([
                    String(i + 1),
                    String(t.entryDate ?? ''),
                    String(t.exitDate ?? ''),
                    String(t.reason ?? ''),
                    isFinite(t.pnlPct) ? (Number(t.pnlPct) * 100).toFixed(4) : '',
                    t.durationDays != null ? String(t.durationDays) : '',
                    isFinite(t.entryFill) ? Number(t.entryFill).toFixed(4) : '',
                    isFinite(t.exitFill) ? Number(t.exitFill).toFixed(4) : '',
                    isFinite(t.fees) ? Number(t.fees).toFixed(4) : '',
                    indicators
                ]);
            });
            const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            downloadTextFile(`gogold_trade_log_${ymd}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
        });
    }

    if (runBtn) {
        runBtn.addEventListener('click', () => {
            const count = document.querySelectorAll('.strategy-checkbox:checked').length;
            if (count === 0) { alert('Please select at least one indicator.'); return; }
            runBtn.textContent = 'Calculating...'; runBtn.disabled = true;
            setTimeout(() => {
                resultsContainer.innerHTML = ''; resultsArea.classList.remove('hidden');
                if (assumptionsContainer) assumptionsContainer.innerHTML = '';
                const out = runBacktest();
                if (out && out.results) {
                    out.results.forEach(item => {
                        const div = document.createElement('div');
                        div.className = `result-item ${item.class || ''}`;
                        const def = getResultDefinition(item.label);
                        div.innerHTML = `<span class="label" title="${def}">${item.label}</span><span class="value">${item.value}</span>`;
                        resultsContainer.appendChild(div);
                    });
                    renderTradeLog(out.trades);
                    storeLastBacktest(out.results);
                    renderRobustness(out);
                    renderEquityAndDrawdown(out);
                    const assumptions = readBacktestAssumptions(out);
                    renderAssumptions(assumptions);
                    lastBacktestSnapshot = { assumptions, results: out.results, trades: out.trades };
                    if (exportResultsJsonBtn) exportResultsJsonBtn.disabled = false;
                    if (exportTradesCsvBtn) exportTradesCsvBtn.disabled = false;
                }
                runBtn.textContent = 'Run Backtest'; runBtn.disabled = false; resultsArea.scrollIntoView({ behavior: 'smooth' });
            }, 800);
        });
    }
});
