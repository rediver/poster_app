import io
import os
import uuid
from typing import Tuple, List
from datetime import datetime, timezone

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

    # CORS (allow frontend origin to call API with Authorization header)
    try:
        from flask_cors import CORS  # type: ignore
        frontend_origin = os.getenv('FRONTEND_ORIGIN') or os.getenv('FRONTEND_URL')
        if frontend_origin:
            CORS(app, supports_credentials=True, resources={r"/api/*": {"origins": [frontend_origin], "allow_headers": ["Authorization", "Content-Type"]}})
    except Exception:
        # If flask-cors is not installed locally, continue without CORS (Render installs it via requirements)
        pass

    # Config
    app.config['MAX_CONTENT_LENGTH'] = int(os.getenv('MAX_UPLOAD_MB', '10')) * 1024 * 1024
    storage_dir = os.getenv('POSTER_STORAGE_DIR', os.path.join(os.path.dirname(__file__), 'storage'))
    os.makedirs(storage_dir, exist_ok=True)
    app.config['POSTER_STORAGE_DIR'] = storage_dir

    @app.get('/healthz')
    def healthz():
        return jsonify(ok=True)

    @app.get('/debug/env')
    def debug_env():
        return jsonify({
            'PUBLIC_BASE_URL': os.getenv('PUBLIC_BASE_URL') or 'NOT_SET',
            'STRAVA_CLIENT_ID': os.getenv('STRAVA_CLIENT_ID') or 'NOT_SET',
            'STRAVA_CLIENT_SECRET': 'SET' if os.getenv('STRAVA_CLIENT_SECRET') else 'NOT_SET',
            'SHOPIFY_API_SECRET': 'SET' if os.getenv('SHOPIFY_API_SECRET') else 'NOT_SET',
            'MAPBOX_ACCESS_TOKEN': 'SET' if os.getenv('MAPBOX_ACCESS_TOKEN') else 'NOT_SET'
        })

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

    # ---------- Public API (for SPA frontend) ----------
    @app.post('/api/generate')
    def api_generate():
        """
        Render a poster image from provided points and store it, returning a public URL.
        Expected JSON body: { "points": [[lat, lon], ...] }
        """
        try:
            raw_len = len(request.data or b'')
        except Exception:
            raw_len = -1
        logger.info(f"/api/generate: content_type={request.content_type} raw_len={raw_len}")
        data = request.get_json(silent=True) or {}
        logger.info(f"/api/generate: parsed_json_keys={list(data.keys()) if isinstance(data, dict) else type(data)}")
        pts = data.get('points') or data.get('latlng') or []
        if not isinstance(pts, list) or not pts:
            logger.warning('/api/generate: missing or invalid points field')
            return jsonify(error='missing_points', detail='Provide points=[[lat, lon], ...]'), 400
        logger.info(f"/api/generate: points_count={len(pts)} sample={pts[:3]}")
        try:
            # Convert to (lon, lat) pairs
            lonlat: List[tuple] = []
            for p in pts:
                if isinstance(p, (list, tuple)) and len(p) >= 2:
                    try:
                        lat, lon = float(p[0]), float(p[1])
                        lonlat.append((lon, lat))
                    except Exception as conv_e:
                        logger.warning(f"/api/generate: failed to convert point {p}: {conv_e}")
                else:
                    logger.warning(f"/api/generate: skipping invalid point structure: {p}")
            if not lonlat:
                logger.warning('/api/generate: lonlat empty after conversion')
                return jsonify(error='invalid_points', detail='No valid points after conversion'), 400
            logger.info(f"/api/generate: lonlat_count={len(lonlat)} sample={lonlat[:3]}")
            w, h = _highres_w(), _highres_h()
            logger.info(f"/api/generate: rendering at {w}x{h}")
            gpx_text = gpx_from_points(lonlat)
            logger.info(f"/api/generate: gpx_length={len(gpx_text)}")
            img_bytes, width, height = render_poster_from_gpx(gpx_text, out_w=w, out_h=h)
            logger.info(f"/api/generate: render complete, image_bytes={len(img_bytes)} size={width}x{height}")
            filename = f"{uuid.uuid4()}.png"
            try:
                file_url, key = store_image(img_bytes, filename_hint=filename)
            except Exception as se:
                logger.exception('/api/generate: store failed')
                return jsonify(error='storage_failed', detail=str(se)), 500
            logger.info(f"/api/generate: stored image url={file_url} key={key}")
            return jsonify(ok=True, id=key, preview_url=file_url, width=width, height=height)
        except Exception as e:
            logger.exception('API generate failed')
            return jsonify(error='render_failed', detail=str(e)), 500

    @app.post('/api/create_product')
    def api_create_product():
        """
        Create a Shopify product with provided image URL (Admin API).
        Expected JSON body similar to /proxy/create_product.
        """
        payload = request.get_json(silent=True) or {}
        logger.info(f"/api/create_product: payload_keys={list(payload.keys())}")
        image_url = payload.get('image_url') or payload.get('preview_url')
        if image_url and image_url.startswith('/'):
            base = _public_base_url()
            if base:
                image_url = f"{base.rstrip('/')}{image_url}"
        logger.info(f"/api/create_product: image_url={image_url}")

        shop = (os.getenv('SHOPIFY_SHOP_URL') or os.getenv('SHOPIFY_SHOP') or os.getenv('SHOPIFY_STORE') or '').strip()
        access_token = (os.getenv('SHOPIFY_ADMIN_ACCESS_TOKEN') or os.getenv('SHOPIFY_ACCESS_TOKEN') or '').strip()
        if not shop or not access_token:
            logger.error('/api/create_product: Shopify not configured')
            return jsonify(error='shopify_not_configured', detail='Set SHOPIFY_SHOP_URL and SHOPIFY_ADMIN_ACCESS_TOKEN'), 500

        if shop.startswith('http://') or shop.startswith('https://'):
            from urllib.parse import urlparse
            shop_domain = urlparse(shop).netloc
        else:
            shop_domain = shop
        logger.info(f"/api/create_product: shop_domain={shop_domain}")

        title = payload.get('title') or f"Poster {payload.get('poster_id') or str(uuid.uuid4())[:8]}"
        vendor = os.getenv('POSTER_VENDOR') or 'Poster App'
        product_type = os.getenv('POSTER_PRODUCT_TYPE') or 'Poster'
        status = (os.getenv('POSTER_PRODUCT_STATUS') or 'active').lower()
        price = os.getenv('POSTER_PRODUCT_PRICE')
        tags = os.getenv('POSTER_PRODUCT_TAGS') or 'poster,generated'

        product = {
            'title': title,
            'body_html': 'Generated poster product',
            'vendor': vendor,
            'product_type': product_type,
            'status': status,
            'tags': tags,
        }
        # Publish to Online Store by default unless explicitly disabled
        publish_flag = (os.getenv('POSTER_PUBLISH') or 'true').lower() in ('1', 'true', 'yes', 'on')
        if status == 'active' and publish_flag:
            now_iso = datetime.now(timezone.utc).isoformat()
            product['published_at'] = now_iso
            product['published_scope'] = 'web'
            logger.info(f"/api/create_product: publishing product now published_at={now_iso}")

        if image_url:
            product['images'] = [{'src': image_url}]
        if price is not None and str(price).strip() != '':
            product['variants'] = [{
                'option1': 'Default',
                'price': str(price).strip(),
            }]

        api_url = f"https://{shop_domain}/admin/api/2024-07/products.json"
        headers = {
            'X-Shopify-Access-Token': access_token,
            'Content-Type': 'application/json',
        }
        try:
            resp = requests.post(api_url, json={'product': product}, headers=headers, timeout=30)
        except Exception as e:
            logger.exception('Failed calling Shopify Admin API')
            return jsonify(error='shopify_request_failed', detail=str(e)), 502

        logger.info(f"/api/create_product: Shopify response status={resp.status_code}")
        if resp.status_code not in (200, 201):
            logger.error(f"/api/create_product: API error {resp.status_code}: {resp.text[:300]}")
            return jsonify(error='shopify_api_error', status=resp.status_code, detail=resp.text), 502

        data = resp.json()
        created = data.get('product') or data
        product_id = created.get('id')
        handle = created.get('handle')
        online_url = f"https://{shop_domain}/products/{handle}" if handle else None
        admin_url = f"https://{shop_domain}/admin/products/{product_id}" if product_id else None
        logger.info(f"/api/create_product: product_id={product_id} handle={handle} product_url={online_url}")

        return jsonify(ok=True, product_id=product_id, handle=handle, product_url=online_url, admin_url=admin_url, product=created)

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
        logger.info('Strava auth initiated')
        client_id = os.getenv('STRAVA_CLIENT_ID')
        redirect_base = _public_base_url()
        logger.info(f'Strava config: client_id={client_id}, redirect_base={redirect_base}')
        if not client_id or not redirect_base:
            logger.error('Strava not configured')
            return jsonify(error='strava_not_configured'), 500
        redirect_uri = f"{redirect_base}/strava/callback"
        state = str(uuid.uuid4())
        logger.info(f'Generated state: {state}, redirect_uri: {redirect_uri}')
        resp = make_response('', 302)
        secure_cookie = (redirect_base.startswith('https://') if redirect_base else False)
        resp.set_cookie('strava_oauth_state', state, httponly=True, secure=secure_cookie, samesite='Lax', max_age=600)
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
        final_url = f"{url}?{urlencode(params)}"
        logger.info(f'Redirecting to Strava: {final_url}')
        resp.headers['Location'] = final_url
        return resp

    @app.get('/strava/callback')
    def strava_callback():
        logger.info('Strava callback received')
        logger.info(f'Request args: {dict(request.args)}')
        logger.info(f'Request cookies: {dict(request.cookies)}')
        
        expected_state = request.cookies.get('strava_oauth_state')
        state = request.args.get('state')
        code = request.args.get('code')
        error = request.args.get('error')
        
        logger.info(f'State validation: expected={expected_state}, received={state}')
        logger.info(f'Authorization code: {code}')
        
        if error:
            logger.error(f'Strava OAuth error: {error}')
            return f'Strava authorization failed: {error}', 400
            
        if not code:
            logger.error('No authorization code received')
            return 'No authorization code received', 400
            
        if not expected_state or expected_state != state:
            logger.error('State mismatch in OAuth callback')
            return 'State mismatch', 400
            
        client_id = os.getenv('STRAVA_CLIENT_ID')
        client_secret = os.getenv('STRAVA_CLIENT_SECRET')
        if not client_id or not client_secret:
            logger.error('Strava credentials not configured')
            return 'Strava not configured', 500
            
        # Exchange code for token
        logger.info('Exchanging code for access token')
        token_resp = requests.post('https://www.strava.com/oauth/token', json={
            'client_id': client_id,
            'client_secret': client_secret,
            'code': code,
            'grant_type': 'authorization_code',
        }, timeout=20)
        
        logger.info(f'Token exchange response: {token_resp.status_code}')
        if token_resp.status_code != 200:
            logger.error(f'Token exchange failed: {token_resp.text}')
            return f"Token exchange failed: {token_resp.text}", 400
            
        data = token_resp.json()
        logger.info(f'Token data received: {list(data.keys())}')
        
        access_token = data.get('access_token')
        expires_at = data.get('expires_at')
        athlete = data.get('athlete', {})
        athlete_name = (athlete.get('firstname') or '') + ' ' + (athlete.get('lastname') or '')
        
        logger.info(f'OAuth success: athlete={athlete_name}, token_expires={expires_at}')
        
        # Return a minimal HTML that posts message to opener and closes
        origin = _public_base_url() or '*'
        html = f"""
<!doctype html>
<html><body>
<h2>Strava Authorization Successful!</h2>
<p>Welcome {athlete_name}! This window should close automatically.</p>
<script>
  console.log('Strava callback page loaded');
  (function() {{
    var msg = {{ 
      type: 'strava_oauth', 
      access_token: '{access_token}', 
      expires_at: {expires_at}, 
      athlete: '{athlete_name.replace("'", "\\'")}'  
    }};
    console.log('Sending postMessage:', msg);
    
    if (window.opener) {{
      console.log('Found opener window, sending message');
      window.opener.postMessage(msg, '*');
      setTimeout(function() {{
        console.log('Closing popup window');
        window.close();
      }}, 2000);
    }} else {{
      console.log('No opener window found');
      alert('Authorization successful! Please close this window and return to the app.');
    }}
  }})();
</script>
</body></html>
"""
        logger.info('Returning callback HTML page')
        return html

    @app.get('/api/strava/download_gpx/<activity_id>')
    def api_strava_download_gpx(activity_id: str):
        auth_header = request.headers.get('Authorization', '')
        access_token = None
        try:
            if auth_header.lower().startswith('bearer '):
                access_token = auth_header.split(' ', 1)[1]
        except Exception:
            access_token = None
        if not access_token:
            return jsonify(error='missing_access_token', detail='Provide Bearer token in Authorization header'), 401
        try:
            points = fetch_strava_latlng(access_token=access_token, activity_id=str(activity_id))
            gpx_text = gpx_from_points(points)
            resp = make_response(gpx_text)
            resp.headers['Content-Type'] = 'application/gpx+xml; charset=utf-8'
            return resp
        except Exception as e:
            logger.exception('Failed to build GPX from Strava')
            return jsonify(error='strava_gpx_failed', detail=str(e)), 500

    @app.get('/api/strava/activities')
    def strava_activities():
        # This endpoint would need to store and retrieve user's access token
        # For now, return mock data or error
        logger.info('Strava activities endpoint called')
        # TODO: Implement proper token storage and retrieval
        return jsonify(error='activities_endpoint_not_implemented', detail='Need to implement token storage'), 501

    @app.get('/api/mapbox/static')
    def mapbox_static():
        try:
            logger.info(f"Mapbox static request args: {dict(request.args)}")
            w = int(request.args.get('w', '800'))
            h = int(request.args.get('h', '600'))
            style_id = request.args.get('style') or 'mapbox/streets-v11'
            token = os.getenv('MAPBOX_ACCESS_TOKEN')
            if not token:
                logger.error('MAPBOX_ACCESS_TOKEN not configured on server')
                return jsonify(error='MAPBOX_ACCESS_TOKEN not configured on server'), 500

            # Clamp size
            w_req = max(1, min(1280, w))
            h_req = max(1, min(1280, h))

            center = request.args.get('center')
            zoom = request.args.get('zoom')
            bbox = request.args.get('bbox')
            bearing = request.args.get('bearing', '0')
            pitch = request.args.get('pitch', '0')

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
                return jsonify(error='Provide center (and optional zoom) or bbox'), 400

            logger.info(f"Proxy Mapbox static URL: {static_url}")
            resp = requests.get(static_url, timeout=30)
            if resp.status_code != 200:
                logger.error(f"Mapbox static error {resp.status_code}: {resp.text[:200]}")
                return jsonify(error='Failed to fetch map image', status=resp.status_code), 502

            out = make_response(resp.content)
            out.headers['Content-Type'] = resp.headers.get('Content-Type', 'image/png')
            # Optional caching header
            out.headers['Cache-Control'] = 'public, max-age=300'
            return out
        except Exception:
            logger.exception('Error proxying Mapbox static image')
            return jsonify(error='Internal error fetching map image'), 500

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
    logger.info(f"render_poster_from_gpx: start out_w={out_w} out_h={out_h} margin={margin} gpx_len={len(gpx_text) if gpx_text else 0}")
    # Parse GPX
    gpx = gpxpy.parse(io.StringIO(gpx_text))

    # Collect points
    points = []
    for track in gpx.tracks:
        for segment in track.segments:
            for p in segment.points:
                points.append((p.longitude, p.latitude))

    logger.info(f"render_poster_from_gpx: collected_points={len(points)}")
    if not points:
        raise ValueError('No points in GPX')

    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    rangex = maxx - minx or 1e-9
    rangey = maxy - miny or 1e-9
    logger.info(f"render_poster_from_gpx: bbox lon=({minx},{maxx}) lat=({miny},{maxy}) range=({rangex},{rangey})")

    # Fit into canvas preserving aspect ratio
    drawable_w = out_w - 2 * margin
    drawable_h = out_h - 2 * margin
    scale_x = drawable_w / rangex
    scale_y = drawable_h / rangey
    scale = min(scale_x, scale_y)
    logger.info(f"render_poster_from_gpx: drawable={drawable_w}x{drawable_h} scale={scale:.6f}")

    # Centering offsets
    offset_x = (out_w - (rangex * scale)) / 2
    offset_y = (out_h - (rangey * scale)) / 2
    logger.info(f"render_poster_from_gpx: offsets x={offset_x:.2f} y={offset_y:.2f}")

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
    out = buf.getvalue()
    logger.info(f"render_poster_from_gpx: done png_bytes={len(out)}")
    return out, out_w, out_h


app = create_app()
