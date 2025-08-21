document.addEventListener('DOMContentLoaded', () => {
    const mapContainer = document.getElementById('map-container');
    const mapElement = document.getElementById('map');
    const elevationContainer = document.getElementById('elevation-chart');
    const lineStyleSelector = document.getElementById('line-style');
    const applyStyleButton = document.getElementById('apply-style');

    const posterTitleInput = document.getElementById('poster-title');
    const posterSubtitleInput = document.getElementById('poster-subtitle');
    const posterDescriptionInput = document.getElementById('poster-description');

    const posterTitleText = document.getElementById('poster-title-text');
    const posterSubtitleText = document.getElementById('poster-subtitle-text');
    const posterDescriptionText = document.getElementById('poster-description-text');

    const toggleOrientationButton = document.getElementById('toggle-orientation');
    const posterStyleSelector = document.getElementById('poster-style');
    const fontSelector = document.getElementById('font-selector');
    const fontSizeSelector = document.getElementById('font-size-selector');

    const poster = document.getElementById('poster');

    mapboxgl.accessToken = mapboxToken;
    let map, geojson, validCoords;

    function initializeMap() {
        map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/streets-v11',
            center: [0, 0],
            zoom: 8,
            preserveDrawingBuffer: true, // allow canvas readback for export
            antialias: true
        });
        return map;
    }

    function loadGPX(activityId) {
        console.log('📥 Loading GPX for activity ID:', activityId);
        fetch(`/api/strava/download_gpx/${activityId}`)
            .then(response => response.text())
            .then(gpxData => {
                console.log('🗺️ GPX data loaded:', gpxData);
                initializeMap();

                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(gpxData, "application/xml");
                const coords = Array.from(xmlDoc.getElementsByTagName('trkpt')).map(pt => [
                    parseFloat(pt.getAttribute('lon')),
                    parseFloat(pt.getAttribute('lat'))
                ]);
                const elevations = Array.from(xmlDoc.getElementsByTagName('trkpt')).map(pt => 
                    parseFloat(pt.getElementsByTagName('ele')[0].textContent)
                );

                validCoords = coords.filter(coord => !isNaN(coord[0]) && !isNaN(coord[1]));
                const validElevations = elevations.filter(elev => !isNaN(elev));

                if (validCoords.length === 0 || validElevations.length === 0) {
                    throw new Error('No valid coordinates or elevations found in GPX data.');
                }

                geojson = {
                    'type': 'Feature',
                    'geometry': {
                        'type': 'LineString',
                        'coordinates': validCoords
                    }
                };

                map.on('load', () => {
                    console.log('🗺️ Map loaded, adding GPX track.');
                    map.addSource('route', {
                        'type': 'geojson',
                        'data': geojson
                    });

                    map.addLayer({
                        'id': 'route',
                        'type': 'line',
                        'source': 'route',
                        'layout': {
                            'line-join': 'round',
                            'line-cap': 'round'
                        },
                        'paint': {
                            'line-color': '#ff0000',
                            'line-width': 10
                        }
                    });

                    if (validCoords.length) {
                        const bounds = validCoords.reduce((bounds, coord) => bounds.extend(coord), new mapboxgl.LngLatBounds(validCoords[0], validCoords[0]));
                        map.fitBounds(bounds, {
                            padding: 20,
                            maxZoom: 15,
                            duration: 1000
                        });
                    }

                    applyStyleButton.addEventListener('click', () => {
                        const selectedStyle = lineStyleSelector.value;
                        console.log('🎨 Applying selected style:', selectedStyle);
                        const styleProps = selectedStyle.split(';').map(prop => prop.split(':').map(item => item.trim()));
                        const styleDict = Object.fromEntries(styleProps);

                        map.setPaintProperty('route', 'line-color', styleDict['line-color']);
                        map.setPaintProperty('route', 'line-width', parseFloat(styleDict['line-width']));
                    });

                    posterStyleSelector.addEventListener('change', () => {
                        const selectedStyle = posterStyleSelector.value;
                        console.log('🎨 Applying poster style:', selectedStyle);
                        applyPosterStyle(selectedStyle, mapElement, poster, validCoords);
                    });

                    drawElevationChart(validElevations);
                });
            })
            .catch(error => console.error('❌ Error loading GPX:', error));
    }

    function drawElevationChart(altitudeData) {
        const ctx = elevationContainer.getContext('2d');
        if (!ctx) {
            console.error('❌ Failed to acquire context for elevation chart');
            return;
        }
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: altitudeData.map((_, i) => i),  // Assuming each point is 1 unit apart
                datasets: [{
                    label: 'Elevation',
                    data: altitudeData,
                    fill: false,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    tension: 0.1
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Elevation (m)'
                        }
                    }
                }
            }
        });
    }

    function updatePosterText() {
        posterTitleText.textContent = posterTitleInput.value;
        posterSubtitleText.textContent = posterSubtitleInput.value;
        posterDescriptionText.textContent = posterDescriptionInput.value;
        console.log('🔄 Poster text updated:', {
            title: posterTitleText.textContent,
            subtitle: posterSubtitleText.textContent,
            description: posterDescriptionText.textContent
        });
    }

    posterTitleInput.addEventListener('input', updatePosterText);
    posterSubtitleInput.addEventListener('input', updatePosterText);
    posterDescriptionInput.addEventListener('input', updatePosterText);

    function toggleOrientation() {
        console.log('↔️ Toggling orientation');
        if (mapContainer.classList.contains('vertical-orientation')) {
            mapContainer.classList.remove('vertical-orientation');
            mapContainer.classList.add('horizontal-orientation');
            console.log('🟦 Switched to horizontal orientation');
        } else {
            mapContainer.classList.remove('horizontal-orientation');
            mapContainer.classList.add('vertical-orientation');
            console.log('🟩 Switched to vertical orientation');
        }
        // Resize the map after orientation change
        mapElement.style.width = '100%';
        mapElement.style.height = '100%';
        map.resize();
        // Redraw GPX track if not in 'map' style
        if (posterStyleSelector.value !== 'map') {
            drawGPXTrack(mapElement, poster, validCoords);
        }
    }

    toggleOrientationButton.addEventListener('click', toggleOrientation);

    fontSelector.addEventListener('change', () => {
        const selectedFont = fontSelector.value;
        applyFontStyle(selectedFont, posterTitleText, posterSubtitleText, posterDescriptionText);
    });

    fontSizeSelector.addEventListener('change', () => {
        const selectedSize = fontSizeSelector.value;
        applyFontSize(selectedSize, posterTitleText, posterSubtitleText, posterDescriptionText);
    });

    // Preview helpers to reflect server-side options on screen
    const bgTypeEl = document.getElementById('bg-type');
    const bgColorEl = document.getElementById('bg-color');
    const blurEl = document.getElementById('blur-radius');
    const monoEl = document.getElementById('mono-toggle');
    const bgImageEl = document.getElementById('bg-image');
    const bgImgPreview = document.getElementById('bg-image-preview');
    const tintOverlay = document.getElementById('tint-overlay');

    function applyPreview() {
        const type = bgTypeEl ? bgTypeEl.value : 'map';
        const color = bgColorEl ? bgColorEl.value : '#111111';
        const blur = blurEl ? parseInt(blurEl.value || '0', 10) : 0;
        const mono = monoEl ? monoEl.checked : false;

        // Reset
        poster.style.background = 'transparent';
        bgImgPreview.style.display = 'none';
        tintOverlay.style.display = 'none';
        mapElement.style.display = 'none';

        if (type === 'solid') {
            poster.style.background = color;
        } else if (type === 'image') {
            // If a new file is chosen, load it; otherwise keep current src
            if (bgImageEl && bgImageEl.files && bgImageEl.files[0]) {
                const reader = new FileReader();
                reader.onload = () => {
                    bgImgPreview.src = reader.result;
                    bgImgPreview.style.display = 'block';
                    applyFilters();
                };
                reader.readAsDataURL(bgImageEl.files[0]);
            } else if (bgImgPreview.src) {
                bgImgPreview.style.display = 'block';
            }
        } else {
            // Map
            mapElement.style.display = 'block';
        }

        function applyFilters() {
            const filterStr = blur > 0 ? `blur(${blur}px)` : 'none';
            if (type === 'map') {
                mapElement.style.filter = filterStr;
            } else if (type === 'image') {
                bgImgPreview.style.filter = filterStr;
            }
            if (mono) {
                // Grayscale base and apply tint overlay with chosen color
                if (type === 'map') {
                    mapElement.style.filter = `${filterStr} grayscale(1)`;
                } else if (type === 'image') {
                    bgImgPreview.style.filter = `${filterStr} grayscale(1)`;
                }
                tintOverlay.style.display = 'block';
                tintOverlay.style.backgroundColor = color;
            }
        }
        applyFilters();
    }

    // Wire events
    if (bgTypeEl) bgTypeEl.addEventListener('change', applyPreview);
    if (bgColorEl) bgColorEl.addEventListener('input', applyPreview);
    if (blurEl) blurEl.addEventListener('input', applyPreview);
    if (monoEl) monoEl.addEventListener('change', applyPreview);
    if (bgImageEl) bgImageEl.addEventListener('change', applyPreview);

    // Export helpers
    async function capturePoster(highScale = 3) {
        // Use html2canvas to render the poster at higher scale for quality
        const posterEl = document.getElementById('poster');
        const canvas = await html2canvas(posterEl, {
            scale: highScale,
            backgroundColor: '#ffffff',
            useCORS: true,
            windowWidth: document.documentElement.scrollWidth,
            windowHeight: document.documentElement.scrollHeight
        });
        return canvas;
    }

    async function exportPoster(format) {
        // If "map" style is active, snapshot the Mapbox canvas and temporarily replace it with an <img>
        let snapshotImg = null;
        try {
            if (posterStyleSelector && posterStyleSelector.value === 'map' && map && typeof map.getCanvas === 'function') {
                try {
                    const mapCanvas = map.getCanvas();
                    const dataURL = mapCanvas.toDataURL('image/png');
                    snapshotImg = document.createElement('img');
                    snapshotImg.src = dataURL;
                    snapshotImg.style.position = 'absolute';
                    snapshotImg.style.top = '0';
                    snapshotImg.style.left = '0';
                    snapshotImg.style.width = '100%';
                    snapshotImg.style.height = '100%';
                    // Hide the live map canvas to avoid WebGL capture issues
                    mapCanvas.style.visibility = 'hidden';
                    mapElement.appendChild(snapshotImg);
                } catch (snapErr) {
                    console.warn('⚠️ Could not snapshot Mapbox canvas, proceeding without map background:', snapErr);
                }
            }

            const canvas = await capturePoster(3);
            const dataUrl = canvas.toDataURL('image/png');
            const filenameBase = (posterTitleInput.value || 'poster').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'poster';
            const res = await fetch('/api/export_poster', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_data: dataUrl, format: format, filename: filenameBase })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Export failed');
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = format === 'pdf' ? `${filenameBase}.pdf` : `${filenameBase}_300dpi_cmyk.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('❌ Export error:', e);
            alert('Failed to export poster: ' + e.message);
        } finally {
            // Restore the live map
            if (snapshotImg) {
                try {
                    const mapCanvas = map.getCanvas();
                    mapElement.removeChild(snapshotImg);
                    mapCanvas.style.visibility = '';
                } catch (restoreErr) {
                    console.warn('⚠️ Could not restore map canvas visibility:', restoreErr);
                }
            }
        }
    }

    document.getElementById('export-pdf').addEventListener('click', () => exportPoster('pdf'));
    document.getElementById('export-cmyk').addEventListener('click', () => exportPoster('cmyk_png'));

    // Server-side composition triggers
    async function composePoster(format) {
        try {
            // Read background options
            const bgType = document.getElementById('bg-type').value;
            const bgColor = document.getElementById('bg-color').value;
            const blurRadius = parseInt(document.getElementById('blur-radius').value || '0', 10);
            const monoToggle = document.getElementById('mono-toggle').checked;

            // If image background selected, read file as data URL
            let bgImageData = null;
            if (bgType === 'image') {
                const fileInput = document.getElementById('bg-image');
                if (fileInput.files && fileInput.files[0]) {
                    bgImageData = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(fileInput.files[0]);
                    });
                }
            }

            const body = {
                activity_id: activityId,
                title: posterTitleInput.value,
                subtitle: posterSubtitleInput.value,
                description: posterDescriptionInput.value,
                width_px: 3508, // A3 portrait @ 300dpi
                height_px: 4961, // A3 portrait @ 300dpi
                line_color: '#ffeb3b',
                line_width: 8,
                format: format,
                filename: (posterTitleInput.value || 'poster').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'poster',
                background_type: bgType,
                solid_color: bgColor,
                blur_radius: blurRadius,
                monochrome: monoToggle,
                mono_color: bgColor,
                background_image_data: bgImageData
            };
            const res = await fetch('/api/export_poster_composed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Compose failed');
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = format === 'pdf' ? `${body.filename}.pdf` : `${body.filename}_300dpi_cmyk.tiff`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('❌ Compose error:', e);
            alert('Failed to compose poster on server: ' + e.message);
        }
    }

    document.getElementById('compose-pdf').addEventListener('click', () => composePoster('pdf'));
    document.getElementById('compose-cmyk').addEventListener('click', () => composePoster('cmyk_tiff'));

    // Save flow: store on server and redirect to confirmation view
    async function savePoster() {
        try {
            console.log('💾 Save poster clicked');
            const bgType = document.getElementById('bg-type').value;
            const bgColor = document.getElementById('bg-color').value;
            const blurRadius = parseInt(document.getElementById('blur-radius').value || '0', 10);
            const monoToggle = document.getElementById('mono-toggle').checked;
            let bgImageData = null;
            if (bgType === 'image') {
                const fileInput = document.getElementById('bg-image');
                if (fileInput.files && fileInput.files[0]) {
                    bgImageData = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(fileInput.files[0]);
                    });
                }
            }
            const body = {
                activity_id: activityId,
                title: posterTitleInput.value,
                subtitle: posterSubtitleInput.value,
                description: posterDescriptionInput.value,
                width_px: 3508,
                height_px: 4961,
                line_color: '#ffeb3b',
                line_width: 8,
                background_type: bgType,
                solid_color: bgColor,
                blur_radius: blurRadius,
                monochrome: monoToggle,
                mono_color: bgColor,
                background_image_data: bgImageData
            };
            console.log('➡️ POST /save_poster_composed', body);
            const res = await fetch('/api/save_poster_composed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            let data;
            try {
                data = await res.json();
            } catch (e) {
                const text = await res.text();
                console.error('❌ Non-JSON response:', text);
                throw new Error('Save failed (non-JSON response)');
            }
            console.log('⬅️ Save response', res.status, data);
            if (!res.ok) throw new Error(data.error || 'Save failed');
            if (data.confirm_url) {
                console.log('🔀 Redirecting to confirm URL:', data.confirm_url);
                window.location.href = data.confirm_url;
            } else {
                alert('Saved, but no confirmation URL returned.');
            }
        } catch (e) {
            console.error('❌ Save error:', e);
            alert('Failed to save poster: ' + e.message);
        }
    }
    const saveBtn = document.getElementById('save-poster');
    if (saveBtn) saveBtn.addEventListener('click', savePoster);

    loadGPX(activityId);

    // Initial orientation setup
    mapContainer.classList.add('vertical-orientation');

    // Apply initial preview reflecting defaults
    applyPreview();
});
