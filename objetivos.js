/* objetivos.js — LIT CRM */

const Objetivos = (() => {
  let _meta          = 5;
  let _mainTimer     = null;   // setInterval cada 60s → render + check venta
  let _emojiTimer    = null;   // setTimeout → próxima caída programada
  let _initialized   = false;
  let _emojisActivos = true;
  let _lastUnidades  = -1;
  let _emojisCaidosHoy = 0;

  let _horario = {
    mañana: { inicio: 9 * 60, fin: 12 * 60 },
    tarde:  { inicio: 13 * 60, fin: 18 * 60 },
  };

  const EMOJI_SEC = ['😄','😊','🙂','😐','😕','😟','😢','😰','😱','🥀'];

  // ── Tiempo ───────────────────────────────────────────────────────────────
  function _ahora() {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  }
  function _totalMinutos() {
    return (_horario.mañana.fin - _horario.mañana.inicio)
         + (_horario.tarde.fin  - _horario.tarde.inicio);
  }
  function _minutosEfectivos() {
    const t = _ahora(), { mañana, tarde } = _horario;
    if (t <= mañana.inicio) return 0;
    if (t <= mañana.fin)    return t - mañana.inicio;
    if (t <  tarde.inicio)  return mañana.fin - mañana.inicio;
    if (t <= tarde.fin)     return (mañana.fin - mañana.inicio) + (t - tarde.inicio);
    return _totalMinutos();
  }
  function _progresoDia()      { const t = _totalMinutos(); return t > 0 ? Math.min(1, _minutosEfectivos() / t) : 0; }
  function _jornadaTerminada() { return _ahora() >= _horario.tarde.fin; }
  function _enPausa()          { const t = _ahora(); return t >= _horario.mañana.fin && t < _horario.tarde.inicio; }
  function _antesDeJornada()   { return _ahora() < _horario.mañana.inicio; }
  function _dentroDeJornada()  { return !_antesDeJornada() && !_jornadaTerminada(); }

  // ── Ventas ───────────────────────────────────────────────────────────────
  function _getUnidadesHoy() {
    const hoy = new Date().toISOString().slice(0, 10);
    return ventas
      .filter(v => {
        if (v.estado !== 'vendido' || v.fecha !== hoy) return false;
        if (currentUser.rol === 'agente') return v.agente_id === currentUser.id;
        if (currentUser.rol === 'admin' && selectedAgentId !== 'all') return v.agente_id === selectedAgentId;
        return true;
      })
      .reduce((s, v) => s + (v.venta_items || []).reduce((ss, it) => ss + (it.cantidad || 1), 0), 0);
  }

  // ── Emoji según progreso ─────────────────────────────────────────────────
  function _emojiDeEstado(unidades) {
    const pct = _meta > 0 ? Math.min(1, unidades / _meta) : 0;
    const idx = Math.round((1 - pct) * (EMOJI_SEC.length - 1));
    return EMOJI_SEC[Math.min(idx, EMOJI_SEC.length - 1)];
  }

  // ── Lanzar emojis — cada elemento se destruye solo vía animationend ──────
  function _lanzarEmojis(char, cantidad) {
    if (!_emojisActivos) return;
    for (let i = 0; i < cantidad; i++) {
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'obj-emoji-fall';
        el.textContent = char;
        el.style.left              = (4 + Math.random() * 88) + 'vw';
        el.style.animationDuration = (3.5 + Math.random() * 2.5) + 's';
        el.style.fontSize          = (24 + Math.random() * 22) + 'px';
        document.body.appendChild(el);
        el.addEventListener('animationend', () => el.remove(), { once: true });
      }, i * (150 + Math.random() * 250));
    }
  }

  // Intervalo fijo entre lluvias de emojis (minutos)
  const MIN_ENTRE_LLUVIAS = 10;

  // ── Cuántas lluvias deberían haber ocurrido hasta ahora ──────────────────
  function _ticksEsperados() {
    return Math.floor(_minutosEfectivos() / MIN_ENTRE_LLUVIAS);
  }

  // ── Ms hasta la próxima lluvia: siempre 10 minutos desde la última ───────
  function _msHastaProximoTick() {
    if (_jornadaTerminada()) return null;
    // Próxima lluvia ocurre en el siguiente múltiplo de 10 min efectivos
    const proxEfect   = (_emojisCaidosHoy + 1) * MIN_ENTRE_LLUVIAS;
    const durMañana   = _horario.mañana.fin - _horario.mañana.inicio;
    let   targetClock;
    if (proxEfect <= durMañana) {
      targetClock = _horario.mañana.inicio + proxEfect;
    } else {
      targetClock = _horario.tarde.inicio + (proxEfect - durMañana);
    }
    const diffMin = targetClock - _ahora();
    return diffMin > 0 ? diffMin * 60 * 1000 : 5000;
  }

  // ── Programar próximo tick ────────────────────────────────────────────────
  function _programarProximo() {
    clearTimeout(_emojiTimer);
    _emojiTimer = null;

    if (_jornadaTerminada()) return;

    if (_antesDeJornada()) {
      const minHastaInicio = _horario.mañana.inicio - _ahora();
      _emojiTimer = setTimeout(_programarProximo, minHastaInicio * 60 * 1000 + 2000);
      return;
    }

    const ms = _msHastaProximoTick();
    if (ms === null) return;

    _emojiTimer = setTimeout(() => {
      _emojiTimer = null;

      if (_enPausa()) {
        const minRestante = _horario.tarde.inicio - _ahora();
        _emojiTimer = setTimeout(_programarProximo, Math.max(minRestante, 1) * 60 * 1000 + 3000);
        return;
      }

      const unidades = _getUnidadesHoy();
      const cantidad = 2 + Math.floor(Math.random() * 4); // 2–5 emojis
      _lanzarEmojis(_emojiDeEstado(unidades), cantidad);
      _emojisCaidosHoy++;
      _programarProximo();
    }, ms);
  }

  // ── Detectar nueva venta ─────────────────────────────────────────────────
  function _checkNuevaVenta() {
    const unidades = _getUnidadesHoy();
    if (_lastUnidades >= 0 && unidades > _lastUnidades) {
      const cantidad = 3 + Math.floor(Math.random() * 4); // 3–6 emojis
      _lanzarEmojis(_emojiDeEstado(unidades), cantidad);
    }
    _lastUnidades = unidades;
  }

  // ── Helpers visuales ─────────────────────────────────────────────────────
  function _colorProgreso(pct) {
    if (pct >= 0.85) return 'var(--green)';
    if (pct >= 0.5)  return 'var(--yellow)';
    if (pct >= 0.25) return 'var(--orange)';
    return 'var(--red)';
  }
  function _minToTime(min) {
    return `${Math.floor(min/60).toString().padStart(2,'0')}:${(min%60).toString().padStart(2,'0')}`;
  }
  function _timeToMin(str) {
    const [h, m] = (str || '00:00').split(':').map(Number);
    return h * 60 + (m || 0);
  }

  // ── Render panel ─────────────────────────────────────────────────────────
  function _renderPanel() {
    const wrap = document.getElementById('obj-panel-derecho');
    if (!wrap) return;

    const unidades    = _getUnidadesHoy();
    const pct         = Math.min(1, _meta > 0 ? unidades / _meta : 0);
    const colorProg   = _colorProgreso(pct);
    const progDia     = _progresoDia();
    const unidEsp     = Math.ceil(progDia * _meta);
    const deficit     = Math.max(0, unidEsp - unidades);
    const superavit   = Math.max(0, unidades - unidEsp);
    const minRest     = Math.round((1 - progDia) * _totalMinutos());
    const pctTiempo   = Math.round(progDia * 100);
    const pctUnidades = Math.round(pct * 100);
    const emojiActual = _emojiDeEstado(unidades);

    let estadoHTML = '';
    if (_antesDeJornada()) {
      estadoHTML = `<div class="obj-estado" style="background:var(--blue-bg);border-color:var(--blue);color:var(--blue);">
        🌅 Jornada inicia a las ${_minToTime(_horario.mañana.inicio)}</div>`;
    } else if (unidades >= _meta) {
      estadoHTML = `<div class="obj-estado obj-estado-ok">🎉 ¡Objetivo cumplido! +3% por unidad activo</div>`;
    } else if (_enPausa()) {
      estadoHTML = `<div class="obj-estado" style="background:var(--yellow-bg);border-color:var(--yellow);color:var(--yellow);">
        ☕ Pausa — regresa a las ${_minToTime(_horario.tarde.inicio)}</div>`;
    } else if (_jornadaTerminada()) {
      estadoHTML = `<div class="obj-estado" style="background:var(--red-bg);border-color:var(--red);color:var(--red);">
        🏁 Jornada finalizada (${_minToTime(_horario.mañana.inicio)}–${_minToTime(_horario.tarde.fin)})</div>`;
    } else if (deficit > 0) {
      estadoHTML = `<div class="obj-estado obj-estado-warn" style="border-color:${colorProg};color:${colorProg};">
        ⚠️ Vas ${deficit} unidad${deficit !== 1 ? 'es' : ''} por detrás del ritmo</div>`;
    } else {
      estadoHTML = `<div class="obj-estado obj-estado-ok">
        ✅ ${superavit > 0 ? `+${superavit} sobre el ritmo` : '¡En ritmo perfecto!'}</div>`;
    }

    const recuadros = Array.from({ length: _meta }, (_, i) => {
      const ok = unidades > i;
      return `<div class="obj-comision-box ${ok ? 'obj-comision-box-ok' : ''}">
        <div class="obj-comision-box-pct">+3%</div>
        <div class="obj-comision-box-num">${ok ? '✓' : i + 1}</div>
      </div>`;
    }).join('');

    wrap.innerHTML = `
      <div class="obj-card-inner">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:13px;
                      text-transform:uppercase;letter-spacing:0.5px;color:var(--text3);">
            🎯 Objetivo del Día
          </div>
          <div style="font-size:26px;line-height:1;" title="Estado actual">${emojiActual}</div>
        </div>

        <div style="text-align:center;margin-bottom:12px;">
          <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:44px;
                      line-height:1;color:${colorProg};transition:color 0.5s;">
            ${unidades}
          </div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px;">
            de <b style="color:var(--text);">${_meta}</b> unidades · hoy
          </div>
        </div>

        <div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;font-size:10px;
                      color:var(--text3);margin-bottom:4px;font-weight:700;
                      text-transform:uppercase;letter-spacing:0.4px;">
            <span>Progreso</span><span style="color:${colorProg};">${pctUnidades}%</span>
          </div>
          <div class="bar-track" style="height:10px;position:relative;overflow:visible;">
            <div style="position:absolute;top:-4px;bottom:-4px;width:2px;
                        left:${Math.min(pctTiempo, 99)}%;background:var(--text3);
                        border-radius:2px;opacity:0.45;z-index:2;"
                 title="Ritmo esperado según hora"></div>
            <div class="bar-fill" style="width:${pctUnidades}%;background:${colorProg};
                        transition:width 0.6s ease,background 0.5s;"></div>
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:3px;">
            │ = ritmo · mañana ${_minToTime(_horario.mañana.inicio)}–${_minToTime(_horario.mañana.fin)}
            · tarde ${_minToTime(_horario.tarde.inicio)}–${_minToTime(_horario.tarde.fin)}
          </div>
        </div>

        ${estadoHTML}

        <div style="margin-bottom:10px;">
          <div style="font-size:10px;font-weight:700;color:var(--text3);
                      text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px;">
            💰 +3% comisión por unidad vendida
          </div>
          <div class="obj-comision-grid">${recuadros}</div>
        </div>

        <div style="padding-top:8px;border-top:1px solid var(--border);
                    font-size:11px;color:var(--text3);line-height:1.9;">
          ${!_jornadaTerminada() && !_antesDeJornada() && !_enPausa()
            ? `<div>⏱ Quedan <b style="color:var(--text);">${minRest} min</b> efectivos para terminar la jornada laboral</div>`
            : ''}
        </div>
      </div>`;
  }

  // ── API PÚBLICA ───────────────────────────────────────────────────────────
  async function init() {
    clearInterval(_mainTimer);
    clearTimeout(_emojiTimer);
    _mainTimer       = null;
    _emojiTimer      = null;
    _emojisCaidosHoy = 0;
    _lastUnidades    = -1;

    try {
      const [
        { data: dataMeta },
        { data: dataEmojis },
        { data: dataHorario }
      ] = await Promise.all([
        db.from('config').select('valor').eq('clave', 'objetivo_unidades_dia').single(),
        db.from('config').select('valor').eq('clave', 'objetivo_emojis_activos').single(),
        db.from('horario_laboral').select('*'),
      ]);

      if (dataMeta?.valor)   _meta          = parseInt(dataMeta.valor) || 5;
      if (dataEmojis?.valor) _emojisActivos = dataEmojis.valor !== 'false';

      if (dataHorario?.length) {
        dataHorario.forEach(row => {
          if (row.turno === 'mañana') {
            _horario.mañana.inicio = _timeToMin(row.inicio);
            _horario.mañana.fin    = _timeToMin(row.fin);
          } else if (row.turno === 'tarde') {
            _horario.tarde.inicio  = _timeToMin(row.inicio);
            _horario.tarde.fin     = _timeToMin(row.fin);
          }
        });
      }
    } catch(e) { console.warn('Objetivos.init error:', e); }

    _initialized  = true;
    _lastUnidades = _getUnidadesHoy();

    // Poner el contador en los ticks que ya debieron haber ocurrido
    // para que el SIGUIENTE tick se programe correctamente desde ahora
    _emojisCaidosHoy = _ticksEsperados();

    _renderPanel();

    // Emoji de bienvenida al iniciar sesión
    if (_dentroDeJornada() && !_enPausa() && _emojisActivos) {
      setTimeout(() => {
        _lanzarEmojis(_emojiDeEstado(_getUnidadesHoy()), 2 + Math.floor(Math.random() * 3));
      }, 1200);
    }

    _programarProximo();

    _mainTimer = setInterval(() => {
      _checkNuevaVenta();
      _renderPanel();
    }, 60_000);
  }

  function render() {
    if (!_initialized) return;
    _checkNuevaVenta();
    _renderPanel();
  }

  function getMeta()          { return _meta; }
  function getEmojisActivos() { return _emojisActivos; }
  function getHorario()       { return _horario; }

  async function setMeta(val) {
    _meta = parseInt(val) || 5;
    clearTimeout(_emojiTimer);
    _emojiTimer      = null;
    _emojisCaidosHoy = _ticksEsperados();
    try {
      await db.from('config').update({ valor: String(_meta) }).eq('clave', 'objetivo_unidades_dia');
    } catch(e) { console.warn('setMeta error:', e); }
    _renderPanel();
    _programarProximo();
  }

  async function setEmojisActivos(val) {
    _emojisActivos = val;
    try {
      await db.from('config').update({ valor: val ? 'true' : 'false' }).eq('clave', 'objetivo_emojis_activos');
    } catch(e) { console.warn('setEmojisActivos error:', e); }
  }

  async function setHorario(turno, inicio, fin) {
    if (turno === 'mañana' || turno === 'tarde') {
      _horario[turno].inicio = _timeToMin(inicio);
      _horario[turno].fin    = _timeToMin(fin);
    }
    try {
      await db.from('horario_laboral').update({ inicio, fin }).eq('turno', turno);
    } catch(e) { console.warn('setHorario error:', e); }
  }

  function afterHorarioSaved() {
    clearTimeout(_emojiTimer);
    _emojiTimer      = null;
    _emojisCaidosHoy = _ticksEsperados();
    _renderPanel();
    _programarProximo();
    if (_dentroDeJornada() && !_enPausa() && _emojisActivos) {
      setTimeout(() => _lanzarEmojis(_emojiDeEstado(_getUnidadesHoy()), 1), 400);
    }
  }

  function stop() {
    clearInterval(_mainTimer);
    clearTimeout(_emojiTimer);
    _mainTimer       = null;
    _emojiTimer      = null;
    _initialized     = false;
    _emojisCaidosHoy = 0;
    _lastUnidades    = -1;
  }

  return {
    init, render, stop,
    getMeta, setMeta,
    getEmojisActivos, setEmojisActivos,
    getHorario, setHorario, afterHorarioSaved,
  };
})();

// ── Funciones globales desde vista Config ─────────────────────────────────

async function saveConfigObjetivoDia() {
  const val = parseInt(document.getElementById('config-objetivo-dia').value) || 5;
  await Objetivos.setMeta(val);
  toast(`✅ Objetivo: ${val} unidades/día`, 'success');
}

async function saveConfigEmojisActivos(activo) {
  await Objetivos.setEmojisActivos(activo);
  document.getElementById('toggle-emojis-span').style.background =
    activo ? 'var(--green)' : 'var(--border)';
  toast(activo ? '✅ Emojis activados' : '🔕 Emojis desactivados', 'success');
}

async function saveConfigHorario() {
  const mIn  = document.getElementById('horario-manana-inicio').value;
  const mFin = document.getElementById('horario-manana-fin').value;
  const tIn  = document.getElementById('horario-tarde-inicio').value;
  const tFin = document.getElementById('horario-tarde-fin').value;

  if (!mIn || !mFin || !tIn || !tFin) {
    toast('⚠️ Completa todos los horarios', 'error');
    return;
  }
  await Objetivos.setHorario('mañana', mIn, mFin);
  await Objetivos.setHorario('tarde',  tIn, tFin);
  Objetivos.afterHorarioSaved();
  toast('✅ Horario laboral guardado', 'success');
}