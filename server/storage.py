import os
import uuid
from typing import Tuple

import boto3
from botocore.client import Config
from loguru import logger


def _s3_client():
    region = os.getenv('AWS_REGION') or os.getenv('AWS_DEFAULT_REGION')
    session = boto3.session.Session(region_name=region)
    return session.client('s3', config=Config(signature_version='s3v4'))


def _s3_public_url(bucket: str, key: str) -> str:
    base = os.getenv('S3_PUBLIC_BASE_URL')
    if base:
        return f"{base.rstrip('/')}/{key}"
    region = os.getenv('AWS_REGION') or 'us-east-1'
    return f"https://{bucket}.s3.{region}.amazonaws.com/{key}"


def store_image(img_bytes: bytes, filename_hint: str | None = None) -> Tuple[str, str]:
    """
    Store an image according to POSTER_STORAGE_MODE (local|s3).
    Returns (public_url, storage_key_or_path).
    """
    mode = (os.getenv('POSTER_STORAGE_MODE') or 'local').lower()
    key_prefix = os.getenv('S3_KEY_PREFIX', 'posters/')

    if mode == 's3':
        bucket = os.getenv('S3_BUCKET')
        if not bucket:
            raise RuntimeError('S3_BUCKET is required when POSTER_STORAGE_MODE=s3')
        file_id = str(uuid.uuid4())
        name = filename_hint or f'{file_id}.png'
        key = f"{key_prefix}{name}"
        client = _s3_client()
        extra = {'ContentType': 'image/png'}
        if (os.getenv('S3_PUBLIC_READ') or 'false').lower() in ('1','true','yes'): 
            extra['ACL'] = 'public-read'
        client.put_object(Bucket=bucket, Key=key, Body=img_bytes, **extra)
        url = _s3_public_url(bucket, key)
        logger.info(f'Uploaded to S3: s3://{bucket}/{key}')
        return url, key

    # local
    storage_dir = os.getenv('POSTER_STORAGE_DIR')
    if not storage_dir:
        # default relative to server package
        here = os.path.dirname(__file__)
        storage_dir = os.path.join(here, 'storage')
    os.makedirs(storage_dir, exist_ok=True)
    file_id = str(uuid.uuid4())
    name = filename_hint or f'{file_id}.png'
    path = os.path.join(storage_dir, name)
    with open(path, 'wb') as f:
        f.write(img_bytes)
    # public url served via /files route; prefer absolute PUBLIC_BASE_URL if provided
    public_base = os.getenv('PUBLIC_BASE_URL')
    if public_base:
        url = f"{public_base.rstrip('/')}/files/{name}"
    else:
        url = f"/files/{name}"
    logger.info(f'Saved locally: {path}')
    return url, path
