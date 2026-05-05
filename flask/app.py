from flask import Flask, redirect, request, session, url_for, jsonify, send_file, make_response
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
import boto3
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
# Accept FRONTEND_URL or FRONTEND_ORIGIN (render.yaml uses FRONTEND_ORIGIN)
FRONTEND_URL = (
    os.getenv("FRONTEND_URL")
    or os.getenv("FRONTEND_ORIGIN")
    or "http://localhost:5173"
)
# Support comma-separated list of allowed origins, e.g. "https://a.com,https://b.com"
ALLOWED_ORIGINS = [o.strip() for o in FRONTEND_URL.split(",") if o.strip()]

# Enable CORS for the frontend, allowing cookies (session) to be sent.
# /apps/* covers the Shopify-proxy-style endpoints (e.g. /apps/poster/generate-and-checkout).
CORS(
    app,
    supports_credentials=True,
    resources={
        r"/api/*":   {"origins": ALLOWED_ORIGINS, "allow_headers": ["Authorization", "Content-Type"]},
        r"/apps/*":  {"origins": ALLOWED_ORIGINS, "allow_headers": ["Authorization", "Content-Type"]},
        r"/strava/*":{"origins": ALLOWED_ORIGINS, "allow_headers": ["Authorization", "Content-Type"]},
        r"/healthz": {"origins": ALLOWED_ORIGINS},
    },
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

@app.route('/healthz')
def healthz():
    return jsonify(ok=True)

@app.route('/', methods=['GET'])
def root():
    # API-only mode: frontend is a separate React app
    return ("", 204)

# Silence favicon requests to avoid noisy logs
@app.route('/favicon.ico')
def favicon():
    return ("", 204)

@app.route('/debug/env')
def debug_env():
    # Expose key env/config values (do not expose secrets)
    return jsonify({
        'FRONTEND_URL': FRONTEND_URL,
        'STRAVA_CLIENT_ID': 'SET' if STRAVA_CLIENT_ID else 'NOT_SET',
        'STRAVA_CLIENT_SECRET': 'SET' if STRAVA_CLIENT_SECRET else 'NOT_SET',
        'MAPBOX_ACCESS_TOKEN': 'SET' if MAPBOX_ACCESS_TOKEN else 'NOT_SET',
        'DATABASE_URL': 'SET' if DATABASE_URL else 'NOT_SET'
    })

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

@app.route('/strava/auth')
def compat_strava_auth():
    # Compatibility route so the frontend can call /strava/auth locally
    # Build Strava OAuth URL, but point redirect_uri to the compat callback which posts a message to the opener
    logger.debug("Compat: Redirecting to Strava authorization URL...")
    auth_url = (
        f"https://www.strava.com/oauth/authorize?client_id={STRAVA_CLIENT_ID}"
        f"&response_type=code&redirect_uri={url_for('compat_strava_callback', _external=True)}"
        f"&scope=read,activity:read,activity:read_all"
    )
    return redirect(auth_url)

@app.route('/strava/callback')
def compat_strava_callback():
    # Compatibility callback that exchanges the code and sends result back to the opener via postMessage
    code = request.args.get('code')
    logger.debug(f"Compat: Received code from Strava: {code}")
    if not code:
        return "No authorization code received", 400
    try:
        access_token, athlete = get_strava_access_token(code)
        athlete_name = ''
        if isinstance(athlete, dict):
            athlete_name = f"{athlete.get('firstname', '')} {athlete.get('lastname', '')}".strip()
    except Exception as e:
        logger.exception("Compat: Token exchange failed")
        return f"Token exchange failed: {e}", 400

    html = f"""
<!doctype html><html><head><title>Auth</title></head><body>
<script>
  (function() {{
    var msg = {{ type: 'strava_oauth', access_token: '{access_token}', expires_at: 0, athlete: '{athlete_name.replace("'", "\\'")}'  }};
    if (window.opener) {{ window.opener.postMessage(msg, '*'); window.close(); }}
  }})();
</script>
</body></html>
"""
    resp = make_response(html)
    resp.headers['Content-Type'] = 'text/html; charset=utf-8'
    return resp

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
        # Try to use Bearer token from header; fall back to session
        auth_header = request.headers.get('Authorization', '')
        token_from = 'session'
        access_token = None
        if isinstance(auth_header, str) and auth_header.lower().startswith('bearer '):
            access_token = auth_header.split(' ', 1)[1].strip()
            token_from = 'header'
        logger.debug(f"GPX request for activity {activity_id} | token_from={token_from} | token_present={bool(access_token) or bool(session.get('strava_access_token'))}")

        streams = get_activity_streams(activity_id, access_token=access_token)
        return generate_gpx_response(streams, activity_id)
    except Exception as e:
        logger.error(f"Error downloading GPX for activity ID {activity_id}: {e}")
        return jsonify({'error': 'Failed to download GPX', 'detail': str(e)}), 500


@app.route('/api/logout', methods=['POST'])
def logout():
    logger.debug(f"🔍 Before clearing session: {session}")
    session.clear()
    logger.debug("🧹 Session cleared. Logged out.")
    logger.debug(f"🔍 After clearing session: {session}")
    return ("", 204)
@app.route('/api/mapbox/static')

def mapbox_static():
    try:
        logger.debug(f"Mapbox static request params: {dict(request.args)}")
        w = int(request.args.get('w', '800'))
        h = int(request.args.get('h', '600'))
        style_id = request.args.get('style') or 'mapbox/streets-v11'
        token = MAPBOX_ACCESS_TOKEN
        if not token:
            logger.error("MAPBOX_ACCESS_TOKEN not configured on server")
            return jsonify({"error": "MAPBOX_ACCESS_TOKEN not configured on server"}), 500
        # Clamp size to Mapbox limits (1280), no @2x here in proxy (frontend can request exact preview size)
        w_req = max(1, min(1280, w))
        h_req = max(1, min(1280, h))

        center = request.args.get('center')  # "lon,lat"
        zoom = request.args.get('zoom')      # numeric string
        bbox = request.args.get('bbox')      # "lon0,lat0,lon1,lat1"
        bearing = request.args.get('bearing', '0')
        pitch = request.args.get('pitch', '0')

        # Prefer center+zoom; if zoom missing, default it so we don't 400
        if center:
            z = zoom if (zoom and zoom.strip() != '') else '12'
            static_url = (
                f"https://api.mapbox.com/styles/v1/{style_id}/static/"
                f"{center},{z},{bearing},{pitch}/{w_req}x{h_req}?access_token={token}"
            )
        elif bbox:
            static_url = (
                f"https://api.mapbox.com/styles/v1/{style_id}/static/"
                f"{bbox}/{w_req}x{h_req}?access_token={token}"
            )
        else:
            return jsonify({"error": "Provide center (and optional zoom) or bbox"}), 400

        logger.debug(f"🗺️ Proxy Mapbox static: {static_url}")
        resp = requests.get(static_url)
        logger.debug(f"Mapbox response status: {resp.status_code}")
        if resp.status_code != 200:
            logger.error(f"Mapbox static error {resp.status_code}: {resp.text[:200]}")
            return jsonify({"error": "Failed to fetch map image"}), 502
        out = make_response(resp.content)
        out.headers['Content-Type'] = resp.headers.get('Content-Type', 'image/png')
        return out
    except Exception:
        logger.exception("Error proxying Mapbox static image")
        return jsonify({"error": "Internal error fetching map image"}), 500

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
        payload = request.get_json(force=True)
        # Reuse composition by calling export_poster_composed internals; here we'll inline minimal shared logic by calling it partially
        # Call export logic to get a high-res RGB image for preview storage
        request_ctx_backup = request.get_json
        # Compose image using same parameters but force RGB PNG output for storage
        # We'll duplicate param extraction to avoid refactor for now
        activity_id = str(payload.get('activity_id', '')).strip()
        if not activity_id:
            return jsonify({"error": "activity_id is required"}), 400

        # Extract Strava token from Authorization header (same as download_gpx)
        auth_header = request.headers.get('Authorization', '')
        access_token = None
        if isinstance(auth_header, str) and auth_header.lower().startswith('bearer '):
            access_token = auth_header.split(' ', 1)[1].strip()
        title = payload.get('title') or ''
        subtitle = payload.get('subtitle') or ''
        description = payload.get('description') or ''
        width_px = int(payload.get('width_px') or 3508)
        height_px = int(payload.get('height_px') or 4961)
        line_color = payload.get('line_color') or '#ffeb3b'
        _lw_raw = int(payload.get('line_width') or 0)
        line_width = _lw_raw if _lw_raw > 0 else max(12, width_px // 150)
        style_id = payload.get('style_id') or 'mapbox/streets-v11'
        background_type = (payload.get('background_type') or 'map').lower()
        background_image_data = payload.get('background_image_data')
        solid_color = payload.get('solid_color') or '#111111'
        blur_radius = int(payload.get('blur_radius') or 0)
        monochrome = bool(payload.get('monochrome') or False)
        mono_color = payload.get('mono_color') or '#808080'
        # Photo-layout specific (sent only when layout === 'photo')
        photo_url    = (payload.get('photo_url') or '').strip()
        overlay_data = dict(payload.get('overlay_data') or {})
        photo_visible = list(payload.get('photo_visible_stats') or ['distance', 'speed', 'date'])
        photo_stats   = bool(payload.get('photo_stats_visible', True))

        # Build bg_img same as export_poster_composed by calling it indirectly is complex; we replicate minimal steps by invoking a private function would be better.
        # For brevity, we call export_poster_composed composition logic via an inner function pattern—omitted for clarity. Here we duplicate code segments.

        # Fetch streams
        streams = get_activity_streams(activity_id, access_token=access_token)
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

        # ── WebMercator helpers (shared by tile fetching AND route projection) ──
        def _merc_y(lat_deg):
            return math.log(math.tan(math.pi / 4 + math.radians(lat_deg) / 2))

        def _px_to_latlon(px, py, ctr_lat, ctr_lon, zm, W, H):
            """Pixel → (lat, lon) for a canvas with given centre and zoom."""
            sc = 256.0 * (2.0 ** zm)
            cx = (ctr_lon + 180.0) / 360.0 * sc
            cy = (1.0 - _merc_y(ctr_lat) / math.pi) / 2.0 * sc
            lon_ = (cx + px - W / 2.0) / sc * 360.0 - 180.0
            y_m = (1.0 - 2.0 * (cy + py - H / 2.0) / sc) * math.pi
            lat_ = math.degrees(2.0 * math.atan(math.exp(y_m)) - math.pi / 2.0)
            return lat_, lon_

        center_lat_r = (min_lat + max_lat) / 2.0
        center_lon_r = (min_lon + max_lon) / 2.0
        _lat_span = (_merc_y(max_lat) - _merc_y(min_lat)) if max_lat > min_lat else 0.001
        _lon_span = (max_lon - min_lon) if max_lon > min_lon else 0.001
        # Bottom 22 % of canvas = data overlay; top 78 % = map section
        overlay_h = int(height_px * 0.22)
        map_h     = height_px - overlay_h   # e.g. 3869 px at A3 4961

        # Zoom: fit route to MAP SECTION (not full canvas), 90 % fill
        # so it matches the editor's Mapbox "auto" + padding=40 behaviour
        _PAD = 0.90
        _zw = math.log2(width_px * _PAD / (256.0 * (_lon_span / 360.0)))
        _zh = math.log2(map_h    * _PAD / (256.0 * (_lat_span / math.pi)))
        map_zoom = max(0.0, min(20.0, min(_zw, _zh)))

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
            details = get_activity_details(activity_id, access_token=access_token)
            # Do not auto-set title from activity name; only use user-provided title
            if not subtitle:
                dist = details.get('distance') or 0
                mv = details.get('moving_time') or 0
                elev = details.get('total_elevation_gain') or 0
                subtitle = f"{_fmt_km(dist)} · {_fmt_hms(int(mv))} · {_fmt_elev(elev)}"
        except Exception as _e:
            logger.warning(f"Could not derive subtitle from activity details: {_e}")

        # ──────────────────────────────────────────────────────────────────────
        # Shared helpers
        # ──────────────────────────────────────────────────────────────────────
        def hex_to_rgb(h):
            h = h.lstrip('#')
            return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

        def _load_font(size):
            for fp in [
                '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
                '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
                '/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf',
                '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
                'Arial.ttf',
            ]:
                try:
                    return ImageFont.truetype(fp, size=size)
                except Exception:
                    pass
            try:
                return ImageFont.load_default(size=size)
            except Exception:
                return ImageFont.load_default()

        is_photo_layout = (background_type == 'image' and bool(photo_url))

        if is_photo_layout:
            # ──────────────────────────────────────────────────────────────────────
            # PHOTO POSTER – replicates the editor’s photo layout exactly:
            #   full-canvas photo  →  route on top  →  gradient+stats at bottom
            # ──────────────────────────────────────────────────────────────────────
            # 1. Fetch and crop photo to full canvas (object-cover semantics)
            try:
                rp = requests.get(photo_url, timeout=20)
                rp.raise_for_status()
                src = Image.open(io.BytesIO(rp.content)).convert('RGB')
            except Exception as _fe:
                logger.error(f"Failed to fetch photo {photo_url}: {_fe}")
                return jsonify({"error": "Failed to fetch poster photo"}), 502
            sw, sh = src.size
            scale  = max(width_px / sw, height_px / sh)
            sw2, sh2 = int(sw * scale), int(sh * scale)
            src    = src.resize((sw2, sh2), resample=Image.LANCZOS)
            ox, oy = (sw2 - width_px) // 2, (sh2 - height_px) // 2
            full_img = src.crop((ox, oy, ox + width_px, oy + height_px))

            # 2. Draw route (decorative, fits full canvas with 82 % fill)
            _zp = max(0.0, min(20.0, min(
                math.log2(width_px  * 0.82 / (256.0 * (_lon_span / 360.0))),
                math.log2(height_px * 0.82 / (256.0 * (_lat_span / math.pi))),
            )))
            draw_ph = ImageDraw.Draw(full_img)

            def _to_xy_p(lat, lon):
                sc   = 256.0 * (2.0 ** _zp)
                _cx  = (center_lon_r + 180.0) / 360.0 * sc
                _cy  = (1.0 - _merc_y(center_lat_r) / math.pi) / 2.0 * sc
                _px  = (lon + 180.0) / 360.0 * sc
                _py  = (1.0 - _merc_y(lat) / math.pi) / 2.0 * sc
                return int(_px - _cx + width_px / 2), int(_py - _cy + height_px / 2)

            pts_p = [_to_xy_p(la, lo) for la, lo in latlng]
            if len(pts_p) >= 2:
                draw_ph.line(pts_p, fill=hex_to_rgb(line_color),
                             width=line_width, joint="curve")

            # 3. Gradient + stats at bottom (mirrors editor photo stats bar)
            _stat_order = [
                ('distance', 'DISTANCE'), ('elevation', 'ELEVATION'),
                ('speed', 'PACE'), ('date', 'DATE'), ('duration', 'TIME'),
            ]
            active_st = [
                (lbl, str(overlay_data.get(k, '')))
                for k, lbl in _stat_order
                if k in photo_visible and overlay_data.get(k)
            ]
            if photo_stats and active_st:
                grad_h  = int(height_px * 0.28)
                grad_y0 = height_px - grad_h
                # RGBA gradient compositing (transparent → dark)
                base_rgba  = full_img.convert('RGBA')
                grad_layer = Image.new('RGBA', (width_px, height_px), (0, 0, 0, 0))
                gd = ImageDraw.Draw(grad_layer)
                for dy in range(grad_h):
                    alpha = int(200 * dy / grad_h)
                    gd.line([(0, grad_y0 + dy), (width_px - 1, grad_y0 + dy)],
                            fill=(0, 0, 0, alpha), width=1)
                full_img = Image.alpha_composite(base_rgba, grad_layer).convert('RGB')
                draw_ph  = ImageDraw.Draw(full_img)

                n       = len(active_st)
                col     = width_px // n
                base_y  = grad_y0 + int(grad_h * 0.14)

                # Font size: limited by BOTH canvas height AND column width.
                # Without the column-width cap, long values like "April 12, 2026"
                # overflow into adjacent columns on a 3508 px canvas.
                max_val_chars = max((len(v) for _, v in active_st), default=8)
                # DejaVu Bold char width ≈ 0.58 × font_size (conservative)
                val_by_h = max(80, height_px // 32)                              # ~155 px at A3
                val_by_w = max(80, int(col * 0.72 / max(1, max_val_chars * 0.58)))  # fit in col
                val_sz   = min(val_by_h, val_by_w)
                lbl_sz   = max(40, val_sz // 2)
                lbl_f    = _load_font(lbl_sz)
                val_f    = _load_font(val_sz)

                for i, (lbl, val) in enumerate(active_st):
                    col_cx = col * i + col // 2

                    def _ct(text, font, dy, fill, _d=draw_ph, _c=col_cx):
                        try:
                            tw = int(_d.textlength(text, font=font))
                        except Exception:
                            tw = 0
                        _d.text((max(0, _c - tw // 2), base_y + dy),
                                text, fill=fill, font=font)

                    _ct(lbl, lbl_f, 0,           (170, 170, 170))
                    _ct(val, val_f, lbl_sz + 24, (255, 255, 255))
                    if i < n - 1:
                        sx = col * (i + 1)
                        draw_ph.line([(sx, base_y), (sx, base_y + lbl_sz + val_sz)],
                                     fill=(180, 180, 180), width=4)

        else:
            # ──────────────────────────────────────────────────────────────────────
            # MAP / SOLID LAYOUT  – map section (78 %) + data overlay (22 %)
            # ──────────────────────────────────────────────────────────────────────
            # 1. Build MAP SECTION image  (width_px × map_h)
            if background_type == 'solid':
                map_img = Image.new('RGB', (width_px, map_h),
                                    color=hex_to_rgb(solid_color))
            elif background_type == 'image' and background_image_data:
                _hdr, b64d = background_image_data.split(',', 1)
                src_img = Image.open(io.BytesIO(base64.b64decode(b64d))).convert('RGB')
                map_img = src_img.resize((width_px, map_h), resample=Image.LANCZOS)
            else:
                # Mapbox: tile grid with centre+zoom – aligns with to_xy()
                style_path = style_id if '/' in style_id else f"mapbox/{style_id}"
                MAX_REQ = 1280
                cols = max(1, math.ceil(width_px / (MAX_REQ * 2)))
                rows = max(1, math.ceil(map_h    / (MAX_REQ * 2)))
                seg_w = [width_px // cols] * cols
                for i in range(width_px % cols): seg_w[i] += 1
                seg_h = [map_h // rows] * rows
                for j in range(map_h % rows): seg_h[j] += 1
                map_img = Image.new('RGB', (width_px, map_h), color=(255, 255, 255))
                y_off = 0
                for r in range(rows):
                    x_off = 0
                    for c in range(cols):
                        tw, th = seg_w[c], seg_h[r]
                        tc_lat, tc_lon = _px_to_latlon(
                            x_off + tw / 2.0, y_off + th / 2.0,
                            center_lat_r, center_lon_r, map_zoom, width_px, map_h,
                        )
                        req_w = min(MAX_REQ, math.ceil(tw / 2))
                        req_h = min(MAX_REQ, math.ceil(th / 2))
                        tile_url = (
                            f"https://api.mapbox.com/styles/v1/{style_path}/static/"
                            f"{tc_lon:.6f},{tc_lat:.6f},{map_zoom:.4f},0,0/"
                            f"{req_w}x{req_h}@2x"
                            f"?access_token={MAPBOX_ACCESS_TOKEN}&logo=false&attribution=false"
                        )
                        resp = requests.get(tile_url)
                        if resp.status_code != 200:
                            logger.error(f"Mapbox tile {r},{c} → {resp.status_code}: {resp.text[:200]}")
                            return jsonify({"error": "Failed to fetch map tile"}), 502
                        tile_img = Image.open(io.BytesIO(resp.content)).convert('RGB')
                        if tile_img.size != (tw, th):
                            tile_img = tile_img.resize((tw, th), resample=Image.LANCZOS)
                        map_img.paste(tile_img, (x_off, y_off))
                        x_off += tw
                    y_off += seg_h[r]

            # Optional effects
            if monochrome:
                gray = ImageOps.grayscale(map_img)
                map_img = ImageOps.colorize(gray, black=(0, 0, 0),
                                            white=hex_to_rgb(mono_color))
            if blur_radius and blur_radius > 0:
                map_img = map_img.filter(ImageFilter.GaussianBlur(radius=blur_radius))

            # 2. Draw route (centred in map section)
            route_color = hex_to_rgb(line_color)
            draw_map    = ImageDraw.Draw(map_img)

            def to_xy(lat, lon):
                sc = 256.0 * (2.0 ** map_zoom)
                cx = (center_lon_r + 180.0) / 360.0 * sc
                cy = (1.0 - _merc_y(center_lat_r) / math.pi) / 2.0 * sc
                px_ = (lon + 180.0) / 360.0 * sc
                py_ = (1.0 - _merc_y(lat) / math.pi) / 2.0 * sc
                return int(px_ - cx + width_px / 2), int(py_ - cy + map_h / 2)

            pts = [to_xy(lat, lon) for lat, lon in latlng]
            if len(pts) >= 2:
                draw_map.line(pts, fill=route_color, width=line_width, joint="curve")

            # 3. Assemble full canvas: map section + data overlay
            overlay_bg = hex_to_rgb(solid_color) if background_type == 'solid' else (0, 0, 0)
            full_img   = Image.new('RGB', (width_px, height_px), color=overlay_bg)
            full_img.paste(map_img, (0, 0))

            draw_full = ImageDraw.Draw(full_img)
            title_sz  = max(130, int(overlay_h * 0.22))
            sub_sz    = max(70,  int(overlay_h * 0.12))
            title_font = _load_font(title_sz)
            sub_font   = _load_font(sub_sz)
            _ov_dark   = sum(overlay_bg) < 384
            txt_fill   = (255, 255, 255) if _ov_dark else (20, 20, 20)

            def _draw_centered(text, font, y):
                try:
                    tw = int(draw_full.textlength(text, font=font))
                except Exception:
                    try:
                        tw = int(font.getlength(text))
                    except Exception:
                        tw = 0
                draw_full.text((max(0, (width_px - tw) // 2), y),
                               text, fill=txt_fill, font=font)

            if title:
                _draw_centered(title,    title_font, map_h + int(overlay_h * 0.18))
            if subtitle:
                _draw_centered(subtitle, sub_font,   map_h + int(overlay_h * 0.55))

        # ──────────────────────────────────────────────────────────────────────
        # 4.  Serialise as print-ready CMYK PDF at 300 DPI
        # ──────────────────────────────────────────────────────────────────────
        timestamp = datetime.utcnow().strftime('%Y%m%d%H%M%S')
        athlete   = session.get('athlete') or {}
        username  = athlete.get('username', 'unknown')
        user_id   = str(athlete.get('id', ''))
        filename  = secure_filename(f"poster_{username}_{timestamp}.pdf")

        cmyk_img = full_img.convert('CMYK')
        img_io = io.BytesIO()
        cmyk_img.save(img_io, format='PDF', resolution=300.0)
        img_io.seek(0)

        try:
            bucket_name = os.getenv("S3_BUCKET")
            aws_region = os.getenv("AWS_REGION", "us-east-1")
            s3_client = boto3.client('s3')
            s3_key = f"posters/{filename}"
            s3_client.put_object(
                Bucket=bucket_name,
                Key=s3_key,
                Body=img_io,
                ContentType='application/pdf',
                ACL='public-read',
                Metadata={
                    'activity-id':     str(activity_id),
                    'title':           str(title)[:256],
                    'background-type': str(background_type),
                    'line-color':      str(line_color),
                    'solid-color':     str(solid_color),
                    'style-id':        str(style_id),
                    'line-width':      str(line_width),
                    'monochrome':      str(monochrome).lower(),
                    'blur-radius':     str(blur_radius),
                    'mono-color':      str(mono_color),
                    'width-px':        str(width_px),
                    'height-px':       str(height_px),
                    'username':        str(username),
                    'user-id':         str(user_id),
                },
            )
            public_url = f"https://{bucket_name}.s3.{aws_region}.amazonaws.com/{s3_key}"
        except Exception as e:
            logger.exception("S3 upload failed")
            return jsonify({"error": "Failed to upload to S3"}), 500

        # Insert DB record (optional in MVP mode)
        if conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO posters (user_name, user_id, activity_id, params, image_path) VALUES (%s,%s,%s,%s,%s) RETURNING id",
                    (username, user_id, activity_id, json.dumps(payload), public_url)
                )
                poster_id = cur.fetchone()[0]
                conn.commit()
        else:
            poster_id = "no_db"
        return jsonify({"id": poster_id, "image_url": public_url})
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

# ── Shopify checkout helpers ──────────────────────────────────────────────────

def _build_checkout_url(activity_name, activity_date, distance_km, map_style, poster_url=''):
    """
    Return a Shopify checkout URL.
    - If SHOPIFY_STOREFRONT_TOKEN is configured → Storefront API checkoutCreate mutation
    - Otherwise → cart permalink (no token needed, works immediately)
    """
    VARIANT_ID = os.getenv('SHOPIFY_VARIANT_ID', '53104872849750')
    raw = SHOPIFY_SHOP_URL or 'cycling-app.myshopify.com'
    store = raw.replace('https://', '').replace('http://', '').rstrip('/')
    sf_token = os.getenv('SHOPIFY_STOREFRONT_TOKEN', '')

    if sf_token:
        endpoint = f'https://{store}/api/2024-01/graphql.json'
        mutation = """
        mutation checkoutCreate($input: CheckoutCreateInput!) {
          checkoutCreate(input: $input) {
            checkout { webUrl }
            checkoutUserErrors { code field message }
          }
        }"""
        variables = {
            'input': {
                'lineItems': [
                    {'variantId': f'gid://shopify/ProductVariant/{VARIANT_ID}', 'quantity': 1}
                ],
                'customAttributes': [
                    {'key': 'Nazwa aktywno\u015bci', 'value': activity_name},
                    {'key': 'Data',             'value': activity_date},
                    {'key': 'Dystans',          'value': distance_km},
                    {'key': 'Styl mapy',        'value': map_style},
                    {'key': 'Plik plakatu',     'value': poster_url},
                ],
            }
        }
        try:
            r = requests.post(
                endpoint,
                json={'query': mutation, 'variables': variables},
                headers={
                    'X-Shopify-Storefront-Access-Token': sf_token,
                    'Content-Type': 'application/json',
                },
                timeout=15,
            )
            data = r.json()
            node = (data.get('data') or {}).get('checkoutCreate', {}).get('checkout')
            if node and node.get('webUrl'):
                logger.info(f'Storefront API checkout: {node["webUrl"][:80]}')
                return node['webUrl']
            errs = (data.get('data') or {}).get('checkoutCreate', {}).get('checkoutUserErrors', [])
            logger.warning(f'Storefront checkoutCreate errors: {errs}')
        except Exception as exc:
            logger.warning(f'Storefront API failed ({exc}), falling back to cart URL')

    # Cart permalink fallback (no token required)
    attrs = {
        'attributes[Nazwa aktywno\u015bci]': activity_name,
        'attributes[Data]':              activity_date,
        'attributes[Dystans]':           distance_km,
        'attributes[Styl mapy]':         map_style,
    }
    if poster_url:
        attrs['attributes[Plik plakatu]'] = poster_url
    qs = _urlparse.urlencode(attrs, quote_via=_urlparse.quote)
    return f'https://{store}/cart/{VARIANT_ID}:1?{qs}'


@app.route('/apps/poster/generate-and-checkout', methods=['POST'])
def generate_and_checkout():
    """
    One-step generate & checkout.

    Request body (JSON):
        activity_name  - activity title
        activity_date  - date string
        distance_km    - distance string ("42.3 km")
        map_style      - "map" | "photo" | "minimal"
        activity_id    - Strava activity ID (used for poster generation)

    Response:
        { "checkout_url": "https://..." }
    """
    try:
        payload       = request.get_json(force=True) or {}
        activity_name = str(payload.get('activity_name') or '').strip()
        activity_date = str(payload.get('activity_date') or '').strip()
        distance_km   = str(payload.get('distance_km')   or '').strip()
        map_style     = str(payload.get('map_style')      or 'map').strip()
        activity_id   = str(payload.get('activity_id')    or '').strip()

        auth_header  = request.headers.get('Authorization', '')
        access_token = None
        if auth_header.lower().startswith('bearer '):
            access_token = auth_header.split(' ', 1)[1].strip()

        # ── Step 1: Generate poster & upload to S3 ───────────────────────────
        # Delegate to save_poster_composed via the Flask test client so we
        # don't duplicate the ~300-line composition code.
        poster_url = ''
        if activity_id:
            try:
                hdrs = {}
                if access_token:
                    hdrs['Authorization'] = f'Bearer {access_token}'
                with app.test_client() as tc:
                    resp = tc.post(
                        '/api/save_poster_composed',
                        json={
                            'activity_id':     activity_id,
                            'title':           activity_name,
                            'background_type': 'map' if map_style == 'map' else 'solid',
                            'style_id':        'mapbox/light-v11',
                        },
                        headers=hdrs,
                    )
                    result = resp.get_json() or {}
                    poster_url = result.get('image_url', '')
                    if not poster_url:
                        logger.warning(f'save_poster_composed returned no image_url: {result}')
            except Exception as exc:
                logger.warning(f'Poster generation skipped (checkout continues): {exc}')

        # ── Step 2: Build Shopify checkout URL ───────────────────────────────
        checkout_url = _build_checkout_url(
            activity_name=activity_name,
            activity_date=activity_date,
            distance_km=distance_km,
            map_style=map_style,
            poster_url=poster_url,
        )
        logger.info(f'generate_and_checkout → {checkout_url[:100]}')
        return jsonify({'checkout_url': checkout_url})

    except Exception:
        logger.exception('generate_and_checkout error')
        return jsonify({'error': 'Internal server error'}), 500


# ---------- Photo upload ----------
import uuid as _uuid
import urllib.parse as _urlparse

ALLOWED_PHOTO_TYPES = {
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
}
_EXT_TO_MIME = {
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
    'webp': 'image/webp', 'heic': 'image/heic', 'heif': 'image/heif',
}

@app.route('/api/upload_photo', methods=['POST'])
def api_upload_photo():
    """Upload a user photo, store locally in generated/ and return a URL."""
    f = request.files.get('photo')
    if not f or not f.filename:
        return jsonify(error='missing_photo', detail='Provide a photo file'), 400

    ct = (f.content_type or '').lower()
    ext = (f.filename.rsplit('.', 1)[-1] if '.' in f.filename else '').lower()
    if ct not in ALLOWED_PHOTO_TYPES and _EXT_TO_MIME.get(ext) not in ALLOWED_PHOTO_TYPES:
        return jsonify(error='invalid_type', detail=f'Unsupported image type: {ct or ext}'), 400

    img_bytes = f.read()

    # Detect dimensions
    width, height = 0, 0
    try:
        img = Image.open(io.BytesIO(img_bytes))
        width, height = img.size
    except Exception as e:
        logger.warning(f'Could not read image dimensions: {e}')

    out_ext = ext if ext in ('jpg', 'jpeg', 'png', 'webp') else 'jpg'
    filename = f"{_uuid.uuid4()}.{out_ext}"
    filepath = os.path.join(GENERATED_DIR, filename)
    with open(filepath, 'wb') as fp:
        fp.write(img_bytes)

    photo_url = url_for('serve_generated', filename=filename, _external=True)
    logger.info(f'/api/upload_photo: stored {filename} url={photo_url} size={width}x{height}')
    return jsonify(ok=True, photo_url=photo_url, width=width, height=height)

# Health check for API-only use
@app.route('/api/health')
def health():
    return jsonify(status="ok")

if __name__ == '__main__':
    app.run(debug=True, port=5050)
