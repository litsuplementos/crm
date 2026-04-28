/* objetivos.js — LIT CRM */

const Objetivos = (() => {
  let _meta = 5;
  let _mainTimer = null;  
  let _emojiTimer = null;  
  let _initialized = false;
  let _emojisActivos = true;
  let _lastUnidades = -1;
  let _emojisCaidosHoy = 0;

  let _horario = {
    mañana: { inicio: 9 * 60, fin: 12 * 60 },
    tarde: { inicio: 13 * 60, fin: 18 * 60 },
  };

  const EMOJI_SEC = ['😄','😊','🙂','😐','😕','😟','😢','😰','😱','🥀'];

  // Tiempo
  function _ahora() {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  }
  function _totalMinutos() {
    return (_horario.mañana.fin - _horario.mañana.inicio)
         + (_horario.tarde.fin - _horario.tarde.inicio);
  }
  function _minutosEfectivos() {
    const t = _ahora(), { mañana, tarde } = _horario;
    if (t <= mañana.inicio) return 0;
    if (t <= mañana.fin) return t - mañana.inicio;
    if (t <  tarde.inicio) return mañana.fin - mañana.inicio;
    if (t <= tarde.fin) return (mañana.fin - mañana.inicio) + (t - tarde.inicio);
    return _totalMinutos();
  }
  function _progresoDia() { const t = _totalMinutos(); return t > 0 ? Math.min(1, _minutosEfectivos() / t) : 0; }
  function _jornadaTerminada() { return _ahora() >= _horario.tarde.fin; }
  function _enPausa() { const t = _ahora(); return t >= _horario.mañana.fin && t < _horario.tarde.inicio; }
  function _antesDeJornada() { return _ahora() < _horario.mañana.inicio; }
  function _dentroDeJornada() { return !_antesDeJornada() && !_jornadaTerminada(); }

  // Ventas
  function _getUnidadesHoy() {
    // Si la jornada ya terminó, mostrar 0 para el nuevo día
    if (_jornadaTerminada()) return 0;

    const hoy = new Date().toISOString().slice(0, 10);
    return ventas
      .filter(v => {
        if (v.estado !== 'vendido') return false;
        const fechaVenta = v.updated_at
          ? v.updated_at.slice(0, 10)
          : v.fecha;
        if (fechaVenta !== hoy) return false;
        if (currentUser.rol === 'agente') return v.agente_id === currentUser.id;
        if (currentUser.rol === 'admin' && selectedAgentId !== 'all') return v.agente_id === selectedAgentId;
        return true;
      })
      .reduce((s, v) => s + (v.venta_items || []).reduce((ss, it) => ss + (it.cantidad || 1), 0), 0);
  }

  // Emoji según progreso
  function _emojiDeEstado(unidades) {
    const pct = _meta > 0 ? Math.min(1, unidades / _meta) : 0;
    const idx = Math.round((1 - pct) * (EMOJI_SEC.length - 1));
    return EMOJI_SEC[Math.min(idx, EMOJI_SEC.length - 1)];
  }

  // Lanzar emojis — cada elemento se destruye solo vía animationend
  function _lanzarEmojis(char, cantidad) {
    if (!_emojisActivos) return;

    // 3 efectos posibles: swing lateral, espiral, explosión desde centro
    const EFFECTS = [
      // Caída con swing lateral y rotación suave
      (el, left, size) => {
        el.style.left = left + 'vw';
        el.style.top = '-80px';
        el.style.fontSize = size + 'px';
        el.style.filter = 'drop-shadow(0 0 6px rgba(200,80,40,0.55))';
        const dur = 4 + Math.random() * 3;
        const swing = (Math.random() - 0.5) * 130;
        el.animate([
          { transform: `translateX(0) translateY(0) rotate(${Math.random()*20-10}deg)`, opacity: 1 },
          { transform: `translateX(${swing * 0.35}px) translateY(30vh) rotate(${Math.random()*30-15}deg)`, opacity: 0.9, offset: 0.3 },
          { transform: `translateX(${swing}px) translateY(70vh) rotate(${Math.random()*50-25}deg)`, opacity: 0.65, offset: 0.75 },
          { transform: `translateX(${swing * 1.5}px) translateY(110vh) rotate(${Math.random()*70-35}deg)`, opacity: 0 }
        ], { duration: dur * 1000, easing: 'cubic-bezier(0.4, 0, 0.8, 1)', fill: 'forwards' })
        .onfinish = () => el.remove();
        setTimeout(() => el.remove(), dur * 1000 + 300);
      },
      // Espiral descendente — ideal para 🥀
      (el, left, size) => {
        el.style.left = left + 'vw';
        el.style.top = '-80px';
        el.style.fontSize = size + 'px';
        el.style.filter = 'drop-shadow(0 2px 5px rgba(0,0,0,0.45))';
        const dur = 5 + Math.random() * 2.5;
        const amp = 30 + Math.random() * 55;
        el.animate([
          { transform: 'translateX(0) translateY(0) rotate(0deg) scale(1)', opacity: 0.95 },
          { transform: `translateX(${amp}px) translateY(25vh) rotate(130deg) scale(0.82)`, opacity: 0.8, offset: 0.25 },
          { transform: `translateX(0) translateY(55vh) rotate(250deg) scale(0.66)`, opacity: 0.55, offset: 0.5 },
          { transform: `translateX(${-amp}px) translateY(80vh) rotate(370deg) scale(0.48)`, opacity: 0.3, offset: 0.75 },
          { transform: `translateX(0) translateY(110vh) rotate(490deg) scale(0.2)`, opacity: 0 }
        ], { duration: dur * 1000, easing: 'ease-in', fill: 'forwards' });
        setTimeout(() => el.remove(), dur * 1000 + 300);
      },
      // Explosión desde el centro con caída posterior
      (el, left, size) => {
        el.style.left = '50vw';
        el.style.top = '35%';
        el.style.fontSize = size + 'px';
        el.style.filter = 'drop-shadow(0 0 10px rgba(248,113,113,0.65))';
        const angle = Math.random() * 2 * Math.PI;
        const dist = 90 + Math.random() * 130;
        const dur = 3 + Math.random() * 2;
        el.animate([
          { transform: 'translate(0,0) scale(1.6)', opacity: 1 },
          { transform: `translate(${Math.cos(angle)*dist}px, ${Math.sin(angle)*dist - 50}px) scale(1)`, opacity: 0.9, offset: 0.3 },
          { transform: `translate(${Math.cos(angle)*dist*1.3}px, ${Math.sin(angle)*dist*1.3 + 220}px) scale(0.5)`, opacity: 0 }
        ], { duration: dur * 1000, easing: 'cubic-bezier(0.2, 0, 0.9, 0.8)', fill: 'forwards' });
        setTimeout(() => el.remove(), dur * 1000 + 300);
      }
    ];

    for (let i = 0; i < cantidad; i++) {
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'obj-emoji-fall';
        el.textContent = char;
        el.style.position = 'fixed';
        el.style.zIndex = '9990';
        el.style.pointerEvents = 'none';
        el.style.userSelect = 'none';
        el.style.lineHeight = '1';
        el.style.willChange = 'transform, opacity';

        const left = 4 + Math.random() * 88;
        const size = 22 + Math.random() * 26;

        // 🥀 siempre usa espiral; otros alternan efecto según índice
        const efectoIdx = (char === '🥀')
          ? (Math.random() < 0.6 ? 1 : 0)   // espiral o swing
          : (i % EFFECTS.length);

        document.body.appendChild(el);
        EFFECTS[efectoIdx](el, left, size);

      }, i * (130 + Math.random() * 220));
    }
  }

  // Intervalo fijo entre lluvias de emojis (minutos)
  const MIN_ENTRE_LLUVIAS = 20;

  function _ticksEsperados() {
    return Math.floor(_minutosEfectivos() / MIN_ENTRE_LLUVIAS);
  }

  function _msHastaProximoTick() {
    if (_jornadaTerminada()) return null;
    // Próxima lluvia ocurre en el siguiente múltiplo de MIN_ENTRE_LLUVIAS efectivos
    const proxEfect = (_emojisCaidosHoy + 1) * MIN_ENTRE_LLUVIAS;
    const durMañana = _horario.mañana.fin - _horario.mañana.inicio;
    let   targetClock;
    if (proxEfect <= durMañana) {
      targetClock = _horario.mañana.inicio + proxEfect;
    } else {
      targetClock = _horario.tarde.inicio + (proxEfect - durMañana);
    }
    const diffMin = targetClock - _ahora();
    return diffMin > 0 ? diffMin * 60 * 1000 : 5000;
  }

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

  function _checkNuevaVenta() {
    const unidades = _getUnidadesHoy();
    if (_lastUnidades >= 0 && unidades > _lastUnidades) {
      const cantidad = 3 + Math.floor(Math.random() * 4); 
      _lanzarEmojis(_emojiDeEstado(unidades), cantidad);
      _renderPanel(); 
    }
    _lastUnidades = unidades;
  }

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

  function _renderPanelRoscaAgentes(wrap) {
    const hoy = new Date().toISOString().slice(0, 10);

    // Calcular unidades vendidas hoy por cada agente
    const agStats = allAgents
      .filter(a => a.rol === 'agente')
      .map(ag => {
        const unidades = ventas
          .filter(v => v.estado === 'vendido' && v.agente_id === ag.id &&
            (v.updated_at ? v.updated_at.slice(0, 10) : v.fecha) === hoy)
          .reduce((s, v) => s + (v.venta_items || []).reduce((ss, it) => ss + (it.cantidad || 1), 0), 0);
        return { nombre: ag.nombre, unidades };
      })
      .filter(a => a.unidades > 0);

    const totalUnidades = agStats.reduce((s, a) => s + a.unidades, 0);

    if (totalUnidades === 0) {
      wrap.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:13px;
                      text-transform:uppercase;letter-spacing:0.5px;color:var(--text3);">
            🎯 Objetivo del Día — Equipo
          </div>
        </div>
        <div style="text-align:center;padding:32px 0;color:var(--text3);font-size:13px;">
          Sin unidades vendidas hoy aún
        </div>`;
      return;
    }

    const colores = ['#6366f1','#22d3a4','#60a5fa','#fbbf24','#f472b6','#34d399','#a78bfa','#fb923c'];
    const cx = 110, cy = 110, R = 90, r = 54, TAU = 2 * Math.PI;
    let startAngle = -Math.PI / 2;
    const segmentos = [];

    agStats.forEach((ag, i) => {
      const pct = ag.unidades / totalUnidades;
      const angle = pct * TAU;
      const end = startAngle + angle;
      const gap = agStats.length > 1 ? 0.04 : 0;
      const s = startAngle + gap / 2;
      const e = end - gap / 2;
      const x1 = cx + R * Math.cos(s), y1 = cy + R * Math.sin(s);
      const x2 = cx + R * Math.cos(e), y2 = cy + R * Math.sin(e);
      const x3 = cx + r * Math.cos(e), y3 = cy + r * Math.sin(e);
      const x4 = cx + r * Math.cos(s), y4 = cy + r * Math.sin(s);
      const large = angle - gap > Math.PI ? 1 : 0;
      const path = `M${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} L${x3},${y3} A${r},${r} 0 ${large},0 ${x4},${y4} Z`;
      segmentos.push({ path, color: colores[i % colores.length], ag, pct });
      startAngle = end;
    });

    const paths = segmentos.map(seg =>
      `<path d="${seg.path}" fill="${seg.color}" opacity="0.9" style="cursor:default;"></path>`
    ).join('');

    const leyenda = segmentos.map(seg => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <div style="width:10px;height:10px;border-radius:3px;background:${seg.color};flex-shrink:0;"></div>
        <span style="font-size:13px;color:var(--text);flex:1;font-weight:500;">${seg.ag.nombre}</span>
        <span style="font-size:14px;font-weight:800;color:${seg.color};">${seg.ag.unidades}</span>
        <span style="font-size:11px;color:var(--text3);">und.</span>
      </div>`).join('');

    wrap.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:13px;
                    text-transform:uppercase;letter-spacing:0.5px;color:var(--text3);">
          🎯 Objetivo del Día — Equipo
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
        <div style="position:relative;flex-shrink:0;">
          <svg width="220" height="220" viewBox="0 0 220 220">
            ${paths}
            <circle cx="${cx}" cy="${cy}" r="${r - 4}" fill="var(--surface)"/>
            <text x="${cx}" y="${cy - 10}" text-anchor="middle"
              style="font-size:11px;fill:var(--text3);font-family:'DM Sans',sans-serif;font-weight:600;">
              Hoy
            </text>
            <text x="${cx}" y="${cy + 8}" text-anchor="middle"
              style="font-size:18px;fill:var(--text);font-family:'Syne',sans-serif;font-weight:700;">
              ${totalUnidades}
            </text>
            <text x="${cx}" y="${cy + 24}" text-anchor="middle"
              style="font-size:10px;fill:var(--text3);font-family:'DM Sans',sans-serif;">
              unidades
            </text>
            <text x="${cx}" y="${cy + 38}" text-anchor="middle"
              style="font-size:10px;fill:var(--text3);font-family:'DM Sans',sans-serif;">
              meta: ${_meta} c/u
            </text>
          </svg>
        </div>
        <div style="flex:1;min-width:120px;">
          ${leyenda}
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);
                      font-size:11px;color:var(--text3);">
            Meta individual: <b style="color:var(--text);">${_meta} unidades/día</b>
          </div>
        </div>
      </div>`;
  }

  function _renderPanel() {
    const wrap = document.getElementById('obj-panel-derecho');
    if (!wrap) return;

    // ── ADMIN viendo TODOS los agentes → rosca por agente ──
    if (currentUser?.rol === 'admin' && selectedAgentId === 'all') {
      _renderPanelRoscaAgentes(wrap);
      return;
    }

    const unidades = _getUnidadesHoy();
    const pct = Math.min(1, _meta > 0 ? unidades / _meta : 0);
    const colorProg = _colorProgreso(pct);
    const progDia = _progresoDia();
    const unidEsp = Math.ceil(progDia * _meta);
    const deficit = Math.max(0, unidEsp - unidades);
    const superavit = Math.max(0, unidades - unidEsp);
    const minRest = Math.round((1 - progDia) * _totalMinutos());
    const pctTiempo = Math.round(progDia * 100);
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
          <span>Progreso (Se calcula en base a registros actuales + posteriores) de registros cerrados hoy</span><span style="color:${colorProg};">${pctUnidades}%</span>
        </div>
        <div class="bar-track" style="height:10px;position:relative;overflow:visible;">
          <div style="position:absolute;top:-4px;bottom:-4px;width:2px;
                      left:${Math.min(pctTiempo, 99)}%;background:var(--text3);
                      border-radius:2px;opacity:0.45;z-index:2;"
                title="Ritmo esperado según hora"></div>
          <div class="bar-fill" style="width:${pctUnidades}%;background:${colorProg};
                      transition:width 0.6s ease,background 0.5s;"></div>
        </div>
        <div style="font-size:12px;color:var(--text3);margin-top:3px;">
          Jornada laboral = Mañana ${_minToTime(_horario.mañana.inicio)}–${_minToTime(_horario.mañana.fin)}
          · Tarde ${_minToTime(_horario.tarde.inicio)}–${_minToTime(_horario.tarde.fin)}
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
    `;
  }

  // API PÚBLICA
  async function init() {
    clearInterval(_mainTimer);
    clearTimeout(_emojiTimer);
    _mainTimer = null;
    _emojiTimer = null;
    _lastUnidades = -1;

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

      if (dataMeta?.valor) _meta = parseInt(dataMeta.valor) || 5;
      if (dataEmojis?.valor) _emojisActivos = dataEmojis.valor !== 'false';

      if (dataHorario?.length) {
        dataHorario.forEach(row => {
          if (row.turno === 'mañana') {
            _horario.mañana.inicio = _timeToMin(row.inicio);
            _horario.mañana.fin = _timeToMin(row.fin);
          } else if (row.turno === 'tarde') {
            _horario.tarde.inicio = _timeToMin(row.inicio);
            _horario.tarde.fin = _timeToMin(row.fin);
          }
        });
      }
    } catch(e) { console.warn('Objetivos.init error:', e); }

    _initialized = true;
    _lastUnidades = _getUnidadesHoy();
    _emojisCaidosHoy = _ticksEsperados();    

    _renderPanel();

    if (_dentroDeJornada() && !_enPausa() && _emojisActivos) {
      setTimeout(() => {
        _lanzarEmojis(_emojiDeEstado(_getUnidadesHoy()), 2 + Math.floor(Math.random() * 3));
      }, 1200);
    }

    _programarProximo();

    _mainTimer = setInterval(() => {
      if (_ahora() === _horario.tarde.fin) {
        _lastUnidades = 0;
        _emojisCaidosHoy = 0;
      }
      _checkNuevaVenta();
      _renderPanel();
    }, 60_000);
  }

  function render() {
    if (!_initialized) return;
    _checkNuevaVenta();
    _renderPanel();
  }

  function getMeta() { return _meta; }
  function getEmojisActivos() { return _emojisActivos; }
  function getHorario() { return _horario; }

  async function setMeta(val) {
    _meta = parseInt(val) || 5;
    clearTimeout(_emojiTimer);
    _emojiTimer = null;
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
      _horario[turno].fin = _timeToMin(fin);
    }
    try {
      await db.from('horario_laboral').update({ inicio, fin }).eq('turno', turno);
    } catch(e) { console.warn('setHorario error:', e); }
  }

  function afterHorarioSaved() {
    clearTimeout(_emojiTimer);
    _emojiTimer = null;
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
    _mainTimer = null;
    _emojiTimer = null;
    _initialized = false;
    _emojisCaidosHoy = 0;
    _lastUnidades = -1;
  }

  return {
    init, render, stop,
    getMeta, setMeta,
    getEmojisActivos, setEmojisActivos,
    getHorario, setHorario, afterHorarioSaved,
  };
})();

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
    toast('⚠️ Completa todos los horarios', 'error'); return;
  }

  const toMin = str => { const [h,m] = str.split(':').map(Number); return h*60+(m||0); };
  const mInM = toMin(mIn), mFinM = toMin(mFin), tInM = toMin(tIn), tFinM = toMin(tFin);

  if (mInM === 0 || mFinM === 0 || tInM === 0 || tFinM === 0) {
    toast('⚠️ Ningún horario puede ser 00:00', 'error'); return;
  }
  if (mFinM <= mInM) {
    toast('⚠️ El fin de mañana debe ser mayor que el inicio', 'error'); return;
  }
  if (tInM <= mFinM) {
    toast('⚠️ El inicio de tarde debe ser posterior al fin de mañana', 'error'); return;
  }
  if (tFinM <= tInM) {
    toast('⚠️ El fin de tarde debe ser mayor que el inicio de tarde', 'error'); return;
  }

  await Objetivos.setHorario('mañana', mIn, mFin);
  await Objetivos.setHorario('tarde', tIn, tFin);
  Objetivos.afterHorarioSaved();
  toast('✅ Horario laboral guardado', 'success');
}