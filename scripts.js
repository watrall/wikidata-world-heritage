// App state
const state = {
    sites: [],
    filteredSites: [],
    selectedYear: new Date().getFullYear(),
    selectedType: 'all',
    loading: true,
    error: null
};

// DOM elements
const elements = {
    loading: document.getElementById('loading'),
    map: document.getElementById('map'),
    siteCount: document.getElementById('site-count'),
    selectedYear: document.getElementById('selected-year'),
    yearSlider: document.getElementById('year-slider'),
    currentYear: document.getElementById('current-year'),
    totalSites: document.getElementById('total-sites'),
    progressPercent: document.getElementById('progress-percent'),
    filterButtons: document.querySelectorAll('.filter-btn')
};

// Initialize the app
async function init() {
    console.log('Initializing app...');
    
    // Set current year
    elements.currentYear.textContent = state.selectedYear;
    elements.yearSlider.value = state.selectedYear;
    elements.yearSlider.max = state.selectedYear;
    
    // Add event listeners
    setupEventListeners();
    
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
        elements.selectedYear.textContent = state.selectedYear;
        updateProgress();
        filterSites();
        updateMap();
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
}

// Load UNESCO sites from DigitalOcean Function
async function loadSites() {
    try {
        console.log('Loading sites from DigitalOcean Function...');
        
        // Use your actual DigitalOcean function URL
        const functionUrl = 'https://faas-nyc1-2ef2e6cc.doserverless.co/api/v1/web/fn-64bcf502-3460-4418-ae12-fed42467b800/default/wikidata-proxy';
        
        // Correct query using Q2039348 (UNESCO World Heritage Site) with coordinates
        const query = `
SELECT ?item ?itemLabel ?country ?coordinate ?inscriptionYear WHERE {
  ?item wdt:P31/wdt:P279* wd:Q2039348.
  ?item wdt:P625 ?coordinate.
  ?item rdfs:label ?itemLabel.
  FILTER(LANG(?itemLabel) = "en")
  OPTIONAL { ?item wdt:P17 ?countryItem. ?countryItem rdfs:label ?country. FILTER(LANG(?country) = "en") }
  OPTIONAL { ?item wdt:P575 ?inscribed. BIND(YEAR(?inscribed) AS ?inscriptionYear) }
  FILTER (?inscriptionYear >= 1978)
}
ORDER BY ?inscriptionYear
LIMIT 300
`;
        
        // Encode the query and make the request
        const fullUrl = `${functionUrl}?query=${encodeURIComponent(query)}`;
        
        console.log('Fetching from function:', fullUrl);
        
        const response = await fetch(fullUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Function returned:', data);
        
        if (!data.results || !data.results.bindings) {
            throw new Error('Invalid data structure returned from function');
        }
        
        processSitesData(data);
        
    } catch (error) {
        console.error('Error loading sites from function:', error);
        // Fallback to test data
        loadTestSites();
    }
}

// Process the sites data
function processSitesData(data) {
    console.log('Processing sites ', data);
    
    if (!data.results || !data.results.bindings) {
        throw new Error('Invalid data structure');
    }
    
    console.log('Number of results:', data.results.bindings.length);
    
    state.sites = data.results.bindings.map(item => {
        // Parse coordinates from Point format
        let latitude = 0;
        let longitude = 0;
        
        if (item.coordinate?.value) {
            // Extract from Point(123.456 78.901) format
            const coordMatch = item.coordinate.value.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/);
            if (coordMatch) {
                longitude = parseFloat(coordMatch[1]);
                latitude = parseFloat(coordMatch[2]);
            }
        }
        
        // Get inscription year (default to 1978 if not available)
        let inscriptionYear = 1978;
        if (item.inscriptionYear?.value) {
            inscriptionYear = parseInt(item.inscriptionYear.value);
        }
        
        return {
            id: item.item?.value ? item.item.value.split('/').pop() : 'unknown',
            name: item.itemLabel?.value || 'Unknown Site',
            country: item.country?.value || 'Unknown',
            latitude: latitude,
            longitude: longitude,
            inscriptionYear: inscriptionYear,
            type: 'cultural', // Default for now
            description: 'UNESCO World Heritage Site',
            officialUrl: ''
        };
    }).filter(site => 
        site.latitude && 
        site.longitude && 
        !isNaN(site.latitude) && 
        !isNaN(site.longitude) &&
        site.latitude >= -90 && 
        site.latitude <= 90 &&
        site.longitude >= -180 && 
        site.longitude <= 180
    );
    
    console.log('Processed valid sites:', state.sites.length);
    
    // Filter sites initially
    filterSites();
    updateCounts();
    updateProgress();
    
    state.loading = false;
    hideLoading();
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
    
    elements.siteCount.innerHTML = `Showing <strong>${state.filteredSites.length}</strong> sites${state.selectedYear < new Date().getFullYear() ? ` up to ${state.selectedYear}` : ''}`;
}

// Update progress percentage
function updateProgress() {
    const minYear = 1978;
    const maxYear = new Date().getFullYear();
    const percent = Math.round(((state.selectedYear - minYear) / (maxYear - minYear)) * 100);
    elements.progressPercent.textContent = `${percent}% through time`;
    elements.totalSites.textContent = `${state.sites.length} total sites`;
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

// Map initialization
let map;
let markers = [];

function initMap() {
    console.log('Initializing map...');
    
    // Create map
    map = L.map('map').setView([20, 0], 2);
    
    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    
    // Update map with sites
    updateMap();
}

// Update map with current filtered sites
function updateMap() {
    if (!map) return;
    
    // Clear existing markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    
    // Add new markers
    state.filteredSites.forEach(site => {
        const icon = createIcon(site.type);
        
        const marker = L.marker([site.latitude, site.longitude], { icon })
            .addTo(map)
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
        
        markers.push(marker);
    });
    
    // Fit bounds if we have sites
    if (state.filteredSites.length > 0) {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds(), { padding: [50, 50] });
    }
}

// Create custom icons
function createIcon(type) {
    const colorMap = {
        cultural: '#8B5CF6', // violet
        natural: '#10B981',  // emerald
        mixed: '#F59E0B'     // amber
    };
    
    const svgIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42" fill="none">
            <path d="M16 0L32 16V42H0V16L16 0Z" fill="${colorMap[type] || '#8B5CF6'}" stroke="oklch(0.145 0 0)" stroke-width="1"/>
            <circle cx="16" cy="20" r="4" fill="white"/>
            ${type === 'cultural' ? '<path d="M14 24H18V28H14V24Z" fill="oklch(0.145 0 0)"/>' : ''}
            ${type === 'natural' ? '<path d="M14 24L16 20L18 24H14Z" fill="oklch(0.145 0 0)"/>' : ''}
            ${type === 'mixed' ? '<path d="M14 24L16 20L18 24H14Z M14 28H18V32H14V28Z" fill="oklch(0.145 0 0)"/>' : ''}
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