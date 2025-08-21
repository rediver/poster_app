$(document).ready(function () {
    function fetchStravaActivities() {
        console.log('🛠️ Fetching Strava activities...');
        $.get('/api/strava/activities', function (data) {
            console.log('📡 Strava activities fetched:', data);
            if (data.activities) {
                var activities = data.activities;
                var activitiesContainer = $('#strava-activities');
                activitiesContainer.empty(); // Clear previous activities

                activities.forEach(function (activity) {
                    console.log('🏃 Adding activity to list:', activity);
                    var activityItem = $('<a href="#" class="list-group-item list-group-item-action"></a>');
                    activityItem.text(activity.name + ' - ' + (activity.distance / 1000).toFixed(2) + ' km');
                    activityItem.attr('data-id', activity.id);
                    activityItem.click(function () {
                        console.log('🗺️ Activity item clicked:', activity.id);
                        downloadGPX(activity.id);
                    });
                    activitiesContainer.append(activityItem);
                });
            } else {
                console.error('❌ Failed to fetch Strava activities');
                alert('Failed to fetch Strava activities');
            }
        }).fail(function (error) {
            console.error('❌ Error fetching Strava activities:', error);
        });
    }

    function downloadGPX(activityId) {
        console.log('📥 Downloading GPX for activity ID:', activityId);
        window.location.href = '/api/strava/download_gpx/' + activityId;
    }

    // Fetch Strava activities on page load
    fetchStravaActivities();
});
