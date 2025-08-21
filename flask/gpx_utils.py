import xml.etree.ElementTree as ET
from loguru import logger

def create_gpx(activity):
    gpx = ET.Element("gpx", version="1.1", creator="Strava API")
    trk = ET.SubElement(gpx, "trk")
    name = ET.SubElement(trk, "name")
    name.text = activity.get('name', 'Unnamed Activity')
    trkseg = ET.SubElement(trk, "trkseg")

    polyline = activity.get('map', {}).get('summary_polyline', '')
    if polyline:
        for point in decode_polyline(polyline):
            lat, lon = point
            trkpt = ET.SubElement(trkseg, "trkpt", lat=str(lat), lon=str(lon))
            ET.SubElement(trkpt, "ele").text = "0"  # Defaulting to 0, adjust if elevation data is available
            ET.SubElement(trkpt, "time").text = activity.get('start_date', '')

    gpx_data = ET.tostring(gpx, encoding='utf8').decode('utf8')
    logger.debug(f"📝 Created GPX data: {gpx_data[:100]}...")  # Log the beginning of the GPX data for brevity
    return gpx_data

def create_gpx_from_streams(latlng_stream, altitude_stream):
    """Generate GPX bytes from lat/lon and altitude streams."""
    gpx = ET.Element("gpx", version="1.1", creator="Strava Streams")
    trk = ET.SubElement(gpx, "trk")
    trkseg = ET.SubElement(trk, "trkseg")

    for (lat, lon), ele in zip(latlng_stream, altitude_stream):
        trkpt = ET.SubElement(trkseg, "trkpt", lat=str(lat), lon=str(lon))
        ET.SubElement(trkpt, "ele").text = str(ele)

    gpx_data = ET.tostring(gpx, encoding="utf-8")
    logger.debug("📝 Created GPX data from streams")
    return gpx_data

def decode_polyline(polyline_str):
    index, lat, lng, points = 0, 0, 0, []
    while index < len(polyline_str):
        shift, result = 0, 0
        while True:
            b = ord(polyline_str[index]) - 63
            index += 1
            result |= (b & 0x1f) << shift
            shift += 5
            if b < 0x20:
                break
        dlat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += dlat

        shift, result = 0, 0
        while True:
            b = ord(polyline_str[index]) - 63
            index += 1
            result |= (b & 0x1f) << shift
            shift += 5
            if b < 0x20:
                break
        dlng = ~(result >> 1) if (result & 1) else (result >> 1)
        lng += dlng

        points.append((lat / 1e5, lng / 1e5))
    return points
