export function buildDocumentViewerHtml(options: {
  title: string;
  imageUrl: string;
  autoPrint?: boolean;
}): string {
  const { title, imageUrl, autoPrint } = options;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>${title}</title>
  <style>
    @page {
      margin: 8mm;
      size: auto;
      background: #ffffff !important;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      overflow: hidden !important;
      background: #e2e8f0 !important;
      color: #0f172a !important;
      font-family: system-ui, -apple-system, sans-serif;
      user-select: none;
      -webkit-user-select: none;
    }
    .viewport {
      width: 100vw;
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
      position: relative;
      cursor: grab;
      touch-action: none;
    }
    .viewport.dragging {
      cursor: grabbing;
    }
    .img-container {
      transform-origin: center center;
      transition: transform 0.04s ease-out;
      display: inline-block;
      will-change: transform;
    }
    img {
      max-width: 95vw;
      max-height: 94vh;
      object-fit: contain;
      display: block;
      margin: auto;
      background: #ffffff !important;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      pointer-events: none;
      border: 1px solid #cbd5e1;
    }
    .toolbar {
      position: fixed;
      bottom: 10px;
      right: 12px;
      background: rgba(15, 23, 42, 0.78);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 6px;
      padding: 2px 5px;
      display: flex;
      align-items: center;
      gap: 3px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
      z-index: 9999;
      opacity: 0.6;
      transition: opacity 0.2s ease;
      font-size: 11px;
      transform: scale(0.85);
      transform-origin: bottom right;
    }
    .toolbar:hover {
      opacity: 1;
    }
    .toolbar button {
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      padding: 0;
      border-radius: 4px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      line-height: 1;
    }
    .toolbar button.text-btn {
      width: auto;
      padding: 0 5px;
      font-size: 10px;
    }
    .toolbar button:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    .toolbar span#zoomLevel {
      color: #38bdf8;
      font-size: 10px;
      font-weight: 700;
      min-width: 34px;
      text-align: center;
      cursor: pointer;
      padding: 0 2px;
    }
    .toolbar-toggle {
      display: none;
      position: fixed;
      bottom: 10px;
      right: 12px;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(4px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #fff;
      font-size: 12px;
      cursor: pointer;
      z-index: 9999;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
      opacity: 0.7;
    }
    .toolbar-toggle:hover {
      opacity: 1;
    }
    @media print {
      html, body {
        width: 100% !important;
        height: 100% !important;
        overflow: visible !important;
        background: #ffffff !important;
      }
      .toolbar, .toolbar-toggle {
        display: none !important;
      }
      .viewport {
        width: 100% !important;
        height: auto !important;
        overflow: visible !important;
        display: block !important;
        cursor: default !important;
      }
      .img-container {
        transform: none !important;
        display: block !important;
      }
      img {
        max-width: 100% !important;
        max-height: 98vh !important;
        box-shadow: none !important;
        border: none !important;
        page-break-inside: avoid;
        margin: auto !important;
      }
    }
  </style>
</head>
<body>
  <div class="viewport" id="viewport">
    <div class="img-container" id="imgContainer">
      <img id="docImg" src="${imageUrl}" alt="${title}" onload="onImgLoad()" />
    </div>
  </div>
  <button class="toolbar-toggle" id="btnToggleShow" title="Show Toolbar">🔍</button>
  <div class="toolbar" id="toolbar">
    <button id="btnZoomOut" title="Zoom Out (−)">−</button>
    <span id="zoomLevel" title="Click to Reset (100%)">100%</span>
    <button id="btnZoomIn" title="Zoom In (+)">+</button>
    <button id="btnFit" class="text-btn" title="Fit to Screen">Fit</button>
    <button id="btnRotate" title="Rotate (R)">↻</button>
    <button id="btnPrint" title="Print Document">🖨️</button>
    <button id="btnMinimize" title="Hide Toolbar" style="opacity: 0.6; margin-left: 2px;">✕</button>
  </div>
  <script>
    let scale = 1;
    let posX = 0;
    let posY = 0;
    let rotation = 0;
    let isDragging = false;
    let startX = 0;
    let startY = 0;

    const viewport = document.getElementById('viewport');
    const container = document.getElementById('imgContainer');
    const zoomLevel = document.getElementById('zoomLevel');

    function updateTransform() {
      container.style.transform = 'translate(' + posX + 'px, ' + posY + 'px) scale(' + scale + ') rotate(' + rotation + 'deg)';
      zoomLevel.textContent = Math.round(scale * 100) + '%';
    }

    function setScale(newScale, clientX, clientY) {
      const minScale = 0.3;
      const maxScale = 6.0;
      const clamped = Math.min(Math.max(newScale, minScale), maxScale);
      if (clamped === scale) return;

      if (clientX !== undefined && clientY !== undefined) {
        const rect = viewport.getBoundingClientRect();
        const originX = clientX - rect.left - rect.width / 2;
        const originY = clientY - rect.top - rect.height / 2;
        posX -= (originX - posX) * (clamped / scale - 1);
        posY -= (originY - posY) * (clamped / scale - 1);
      }
      scale = clamped;
      updateTransform();
    }

    function resetZoom() {
      scale = 1;
      posX = 0;
      posY = 0;
      updateTransform();
    }

    // Ctrl + Mouse Wheel OR regular Mouse Wheel: smooth zoom
    window.addEventListener('wheel', function(e) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      setScale(scale * factor, e.clientX, e.clientY);
    }, { passive: false });

    // Drag to pan
    viewport.addEventListener('mousedown', function(e) {
      if (e.target.closest('#toolbar')) return;
      isDragging = true;
      viewport.classList.add('dragging');
      startX = e.clientX - posX;
      startY = e.clientY - posY;
    });

    window.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      posX = e.clientX - startX;
      posY = e.clientY - startY;
      updateTransform();
    });

    window.addEventListener('mouseup', function() {
      isDragging = false;
      viewport.classList.remove('dragging');
    });

    // Touch support (mobile pinch zoom & drag)
    let initialTouchDist = 0;
    let initialScale = 1;
    viewport.addEventListener('touchstart', function(e) {
      if (e.target.closest('#toolbar')) return;
      if (e.touches.length === 1) {
        isDragging = true;
        startX = e.touches[0].clientX - posX;
        startY = e.touches[0].clientY - posY;
      } else if (e.touches.length === 2) {
        isDragging = false;
        initialTouchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        initialScale = scale;
      }
    }, { passive: true });

    viewport.addEventListener('touchmove', function(e) {
      if (e.touches.length === 1 && isDragging) {
        posX = e.touches[0].clientX - startX;
        posY = e.touches[0].clientY - startY;
        updateTransform();
      } else if (e.touches.length === 2 && initialTouchDist > 0) {
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        setScale(initialScale * (dist / initialTouchDist), midX, midY);
      }
    }, { passive: true });

    viewport.addEventListener('touchend', function() {
      isDragging = false;
      initialTouchDist = 0;
    });

    // Double click to zoom in 2x or reset
    viewport.addEventListener('dblclick', function(e) {
      if (e.target.closest('#toolbar')) return;
      if (scale > 1.2) {
        resetZoom();
      } else {
        setScale(2.0, e.clientX, e.clientY);
      }
    });

    // Toolbar buttons
    document.getElementById('btnZoomIn').addEventListener('click', () => setScale(scale * 1.25));
    document.getElementById('btnZoomOut').addEventListener('click', () => setScale(scale / 1.25));
    document.getElementById('zoomLevel').addEventListener('click', resetZoom);
    document.getElementById('btnFit').addEventListener('click', resetZoom);
    document.getElementById('btnRotate').addEventListener('click', () => {
      rotation = (rotation + 90) % 360;
      updateTransform();
    });
    document.getElementById('btnPrint').addEventListener('click', () => {
      window.print();
    });

    const toolbarEl = document.getElementById('toolbar');
    const toggleBtnEl = document.getElementById('btnToggleShow');
    document.getElementById('btnMinimize').addEventListener('click', () => {
      toolbarEl.style.display = 'none';
      toggleBtnEl.style.display = 'inline-flex';
    });
    toggleBtnEl.addEventListener('click', () => {
      toolbarEl.style.display = 'flex';
      toggleBtnEl.style.display = 'none';
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', function(e) {
      if (e.key === '+' || e.key === '=') {
        setScale(scale * 1.2);
      } else if (e.key === '-' || e.key === '_') {
        setScale(scale / 1.2);
      } else if (e.key === '0') {
        resetZoom();
      } else if (e.key === 'r' || e.key === 'R') {
        rotation = (rotation + 90) % 360;
        updateTransform();
      }
    });

    function onImgLoad() {
      ${autoPrint ? `setTimeout(function() {
        try {
          window.focus();
          window.print();
        } catch (e) {}
      }, 400);` : ''}
    }
  </script>
</body>
</html>`;
}
