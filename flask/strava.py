import os
import io
import requests
from flask import session, jsonify, send_file
from loguru import logger
from gpx_utils import create_gpx_from_streams

STRAVA_API_BASE = "https://www.strava.com/api/v3"

def get_strava_access_token(code):
    token_url = "https://www.strava.com/oauth/token"
    payload = {
        'client_id': os.getenv('STRAVA_CLIENT_ID'),
        'client_secret': os.getenv('STRAVA_CLIENT_SECRET'),
        'code': code,
        'grant_type': 'authorization_code'
    }
    response = requests.post(token_url, data=payload)
    data = response.json()
    access_token = data.get('access_token')
    athlete = data.get('athlete')
    logger.debug(f"🔓 Access token obtained: {access_token}")
    return access_token, athlete

def get_strava_activities():
    access_token = session.get('strava_access_token')
    logger.debug(f"🗝️ Access token in session: {access_token}")
    if access_token:
        headers = {
            "Authorization": f"Bearer {access_token}"
        }
        activities_url = "https://www.strava.com/api/v3/athlete/activities"
        params = {
            'per_page': 35  # Increase this number to fetch more activities
        }
        response = requests.get(activities_url, headers=headers, params=params)
        logger.debug(f"📡 Strava response status: {response.status_code}")
        if response.status_code == 200:
            activities = response.json()
            logger.debug(f"🚴 Retrieved activities")
            # Filter activities by type
            filtered_activities = [activity for activity in activities if activity['type'] in ['Run', 'Ride', 'Walk', 'Hike']]
            logger.debug(f"🚶 Filtered activities count: {len(filtered_activities)}")
            # Enhanced logging for activities
            for activity in filtered_activities:
                logger.info({
                    "emoji": "🏃",
                    "Activity": activity['name'],
                    "Type": activity['type'],
                    "Distance": activity['distance'],
                    "Start Date": activity['start_date']
                })
            return jsonify({"activities": filtered_activities})
        else:
            logger.warning(f"⚠️ Failed to fetch activities from Strava: {response.json()}")
            return "Failed to fetch activities from Strava", response.status_code
    else:
        logger.error("❌ Not authenticated with Strava")
        return "Not authenticated with Strava", 401

def get_activity_streams(activity_id):
    """Retrieve activity streams containing lat/lon and altitude."""
    access_token = session.get('strava_access_token')
    logger.debug(f"📥 Downloading streams for activity ID: {activity_id}")
    if not access_token:
        logger.error("❌ Not authenticated with Strava")
        raise ValueError("Not authenticated with Strava")

    headers = {"Authorization": f"Bearer {access_token}"}
    url = f"{STRAVA_API_BASE}/activities/{activity_id}/streams"
    params = {"keys": "latlng,altitude", "key_by_type": "true"}
    response = requests.get(url, headers=headers, params=params)
    logger.debug(f"📡 Activity streams status: {response.status_code}")
    response.raise_for_status()
    return response.json()

def generate_gpx_response(streams, activity_id):
    if "latlng" not in streams or "altitude" not in streams:
        logger.error(
            f"GPX data missing latlng or altitude for activity ID: {activity_id}"
        )
        return "Elevation data not available", 400, {}

    latlng_stream = streams["latlng"]["data"]
    altitude_stream = streams["altitude"]["data"]

    gpx_bytes = create_gpx_from_streams(latlng_stream, altitude_stream)
    gpx_file = io.BytesIO(gpx_bytes)
    gpx_file.seek(0)
    return send_file(
        gpx_file,
        as_attachment=True,
        download_name=f"activity_{activity_id}.gpx",
    )

