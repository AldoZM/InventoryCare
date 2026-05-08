import { getSession } from './session.js';

let _scanner = null;
let _stream = null;
let _onResult = null;
let _tesseractLoaded = false;

export function openScanModal(onResult) {
  _onResult = onResult;
  document.body.insertAdjacentHTML('beforeend', _buildHTML());

  const overlay = document.getElementById('scan-overlay');
  document.getElementById('scan-close').addEventListener('click', _closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) _closeModal(); });
  document.getElementById('tab-barcode').addEventListener('click', () => _switchTab('barcode'));
  document.getElementById('tab-ocr').addEventListener('click', () => _switchTab('ocr'));
  document.getElementById('btn-capture').addEventListener('click', _captureAndOCR);

  _switchTab('barcode');
}

function _buildHTML() {
  return `
    <div class="scan-overlay" id="scan-overlay">
      <div class="scan-modal">
        <div class="scan-modal-header">
          <h2>📷 Escanear producto</h2>
          <button class="scan-close-btn" id="scan-close">✕</button>
        </div>
        <div class="scan-tabs">
          <button class="scan-tab active" id="tab-barcode">Código de barras</button>
          <button class="scan-tab" id="tab-ocr">Texto (OCR)</button>
        </div>
        <div class="scan-body">
          <div id="scan-reader"></div>
          <video id="scan-video" class="scan-video hidden" autoplay playsinline muted></video>
          <button class="btn btn-primary scan-capture-btn hidden" id="btn-capture">📸 Capturar y leer</button>
        </div>
        <div class="scan-status" id="scan-status"></div>
        <div class="scan-preview hidden" id="scan-preview">
          <h3>Datos detectados:</h3>
          <div id="scan-preview-content"></div>
          <div class="scan-preview-actions">
            <button class="btn btn-primary" id="btn-use-data">Usar datos</button>
            <button class="btn btn-secondary" id="btn-scan-retry">Reintentar</button>
          </div>
        </div>
      </div>
    </div>`;
}

async function _switchTab(mode) {
  await _stopAll();
  document.getElementById('tab-barcode').classList.toggle('active', mode === 'barcode');
  document.getElementById('tab-ocr').classList.toggle('active', mode === 'ocr');
  document.getElementById('scan-reader').classList.toggle('hidden', mode !== 'barcode');
  document.getElementById('scan-video').classList.toggle('hidden', mode !== 'ocr');
  document.getElementById('btn-capture').classList.toggle('hidden', mode !== 'ocr');
  document.getElementById('scan-preview').classList.add('hidden');

  if (mode === 'barcode') {
    _setStatus('Apunta la cámara al código de barras');
    await _startBarcodeScanner();
  } else {
    _setStatus('Apunta al texto de la etiqueta y captura');
    _loadTesseract();
    await _startOCRCamera();
  }
}

async function _startBarcodeScanner() {
  if (!window.Html5Qrcode) { _setStatus('Error: librería html5-qrcode no cargada'); return; }
  try {
    _scanner = new window.Html5Qrcode('scan-reader');
    await _scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 150 } },
      _onBarcodeDecode,
      () => {}
    );
  } catch (e) {
    _setStatus('Sin acceso a cámara: ' + e.message);
  }
}

async function _startOCRCamera() {
  try {
    _stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    document.getElementById('scan-video').srcObject = _stream;
  } catch (e) {
    _setStatus('Sin acceso a cámara: ' + e.message);
  }
}

function _loadTesseract() {
  if (_tesseractLoaded || typeof Tesseract !== 'undefined') return;
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  s.onload = () => { _tesseractLoaded = true; };
  document.head.appendChild(s);
}

async function _stopAll() {
  if (_scanner) {
    await _scanner.stop().catch(() => {});
    _scanner = null;
  }
  if (_stream) {
    _stream.getTracks().forEach(t => t.stop());
    _stream = null;
  }
}

async function _onBarcodeDecode(code) {
  await _stopAll();
  _setStatus('Código: ' + code + ' — buscando...');

  const headers = { Authorization: `Bearer ${getSession()?.token}` };

  // 1. Check local SKU
  try {
    const r = await fetch(`/api/scan/sku/${encodeURIComponent(code)}`, { headers });
    if (r.ok) {
      const product = await r.json();
      _closeModal();
      _onResult({ found: true, product });
      return;
    }
  } catch {}

  // 2. External lookup
  let fields = { sku: code, name: '', category: '', price: null };
  try {
    const r = await fetch(`/api/scan/lookup/${encodeURIComponent(code)}`, { headers });
    if (r.ok) {
      const data = await r.json();
      fields = { sku: code, name: data.name || '', category: data.category || '', price: data.price ?? null };
    }
  } catch {}

  _showPreview(fields, () => { _closeModal(); _onResult({ found: false, fields }); });
}

async function _captureAndOCR() {
  const video = document.getElementById('scan-video');
  if (!video || !video.videoWidth) { _setStatus('Cámara no lista'); return; }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  _setStatus('Analizando imagen...');

  canvas.toBlob(async blob => {
    let fields = await _runClientOCR(blob) || await _runServerOCR(blob);
    if (fields) {
      _showPreview(fields, () => { _closeModal(); _onResult({ found: false, fields }); });
    } else {
      _setStatus('No se pudo leer el texto. Intenta con mejor iluminación.');
    }
  }, 'image/jpeg', 0.85);
}

async function _runClientOCR(blob) {
  if (typeof Tesseract === 'undefined') return null;
  try {
    const worker = await Tesseract.createWorker(['spa', 'eng']);
    const { data } = await worker.recognize(blob);
    await worker.terminate();
    if (data.confidence < 40 || !data.text.trim()) return null;
    return _parseOCRText(data.text);
  } catch { return null; }
}

async function _runServerOCR(blob) {
  const fd = new FormData();
  fd.append('image', blob, 'scan.jpg');
  try {
    const r = await fetch('/api/scan/ocr', {
      method: 'POST',
      headers: { Authorization: `Bearer ${getSession()?.token}` },
      body: fd,
    });
    if (!r.ok) return null;
    const data = await r.json();
    return { sku: '', name: data.name || '', category: data.category || '', price: data.price ?? null };
  } catch { return null; }
}

function _parseOCRText(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const name = lines[0] || '';
  const priceMatch = text.match(/\$?\s*(\d{1,6}[.,]\d{2})/);
  const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : null;
  return { sku: '', name, category: '', price };
}

function _showPreview(fields, onUse) {
  document.getElementById('scan-preview-content').innerHTML = `
    <div class="scan-preview-field"><span class="scan-preview-label">SKU:</span>${fields.sku || '—'}</div>
    <div class="scan-preview-field"><span class="scan-preview-label">Nombre:</span>${fields.name || '—'}</div>
    <div class="scan-preview-field"><span class="scan-preview-label">Categoría:</span>${fields.category || '—'}</div>
    <div class="scan-preview-field"><span class="scan-preview-label">Precio:</span>${fields.price != null ? '$' + Number(fields.price).toFixed(2) : '—'}</div>
  `;
  document.getElementById('scan-preview').classList.remove('hidden');
  _setStatus('');

  document.getElementById('btn-use-data').onclick = onUse;
  document.getElementById('btn-scan-retry').onclick = () => {
    document.getElementById('scan-preview').classList.add('hidden');
    const mode = document.getElementById('tab-barcode').classList.contains('active') ? 'barcode' : 'ocr';
    _switchTab(mode);
  };
}

function _setStatus(msg) {
  const el = document.getElementById('scan-status');
  if (el) el.textContent = msg;
}

async function _closeModal() {
  await _stopAll();
  document.getElementById('scan-overlay')?.remove();
}
