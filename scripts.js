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
    controlsCollapsed: true
};

// DOM elements
const elements = {
    loading: document.getElementById('loading'),
    map: document.getElementById('map'),
    siteCount: document.getElementById('site-count'),
    yearSlider: document.getElementById('year-slider'),
    totalSites: document.getElementById('total-sites'),
    progressPercent: document.getElementById('progress-percent'),
    filterButtons: document.querySelectorAll('.filter-btn'),
    toggleControls: document.getElementById('toggle-controls'),
    controlsPanel: document.getElementById('controls'),
    expandedControls: document.getElementById('expanded-controls'),
    sliderBubble: document.getElementById('slider-bubble'),
    sliderStart: document.getElementById('slider-start'),
    sliderEnd: document.getElementById('slider-end')
};

const mapState = {
    map: null,
    markers: [],
    forceFitBounds: true,
    userHasAdjusted: false,
    isAutoFitting: false
};

function requestFitBounds() {
    mapState.forceFitBounds = true;
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
            requestFitBounds();
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
        const functionUrl = 'https://faas-nyc1-2ef2e6cc.doserverless.co/api/v1/web/fn-64bcf502-3460-4418-ae12-fed42467b800/default/wikidata-proxy';
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

        return {
            id,
            name: site.label || site.name || 'Unknown Site',
            country: countries.length > 0 ? countries.join(', ') : 'Unknown',
            countries,
            latitude,
            longitude,
            inscriptionYear: inscriptionYearValue ?? 1978,
            type,
            criteria,
            description: site.description || 'UNESCO World Heritage Site',
            officialUrl: site.unescoUrl || site.officialUrl || ''
        };
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
        return yearMatch && typeMatch;
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
        (state.selectedType === 'all' || site.type === state.selectedType)
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
        all: state.sites.filter(s => s.inscriptionYear <= state.selectedYear).length,
        cultural: state.sites.filter(s => s.type === 'cultural' && s.inscriptionYear <= state.selectedYear).length,
        natural: state.sites.filter(s => s.type === 'natural' && s.inscriptionYear <= state.selectedYear).length,
        mixed: state.sites.filter(s => s.type === 'mixed' && s.inscriptionYear <= state.selectedYear).length
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
    
    // Create map
    mapState.map = L.map('map').setView([20, 0], 2);

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
    
    // Update map with sites
    updateMap();
}

// Update map with current filtered sites
function updateMap() {
    if (!mapState.map) return;
    
    // Clear existing markers
    mapState.markers.forEach(marker => mapState.map.removeLayer(marker));
    mapState.markers = [];
    
    // Add new markers
    state.filteredSites.forEach(site => {
        const icon = createIcon(site.type);
        
        const marker = L.marker([site.latitude, site.longitude], { icon })
            .addTo(mapState.map)
            .bindPopup(`
                <div style="padding: 8px; width: 288px; max-height: 320px; overflow-y: auto; background: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); font-size: 12px; line-height: 1.4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                    <h3 style="font-weight: bold; color: #000000; margin: 0 0 4px 0;">${site.name}</h3>
                    <p style="color: #000000; margin: 4px 0;"><strong>Country:</strong> ${site.country}</p>
                    <p style="color: #000000; margin: 4px 0;"><strong>Inscribed:</strong> ${site.inscriptionYear}</p>
                    <p style="color: #000000; margin: 8px 0;">${site.description}</p>
                    <a 
                        href="${site.officialUrl}" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style="color: #10B981; text-decoration: underline; font-size: 11px;"
                    >
                        View on UNESCO →
                    </a>
                </div>
            `);

        marker.on('mouseover', function() {
            marker.bindTooltip(`<strong>${site.name}</strong>`, {
                permanent: false,
                direction: 'top',
                className: 'tooltip-popup',
                offset: [0, -10],
            }).openTooltip();
        });

        marker.on('mouseout', () => marker.closeTooltip());
        
        mapState.markers.push(marker);
    });
    
    // Fit bounds if we have sites
    const shouldAutoFit = mapState.markers.length > 0 && mapState.forceFitBounds;
    if (shouldAutoFit) {
        mapState.isAutoFitting = true;
        mapState.map.once('moveend', () => {
            mapState.isAutoFitting = false;
        });
        const group = L.featureGroup(mapState.markers);
        mapState.map.fitBounds(group.getBounds(), { padding: [50, 50] });
    }
    mapState.forceFitBounds = false;
}

// Create custom icons
function createIcon(type) {
    const colors = {
        cultural: '#8B5CF6', // violet
        natural: '#10B981',  // emerald
        mixed: '#F59E0B'     // amber
    };
    
    const svgIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42" fill="none">
            <path d="M16 0L32 16V42H0V16L16 0Z" fill="${colors[type]}" stroke="#030213" stroke-width="1"/>
            <circle cx="16" cy="20" r="4" fill="white"/>
            ${type === 'cultural' ? '<path d="M14 24H18V28H14V24Z" fill="#030213"/>' : ''}
            ${type === 'natural' ? '<path d="M14 24L16 20L18 24H14Z" fill="#030213"/>' : ''}
            ${type === 'mixed' ? '<path d="M14 24L16 20L18 24H14Z M14 28H18V32H14V28Z" fill="#030213"/>' : ''}
        </svg>
    `;
    
    return L.divIcon({
        html: svgIcon,
        iconSize: [32, 42],
        iconAnchor: [16, 42],
        popupAnchor: [0, -42],
        className: 'custom-heritage-marker',
    });
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', init);
