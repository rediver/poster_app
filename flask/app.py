from flask import Flask, redirect, request, session, url_for, jsonify, send_file
import os
import io
import base64
import math
import requests
import psycopg2
import json
from datetime import datetime
from dotenv import load_dotenv
from loguru import logger
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps
from werkzeug.utils import secure_filename
from flask_cors import CORS
from strava import (
    get_strava_access_token,
    get_strava_activities,
    get_activity_streams,
    generate_gpx_response,
    get_activity_details,
)

load_dotenv()  # Ensure this is called to load the environment variables

app = Flask(__name__)
app.secret_key = os.urandom(24)

SHOPIFY_API_KEY = os.getenv("SHOPIFY_API_KEY")
SHOPIFY_API_SECRET = os.getenv("SHOPIFY_API_SECRET")
SHOPIFY_SCOPES = os.getenv("SHOPIFY_SCOPES")
SHOPIFY_SHOP_URL = os.getenv("SHOPIFY_SHOP_URL")
STRAVA_CLIENT_ID = os.getenv("STRAVA_CLIENT_ID")
STRAVA_CLIENT_SECRET = os.getenv("STRAVA_CLIENT_SECRET")
STRAVA_REDIRECT_URI = os.getenv("STRAVA_REDIRECT_URI")
MAPBOX_ACCESS_TOKEN = os.getenv("MAPBOX_ACCESS_TOKEN")
DATABASE_URL = os.getenv("DATABASE_URL")  # e.g. postgres://user:pass@host:5432/db
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# Enable CORS for the frontend, allowing cookies (session) to be sent
CORS(
    app,
    supports_credentials=True,
    resources={r"/api/*": {"origins": [FRONTEND_URL]}},
)

# Configure loguru logger to use JSON format
logger.add("debug.log", format="{time} {level} {message}", level="DEBUG", serialize=True)

# Ensure generated directory exists
GENERATED_DIR = os.path.join(os.path.dirname(__file__), 'generated')
os.makedirs(GENERATED_DIR, exist_ok=True)

# DB helpers
conn = None
if DATABASE_URL:
    try:
        conn = psycopg2.connect(DATABASE_URL)
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS posters (
                    id SERIAL PRIMARY KEY,
                    user_name TEXT,
                    user_id TEXT,
                    activity_id TEXT,
                    params JSONB,
                    image_path TEXT,
                    created_at TIMESTAMP DEFAULT NOW()
                )
                """
            )
            conn.commit()
    except Exception as e:
        logger.error(f"Failed to connect/init DB: {e}")
else:
    logger.warning("DATABASE_URL not set; admin features disabled")

@app.route('/', methods=['GET'])
def root():
    # API-only mode: frontend is a separate React app
    return ("", 204)

# Silence favicon requests to avoid noisy logs
@app.route('/favicon.ico')
def favicon():
    return ("", 204)

@app.route('/api/auth/strava')
def auth_strava():
    logger.debug("🔐 Redirecting to Strava authorization URL...")
    auth_url = (f"https://www.strava.com/oauth/authorize?client_id={STRAVA_CLIENT_ID}"
                f"&response_type=code&redirect_uri={url_for('strava_callback', _external=True)}"
                f"&scope=read,activity:read")
    return redirect(auth_url)

@app.route('/api/auth/strava/callback')
def strava_callback():
    code = request.args.get('code')
    logger.debug(f"🔑 Received code from Strava: {code}")
    if code:
        access_token, athlete = get_strava_access_token(code)
        logger.debug(f"🔓 Access token obtained: {access_token}")
        session['strava_access_token'] = access_token
        if athlete:
            session['athlete'] = {
                'id': athlete.get('id'),
                'username': athlete.get('username') or athlete.get('firstname') or 'unknown'
            }
        # After successful auth, redirect back to frontend, which can then fetch data via API
        redirect_url = os.getenv("FRONTEND_URL", FRONTEND_URL)
        # Add a hash so the SPA can detect auth success
        return redirect(f"{redirect_url}#strava=authenticated")
    return "Authentication failed", 400

@app.route('/api/strava/activities')
def activities():
    try:
        logger.debug("Fetching activities from Strava.")
        activities_response = get_strava_activities()
        logger.debug(f"Activities fetched: {activities_response}")
        return activities_response
    except Exception as e:
        logger.error(f"Error fetching activities: {e}")
        return jsonify({'error': 'Failed to fetch activities from Strava'}), 500

@app.route('/api/strava/download_gpx/<activity_id>')
def download_gpx(activity_id):
    try:
        streams = get_activity_streams(activity_id)
        return generate_gpx_response(streams, activity_id)
    except Exception as e:
        logger.error(f"Error downloading GPX for activity ID {activity_id}: {e}")
        return jsonify({'error': 'Failed to download GPX'}), 500


@app.route('/api/logout', methods=['POST'])
def logout():
    logger.debug(f"🔍 Before clearing session: {session}")
    session.clear()
    logger.debug("🧹 Session cleared. Logged out.")
    logger.debug(f"🔍 After clearing session: {session}")
    return ("", 204)

@app.route('/api/export_poster', methods=['POST'])
def export_poster():
    """
    Accepts JSON payload with fields:
      - image_data: data URL (e.g., data:image/png;base64,....)
      - format: "pdf" or "cmyk_png"
      - filename: optional base filename without extension
    Returns the requested file.
    """
    try:
        data = request.get_json(force=True)
        image_data_url = data.get('image_data')
        export_format = data.get('format', 'pdf')
        base_filename = data.get('filename', 'poster')

        if not image_data_url or not image_data_url.startswith('data:image'):
            return jsonify({"error": "Invalid or missing image_data"}), 400

        # Extract base64 payload
        header, b64data = image_data_url.split(',', 1)
        image_bytes = base64.b64decode(b64data)
        image_stream = io.BytesIO(image_bytes)
        image = Image.open(image_stream)

        if export_format == 'cmyk_png':
            # Convert to CMYK and set 300 DPI
            cmyk_image = image.convert('CMYK')
            out = io.BytesIO()
            cmyk_image.save(out, format='PNG', dpi=(300, 300))
            out.seek(0)
            filename = f"{base_filename}_300dpi_cmyk.png"
            return send_file(out, as_attachment=True, download_name=filename, mimetype='image/png')
        elif export_format == 'pdf':
            # Ensure 300 DPI and save as single-page PDF
            # Convert to RGB if mode not supported by PDF encoder
            pdf_image = image.convert('RGB') if image.mode not in ('RGB', 'L') else image
            out = io.BytesIO()
            pdf_image.save(out, format='PDF', resolution=300.0)
            out.seek(0)
            filename = f"{base_filename}.pdf"
            return send_file(out, as_attachment=True, download_name=filename, mimetype='application/pdf')
        else:
            return jsonify({"error": "Unsupported format. Use 'pdf' or 'cmyk_png'."}), 400
    except Exception as e:
        logger.exception("Error exporting poster")
        return jsonify({"error": "Failed to export poster"}), 500

@app.route('/api/export_poster_composed', methods=['POST'])
def export_poster_composed():
    """
    Server-side composition of a poster that includes a Mapbox Static Image background
    and the GPX route overlay, plus title/subtitle/description text.

    Request JSON fields:
      - activity_id: string (required)
      - title: string (optional)
      - subtitle: string (optional)
      - description: string (optional)
      - width_px: int (optional, default 3508)  # A3 width @ 300dpi (portrait)
      - height_px: int (optional, default 4961) # A3 height @ 300dpi (portrait)
      - line_color: string hex (optional, default '#ff0000')
      - line_width: int (optional, default 6)
      - format: 'pdf' or 'cmyk_tiff' (optional, default 'pdf')
      - style_id: Mapbox style ID path (optional, default 'mapbox/streets-v11')
      - background_type: 'map' | 'image' | 'solid' (default 'map')
      - background_image_data: data URL (if background_type='image')
      - solid_color: hex color for solid background (if background_type='solid')
      - blur_radius: int pixels (optional, default 0)
      - monochrome: bool (optional, default false) – apply monochrome tint
      - mono_color: hex color for monochrome tint (optional, default '#808080')
    """
    try:
        payload = request.get_json(force=True)
        activity_id = str(payload.get('activity_id', '')).strip()
        if not activity_id:
            return jsonify({"error": "activity_id is required"}), 400

        title = payload.get('title') or ''
        subtitle = payload.get('subtitle') or ''
        description = payload.get('description') or ''
        width_px = int(payload.get('width_px') or 3508)
        height_px = int(payload.get('height_px') or 4961)
        line_color = payload.get('line_color') or '#ffeb3b'
        line_width = int(payload.get('line_width') or 8)
        export_format = payload.get('format') or 'pdf'
        style_id = payload.get('style_id') or 'mapbox/streets-v11'
        base_filename = payload.get('filename') or 'poster'

        background_type = (payload.get('background_type') or 'map').lower()
        background_image_data = payload.get('background_image_data')
        solid_color = payload.get('solid_color') or '#111111'
        blur_radius = int(payload.get('blur_radius') or 0)
        monochrome = bool(payload.get('monochrome') or False)
        mono_color = payload.get('mono_color') or '#808080'

        # Fetch streams
        streams = get_activity_streams(activity_id)
        if 'latlng' not in streams or not streams['latlng'].get('data'):
            return jsonify({"error": "No latlng stream available for this activity"}), 400
        latlng = streams['latlng']['data']  # list of [lat, lon]

        # Compute bounds
        lats = [pt[0] for pt in latlng]
        lons = [pt[1] for pt in latlng]
        min_lat, max_lat = min(lats), max(lats)
        min_lon, max_lon = min(lons), max(lons)

        # Add small padding to bounds
        lat_pad = (max_lat - min_lat) * 0.05 or 0.001
        lon_pad = (max_lon - min_lon) * 0.05 or 0.001
        min_lat_p = min_lat - lat_pad
        max_lat_p = max_lat + lat_pad
        min_lon_p = min_lon - lon_pad
        max_lon_p = max_lon + lon_pad

        # If title/subtitle not provided, derive from activity details
        def _fmt_hms(seconds: int) -> str:
            h = seconds // 3600
            m = (seconds % 3600) // 60
            s = seconds % 60
            return f"{h:d}:{m:02d}:{s:02d}" if h else f"{m:d}:{s:02d}"
        def _fmt_km(meters: float) -> str:
            return f"{meters/1000.0:.1f} km"
        def _fmt_elev(meters: float) -> str:
            return f"+{round(meters)} m"
        try:
            details = get_activity_details(activity_id)
            # Do not auto-set title from activity name; only use user-provided title
            if not subtitle:
                dist = details.get('distance') or 0
                mv = details.get('moving_time') or 0
                elev = details.get('total_elevation_gain') or 0
                subtitle = f"{_fmt_km(dist)} · {_fmt_hms(int(mv))} · {_fmt_elev(elev)}"
        except Exception as _e:
            logger.warning(f"Could not derive subtitle from activity details: {_e}")

        # Create destination canvas
        bg_img = Image.new('RGB', (width_px, height_px), color=(17, 17, 17))

        if background_type == 'solid':
            # Solid color background
            def hex_to_rgb(h):
                h = h.lstrip('#')
                return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
            bg_img = Image.new('RGB', (width_px, height_px), color=hex_to_rgb(solid_color))
        elif background_type == 'image' and background_image_data:
            # Decode data URL and fit to canvas
            try:
                header, b64data = background_image_data.split(',', 1)
                img_bytes = base64.b64decode(b64data)
                src_img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
                bg_img = src_img.resize((width_px, height_px), resample=Image.LANCZOS)
            except Exception as e:
                logger.warning(f"Failed to decode background image, falling back to solid: {e}")
                def hex_to_rgb(h):
                    h = h.lstrip('#')
                    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
                bg_img = Image.new('RGB', (width_px, height_px), color=hex_to_rgb(solid_color))
        else:
            # background_type == 'map' -> Build Mapbox Static Image tiles using bbox, honoring per-request limits
            style_path = style_id if style_id.startswith('mapbox/') or '/' in style_id else f"mapbox/{style_id}"
            MAX_REQ = 1280
            EFFECTIVE_MAX = 2560  # using @2x yields up to 2560 effective pixels

            # Compute tile grid counts
            cols = max(1, math.ceil(width_px / EFFECTIVE_MAX))
            rows = max(1, math.ceil(height_px / EFFECTIVE_MAX))

            # Compute per-segment pixel sizes in final canvas
            seg_w = [width_px // cols] * cols
            for i in range(width_px % cols):
                seg_w[i] += 1
            seg_h = [height_px // rows] * rows
            for j in range(height_px % rows):
                seg_h[j] += 1

            # Helper to compute bbox for tile [ci, rj]
            def tile_bbox(ci, rj):
                x0 = sum(seg_w[:ci])
                x1 = x0 + seg_w[ci]
                y0 = sum(seg_h[:rj])
                y1 = y0 + seg_h[rj]
                # Fractions across canvas
                fx0, fx1 = x0 / width_px, x1 / width_px
                fy0, fy1 = y0 / height_px, y1 / height_px
                # Lons increase left->right, Lats decrease top->bottom
                lon0 = min_lon_p + (max_lon_p - min_lon_p) * fx0
                lon1 = min_lon_p + (max_lon_p - min_lon_p) * fx1
                lat1 = max_lat_p - (max_lat_p - min_lat_p) * fy0  # top
                lat0 = max_lat_p - (max_lat_p - min_lat_p) * fy1  # bottom
                return lon0, lat0, lon1, lat1

            # Start with blank canvas
            bg_img = Image.new('RGB', (width_px, height_px), color=(255, 255, 255))

            # Fetch and paste each tile
            y_cursor = 0
            for r in range(rows):
                x_cursor = 0
                for c in range(cols):
                    tw, th = seg_w[c], seg_h[r]
                    # Determine request size using @2x when helpful
                    req_w = min(MAX_REQ, math.ceil(tw / 2))
                    req_h = min(MAX_REQ, math.ceil(th / 2))
                    use_2x = True  # prefer @2x
                    size_suffix = f"{req_w}x{req_h}@2x" if use_2x else f"{req_w}x{req_h}"

                    lon0, lat0, lon1, lat1 = tile_bbox(c, r)
                    static_url = (
                        f"https://api.mapbox.com/styles/v1/{style_path}/static/"
                        f"{lon0},{lat0},{lon1},{lat1}/"
                        f"{size_suffix}?access_token={MAPBOX_ACCESS_TOKEN}"
                    )
                    logger.debug(f"🧩 Fetching tile r{r} c{c}: {static_url}")
                    resp = requests.get(static_url)
                    if resp.status_code != 200:
                        logger.error(f"Failed to fetch tile r{r} c{c}: {resp.status_code} {resp.text[:200]}")
                        return jsonify({"error": "Failed to fetch static map tile"}), 502
                    tile_img = Image.open(io.BytesIO(resp.content)).convert('RGB')
                    # Resize tile to exact target pixels (tw x th)
                    if tile_img.size != (tw, th):
                        tile_img = tile_img.resize((tw, th), resample=Image.LANCZOS)
                    bg_img.paste(tile_img, (x_cursor, y_cursor))
                    x_cursor += tw
                y_cursor += seg_h[r]

        # Optional monochrome tint
        if monochrome:
            # Convert to grayscale and colorize towards mono_color
            def hex_to_rgb(h):
                h = h.lstrip('#')
                return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
            tint = hex_to_rgb(mono_color)
            gray = ImageOps.grayscale(bg_img)
            bg_img = ImageOps.colorize(gray, black=(0, 0, 0), white=tint)

        # Optional blur
        if blur_radius and blur_radius > 0:
            bg_img = bg_img.filter(ImageFilter.GaussianBlur(radius=blur_radius))

        draw = ImageDraw.Draw(bg_img)

        # Draw route on top of the background
        # Convert hex color to RGB
        def hex_to_rgb(h):
            h = h.lstrip('#')
            return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
        route_color = hex_to_rgb(line_color)

        # Project lat/lon to image pixels (simple bbox scaling)
        def to_xy(lat, lon):
            x = (lon - min_lon_p) / (max_lon_p - min_lon_p) * (width_px - 1)
            y = (max_lat_p - lat) / (max_lat_p - min_lat_p) * (height_px - 1)
            return (int(x), int(y))

        pts = [to_xy(lat, lon) for lat, lon in latlng]
        # Draw as a polyline
        if len(pts) >= 2:
            draw.line(pts, fill=route_color, width=line_width, joint="curve")

        # Place text (basic layout)
        # Choose fallback fonts (system-dependent). If font load fails, PIL will use default.
        try:
            title_font = ImageFont.truetype("Arial.ttf", size=64)
            subtitle_font = ImageFont.truetype("Arial.ttf", size=36)
            desc_font = ImageFont.truetype("Arial.ttf", size=28)
        except Exception:
            title_font = ImageFont.load_default()
            subtitle_font = ImageFont.load_default()
            desc_font = ImageFont.load_default()

        margin = 40
        # Title
        if title:
            draw.text((margin, margin), title, fill=(0, 0, 0), font=title_font)
        # Subtitle
        if subtitle:
            draw.text((margin, margin + 90), subtitle, fill=(0, 0, 0), font=subtitle_font)
        # Description at bottom
        if description:
            desc_y = height_px - margin - 40
            draw.text((margin, desc_y), description, fill=(0, 0, 0), font=desc_font)

        # Output
        out = io.BytesIO()
        if export_format == 'pdf':
            bg_img.save(out, format='PDF', resolution=300.0)
            out.seek(0)
            return send_file(out, as_attachment=True, download_name=f"{base_filename}.pdf", mimetype='application/pdf')
        elif export_format == 'cmyk_tiff':
            cmyk = bg_img.convert('CMYK')
            cmyk.save(out, format='TIFF', dpi=(300, 300), compression='tiff_lzw')
            out.seek(0)
            return send_file(out, as_attachment=True, download_name=f"{base_filename}_300dpi_cmyk.tiff", mimetype='image/tiff')
        else:
            return jsonify({"error": "Unsupported format. Use 'pdf' or 'cmyk_tiff'."}), 400
    except Exception as e:
        logger.exception("Error during server-side poster composition")
        return jsonify({"error": "Failed to compose poster on server"}), 500

@app.route('/api/save_poster_composed', methods=['POST'])
def save_poster_composed():
    try:
        if not conn:
            return jsonify({"error": "DATABASE_URL not configured"}), 500
        payload = request.get_json(force=True)
        # Reuse composition by calling export_poster_composed internals; here we'll inline minimal shared logic by calling it partially
        # Call export logic to get a high-res RGB image for preview storage
        request_ctx_backup = request.get_json
        # Compose image using same parameters but force RGB PNG output for storage
        # We'll duplicate param extraction to avoid refactor for now
        activity_id = str(payload.get('activity_id', '')).strip()
        if not activity_id:
            return jsonify({"error": "activity_id is required"}), 400
        title = payload.get('title') or ''
        subtitle = payload.get('subtitle') or ''
        description = payload.get('description') or ''
        width_px = int(payload.get('width_px') or 3508)
        height_px = int(payload.get('height_px') or 4961)
        line_color = payload.get('line_color') or '#ffeb3b'
        line_width = int(payload.get('line_width') or 8)
        style_id = payload.get('style_id') or 'mapbox/streets-v11'
        background_type = (payload.get('background_type') or 'map').lower()
        background_image_data = payload.get('background_image_data')
        solid_color = payload.get('solid_color') or '#111111'
        blur_radius = int(payload.get('blur_radius') or 0)
        monochrome = bool(payload.get('monochrome') or False)
        mono_color = payload.get('mono_color') or '#808080'

        # Build bg_img same as export_poster_composed by calling it indirectly is complex; we replicate minimal steps by invoking a private function would be better.
        # For brevity, we call export_poster_composed composition logic via an inner function pattern—omitted for clarity. Here we duplicate code segments.

        # Fetch streams
        streams = get_activity_streams(activity_id)
        if 'latlng' not in streams or not streams['latlng'].get('data'):
            return jsonify({"error": "No latlng stream available for this activity"}), 400
        latlng = streams['latlng']['data']
        lats = [pt[0] for pt in latlng]
        lons = [pt[1] for pt in latlng]
        min_lat, max_lat = min(lats), max(lats)
        min_lon, max_lon = min(lons), max(lons)
        lat_pad = (max_lat - min_lat) * 0.05 or 0.001
        lon_pad = (max_lon - min_lon) * 0.05 or 0.001
        min_lat_p = min_lat - lat_pad
        max_lat_p = max_lat + lat_pad
        min_lon_p = min_lon - lon_pad
        max_lon_p = max_lon + lon_pad

        # If title/subtitle not provided, derive from activity details
        def _fmt_hms(seconds: int) -> str:
            h = seconds // 3600
            m = (seconds % 3600) // 60
            s = seconds % 60
            return f"{h:d}:{m:02d}:{s:02d}" if h else f"{m:d}:{s:02d}"
        def _fmt_km(meters: float) -> str:
            return f"{meters/1000.0:.1f} km"
        def _fmt_elev(meters: float) -> str:
            return f"+{round(meters)} m"
        try:
            details = get_activity_details(activity_id)
            # Do not auto-set title from activity name; only use user-provided title
            if not subtitle:
                dist = details.get('distance') or 0
                mv = details.get('moving_time') or 0
                elev = details.get('total_elevation_gain') or 0
                subtitle = f"{_fmt_km(dist)} · {_fmt_hms(int(mv))} · {_fmt_elev(elev)}"
        except Exception as _e:
            logger.warning(f"Could not derive subtitle from activity details: {_e}")

        # Create background similar to export
        def hex_to_rgb(h):
            h = h.lstrip('#')
            return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

        bg_img = Image.new('RGB', (width_px, height_px), color=(17, 17, 17))
        if background_type == 'solid':
            bg_img = Image.new('RGB', (width_px, height_px), color=hex_to_rgb(solid_color))
        elif background_type == 'image' and background_image_data:
            header, b64data = background_image_data.split(',', 1)
            img_bytes = base64.b64decode(b64data)
            src_img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
            bg_img = src_img.resize((width_px, height_px), resample=Image.LANCZOS)
        else:
            style_path = style_id if style_id.startswith('mapbox/') or '/' in style_id else f"mapbox/{style_id}"
            MAX_REQ = 1280
            EFFECTIVE_MAX = 2560
            cols = max(1, math.ceil(width_px / EFFECTIVE_MAX))
            rows = max(1, math.ceil(height_px / EFFECTIVE_MAX))
            seg_w = [width_px // cols] * cols
            for i in range(width_px % cols):
                seg_w[i] += 1
            seg_h = [height_px // rows] * rows
            for j in range(height_px % rows):
                seg_h[j] += 1
            def tile_bbox(ci, rj):
                x0 = sum(seg_w[:ci]); x1 = x0 + seg_w[ci]
                y0 = sum(seg_h[:rj]); y1 = y0 + seg_h[rj]
                fx0, fx1 = x0 / width_px, x1 / width_px
                fy0, fy1 = y0 / height_px, y1 / height_px
                lon0 = min_lon_p + (max_lon_p - min_lon_p) * fx0
                lon1 = min_lon_p + (max_lon_p - min_lon_p) * fx1
                lat1 = max_lat_p - (max_lat_p - min_lat_p) * fy0
                lat0 = max_lat_p - (max_lat_p - min_lat_p) * fy1
                return lon0, lat0, lon1, lat1
            bg_img = Image.new('RGB', (width_px, height_px), color=(255, 255, 255))
            y_cursor = 0
            for r in range(rows):
                x_cursor = 0
                for c in range(cols):
                    tw, th = seg_w[c], seg_h[r]
                    req_w = min(MAX_REQ, math.ceil(tw / 2))
                    req_h = min(MAX_REQ, math.ceil(th / 2))
                    size_suffix = f"{req_w}x{req_h}@2x"
                    lon0, lat0, lon1, lat1 = tile_bbox(c, r)
                    static_url = (
                        f"https://api.mapbox.com/styles/v1/{style_path}/static/"
                        f"{lon0},{lat0},{lon1},{lat1}/"
                        f"{size_suffix}?access_token={MAPBOX_ACCESS_TOKEN}"
                    )
                    resp = requests.get(static_url)
                    resp.raise_for_status()
                    tile_img = Image.open(io.BytesIO(resp.content)).convert('RGB')
                    if tile_img.size != (tw, th):
                        tile_img = tile_img.resize((tw, th), resample=Image.LANCZOS)
                    bg_img.paste(tile_img, (x_cursor, y_cursor))
                    x_cursor += tw
                y_cursor += seg_h[r]
        # Effects
        if monochrome:
            gray = ImageOps.grayscale(bg_img)
            bg_img = ImageOps.colorize(gray, black=(0,0,0), white=hex_to_rgb(mono_color))
        if blur_radius and blur_radius > 0:
            bg_img = bg_img.filter(ImageFilter.GaussianBlur(radius=blur_radius))

        # Draw route
        def hex_to_rgb2(h):
            h = h.lstrip('#')
            return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
        route_color = hex_to_rgb2(line_color)
        draw = ImageDraw.Draw(bg_img)
        def to_xy(lat, lon):
            x = (lon - min_lon_p) / (max_lon_p - min_lon_p) * (width_px - 1)
            y = (max_lat_p - lat) / (max_lat_p - min_lat_p) * (height_px - 1)
            return (int(x), int(y))
        pts = [to_xy(lat, lon) for lat, lon in latlng]
        if len(pts) >= 2:
            draw.line(pts, fill=route_color, width=line_width, joint="curve")
        # Title/subtitle/desc
        try:
            title_font = ImageFont.truetype("Arial.ttf", size=64)
            subtitle_font = ImageFont.truetype("Arial.ttf", size=36)
            desc_font = ImageFont.truetype("Arial.ttf", size=28)
        except Exception:
            title_font = ImageFont.load_default(); subtitle_font = ImageFont.load_default(); desc_font = ImageFont.load_default()
        margin = 40
        if title:
            draw.text((margin, margin), title, fill=(0,0,0), font=title_font)
        if subtitle:
            draw.text((margin, margin+90), subtitle, fill=(0,0,0), font=subtitle_font)
        if description:
            desc_y = height_px - margin - 40
            draw.text((margin, desc_y), description, fill=(0,0,0), font=desc_font)

        # Save preview PNG
        timestamp = datetime.utcnow().strftime('%Y%m%d%H%M%S')
        athlete = session.get('athlete') or {}
        username = athlete.get('username', 'unknown')
        user_id = str(athlete.get('id', ''))
        filename = secure_filename(f"poster_{username}_{timestamp}.png")
        filepath = os.path.join(GENERATED_DIR, filename)
        bg_img.save(filepath, format='PNG', optimize=True)

        # Insert DB record
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO posters (user_name, user_id, activity_id, params, image_path) VALUES (%s,%s,%s,%s,%s) RETURNING id",
                (username, user_id, activity_id, json.dumps(payload), filename)
            )
            poster_id = cur.fetchone()[0]
            conn.commit()
        return jsonify({"id": poster_id, "image_url": url_for('serve_generated', filename=filename, _external=True), "confirm_url": url_for('poster_confirm', poster_id=poster_id, _external=True)})
    except Exception as e:
        logger.exception("Error saving poster")
        return jsonify({"error": "Failed to save poster"}), 500

@app.route('/api/generated/<filename>')
def serve_generated(filename):
    return send_file(os.path.join(GENERATED_DIR, filename))

@app.route('/api/poster/<int:poster_id>')
def poster_confirm(poster_id):
    if not conn:
        return jsonify({"error": "DB not configured"}), 500
    with conn.cursor() as cur:
        cur.execute("SELECT id, user_name, image_path, params, created_at FROM posters WHERE id=%s", (poster_id,))
        row = cur.fetchone()
    if not row:
        return jsonify({"error": "Not found"}), 404
    data = {
        'id': row[0],
        'user_name': row[1],
        'image_path': row[2],
        'params': row[3],
        'created_at': row[4]
    }
    return jsonify(data)

# Admin (API-only)
@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    pwd = request.json.get('password') if request.is_json else request.form.get('password')
    if pwd == ADMIN_PASSWORD:
        session['admin'] = True
        return jsonify({"ok": True})
    return jsonify({"ok": False, "error": "Invalid password"}), 401

@app.route('/api/admin/logout', methods=['POST'])
def admin_logout():
    session.pop('admin', None)
    return ("", 204)

@app.route('/api/admin/posters')
def admin_posters():
    if not session.get('admin'):
        return jsonify({"error": "unauthorized"}), 401
    if not conn:
        return jsonify({"error": "DB not configured"}), 500
    with conn.cursor() as cur:
        cur.execute("SELECT id, user_name, image_path, params::text, created_at FROM posters ORDER BY created_at DESC")
        rows = cur.fetchall()
    posters = [
        { 'id': r[0], 'user_name': r[1], 'image_path': r[2], 'params': json.loads(r[3]), 'created_at': r[4] }
        for r in rows
    ]
    return jsonify({"posters": posters})

# Health check for API-only use
@app.route('/api/health')
def health():
    return jsonify(status="ok")

if __name__ == '__main__':
    app.run(debug=True)
