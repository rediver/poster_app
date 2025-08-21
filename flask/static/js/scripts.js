document.addEventListener('DOMContentLoaded', () => {
    const fetchActivitiesButton = document.getElementById('fetch-activities');
    const logoutButton = document.getElementById('logout-button');
    const activitiesList = document.getElementById('activities-list');
    const mapContainer = document.getElementById('map-container');

    mapboxgl.accessToken = mapboxToken;

    fetchActivitiesButton.addEventListener('click', () => {
        console.log('🛠️ Fetch Activities button clicked');
        fetch('/strava/activities')
            .then(response => {
                console.log('📡 Fetching activities:', response);
                return response.json();
            })
            .then(data => {
                activitiesList.innerHTML = '';
                data.activities.forEach(activity => {
                    console.log('🏃 Adding activity to list:', activity);
                    const listItem = document.createElement('li');
                    listItem.classList.add('activity-item');

                    const link = document.createElement('a');
                    link.href = "#";
                    link.textContent = `${activity.type}: ${activity.name} - ${(activity.distance / 1000).toFixed(2)} km`;
                    link.classList.add('activity-link');
                    link.addEventListener('click', (event) => {
                        event.preventDefault();
                        console.log('🗺️ Activity link clicked:', activity.id);
                        loadGPX(activity.id);
                        mapContainer.style.display = 'block';
                    });
                    listItem.appendChild(link);

                    const detailButton = document.createElement('a');
                    detailButton.href = `/activity/${activity.id}`;
                    detailButton.textContent = " ->";
                    detailButton.classList.add('button', 'is-small', 'is-info', 'ml-2');
                    listItem.appendChild(detailButton);

                    activitiesList.appendChild(listItem);
                });
            })
            .catch(error => console.error('❌ Error fetching activities:', error));
    });

    logoutButton.addEventListener('click', () => {
        console.log('🚪 Logout button clicked');
        fetch('/logout', { method: 'POST' })
            .then(response => {
                console.log('📡 Logout response:', response);
                if (response.redirected) {
                    window.location.href = response.url;
                } else {
                    console.error('❌ Logout failed:', response);
                }
            })
            .catch(error => console.error('❌ Error during logout:', error));
    });

    function loadGPX(activityId) {
        console.log('📥 Loading GPX for activity ID:', activityId);
        fetch(`/strava/download_gpx/${activityId}`)
            .then(response => response.text())
            .then(gpxData => {
                console.log('🗺️ GPX data loaded:', gpxData);
                const mapElement = document.getElementById('map');
                mapElement.innerHTML = '';
                const map = new mapboxgl.Map({
                    container: 'map',
                    style: 'mapbox://styles/mapbox/streets-v11',
                    center: [0, 0],
                    zoom: 8
                });

                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(gpxData, "application/xml");
                const coords = Array.from(xmlDoc.getElementsByTagName('trkpt')).map(pt => [
                    parseFloat(pt.getAttribute('lon')),
                    parseFloat(pt.getAttribute('lat'))
                ]);

                const geojson = {
                    'type': 'Feature',
                    'geometry': {
                        'type': 'LineString',
                        'coordinates': coords
                    }
                };

                map.on('load', () => {
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
                            'line-width': 5
                        }
                    });

                    if (coords.length) {
                        const bounds = coords.reduce((bounds, coord) => bounds.extend(coord), new mapboxgl.LngLatBounds(coords[0], coords[0]));
                        map.fitBounds(bounds, {
                            padding: 20,
                            maxZoom: 15,
                            duration: 1000
                        });
                    }
                });
            })
            .catch(error => console.error('❌ Error loading GPX:', error));
    }

    // Hide map container initially
    mapContainer.style.display = 'none';
});
