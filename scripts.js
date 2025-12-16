// App state
const state = {
    sites: [],
    filteredSites: [],
    minYear: 1978,
    maxYear: Math.max(new Date().getFullYear(), 2025),
    selectedYear: new Date().getFullYear(),
    selectedType: 'all',
    loading: true,
    error: null,
    controlsCollapsed: true,
    searchTerms: [],
    activeSearchTerms: []
};

// DOM elements
const elements = {
    loading: document.getElementById('loading'),
    map: document.getElementById('map'),
    siteCount: document.getElementById('site-count'),
    yearSlider: document.getElementById('year-slider'),
    totalSites: document.getElementById('total-sites'),
    filterButtons: document.querySelectorAll('.filter-btn'),
    toggleControls: document.getElementById('toggle-controls'),
    controlsPanel: document.getElementById('controls'),
    expandedControls: document.getElementById('expanded-controls'),
    sliderBubble: document.getElementById('slider-bubble'),
    sliderStart: document.getElementById('slider-start'),
    sliderEnd: document.getElementById('slider-end'),
    searchBar: document.getElementById('search-form'),
    searchForm: document.getElementById('search-form'),
    searchInput: document.getElementById('search-input'),
    searchTags: document.getElementById('search-tags'),
    searchSubmit: document.getElementById('search-submit'),
    searchClear: document.getElementById('search-clear')
};

const mapState = {
    map: null,
    markers: [],
    clusterGroup: null,
    forceFitBounds: true,
    userHasAdjusted: false,
    isAutoFitting: false,
    activeSpiderCluster: null,
    lastSpiderCluster: null,
    spiderfiedMarkers: new Set(),
    pendingRespiderCluster: null,
    pendingRespiderMarker: null
};

const imageCache = new Map();

function requestFitBounds() {
    mapState.forceFitBounds = true;
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalizeSearchValue(value) {
    if (value == null) return '';
    let normalized = String(value).toLowerCase();
    try {
        normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch (error) {
        // Some environments may not support String.prototype.normalize; fallback to lowercase only
    }
    return normalized;
}

function normalizeImages(images) {
    if (!images) return [];
    if (Array.isArray(images)) {
        return images.map(String).map(str => str.trim()).filter(Boolean).slice(0, 5);
    }
    if (typeof images === 'string') {
        if (images.includes('|')) {
            return images.split('|').map(part => part.trim()).filter(Boolean).slice(0, 5);
        }
        if (images.startsWith('[')) {
            try {
                const parsed = JSON.parse(images);
                if (Array.isArray(parsed)) {
                    return parsed.map(String).map(str => str.trim()).filter(Boolean).slice(0, 5);
                }
            } catch (error) {
                console.warn('Unable to parse images JSON string', error);
            }
        }
        return [images.trim()].filter(Boolean).slice(0, 5);
    }
    return [];
}

function formatDescriptionText(value) {
    if (value == null) return '';
    const trimmed = String(value).trim();
    if (!trimmed) return '';
    const firstChar = trimmed.charAt(0);
    if (firstChar && firstChar === firstChar.toLowerCase() && firstChar !== firstChar.toUpperCase()) {
        return firstChar.toUpperCase() + trimmed.slice(1);
    }
    return trimmed;
}

const DEFAULT_POPUP_IMAGES = [
    'assets/placeholder_image01.jpg',
    'assets/placeholder_image02.jpg',
    'assets/placeholder_image03.jpg',
    'assets/placeholder_image04.jpg',
    'assets/placeholder_image05.jpg'
];
const FALLBACK_POPUP_IMAGE = 'assets/default-popup-fallback.svg';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const MAX_POPUP_IMAGES = 5;

const REGION_FALLBACK_CODES = 'AD,AE,AF,AG,AI,AL,AM,AO,AQ,AR,AS,AT,AU,AW,AX,AZ,BA,BB,BD,BE,BF,BG,BH,BI,BJ,BL,BM,BN,BO,BQ,BR,BS,BT,BV,BW,BY,BZ,CA,CC,CD,CF,CG,CH,CI,CK,CL,CM,CN,CO,CR,CU,CV,CW,CX,CY,CZ,DE,DJ,DK,DM,DO,DZ,EC,EE,EG,EH,ER,ES,ET,FI,FJ,FK,FM,FO,FR,GA,GB,GD,GE,GF,GG,GH,GI,GL,GM,GN,GP,GQ,GR,GS,GT,GU,GW,GY,HK,HM,HN,HR,HT,HU,ID,IE,IL,IM,IN,IO,IQ,IR,IS,IT,JE,JM,JO,JP,KE,KG,KH,KI,KM,KN,KP,KR,KW,KY,KZ,LA,LB,LC,LI,LK,LR,LS,LT,LU,LV,LY,MA,MC,MD,ME,MF,MG,MH,MK,ML,MM,MN,MO,MP,MQ,MR,MS,MT,MU,MV,MW,MX,MY,MZ,NA,NC,NE,NF,NG,NI,NL,NO,NP,NR,NU,NZ,OM,PA,PE,PF,PG,PH,PK,PL,PM,PN,PR,PS,PT,PW,PY,QA,RE,RO,RS,RU,RW,SA,SB,SC,SD,SE,SG,SH,SI,SJ,SK,SL,SM,SN,SO,SR,SS,ST,SV,SX,SY,SZ,TC,TD,TF,TG,TH,TJ,TK,TL,TM,TN,TO,TR,TT,TV,TW,TZ,UA,UG,UM,US,UY,UZ,VA,VC,VE,VG,VI,VN,VU,WF,WS,YE,YT,ZA,ZM,ZW'.split(',');

let FALLBACK_REGION_CODES = REGION_FALLBACK_CODES;

if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
    try {
        const supported = Intl.supportedValuesOf('region');
        if (Array.isArray(supported) && supported.length > 0) {
            FALLBACK_REGION_CODES = supported.filter(code => /^[A-Z]{2}$/.test(code));
        }
    } catch (error) {
        console.warn('Intl.supportedValuesOf is unavailable or unsupported, using fallback region codes.', error);
    }
}

const REGION_DISPLAY = typeof Intl?.DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

const COUNTRY_LOOKUP_STRIP_PATTERN = /\b(the|state|states|republic|kingdom|plurinational|democratic|people's|people|federal|federation|territory|commonwealth|nation|socialist|arab|bolivarian|co-operative|cooperative|islamic)\b/g;
const COUNTRY_LOOKUP_SPLIT_PATTERN = /[,/]|(?:\sand\s)|(?:\s&\s)/i;

function normalizeCountryKey(value) {
    if (!value) return '';
    return String(value)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '');
}

function stripCountryDescriptors(key) {
    if (!key) return '';
    return normalizeCountryKey(
        String(key)
            .replace(COUNTRY_LOOKUP_STRIP_PATTERN, ' ')
    );
}

function addCountryLookupEntry(map, key, code) {
    if (!key) return;
    const normalized = normalizeCountryKey(key);
    if (!normalized) return;
    if (!map.has(normalized)) {
        map.set(normalized, code);
    }
    const stripped = stripCountryDescriptors(key);
    if (stripped && !map.has(stripped)) {
        map.set(stripped, code);
    }
}

const COUNTRY_NAME_OVERRIDES = new Map([
    ['boliviaplurinationalstateof', 'BO'],
    ['bolivia', 'BO'],
    ['cotedivoire', 'CI'],
    ['ivorycoast', 'CI'],
    ['congodemocraticrepublicofthe', 'CD'],
    ['democraticrepublicofthecongo', 'CD'],
    ['congorepublicofthe', 'CG'],
    ['republicofthecongo', 'CG'],
    ['iran', 'IR'],
    ['iranislamicrepublicof', 'IR'],
    ['laopdr', 'LA'],
    ['laopeoplesdemocraticrepublic', 'LA'],
    ['laos', 'LA'],
    ['moldovarepublicof', 'MD'],
    ['republicofmoldova', 'MD'],
    ['micronesiafederatedstatesof', 'FM'],
    ['palestinianterritories', 'PS'],
    ['russianfederation', 'RU'],
    ['russia', 'RU'],
    ['southkorea', 'KR'],
    ['republicofkorea', 'KR'],
    ['northkorea', 'KP'],
    ['dprk', 'KP'],
    ['syrianarabrepublic', 'SY'],
    ['syria', 'SY'],
    ['tanzaniaunitedrepublicof', 'TZ'],
    ['timorleste', 'TL'],
    ['unitedstatesofamerica', 'US'],
    ['unitedstates', 'US'],
    ['unitedkingdomofgreatbritainandnorthernireland', 'GB'],
    ['unitedkingdom', 'GB'],
    ['venezuela', 'VE'],
    ['bolivarianrepublicofvenezuela', 'VE'],
    ['vietnamsocialistrepublicof', 'VN'],
    ['vietnamsocialistrepublic', 'VN'],
    ['vietnam', 'VN']
]);

const COUNTRY_NAME_TO_ISO = (() => {
    const map = new Map();
    FALLBACK_REGION_CODES.forEach(code => {
        const label = REGION_DISPLAY?.of(code) || code;
        addCountryLookupEntry(map, label, code);
    });
    COUNTRY_NAME_OVERRIDES.forEach((code, key) => {
        addCountryLookupEntry(map, key, code);
    });
    return map;
})();

const COUNTRY_LOOKUP_KEYS = Array.from(COUNTRY_NAME_TO_ISO.keys());

function resolveCountryCodeFromName(name) {
    if (!name) return null;
    const segments = String(name)
        .split(COUNTRY_LOOKUP_SPLIT_PATTERN)
        .map(segment => segment.trim())
        .filter(Boolean);

    const tryResolve = (key) => {
        if (!key) return null;
        const normalized = normalizeCountryKey(key);
        if (!normalized) return null;
        if (COUNTRY_NAME_OVERRIDES.has(normalized)) {
            return COUNTRY_NAME_OVERRIDES.get(normalized);
        }
        const direct = COUNTRY_NAME_TO_ISO.get(normalized);
        if (direct) {
            return direct;
        }
        const stripped = stripCountryDescriptors(key);
        if (COUNTRY_NAME_TO_ISO.has(stripped)) {
            return COUNTRY_NAME_TO_ISO.get(stripped);
        }
        const fallbackKey = COUNTRY_LOOKUP_KEYS.find(existing =>
            existing.includes(normalized) || normalized.includes(existing)
        );
        return fallbackKey ? COUNTRY_NAME_TO_ISO.get(fallbackKey) : null;
    };

    for (const segment of segments) {
        const match = tryResolve(segment);
        if (match) return match;
    }

    return tryResolve(name);
}

function countryCodeToFlagEmoji(code) {
    if (!code || typeof code !== 'string' || code.length !== 2) return '';
    const upper = code.toUpperCase();
    const base = 127397;
    return String.fromCodePoint(
        base + upper.charCodeAt(0),
        base + upper.charCodeAt(1)
    );
}

function buildSiteSearchText(site) {
    const fragments = [];
    if (site.name) fragments.push(site.name);
    if (site.country) fragments.push(site.country);
    if (Array.isArray(site.countries) && site.countries.length) fragments.push(site.countries.join(' '));
    if (site.description) fragments.push(site.description);
    if (Array.isArray(site.criteria) && site.criteria.length) fragments.push(site.criteria.join(' '));
    if (site.type) fragments.push(site.type);
    if (site.inscriptionYear) fragments.push(site.inscriptionYear);
    if (site.unescoId) fragments.push(site.unescoId);
    if (site.id) fragments.push(site.id);
    if (site.officialUrl) fragments.push(site.officialUrl);

    return fragments
        .filter(Boolean)
        .map(fragment => normalizeSearchValue(fragment))
        .join(' ');
}

const markerConfigs = {
    cultural: {
        color: '#DC2626',
        label: 'Cultural',
        icon: '<i class="fa-solid fa-torii-gate" aria-hidden="true"></i>'
    },
    natural: {
        color: '#16A34A',
        label: 'Natural',
        icon: '<i class="fa-solid fa-leaf" aria-hidden="true"></i>'
    },
    mixed: {
        color: '#F97316',
        label: 'Mixed',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" aria-hidden="true" focusable="false"><path d="M248 106.6c18.9-9 32-28.3 32-50.6c0-30.9-25.1-56-56-56s-56 25.1-56 56c0 22.3 13.1 41.6 32 50.6l0 98.8c-2.8 1.3-5.5 2.9-8 4.7l-80.1-45.8c1.6-20.8-8.6-41.6-27.9-52.8C57.2 96 23 105.2 7.5 132S1.2 193 28 208.5c1.3 .8 2.6 1.5 4 2.1l0 90.8c-1.3 .6-2.7 1.3-4 2.1C1.2 319-8 353.2 7.5 380S57.2 416 84 400.5c19.3-11.1 29.4-32 27.8-52.8l50.5-28.9c-11.5-11.2-19.9-25.6-23.8-41.7L88 306.1c-2.6-1.8-5.2-3.3-8-4.7l0-90.8c2.8-1.3 5.5-2.9 8-4.7l80.1 45.8c-.1 1.4-.2 2.8-.2 4.3c0 22.3 13.1 41.6 32 50.6l0 98.8c-18.9 9-32 28.3-32 50.6c0 30.9 25.1 56 56 56s56-25.1 56-56c0-22.3-13.1-41.6-32-50.6l0-98.8c2.8-1.3 5.5-2.9 8-4.7l80.1 45.8c-1.6 20.8 8.6 41.6 27.8 52.8c26.8 15.5 61 6.3 76.5-20.5s6.3-61-20.5-76.5c-1.3-.8-2.7-1.5-4-2.1l0-90.8c1.4-.6 2.7-1.3 4-2.1c26.8-15.5 36-49.7 20.5-76.5S390.8 96 364 111.5c-19.3 11.1-29.4 32-27.8 52.8l-50.6 28.9c11.5 11.2 19.9 25.6 23.8 41.7L360 205.9c2.6 1.8 5.2 3.3 8 4.7l0 90.8c-2.8 1.3-5.5 2.9-8 4.6l-80.1-45.8c.1-1.4 .2-2.8 .2-4.3c0-22.3-13.1-41.6-32-50.6l0-98.8z"/></svg>'
    },
    all: {
        color: '#0EA5E9',
        label: 'All Sites',
        icon: '<i class="fa-solid fa-earth-americas" aria-hidden="true"></i>'
    }
};

function resolveClusterFromEvent(event) {
    if (!event) return null;
    if (event.layer && typeof event.layer.getAllChildMarkers === 'function') {
        return event.layer;
    }
    if (event.cluster && typeof event.cluster.getAllChildMarkers === 'function') {
        return event.cluster;
    }
    if (event.target && typeof event.target.getAllChildMarkers === 'function') {
        return event.target;
    }
    if (typeof event.getAllChildMarkers === 'function') {
        return event;
    }
    return null;
}

function createClusterGroup() {
    const clusterGroup = L.markerClusterGroup({
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        spiderfyDistanceMultiplier: 1.2,
        disableClusteringAtZoom: 7,
        maxClusterRadius: 60,
        iconCreateFunction: (cluster) => {
            const childMarkers = cluster.getAllChildMarkers();
            const count = cluster.getChildCount();
            const primaryColor = determineClusterColor(childMarkers);
            const lightColor = lightenColor(primaryColor, 0.18);
            const darkColor = darkenColor(primaryColor, 0.2);
            const html = `
                <div class="cluster-marker" style="--cluster-color:${primaryColor}; --cluster-color-light:${lightColor}; --cluster-color-dark:${darkColor};">
                    <span class="cluster-marker-count">${count.toLocaleString()}</span>
                </div>
            `;

            return L.divIcon({
                html,
                className: 'custom-cluster-marker marker-cluster marker-cluster-neutral',
                iconSize: [48, 48],
                iconAnchor: [24, 24]
            });
        }
    });

    clusterGroup.on('spiderfied', (event) => {
        const cluster = resolveClusterFromEvent(event);
        if (cluster) {
            mapState.activeSpiderCluster = cluster;
            mapState.lastSpiderCluster = cluster;
            const markers = cluster.getAllChildMarkers?.() || [];
            mapState.spiderfiedMarkers = new Set(markers);
        }
    });

    clusterGroup.on('unspiderfied', () => {
        mapState.activeSpiderCluster = null;
        mapState.lastSpiderCluster = null;
        mapState.spiderfiedMarkers.clear();
    });

    return clusterGroup;
}

function determineClusterColor(markers) {
    if (!Array.isArray(markers) || markers.length === 0) {
        return markerConfigs.all.color;
    }

    const counts = {
        cultural: 0,
        natural: 0,
        mixed: 0
    };

    markers.forEach(marker => {
        const type = marker.options?.siteType;
        if (type && counts.hasOwnProperty(type)) {
            counts[type] += 1;
        }
    });

    const entries = Object.entries(counts).filter(([, value]) => value > 0);
    if (entries.length === 1 && entries[0][1] === markers.length) {
        return markerConfigs[entries[0][0]].color;
    }

    if (entries.length > 0) {
        entries.sort((a, b) => b[1] - a[1]);
        return markerConfigs[entries[0][0]].color;
    }

    return markerConfigs.all.color;
}

function lightenColor(color, amount = 0.2) {
    const rgb = hexToRgb(color);
    if (!rgb) return color;
    const r = Math.round(rgb.r + (255 - rgb.r) * amount);
    const g = Math.round(rgb.g + (255 - rgb.g) * amount);
    const b = Math.round(rgb.b + (255 - rgb.b) * amount);
    return rgbToHex(r, g, b);
}

function darkenColor(color, amount = 0.2) {
    const rgb = hexToRgb(color);
    if (!rgb) return color;
    const r = Math.round(rgb.r * (1 - amount));
    const g = Math.round(rgb.g * (1 - amount));
    const b = Math.round(rgb.b * (1 - amount));
    return rgbToHex(r, g, b);
}

function hexToRgb(hex) {
    if (typeof hex !== 'string') return null;
    const normalized = hex.trim();
    if (!/^#([\da-f]{3}|[\da-f]{6})$/i.test(normalized)) return null;
    let value = normalized.slice(1);
    if (value.length === 3) {
        value = value.split('').map(char => char + char).join('');
    }
    const num = parseInt(value, 16);
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
    };
}

function rgbToHex(r, g, b) {
    const toHex = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function clamp(value, min = 0, max = 255) {
    return Math.min(max, Math.max(min, value));
}

// Initialize the app
async function init() {
    console.log('Initializing app...');

    if (elements.yearSlider) {
        elements.yearSlider.min = state.minYear;
        elements.yearSlider.max = state.maxYear;
        elements.yearSlider.value = state.selectedYear;
    }
    updateSliderEnds();
    
    // Add event listeners
    setupEventListeners();

    // Apply initial controls visibility
    updateControlsVisibility();
    updateSliderBubble();

    // Load sites
    await loadSites();
    
    // Initialize map
    initMap();
}

// Set up event listeners
function setupEventListeners() {
    // Year slider
    elements.yearSlider.addEventListener('input', (e) => {
        state.selectedYear = parseInt(e.target.value);
        updateProgress();
        filterSites();
        updateMap();
        updateSliderBubble();
    });

    window.addEventListener('resize', () => {
        requestAnimationFrame(updateSliderBubble);
    });
    
    // Filter buttons
    elements.filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all buttons
            elements.filterButtons.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            btn.classList.add('active');
            // Update selected type
            state.selectedType = btn.dataset.type;
            // Filter and update
            filterSites();
            updateMap();
            updateCounts();
        });
    });
    
    // Toggle controls
    elements.toggleControls.addEventListener('click', () => {
        state.controlsCollapsed = !state.controlsCollapsed;
        updateControlsVisibility();
    });

    setupSearchEvents();
}

function setupSearchEvents() {
    if (!elements.searchForm || !elements.searchInput || !elements.searchTags) {
        return;
    }

    elements.searchForm.addEventListener('submit', (event) => {
        event.preventDefault();
        commitSearchInput({ apply: true });
    });

    elements.searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            commitSearchInput({ apply: true });
        } else if (event.key === ',' || event.key === 'Comma') {
            event.preventDefault();
            commitSearchInput({ apply: true });
        } else if (event.key === 'Backspace' && !event.target.value && state.searchTerms.length > 0) {
            event.preventDefault();
            removeSearchTerm(state.searchTerms.length - 1, { apply: true });
        }
    });

    elements.searchInput.addEventListener('blur', () => {
        commitSearchInput({ apply: true });
    });

    elements.searchTags.addEventListener('click', (event) => {
        const button = event.target.closest('.search-tag-remove');
        if (!button) return;
        const index = Number.parseInt(button.dataset.index, 10);
        if (Number.isInteger(index)) {
            removeSearchTerm(index, { apply: true });
        }
    });

    if (elements.searchClear) {
        elements.searchClear.addEventListener('click', () => {
            if (!state.searchTerms.length && !state.activeSearchTerms.length && !(elements.searchInput?.value?.trim())) {
                return;
            }
            clearSearchTerms();
        });
    }

    renderSearchTerms();
}

function commitSearchInput({ apply = false } = {}) {
    if (!elements.searchInput) {
        return false;
    }

    const rawValue = elements.searchInput.value;
    if (!rawValue) {
        if (apply) {
            applySearchFilter();
        }
        return false;
    }

    const parts = rawValue.split(',').map(part => part.trim()).filter(Boolean);
    let added = false;
    parts.forEach(part => {
        if (addSearchTerm(part)) {
            added = true;
        }
    });

    if (parts.length > 0) {
        elements.searchInput.value = '';
    }

    if (added) {
        renderSearchTerms();
    }

    if (apply) {
        applySearchFilter();
    }

    return added;
}

function addSearchTerm(raw) {
    if (!raw) return false;
    const trimmed = raw.trim();
    if (!trimmed) return false;
    const normalized = normalizeSearchValue(trimmed);
    if (state.searchTerms.some(term => term.normalized === normalized)) {
        return false;
    }
    state.searchTerms.push({ raw: trimmed, normalized });
    return true;
}

function removeSearchTerm(index, { apply = false } = {}) {
    if (index < 0 || index >= state.searchTerms.length) return;
    state.searchTerms.splice(index, 1);
    renderSearchTerms();
    if (apply) {
        applySearchFilter();
    }
}

function clearSearchTerms() {
    state.searchTerms = [];
    state.activeSearchTerms = [];
    if (elements.searchInput) {
        elements.searchInput.value = '';
    }
    renderSearchTerms();
    requestFitBounds();
    filterSites();
    updateCounts();
    updateMap();
}

function renderSearchTerms() {
    if (!elements.searchTags) return;
    elements.searchTags.innerHTML = '';

    state.searchTerms.forEach((term, index) => {
        const tag = document.createElement('span');
        tag.className = 'search-tag';
        tag.dataset.index = String(index);
        tag.setAttribute('role', 'listitem');

        const label = document.createElement('span');
        label.className = 'search-tag-label';
        label.textContent = term.raw;
        label.title = term.raw;
        tag.appendChild(label);

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'search-tag-remove';
        removeButton.dataset.index = String(index);
        removeButton.setAttribute('aria-label', `Remove term ${term.raw}`);
        removeButton.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        tag.appendChild(removeButton);

        elements.searchTags.appendChild(tag);
    });

    updateSearchControlsState();
}

function updateSearchControlsState() {
    const hasContent = state.searchTerms.length > 0 || state.activeSearchTerms.length > 0 || Boolean(elements.searchInput?.value?.trim());
    if (elements.searchClear) {
        elements.searchClear.disabled = !hasContent;
    }
    if (elements.searchBar) {
        elements.searchBar.classList.toggle('has-active-search', state.activeSearchTerms.length > 0);
    }
}

function applySearchFilter() {
    state.activeSearchTerms = state.searchTerms.map(term => term.normalized);
    requestFitBounds();
    filterSites();
    updateCounts();
    updateMap();
    updateSearchControlsState();
}

function matchesActiveSearchTerms(site) {
    if (!Array.isArray(state.activeSearchTerms) || state.activeSearchTerms.length === 0) return true;
    const haystack = site.searchText || '';
    if (!haystack) return false;
    return state.activeSearchTerms.every(term => haystack.includes(term));
}

// Update controls visibility
function updateControlsVisibility() {
    const controlPanel = document.querySelector('.control-panel');
    if (state.controlsCollapsed) {
        controlPanel.classList.add('collapsed');
    } else {
        controlPanel.classList.remove('collapsed');
    }
}

// Load UNESCO sites from DigitalOcean Function
async function loadSites() {
    try {
        console.log('Loading sites from DigitalOcean Function...');
        
        // Use your actual DigitalOcean function URL
        const functionUrl = 'https://faas-nyc1-2ef2e6cc.doserverless.co/api/v1/web/fn-64bcf502-3460-4418-ae12-fed42467b800/default/wikidata-proxy?refresh=1';
        const response = await fetch(functionUrl, {
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Function returned:', data);

        if (Array.isArray(data.sites)) {
            processSitesData(data.sites);
            return;
        }

        if (data.results?.bindings) {
            console.warn('Received legacy SPARQL bindings – normalizing on the client.');
            const normalizedSites = normalizeBindings(data.results.bindings);
            processSitesData(normalizedSites);
            return;
        }

        throw new Error('Invalid data structure returned from function');

    } catch (error) {
        console.error('Error loading sites from function:', error);
        showError('Unable to load data from Wikidata at the moment. Please try again later.');
        state.loading = false;
    }
}

// Process the sites data
function processSitesData(sites) {
    console.log('Processing sites ', sites);

    if (!Array.isArray(sites)) {
        throw new Error('Invalid data structure');
    }

    console.log('Number of results:', sites.length);

    state.sites = sites.map(site => {
        const id = site.site ? site.site.split('/').pop() : 'unknown';
        const coords = site.coord || site.coordinate || null;
        const latitude = getLatitude(coords, site);
        const longitude = getLongitude(coords, site);

        const inscriptionYearValue = parseInscriptionYear(site.inscriptionYear);
        const criteria = Array.isArray(site.criteria) ? site.criteria : [];
        const type = resolveSiteType(site, criteria);
        const countries = Array.isArray(site.countries) && site.countries.length > 0
            ? site.countries
            : (site.country ? [site.country] : []);
        const images = normalizeImages(site.images || site.imageList || site.media || null);
        const primaryCountry = countries[0] ?? site.country ?? '';
        const countryCode = resolveCountryCodeFromName(primaryCountry || site.country);
        const countryFlag = countryCodeToFlagEmoji(countryCode);

        const normalizedSite = {
            id,
            name: site.label || site.name || 'Unknown Site',
            country: countries.length > 0 ? countries.join(', ') : 'Unknown',
            countries,
            primaryCountry,
            countryCode: countryCode ?? null,
            countryFlag: countryFlag || '',
            latitude,
            longitude,
            inscriptionYear: inscriptionYearValue ?? 1978,
            type,
            criteria,
            description: site.description || 'UNESCO World Heritage Site',
            officialUrl: site.unescoUrl || site.officialUrl || '',
            unescoId: site.unescoId || site.unescoIdentifier || site.unesco_id || '',
            images
        };

        normalizedSite.searchText = buildSiteSearchText(normalizedSite);

        return normalizedSite;
    }).filter(site => 
        site.latitude != null &&
        site.longitude != null &&
        !isNaN(site.latitude) &&
        !isNaN(site.longitude) &&
        site.latitude >= -90 &&
        site.latitude <= 90 &&
        site.longitude >= -180 &&
        site.longitude <= 180
    );

    console.log('Processed valid sites:', state.sites.length);

    const inscriptionYears = state.sites
        .map(site => site.inscriptionYear)
        .filter(year => Number.isFinite(year));

    if (inscriptionYears.length > 0) {
        const computedMin = Math.min(...inscriptionYears);
        const computedMax = Math.max(...inscriptionYears);
        const DEFAULT_MIN_YEAR = 1978;
        const DEFAULT_MAX_YEAR = 2025;
        state.minYear = DEFAULT_MIN_YEAR;
        state.maxYear = Math.max(DEFAULT_MAX_YEAR, computedMax);
        state.selectedYear = Math.max(computedMax, state.minYear);
    }

    if (elements.yearSlider) {
        elements.yearSlider.min = state.minYear;
        elements.yearSlider.max = state.maxYear;
        elements.yearSlider.value = state.selectedYear;
    }

    updateSliderEnds();

    // Filter sites initially
    filterSites();
    updateCounts();
    updateProgress();

    state.loading = false;
    hideLoading();
    requestFitBounds();
    mapState.userHasAdjusted = false;
    updateSliderBubble();
}

function resolveSiteType(site, criteria = []) {
    const normalized = typeof site.type === 'string' ? site.type.toLowerCase() : '';
    if (['cultural', 'natural', 'mixed'].includes(normalized)) {
        return normalized;
    }

    const hasCultural = criteria.some(c => /\b(i|ii|iii|iv|v|vi)\b/i.test(c));
    const hasNatural = criteria.some(c => /\b(vii|viii|ix|x)\b/i.test(c));

    if (hasCultural && hasNatural) return 'mixed';
    if (hasNatural) return 'natural';
    if (hasCultural) return 'cultural';

    const description = site.description?.toLowerCase?.() ?? '';
    if (description.includes('mixed')) return 'mixed';
    if (description.includes('natural')) return 'natural';
    if (description.includes('cultural')) return 'cultural';

    return 'cultural';
}

function getLatitude(coords, site) {
    if (coords && typeof coords.lat === 'number') return coords.lat;
    if (coords && typeof coords.latitude === 'number') return coords.latitude;
    if (typeof site.latitude === 'number') return site.latitude;
    if (typeof site.latitude === 'string') return parseFloat(site.latitude);
    if (typeof site.lat === 'string' || typeof site.lat === 'number') return parseFloat(site.lat);
    return null;
}

function getLongitude(coords, site) {
    if (coords && typeof coords.lon === 'number') return coords.lon;
    if (coords && typeof coords.longitude === 'number') return coords.longitude;
    if (typeof site.longitude === 'number') return site.longitude;
    if (typeof site.longitude === 'string') return parseFloat(site.longitude);
    if (typeof site.lon === 'string' || typeof site.lon === 'number') return parseFloat(site.lon);
    return null;
}

function parseInscriptionYear(value) {
    if (value == null) return null;
    if (Number.isFinite(value)) return value;
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
}

function parseLegacyWKT(value) {
    if (!value) return null;
    const match = value.match(/Point\\(([-\\d\\.]+) ([-\\d\\.]+)\\)/);
    return match ? { lat: parseFloat(match[2]), lon: parseFloat(match[1]) } : null;
}

function normalizeBindings(bindings) {
    return bindings.map(item => {
        const wkt = item.coordinate?.value || item.coord?.value;
        const coord = parseLegacyWKT(wkt);
        const latitude = coord?.lat ?? (item.latitude?.value ? parseFloat(item.latitude.value) : null);
        const longitude = coord?.lon ?? (item.longitude?.value ? parseFloat(item.longitude.value) : null);

        return {
            site: item.item?.value ?? null,
            label: item.itemLabel?.value ?? null,
            description: item.description?.value ?? null,
            country: item.country?.value ?? null,
            countries: item.country?.value ? [item.country.value] : [],
            coord: coord ?? (latitude != null && longitude != null ? { lat: latitude, lon: longitude } : null),
            latitude,
            longitude,
            inscriptionYear: item.inscriptionYear?.value ?? null,
            unescoId: item.unescoId?.value ?? null,
            unescoUrl: item.officialUrl?.value ?? null,
            criteria: [],
            type: item.type?.value ?? null
        };
    });
}

// Test data fallback
function loadTestSites() {
    console.log('Loading test data...');
    
    const testSites = [
        {
            id: "1",
            name: "Yellowstone National Park",
            country: "United States",
            latitude: 44.4280,
            longitude: -110.5885,
            inscriptionYear: 1978,
            type: "natural",
            description: "First national park in the world, known for its geothermal features.",
            officialUrl: "https://www.nps.gov/yell/index.htm"
        },
        {
            id: "2",
            name: "Great Wall of China",
            country: "China",
            latitude: 40.4319,
            longitude: 116.5704,
            inscriptionYear: 1987,
            type: "cultural",
            description: "Series of fortifications made of stone, brick, wood and other materials.",
            officialUrl: "https://whc.unesco.org/en/list/438"
        },
        {
            id: "3",
            name: "Galápagos Islands",
            country: "Ecuador",
            latitude: -0.7893,
            longitude: -91.2109,
            inscriptionYear: 1978,
            type: "natural",
            description: "Volcanic archipelago famous for its endemic species studied by Charles Darwin.",
            officialUrl: "https://whc.unesco.org/en/list/1"
        }
    ];
    
    state.sites = testSites;
    filterSites();
    updateCounts();
    updateProgress();
    state.loading = false;
    hideLoading();
    initMap();
}

// Filter sites based on current state
function filterSites() {
    state.filteredSites = state.sites.filter(site => {
        const yearMatch = site.inscriptionYear <= state.selectedYear;
        const typeMatch = state.selectedType === 'all' || site.type === state.selectedType;
        const searchMatch = matchesActiveSearchTerms(site);
        return yearMatch && typeMatch && searchMatch;
    });
    
    elements.siteCount.innerHTML = `Showing <strong>${state.filteredSites.length}</strong> UNESCO World Heritage Sites${state.selectedYear < new Date().getFullYear() ? ` up to ${state.selectedYear}` : ''}`;
    updateSliderBubble();
}

// Update progress percentage
function updateProgress() {
    elements.totalSites.textContent = `${state.sites.length} total sites`;
}

function updateSliderBubble() {
    const bubble = elements.sliderBubble;
    const slider = elements.yearSlider;
    if (!bubble || !slider) return;

    const year = state.selectedYear;
    const count = state.sites.filter(site =>
        site.inscriptionYear === year &&
        (state.selectedType === 'all' || site.type === state.selectedType) &&
        matchesActiveSearchTerms(site)
    ).length;

    bubble.textContent = `${year} | ${count} ${count === 1 ? 'Site' : 'Sites'}`;

    const min = Number(slider.min);
    const max = Number(slider.max);
    if (Number.isNaN(min) || Number.isNaN(max) || max === min) {
        bubble.style.left = '0%';
        return;
    }

    const percent = (year - min) / (max - min);
    const boundedPercent = Math.min(Math.max(percent, 0), 1);
    const sliderRect = slider.getBoundingClientRect();
    const containerRect = slider.parentElement.getBoundingClientRect();
    const sliderWidth = sliderRect.width;
    const bubbleWidth = bubble.offsetWidth;
    const bubbleHeight = bubble.offsetHeight;
    const halfBubble = bubbleWidth / 2;
    const containerLeft = sliderRect.left - containerRect.left;

    let leftPx = containerLeft + boundedPercent * sliderWidth;
    leftPx = Math.min(Math.max(leftPx, containerLeft + halfBubble), containerLeft + sliderWidth - halfBubble);
    bubble.style.left = `${leftPx}px`;

    const sliderStyles = window.getComputedStyle(slider);
    const trackHeight = parseFloat(sliderStyles.getPropertyValue('height')) || sliderRect.height;
    const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const thumbHeight = 1.4 * rootFontSize;
    const thumbTopOffset = (thumbHeight - trackHeight) / 2;
    const topPx = (sliderRect.top - containerRect.top) - thumbTopOffset - bubbleHeight - 5;
    bubble.style.top = `${topPx}px`;
}

function updateSliderEnds() {
    if (elements.sliderStart) {
        elements.sliderStart.textContent = state.minYear;
    }
    if (elements.sliderEnd) {
        elements.sliderEnd.textContent = state.maxYear;
    }
}

// Update site counts
function updateCounts() {
    const counts = {
        all: state.sites.filter(s => s.inscriptionYear <= state.selectedYear && matchesActiveSearchTerms(s)).length,
        cultural: state.sites.filter(s => s.type === 'cultural' && s.inscriptionYear <= state.selectedYear && matchesActiveSearchTerms(s)).length,
        natural: state.sites.filter(s => s.type === 'natural' && s.inscriptionYear <= state.selectedYear && matchesActiveSearchTerms(s)).length,
        mixed: state.sites.filter(s => s.type === 'mixed' && s.inscriptionYear <= state.selectedYear && matchesActiveSearchTerms(s)).length
    };
    
    document.getElementById('count-all').textContent = counts.all;
    document.getElementById('count-cultural').textContent = counts.cultural;
    document.getElementById('count-natural').textContent = counts.natural;
    document.getElementById('count-mixed').textContent = counts.mixed;
}

// Hide loading screen
function hideLoading() {
    elements.loading.style.display = 'none';
}

// Show error
function showError(message) {
    elements.loading.innerHTML = `
        <div style="text-align: center; max-width: 500px; padding: 1rem;">
            <p style="color: #d4183d; margin-bottom: 1rem;">${message}</p>
            <button
                onclick="location.reload()"
                style="
                    padding: 0.5rem 1rem;
                    background: #030213;
                    color: white;
                    border: none;
                    border-radius: 0.5rem;
                    cursor: pointer;
                "
                aria-label="Retry loading data"
            >
                Retry
            </button>
        </div>
    `;
}

function initMap() {
    console.log('Initializing map with OpenStreetMap tiles...');

    // Allow panning beyond default world tile bounds by using an infinite CRS definition.
    const infiniteWorldCrs = L.Util.extend({}, L.CRS.EPSG3857, { infinite: true });
    
    // Create map
    mapState.map = L.map('map', {
        crs: infiniteWorldCrs,
        worldCopyJump: false,
        maxBounds: null,
        maxBoundsViscosity: 0
    }).setView([20, 0], 2);

    mapState.map.on('movestart', () => {
        if (!mapState.isAutoFitting) {
            mapState.userHasAdjusted = true;
            mapState.forceFitBounds = false;
        }
    });

    mapState.map.on('zoomstart', () => {
        if (!mapState.isAutoFitting) {
            mapState.userHasAdjusted = true;
            mapState.forceFitBounds = false;
        }
    });
    
    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Data from <a href="https://www.wikidata.org/">Wikidata</a>',
        minZoom: 1,
        maxZoom: 19,
        crossOrigin: true,
        keepBuffer: 4,
        updateWhenIdle: true,
        updateWhenZooming: false
    }).addTo(mapState.map);
    
    mapState.clusterGroup = createClusterGroup();
    mapState.map.addLayer(mapState.clusterGroup);
    
    // Update map with sites
    updateMap();
}

// Update map with current filtered sites
function updateMap() {
    if (!mapState.map) return;
    
    if (!mapState.clusterGroup) {
        mapState.clusterGroup = createClusterGroup();
        mapState.map.addLayer(mapState.clusterGroup);
    }

    mapState.clusterGroup.clearLayers();
    mapState.markers = [];
    
    // Add new markers
    state.filteredSites.forEach(site => {
        const icon = createIcon(site.type);

        const config = markerConfigs[site.type] || markerConfigs.cultural;
        const popupHtml = buildPopupContent(site, config);

        const marker = L.marker([site.latitude, site.longitude], {
            icon,
            siteType: site.type
        }).bindPopup(popupHtml, {
            autoPan: false
        });

        marker.__suppressCentering = false;

        marker.__siteData = site;

        marker.on('popupopen', (event) => {
            const popupElement = event.popup?.getElement?.();
            loadPopupImages(marker.__siteData, popupElement);
            if (marker.__suppressCentering) {
                marker.__suppressCentering = false;
                if (popupElement) {
                    requestAnimationFrame(() => adjustPopupIntoViewport(marker, popupElement));
                }
                return;
            }
            centerPopupOnMarker(marker, popupElement);
        });

        marker.on('mouseover', function() {
            marker.bindTooltip(`<strong>${site.name}</strong>`, {
                permanent: false,
                direction: 'top',
                className: 'tooltip-popup',
                offset: [0, -46],
            }).openTooltip();
        });

        marker.on('mouseout', () => marker.closeTooltip());
        
        mapState.markers.push(marker);
        mapState.clusterGroup.addLayer(marker);
    });

    // Fit bounds if we have sites
    const hasMarkers = mapState.clusterGroup.getLayers().length > 0;
    const shouldAutoFit = hasMarkers && mapState.forceFitBounds;
    if (shouldAutoFit) {
        mapState.isAutoFitting = true;
        mapState.map.once('moveend', () => {
            mapState.isAutoFitting = false;
        });
        const bounds = mapState.clusterGroup.getBounds();
        if (bounds.isValid()) {
            mapState.map.fitBounds(bounds, { padding: [50, 50] });
        }
    }
    mapState.forceFitBounds = false;
}

// Create custom icons
function createIcon(type) {
    const config = markerConfigs[type] || markerConfigs.cultural;
    const markerHtml = `
        <div class="heritage-marker" style="background-color:${config.color};">
            <span class="heritage-marker-icon">${config.icon}</span>
        </div>
    `;

    return L.divIcon({
        html: markerHtml,
        iconSize: [42, 42],
        iconAnchor: [21, 42],
        popupAnchor: [0, -32],
        className: 'custom-heritage-marker'
    });
}

function refreshLucideIcons(root = document) {
    try {
        if (window.lucide?.createIcons) {
            window.lucide.createIcons({ root, nameAttr: 'data-lucide' });
        }
    } catch (error) {
        console.warn('Unable to render lucide icons', error);
    }
}

function ensureFileTitle(title) {
    if (!title) return null;
    const trimmed = String(title).trim();
    if (!trimmed) return null;
    return trimmed.startsWith('File:') ? trimmed : `File:${trimmed}`;
}

async function fetchCommonsThumbnails(titles) {
    const validTitles = titles
        .map(ensureFileTitle)
        .filter(Boolean)
        .slice(0, MAX_POPUP_IMAGES);
    if (validTitles.length === 0) return [];

    const params = new URLSearchParams({
        action: 'query',
        prop: 'imageinfo',
        format: 'json',
        origin: '*',
        iiprop: 'url|extmetadata',
        iiurlwidth: '640',
        titles: validTitles.join('|')
    });

    const response = await fetch(`${COMMONS_API}?${params.toString()}`);
    if (!response.ok) throw new Error(`Commons image lookup failed: ${response.status}`);
    const json = await response.json();
    const pages = json?.query?.pages || {};
    const urls = [];

    Object.values(pages).forEach(page => {
        const info = Array.isArray(page?.imageinfo) ? page.imageinfo[0] : null;
        const thumb = info?.thumburl || info?.url || null;
        if (thumb) {
            urls.push(thumb);
        }
    });

    return urls.slice(0, MAX_POPUP_IMAGES);
}

function renderMediaLoader(mediaElement) {
    if (!mediaElement) return;
    const track = mediaElement.querySelector('.popup-media-track');
    if (track) {
        track.classList.add('is-loading');
        track.innerHTML = `
            <div class="popup-media-loader" role="status" aria-label="Loading images"></div>
        `;
    }
    const dots = mediaElement.querySelector('.popup-media-dots');
    if (dots) dots.remove();
}

function renderMediaEmpty(mediaElement) {
    if (!mediaElement) return;
    const track = mediaElement.querySelector('.popup-media-track');
    if (track) {
        track.classList.remove('is-loading');
        track.innerHTML = `
            <div class="popup-media-slide active">
                <div class="popup-media-empty" aria-label="No images available">
                    <i class="popup-media-icon" data-lucide="image-off"></i>
                    <span>No image available</span>
                </div>
            </div>
        `;
    }
    const dots = mediaElement.querySelector('.popup-media-dots');
    if (dots) dots.remove();
    mediaElement.dataset.activeIndex = '0';
    refreshLucideIcons(mediaElement);
}

function renderMediaSlides(mediaElement, urls, siteName) {
    if (!mediaElement) return;
    const sanitized = Array.isArray(urls) ? urls.filter(Boolean).slice(0, MAX_POPUP_IMAGES) : [];
    if (sanitized.length === 0) {
        renderMediaEmpty(mediaElement);
        return;
    }

    const track = mediaElement.querySelector('.popup-media-track');
    if (!track) return;
    track.classList.remove('is-loading');
    track.innerHTML = sanitized.map((url, index) => `
        <div class="popup-media-slide${index === 0 ? ' active' : ''}">
            <img src="${escapeHtml(url)}" alt="${escapeHtml(siteName)} image ${index + 1}" loading="lazy" />
        </div>
    `).join('');

    const dotsNeeded = sanitized.length > 1;
    const existingDots = mediaElement.querySelector('.popup-media-dots');
    if (existingDots) existingDots.remove();

    if (dotsNeeded) {
        const dots = document.createElement('div');
        dots.className = 'popup-media-dots';
        dots.setAttribute('role', 'tablist');
        dots.setAttribute('aria-label', `${siteName} images`);
        dots.innerHTML = sanitized.map((_, index) => `
            <button type="button" class="popup-media-dot${index === 0 ? ' active' : ''}" data-index="${index}" aria-label="Show image ${index + 1}"></button>
        `).join('');
        mediaElement.appendChild(dots);
    }

    mediaElement.dataset.activeIndex = '0';
}

async function loadPopupImages(site, popupElement) {
    if (!site || !popupElement) return;
    const mediaElement = popupElement.querySelector('.popup-media');
    if (!mediaElement) return;

    const hasImages = Array.isArray(site.images) && site.images.length > 0;
    if (!hasImages) {
        renderMediaEmpty(mediaElement);
        initializePopupMedia(popupElement);
        return;
    }

    const cached = imageCache.get(site.id);
    if (cached) {
        renderMediaSlides(mediaElement, cached, site.name);
        initializePopupMedia(popupElement);
        return;
    }

    renderMediaLoader(mediaElement);
    try {
        const urls = await fetchCommonsThumbnails(site.images);
        const finalUrls = urls.length > 0 ? urls : [];
        imageCache.set(site.id, finalUrls);
        if (finalUrls.length === 0) {
            renderMediaEmpty(mediaElement);
        } else {
            renderMediaSlides(mediaElement, finalUrls, site.name);
        }
    } catch (error) {
        console.warn('Unable to load Commons images for site', site.id, error);
        renderMediaEmpty(mediaElement);
    }

    initializePopupMedia(popupElement);
}

function buildPopupContent(site, config) {
    const hasRealImages = Array.isArray(site.images) && site.images.length > 0;
    const cardClasses = 'popup-card';
    const countryLabel = site.country || 'Unknown';
    const normalizedIsoCode = (value) => {
        if (!value || typeof value !== 'string') return null;
        const trimmed = value.trim();
        if (!/^[A-Za-z]{2}$/.test(trimmed)) return null;
        return trimmed.toUpperCase();
    };

    const derivedCode = countryLabel ? resolveCountryCodeFromName(countryLabel) : null;
    const isoCode = normalizedIsoCode(site.countryCode)
        || normalizedIsoCode(site.countryFlag)
        || normalizedIsoCode(derivedCode);

    const emojiPattern = /^[\u{1F1E6}-\u{1F1FF}]{2}$/u;
    const rawFlag = typeof site.countryFlag === 'string' ? site.countryFlag.trim() : '';
    const emojiFlag = emojiPattern.test(rawFlag)
        ? rawFlag
        : (isoCode ? countryCodeToFlagEmoji(isoCode) : '');
    const flagImgSrc = isoCode
        ? `https://cdn.jsdelivr.net/npm/flag-icons@6.6.6/flags/4x3/${isoCode.toLowerCase()}.svg`
        : null;
    const flagMarkup = flagImgSrc
        ? `<span class="popup-country-flag" aria-hidden="true"><img src="${escapeHtml(flagImgSrc)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>`
        : emojiFlag
            ? `<span class="popup-country-flag popup-country-flag--emoji" aria-hidden="true">${escapeHtml(emojiFlag)}</span>`
            : isoCode
                ? `<span class="popup-country-flag popup-country-flag--fallback" aria-hidden="true">${escapeHtml(isoCode)}</span>`
                : '';

    const countryMarkup = countryLabel ? `
        <span class="popup-country" role="text">
            ${flagMarkup}
            <span>${escapeHtml(countryLabel)}</span>
        </span>
    ` : '';
    const inscriptionText = site.inscriptionYear
        ? `Inscribed in ${escapeHtml(site.inscriptionYear)}`
        : '';
    const formattedDescription = formatDescriptionText(site.description);
    const descriptionText = formattedDescription ? escapeHtml(formattedDescription) : '';

    const typeBadgeMarkup = `
        <span class="popup-chip popup-chip-overlay" style="--chip-color:${config.color}">${config.label}</span>
    `;
    const metaMarkup = countryMarkup
        ? `
            <div class="popup-body-meta">
                ${countryMarkup}
            </div>
        `
        : '';

    const mediaTrackMarkup = hasRealImages
        ? `
            <div class="popup-media-track is-loading">
                <div class="popup-media-loader" role="status" aria-label="Loading images"></div>
            </div>
        `
        : `
            <div class="popup-media-track">
                <div class="popup-media-slide active">
                    <div class="popup-media-empty" aria-label="No images available">
                        <i class="popup-media-icon" data-lucide="image-off"></i>
                        <span>No image available</span>
                    </div>
                </div>
            </div>
        `;

    return `
        <div class="${cardClasses}" data-site-id="${escapeHtml(site.id)}">
            <div class="popup-media" data-active-index="0" data-has-real-media="${hasRealImages}">
                ${typeBadgeMarkup}
                ${mediaTrackMarkup}
            </div>
            <div class="popup-body">
                <h3 class="popup-heading">${escapeHtml(site.name)}</h3>
                ${metaMarkup}
                ${inscriptionText ? `<p class="popup-meta-line">${inscriptionText}</p>` : ''}
                ${descriptionText ? `<p class="popup-description">${descriptionText}</p>` : ''}
                ${site.officialUrl ? `<a href="${escapeHtml(site.officialUrl)}" target="_blank" rel="noopener noreferrer" class="popup-link">View on UNESCO →</a>` : ''}
            </div>
        </div>
    `;
}

function centerPopupOnMarker(marker, popupElement) {
    if (!marker || !mapState.map) return;
    const map = mapState.map;
    const latLng = marker.getLatLng();
    if (!latLng) return;
    const popupEl = popupElement || marker.getPopup()?.getElement?.();

    const clusterGroup = mapState.clusterGroup;
    const parentCluster = marker.__parent || null;
    const spiderCluster = clusterGroup?._spiderfied || null;
    const shouldRespider = spiderCluster && parentCluster && spiderCluster === parentCluster;

    mapState.isAutoFitting = true;

    const finishAutoFit = () => {
        mapState.isAutoFitting = false;
    };

    const currentZoom = map.getZoom();
    const mapSize = map.getSize();
    const baseOffset = Math.round(mapSize.y * 0.22);
    let verticalOffset = Math.max(96, Math.min(260, baseOffset));

    const searchForm = elements.searchForm;
    if (searchForm) {
        const searchRect = searchForm.getBoundingClientRect();
        if (searchRect.bottom > 0) {
            const safeSpace = Math.ceil(searchRect.bottom + 20);
            verticalOffset = Math.max(verticalOffset, safeSpace);
        }
    }
    const projectedPoint = map.project(latLng, currentZoom);
    const targetPoint = projectedPoint.subtract([0, verticalOffset]);
    if (projectedPoint.equals(targetPoint)) {
        finishAutoFit();
        if (popupEl) {
            requestAnimationFrame(() => adjustPopupIntoViewport(marker, popupEl));
        }
        return;
    }
    const targetLatLng = map.unproject(targetPoint, currentZoom);

    schedulePostMoveActions({
        marker,
        popupElement: popupEl,
        cluster: shouldRespider ? parentCluster : null,
        onAfter: finishAutoFit
    });

    map.flyTo(targetLatLng, currentZoom, {
        animate: true,
        duration: 0.35,
        easeLinearity: 0.25,
        noMoveStart: false
    });
}

function schedulePostMoveActions({ marker, popupElement, cluster, onAfter }) {
    if (!mapState.map) return;
    const map = mapState.map;
    const hasCluster = cluster && typeof cluster.spiderfy === 'function';

    if (hasCluster) {
        mapState.pendingRespiderCluster = cluster;
        mapState.pendingRespiderMarker = marker || null;
    } else {
        mapState.pendingRespiderCluster = null;
        mapState.pendingRespiderMarker = null;
    }

    map.once('moveend', () => {
        if (typeof onAfter === 'function') {
            onAfter();
        }

        const pendingCluster = mapState.pendingRespiderCluster;
        const pendingMarker = mapState.pendingRespiderMarker;
        mapState.pendingRespiderCluster = null;
        mapState.pendingRespiderMarker = null;

        if (pendingCluster && typeof pendingCluster.spiderfy === 'function') {
            if (pendingMarker) {
                pendingMarker.__suppressCentering = true;
            }
            requestAnimationFrame(() => {
                pendingCluster.spiderfy();
                if (pendingMarker) {
                    requestAnimationFrame(() => {
                        pendingMarker.openPopup();
                        const reopenedPopup = pendingMarker.getPopup?.();
                        const element = reopenedPopup?.getElement?.() || popupElement;
                        if (element) {
                            requestAnimationFrame(() => adjustPopupIntoViewport(pendingMarker, element));
                        }
                    });
                }
            });
        } else if (popupElement) {
            requestAnimationFrame(() => adjustPopupIntoViewport(marker, popupElement));
        }
    });
}

function adjustPopupIntoViewport(marker, popupElement) {
    if (!marker || !popupElement || !mapState.map) return;
    const map = mapState.map;
    const mapContainer = map.getContainer();
    if (!mapContainer) return;

    const rect = popupElement.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return;

    const mapRect = mapContainer.getBoundingClientRect();
    const searchRect = elements.searchForm?.getBoundingClientRect();
    const horizontalPadding = 18;
    const verticalPadding = 16;
    const safeTopBase = mapRect.top + verticalPadding;
    const safeTop = searchRect
        ? Math.max(safeTopBase, searchRect.bottom + verticalPadding)
        : safeTopBase;
    const safeBottom = mapRect.bottom - verticalPadding;
    const safeLeft = mapRect.left + horizontalPadding;
    const safeRight = mapRect.right - horizontalPadding;

    if (safeRight <= safeLeft || safeBottom <= safeTop) return;

    const safeWidth = safeRight - safeLeft;
    const safeHeight = safeBottom - safeTop;
    const extraWidth = rect.width - safeWidth;
    const extraHeight = rect.height - safeHeight;

    const desiredLeft = extraWidth > 0 ? safeLeft - extraWidth / 2 : safeLeft;
    const desiredRight = extraWidth > 0 ? safeRight + extraWidth / 2 : safeRight;
    const desiredTop = extraHeight > 0 ? safeTop - extraHeight / 2 : safeTop;
    const desiredBottom = extraHeight > 0 ? safeBottom + extraHeight / 2 : safeBottom;

    let shiftX = 0;
    let shiftY = 0;

    if (rect.left < desiredLeft) {
        shiftX = rect.left - desiredLeft;
    } else if (rect.right > desiredRight) {
        shiftX = rect.right - desiredRight;
    }

    if (rect.top < desiredTop) {
        shiftY = rect.top - desiredTop;
    } else if (rect.bottom > desiredBottom) {
        shiftY = rect.bottom - desiredBottom;
    }

    if (Math.abs(shiftX) < 0.5 && Math.abs(shiftY) < 0.5) return;

    const parentCluster = marker.__parent || null;
    const spiderCluster = mapState.clusterGroup?._spiderfied || null;
    const clusterToRestore = parentCluster && spiderCluster && parentCluster === spiderCluster
        ? parentCluster
        : null;

    const zoom = map.getZoom();
    const currentCenter = map.getCenter();
    if (!currentCenter) return;

    const shiftPoint = L.point(shiftX, shiftY);
    const centerPoint = map.latLngToContainerPoint(currentCenter, zoom);
    const targetPoint = L.point(centerPoint.x + shiftPoint.x, centerPoint.y + shiftPoint.y);
    const targetLatLng = map.containerPointToLatLng(targetPoint, zoom);

    if (!targetLatLng || !Number.isFinite(targetLatLng.lat) || !Number.isFinite(targetLatLng.lng)) {
        return;
    }

    const latDiff = Math.abs(currentCenter.lat - targetLatLng.lat);
    const lngDiff = Math.abs(currentCenter.lng - targetLatLng.lng);
    if (latDiff < 1e-12 && lngDiff < 1e-12) {
        return;
    }

    mapState.isAutoFitting = true;
    const finishAutoFit = () => {
        mapState.isAutoFitting = false;
    };

    schedulePostMoveActions({
        marker,
        popupElement,
        cluster: clusterToRestore,
        onAfter: finishAutoFit
    });

    map.flyTo(targetLatLng, zoom, {
        animate: true,
        duration: 0.3,
        easeLinearity: 0.25,
        noMoveStart: false
    });
}

function initializePopupMedia(root) {
    if (!root) return;
    const mediaContainers = root.querySelectorAll('.popup-media');
    mediaContainers.forEach(container => {
        const slides = Array.from(container.querySelectorAll('.popup-media-slide'));
        const dots = Array.from(container.querySelectorAll('.popup-media-dot'));

        // Ensure any broken image falls back to an icon-only empty state.
        slides.forEach(slide => {
            const img = slide.querySelector('img');
            if (!img) return;
            if (img.dataset.fallbackBound === 'true') return;
            img.dataset.fallbackBound = 'true';
            img.addEventListener('error', () => {
                if (img.dataset.fallbackApplied === 'true') return;
                img.dataset.fallbackApplied = 'true';
                slide.innerHTML = `
                    <div class="popup-media-empty" aria-label="No images available">
                        <i class="popup-media-icon" data-lucide="image-off"></i>
                        <span>No image available</span>
                    </div>
                `;
                refreshLucideIcons(slide);
            });
        });

        if (slides.length <= 1) return;

        dots.forEach(dot => {
            if (dot.dataset.listenerAttached === 'true') return;
            dot.addEventListener('click', () => {
                const index = Number.parseInt(dot.dataset.index, 10) || 0;
                slides.forEach((slide, slideIndex) => {
                    slide.classList.toggle('active', slideIndex === index);
                });
                dots.forEach((button, dotIndex) => {
                    button.classList.toggle('active', dotIndex === index);
                });
                container.dataset.activeIndex = String(index);
            }, { once: false });
            dot.dataset.listenerAttached = 'true';
        });
    });
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', init);
