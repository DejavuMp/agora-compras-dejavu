
/* ABRACADABRA · Motor de demostración. Sin acceso a cuentas reales. */
(function (root) {
  'use strict';
  const ROLES = ['administrador', 'directivo', 'coordinador', 'staff', 'proveedor', 'cliente'];
  const can = (role, action) => {
    const matrix = {
      administrador: ['dashboard','ver_movimientos','crear_movimiento','aprobar','pagar','importar','ver_jornadas','identidades','vincular_id','exportar','recibos'],
      directivo: ['dashboard','ver_movimientos','aprobar','ver_jornadas','exportar','recibos'],
      coordinador: ['dashboard','ver_movimientos','ver_jornadas'],
      staff: ['dashboard','ver_movimientos','ver_jornadas','recibos'],
      proveedor: ['dashboard','ver_movimientos','recibos'],
      cliente: ['dashboard','ver_movimientos','recibos']
    };
    return Boolean(matrix[role]?.includes(action));
  };
  function toCents(v) {
    let s = String(v ?? '').trim().replace(/[$,\s]/g, '');
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(s)) throw new Error('Importe inválido: utiliza pesos y hasta dos decimales.');
    const [whole, fraction = ''] = s.split('.');
    const n = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(n)) throw new Error('Importe fuera de rango.');
    return n;
  }
  function money(cents) { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100); }
  function parseCsv(input) {
    const rows = []; let row = []; let field = ''; let q = false;
    const s = String(input ?? '').replace(/^\uFEFF/, '');
    for (let i = 0; i < s.length; i++) {
      const x = s[i];
      if (x === '"') { if (q && s[i + 1] === '"') { field += '"'; i++; } else q = !q; }
      else if (x === ',' && !q) { row.push(field); field = ''; }
      else if ((x === '\n' || x === '\r') && !q) {
        if (x === '\r' && s[i + 1] === '\n') i++;
        row.push(field); field = ''; if (row.some(z => z.trim())) rows.push(row); row = [];
      } else field += x;
    }
    if (q) throw new Error('CSV con comillas sin cerrar.');
    row.push(field); if (row.some(z => z.trim())) rows.push(row);
    if (rows.length < 2) throw new Error('El archivo debe tener encabezado y al menos una fila.');
    const headers = rows.shift().map(x => x.trim());
    if (new Set(headers).size !== headers.length) throw new Error('Columnas repetidas en CSV.');
    return rows.map((r, i) => {
      if (r.length !== headers.length) throw new Error('Cantidad de columnas incorrecta en fila ' + (i + 2));
      return Object.fromEntries(headers.map((h, j) => [h, r[j].trim()]));
    });
  }
  function parseBatch(raw, type) {
    if (type === 'json') {
      const o = JSON.parse(raw); const records = Array.isArray(o) ? o : o.records;
      if (!Array.isArray(records)) throw new Error('JSON debe ser arreglo o tener records[].');
      return records;
    }
    return parseCsv(raw);
  }
  const cleaned = (v) => String(v ?? '').trim();
  function validateShift(source) {
    const must = ['id','ownerUid','personId','eventId','approvedHours','paymentStatus'];
    const missing = must.filter(k => !cleaned(source[k]));
    if (missing.length) throw new Error('Faltan campos: ' + missing.join(', '));
    if (source.paymentStatus !== 'validado') throw new Error('Jornada ' + source.id + ': no está validada por coordinación.');
    const hours = Number(source.approvedHours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) throw new Error('Jornada ' + source.id + ': horas inválidas.');
    return {
      source: 'agora_ops_logs', sourceId: cleaned(source.id), ownerUid: cleaned(source.ownerUid),
      personId: cleaned(source.personId), eventId: cleaned(source.eventId),
      hours, activity: cleaned(source.activity), place: cleaned(source.place),
      start: cleaned(source.start), end: cleaned(source.end), breakMins: Number(source.breakMins) || 0,
      version: cleaned(source.updatedAt) || 'sin_version', verified: false,
      importedAt: new Date().toISOString(), status: 'pendiente_verificacion'
    };
  }
  function registerIdentity(existing, raw) {
    const personId = cleaned(raw.personId), canonicalId = cleaned(raw.canonicalId);
    if (!personId || !canonicalId) throw new Error('Se requiere ID de ficha ÁGORA y el ID único de RH ya existente.');
    if (existing.some(i => i.personId === personId && i.canonicalId !== canonicalId)) throw new Error('Esa ficha de ÁGORA ya pertenece a otro ID único.');
    if (existing.some(i => i.canonicalId === canonicalId && i.personId !== personId)) throw new Error('Ese ID único ya está vinculado a otra ficha: resolver en RH, no duplicar.');
    if (existing.some(i => i.personId === personId && i.canonicalId === canonicalId)) throw new Error('La vinculación ya existe.');
    return {personId, canonicalId, label: cleaned(raw.label) || 'Identidad vinculada', kind: 'colaborador'};
  }
  function importBatch(existingShifts, sources, identities) {
    const added = [], rejected = [], current = [...existingShifts];
    for (const [index, source] of sources.entries()) {
      try {
        const row = validateShift(source);
        const collision = current.find(s => s.sourceId === row.sourceId || (s.ownerUid === row.ownerUid && s.eventId === row.eventId));
        if (collision) throw new Error('Duplicado detectado por ID de log o por UID + evento. No se creó otro pago.');
        const match = identities.find(i => i.personId === row.personId);
        row.canonicalId = match?.canonicalId || null;
        row.status = match ? 'pendiente_verificacion' : 'pendiente_vincular_id';
        current.push(row); added.push(row);
      } catch (e) { rejected.push({row: index + 1, id: cleaned(source?.id), reason: e.message}); }
    }
    return {next: current, added, rejected};
  }
  function paymentEligible(shift) {
    return Boolean(shift?.verified && shift?.canonicalId && shift?.status === 'verificado_servidor');
  }
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])); }
  const api = {ROLES, can, toCents, money, parseCsv, parseBatch, validateShift, registerIdentity, importBatch, paymentEligible, escapeHtml};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AbraCore = api;
})(typeof window !== 'undefined' ? window : globalThis);

