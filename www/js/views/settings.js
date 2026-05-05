import { toast } from '../components.js';
import { getSession } from '../session.js';

export function renderSettings(container) {
  container.innerHTML = `
    <div class="settings-grid">

      <div class="card settings-card">
        <h3>Backup de base de datos</h3>
        <p>Descarga una copia del archivo de base de datos. Guárdala en un lugar seguro.</p>
        <button class="btn btn-primary" id="btn-backup">Descargar backup</button>
      </div>

      <div class="card settings-card">
        <h3>Restaurar base de datos</h3>
        <p>Reemplaza la base de datos actual con un archivo de backup previamente descargado. <strong>Esta acción no se puede deshacer.</strong></p>
        <label class="btn btn-secondary" style="cursor:pointer">
          Seleccionar archivo .db
          <input type="file" id="file-restore" accept=".db" style="display:none">
        </label>
        <span id="restore-filename" style="margin-left:10px;font-size:13px;color:var(--text-3)"></span>
        <br><br>
        <button class="btn btn-danger" id="btn-restore" disabled>Restaurar</button>
      </div>

    </div>`;

  // Backup
  document.getElementById('btn-backup').addEventListener('click', () => {
    const s = getSession();
    const a = document.createElement('a');
    a.href = '/api/backup';
    a.download = 'inventarycare_backup.db';
    // Pass token via query param not possible with FileResponse auth — use fetch
    fetch('/api/backup', { headers: { Authorization: `Bearer ${s.token}` } })
      .then(r => {
        if (!r.ok) throw new Error('Error al generar backup');
        return r.blob();
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        a.href = url;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast('Backup descargado');
      })
      .catch(e => toast(e.message, 'error'));
  });

  // Restore — file picker
  const fileInput = document.getElementById('file-restore');
  const btnRestore = document.getElementById('btn-restore');
  const nameLabel  = document.getElementById('restore-filename');

  fileInput.addEventListener('change', () => {
    const f = fileInput.files[0];
    if (f) {
      nameLabel.textContent = f.name;
      btnRestore.disabled = false;
    }
  });

  btnRestore.addEventListener('click', async () => {
    const f = fileInput.files[0];
    if (!f) return;
    if (!confirm('¿Restaurar la base de datos? Se perderán todos los datos actuales.')) return;

    const s = getSession();
    const form = new FormData();
    form.append('file', f);

    try {
      btnRestore.disabled = true;
      btnRestore.textContent = 'Restaurando...';
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.token}` },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Error al restaurar');
      }
      toast('Base de datos restaurada. Recargando...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      toast(e.message, 'error');
      btnRestore.disabled = false;
      btnRestore.textContent = 'Restaurar';
    }
  });
}
