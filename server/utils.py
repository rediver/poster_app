import hashlib
import hmac
import os

from flask import Request
from loguru import logger


def verify_app_proxy_signature(request: Request) -> bool:
    """
    Validate Shopify App Proxy request using the shared secret.

    App Proxy signature is computed as hex(HMAC-SHA256(secret, path + '?' + raw_querystring_without_signature)),
    preserving the original query parameter order and encoding.

    Note: In development, if SHOPIFY_API_SECRET is missing, the check is skipped.
    """
    secret = os.getenv('SHOPIFY_API_SECRET') or os.getenv('SHOPIFY_APP_SECRET') or ''
    if not secret:
        logger.warning('SHOPIFY_API_SECRET not set; skipping App Proxy signature verification (dev only)')
        return True

    signature = request.args.get('signature')
    if not signature:
        return False

    raw_qs = request.query_string.decode('utf-8', errors='ignore')
    # Remove signature parameter while preserving order/encoding
    if raw_qs:
        parts = raw_qs.split('&')
        parts = [p for p in parts if not p.startswith('signature=')]
        canonical_query = '&'.join(parts)
    else:
        canonical_query = ''

    base_string = request.path
    if canonical_query:
        base_string = f"{base_string}?{canonical_query}"

    digest = hmac.new(secret.encode('utf-8'), base_string.encode('utf-8'), hashlib.sha256).hexdigest()

    return hmac.compare_digest(digest, signature.lower())
