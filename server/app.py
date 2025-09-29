import io
import os
import uuid
from typing import Tuple, List

from dotenv import load_dotenv
from flask import Flask, abort, jsonify, request, send_from_directory, make_response
from loguru import logger
from PIL import Image, ImageDraw
import gpxpy
import requests

from .utils import verify_app_proxy_signature
from .storage import store_image


load_dotenv()


def create_app() -> Flask:
    app = Flask(__name__)

    # Config
    app.config['MAX_CONTENT_LENGTH'] = int(os.getenv('MAX_UPLOAD_MB', '10')) * 1024 * 1024
    storage_dir = os.getenv('POSTER_STORAGE_DIR', os.path.join(os.path.dirname(__file__), 'storage'))
    os.makedirs(storage_dir, exist_ok=True)
    app.config['POSTER_STORAGE_DIR'] = storage_dir

    @app.get('/healthz')
    def healthz():
        return jsonify(ok=True)

    @app.get('/proxy/ping')
    def proxy_ping():
        if not verify_app_proxy_signature(request):
            abort(401, 'Invalid signature')
        shop = request.args.get('shop')
        return jsonify(ok=True, shop=shop)

    @app.route('/proxy/generate', methods=['POST'])
    def proxy_generate():
        if not verify_app_proxy_signature(request):
            abort(401, 'Invalid signature')

        source = request.form.get('source') or (request.json or {}).get('source')

        if source == 'strava':
            payload = request.json or request.form
            access_token = payload.get('access_token')
            activity_id = payload.get('activity_id')
            if not access_token or not activity_id:
                return jsonify(error='missing_strava_params', detail='access_token and activity_id required'), 400
            try:
                points = fetch_strava_latlng(access_token=access_token, activity_id=str(activity_id))
                gpx_text = gpx_from_points(points)
                img_bytes, width, height = render_poster_from_gpx(gpx_text, out_w=_highres_w(), out_h=_highres_h())
            except Exception as e:
                logger.exception('Strava render failed')
                return jsonify(error='strava_render_failed', detail=str(e)), 500
            filename = f"{uuid.uuid4()}.png"
            file_url, key = store_image(img_bytes, filename_hint=filename)
            return jsonify(ok=True, id=key, preview_url=file_url, width=width, height=height)

        # GPX upload flow
        gpx_data = None
        if request.files.get('gpx_file'):
            data = request.files['gpx_file'].read()
            try:
                gpx_data = data.decode('utf-8', errors='ignore')
            except Exception:
                gpx_data = data.decode('latin-1', errors='ignore')
        elif request.json and request.json.get('gpx'):
            gpx_data = request.json['gpx']
        elif request.form and request.form.get('gpx'):
            gpx_data = request.form.get('gpx')

        if not gpx_data:
            return jsonify(error='missing_gpx'), 400

        try:
            img_bytes, width, height = render_poster_from_gpx(gpx_data, out_w=_highres_w(), out_h=_highres_h())
        except Exception as e:
            logger.exception('GPX render failed')
            return jsonify(error='render_failed', detail=str(e)), 500

        filename = f"{uuid.uuid4()}.png"
        file_url, key = store_image(img_bytes, filename_hint=filename)
        return jsonify(ok=True, id=key, preview_url=file_url, width=width, height=height)

    @app.get('/files/<path:filename>')
    def files(filename: str):
        return send_from_directory(app.config['POSTER_STORAGE_DIR'], filename, as_attachment=False)

    @app.get('/proxy/config')
    def proxy_config():
        if not verify_app_proxy_signature(request):
            abort(401, 'Invalid signature')
        variant_id = os.getenv('POSTER_PRODUCT_VARIANT_ID')
        public_base = _public_base_url()
        strava_auth_url = f"{public_base}/strava/auth" if public_base else None
        backend_origin = public_base
        return jsonify(ok=True, poster_product_variant_id=variant_id, strava_auth_url=strava_auth_url, backend_origin=backend_origin)

    @app.get('/strava/auth')
    def strava_auth():
        client_id = os.getenv('STRAVA_CLIENT_ID')
        redirect_base = _public_base_url()
        if not client_id or not redirect_base:
            return jsonify(error='strava_not_configured'), 500
        redirect_uri = f"{redirect_base}/strava/callback"
        state = str(uuid.uuid4())
        resp = make_response('', 302)
        resp.set_cookie('strava_oauth_state', state, httponly=True, secure=True, samesite='Lax', max_age=600)
        params = {
            'client_id': client_id,
            'redirect_uri': redirect_uri,
            'response_type': 'code',
            'approval_prompt': 'auto',
            'scope': 'activity:read,activity:read_all',
            'state': state,
        }
        url = 'https://www.strava.com/oauth/authorize'
        from urllib.parse import urlencode
        resp.headers['Location'] = f"{url}?{urlencode(params)}"
        return resp

    @app.get('/strava/callback')
    def strava_callback():
        expected_state = request.cookies.get('strava_oauth_state')
        state = request.args.get('state')
        code = request.args.get('code')
        if not expected_state or expected_state != state:
            return 'State mismatch', 400
        client_id = os.getenv('STRAVA_CLIENT_ID')
        client_secret = os.getenv('STRAVA_CLIENT_SECRET')
        if not client_id or not client_secret:
            return 'Strava not configured', 500
        # Exchange code for token
        token_resp = requests.post('https://www.strava.com/oauth/token', json={
            'client_id': client_id,
            'client_secret': client_secret,
            'code': code,
            'grant_type': 'authorization_code',
        }, timeout=20)
        if token_resp.status_code != 200:
            return f"Token exchange failed: {token_resp.text}", 400
        data = token_resp.json()
        access_token = data.get('access_token')
        expires_at = data.get('expires_at')
        athlete = data.get('athlete', {})
        athlete_name = (athlete.get('firstname') or '') + ' ' + (athlete.get('lastname') or '')
        # Return a minimal HTML that posts message to opener and closes
        origin = _public_base_url() or '*'
        html = f"""
<!doctype html>
<html><body>
<script>
  (function() {{
    var msg = {{ type: 'strava_oauth', access_token: '{access_token}', expires_at: {expires_at}, athlete: {repr(athlete_name)} }};
    if (window.opener) {{
      window.opener.postMessage(msg, '*');
    }}
    window.close();
  }})();
</script>
Zamknij to okno.
</body></html>
"""
        return html

    return app


def _public_base_url() -> str | None:
    return os.getenv('PUBLIC_BASE_URL')


def _highres_w() -> int:
    return int(os.getenv('POSTER_OUT_W', '4800'))


def _highres_h() -> int:
    return int(os.getenv('POSTER_OUT_H', '3600'))


def gpx_from_points(points: List[tuple]) -> str:
    import datetime
    from xml.sax.saxutils import escape
    # points is a list of (lon, lat)
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="poster-app" xmlns="http://www.topografix.com/GPX/1/1">',
        '<trk><name>Strava Activity</name><trkseg>'
    ]
    for lon, lat in points:
        parts.append(f'<trkpt lat="{lat}" lon="{lon}"></trkpt>')
    parts.append('</trkseg></trk></gpx>')
    return '\n'.join(parts)


def fetch_strava_latlng(access_token: str, activity_id: str) -> List[tuple]:
    url = f'https://www.strava.com/api/v3/activities/{activity_id}/streams'
    params = {'keys': 'latlng', 'key_by_type': 'true'}
    headers = {'Authorization': f'Bearer {access_token}'}
    r = requests.get(url, params=params, headers=headers, timeout=20)
    if r.status_code != 200:
        raise RuntimeError(f'Strava API error: {r.status_code} {r.text}')
    data = r.json()
    latlng = data.get('latlng', {}).get('data')
    if not latlng:
        raise RuntimeError('No latlng stream available')
    # convert to (lon, lat)
    return [(pt[1], pt[0]) for pt in latlng]


def render_poster_from_gpx(gpx_text: str, out_w: int = 1600, out_h: int = 1200, margin: int = 80) -> Tuple[bytes, int, int]:
    # Parse GPX
    gpx = gpxpy.parse(io.StringIO(gpx_text))

    # Collect points
    points = []
    for track in gpx.tracks:
        for segment in track.segments:
            for p in segment.points:
                points.append((p.longitude, p.latitude))

    if not points:
        raise ValueError('No points in GPX')

    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    rangex = maxx - minx or 1e-9
    rangey = maxy - miny or 1e-9

    # Fit into canvas preserving aspect ratio
    drawable_w = out_w - 2 * margin
    drawable_h = out_h - 2 * margin
    scale_x = drawable_w / rangex
    scale_y = drawable_h / rangey
    scale = min(scale_x, scale_y)

    # Centering offsets
    offset_x = (out_w - (rangex * scale)) / 2
    offset_y = (out_h - (rangey * scale)) / 2

    # Create image
    img = Image.new('RGB', (out_w, out_h), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)

    def transform(pt):
        x = (pt[0] - minx) * scale + offset_x
        # invert Y to keep north-up orientation
        y = out_h - ((pt[1] - miny) * scale + offset_y)
        return (x, y)

    transformed = list(map(transform, points))

    # Draw route
    draw.line(transformed, fill=(0, 0, 0), width=6)

    # Start/finish markers
    r = 10
    sx, sy = transformed[0]
    ex, ey = transformed[-1]
    draw.ellipse((sx - r, sy - r, sx + r, sy + r), fill=(34, 197, 94))  # green start
    draw.ellipse((ex - r, ey - r, ex + r, ey + r), fill=(239, 68, 68))  # red end

    buf = io.BytesIO()
    img.save(buf, format='PNG', optimize=True)
    return buf.getvalue(), out_w, out_h


app = create_app()
