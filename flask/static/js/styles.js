function applyPosterStyle(style, mapElement, poster, validCoords) {
    console.log('🎨 Applying poster style:', style);
    removeGPXCanvas(poster);
    switch (style) {
        case 'map':
            mapElement.classList.remove('hidden');
            poster.style.backgroundColor = 'white';
            console.log('🗺️ Map style applied.');
            mapElement.resize();
            break;
        case 'red':
            mapElement.classList.add('hidden');
            poster.style.backgroundColor = 'lightcoral';
            console.log('🔴 Red style applied.');
            drawGPXTrack(mapElement, poster, validCoords);
            break;
        case 'blue':
            mapElement.classList.add('hidden');
            poster.style.backgroundColor = 'lightblue';
            console.log('🔵 Blue style applied.');
            drawGPXTrack(mapElement, poster, validCoords);
            break;
        default:
            console.error('❌ Unknown poster style:', style);
    }
}

function drawGPXTrack(mapElement, poster, validCoords) {
    if (!validCoords) return;

    const canvas = document.createElement('canvas');
    canvas.id = 'gpx-canvas';
    canvas.width = poster.clientWidth;
    canvas.height = poster.clientHeight;
    const ctx = canvas.getContext('2d');

    const margin = 20;
    const width = canvas.width - margin * 2;
    const height = canvas.height - margin * 2;

    const lons = validCoords.map(coord => coord[0]);
    const lats = validCoords.map(coord => coord[1]);

    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    const scaleLon = width / (maxLon - minLon);
    const scaleLat = height / (maxLat - minLat);

    const scale = Math.min(scaleLon, scaleLat);
    
    const offsetX = (canvas.width - (maxLon - minLon) * scale) / 2;
    const offsetY = (canvas.height - (maxLat - minLat) * scale) / 2;

    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 5;
    ctx.beginPath();

    validCoords.forEach((coord, index) => {
        const x = (coord[0] - minLon) * scale + offsetX;
        const y = (maxLat - coord[1]) * scale + offsetY;
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    ctx.stroke();
    const img = new Image();
    img.src = canvas.toDataURL();
    img.style.position = 'absolute';
    img.style.top = '0';
    img.style.left = '0';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.zIndex = '0';

    poster.appendChild(img);
    console.log('🖌️ GPX track drawn on canvas.');
}

function removeGPXCanvas(poster) {
    const canvas = poster.querySelector('#gpx-canvas');
    if (canvas) {
        poster.removeChild(canvas);
        console.log('🗑️ GPX canvas/image removed.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const fontSelector = document.getElementById('font-selector');
    const fontSizeSelector = document.getElementById('font-size-selector');
    const posterTitleText = document.getElementById('poster-title-text');
    const posterSubtitleText = document.getElementById('poster-subtitle-text');
    const posterDescriptionText = document.getElementById('poster-description-text');

    fontSelector.addEventListener('change', () => {
        const selectedFont = fontSelector.value;
        posterTitleText.style.fontFamily = selectedFont + ', sans-serif';
        posterSubtitleText.style.fontFamily = selectedFont + ', sans-serif';
        posterDescriptionText.style.fontFamily = selectedFont + ', sans-serif';
        console.log('🔤 Font changed to:', selectedFont);
    });

    fontSizeSelector.addEventListener('change', () => {
        const selectedSize = fontSizeSelector.value;
        let fontSize;
        switch(selectedSize) {
            case 'small':
                fontSize = '12px';
                break;
            case 'medium':
                fontSize = '16px';
                break;
            case 'large':
                fontSize = '20px';
                break;
        }
        posterTitleText.style.fontSize = fontSize;
        posterSubtitleText.style.fontSize = fontSize;
        posterDescriptionText.style.fontSize = fontSize;
        console.log('🔠 Font size changed to:', selectedSize, fontSize);
    });
});
