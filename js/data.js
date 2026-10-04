/*
 * Universo JMC · camada de dados ("a única porta").
 *
 * O resto da app só conhece esta interface:
 *   JMCData.connect()                        -> Promise<Store>
 *   store.collection('memos'|'chat'|'salas') -> Query
 *   query.where(campo,'==',valor).orderBy(campo,'asc'|'desc').limit(n)
 *   query.onSnapshot(next, erro)             -> função para cancelar
 *   query.doc(id?)                           -> DocRef { id, set(obj), update(obj), delete() }
 *   store.doc('config/geral')                -> DocRef com onSnapshot(cb({exists,data()}))
 *   store.verifyCode('1234')                 -> Promise<nome|null>
 *
 * Mudar de fornecedor (Supabase na nuvem -> servidor próprio) = trocar só este ficheiro.
 * Os campos da app (camelCase, datas em milissegundos) são convertidos para as colunas SQL.
 */
(function (global) {
  'use strict';

  // ---------- mapeamento app <-> tabelas SQL ----------
  // tipo: s = texto, n = número, a = lista, ts = data (ms <-> ISO), j = objeto
  const MAP = {
    memos: { table: 'memos', order: { criadoEm: 'criado_em' }, f: {
      t: ['texto', 's'], p: ['prioridade', 's'], para: ['para', 'a'], pessoa: ['pessoa', 's'],
      de: ['de', 's'], deTxt: ['de_txt', 's'], escalaEm: ['escala_em', 'ts'], estado: ['estado', 's'],
      ate: ['ate', 'ts'], adiPor: ['adi_por', 's'], nAdi: ['n_adi', 'n'], adiMot: ['adi_mot', 's'],
      nota: ['nota', 's'], naoPor: ['nao_por', 's'], naoEm: ['nao_em', 'ts'],
      feitoPor: ['feito_por', 's'], feitoEm: ['feito_em', 'ts'], criadoEm: ['criado_em', 'ts'],
      tipo: ['tipo', 's'], link: ['link', 's'], clinica: ['clinica', 's'], ok: ['ok', 'b'], inc: ['incompleto', 'b'], concluidoEm: ['concluido_em', 'ts'], valores: ['valores', 'j'], por: ['por', 's'], hora: ['hora', 's'] } },
    chat: { table: 'chat_messages', order: { em: 'enviado_em' }, f: {
      tid: ['tid', 's'], de: ['de', 's'], deTxt: ['de_txt', 's'], para: ['para', 's'], sala: ['sala', 's'],
      t: ['texto', 's'], em: ['enviado_em', 'ts'], editadoEm: ['editado_em', 'ts'], apagadoEm: ['apagado_em', 'ts'], anexo: ['anexo', 'j'], resposta: ['resposta', 'j'], reacoes: ['reacoes', 'j'], reenc: ['reencaminhada', 'b'] }, visto: true },
    salas: { table: 'room_assignments', textId: true, f: {
      medico: ['medico', 's'], clinica: ['clinica', 's'], sala: ['sala', 's'], dia: ['dia', 's'] } }
  };
  const iso = ms => (ms == null || ms === '' ? null : new Date(ms).toISOString());
  const ms = v => (v == null ? null : Date.parse(v));

  function toRow(name, obj) {
    const m = MAP[name], row = {};
    for (const k in obj) {
      if (k === 'visto' && m.visto) { row.visto_por = obj.visto ? obj.visto.por : null; row.visto_em = obj.visto ? iso(obj.visto.em) : null; continue; }
      const d = m.f[k]; if (!d) continue;
      row[d[0]] = d[1] === 'ts' ? (typeof obj[k] === 'number' ? iso(obj[k]) : null) : obj[k];
    }
    return row;
  }
  function fromRow(name, row) {
    const m = MAP[name], o = {};
    for (const k in m.f) { const d = m.f[k]; const v = row[d[0]]; if (v === undefined) continue; o[k] = d[1] === 'ts' ? ms(v) : v; }
    if (m.visto) o.visto = row.visto_em ? { por: row.visto_por, em: ms(row.visto_em) } : null;
    return o;
  }
  const uuid = () => (global.crypto && crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  const snapDoc = (id, data) => ({ id, exists: data != null, data: () => data });

  // ================= Supabase (nuvem ou instalado no vosso servidor) =================
  function SupabaseStore(cfg) {
    const sb = global.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true } });
    const listeners = {}; // tabela -> Set(refetch)
    const channel = sb.channel('jmc-memo');
    ['memos', 'chat_messages', 'room_assignments', 'app_config'].forEach(t => {
      listeners[t] = new Set();
      channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => listeners[t].forEach(fn => fn()));
    });
    let status = 'a ligar';
    channel.subscribe(s => { status = s; if (s === 'SUBSCRIBED') Object.values(listeners).forEach(set => set.forEach(fn => fn())); });

    function query(name, spec) {
      const m = MAP[name];
      const api = {
        where: (f, op, v) => query(name, Object.assign({}, spec, { where: (spec.where || []).concat([[f, op, v]]) })),
        orderBy: (f, dir) => query(name, Object.assign({}, spec, { order: [f, dir || 'asc'] })),
        limit: n => query(name, Object.assign({}, spec, { limit: n })),
        doc: id => docRef(name, id),
        onSnapshot(next, err) {
          let timer = null, dead = false;
          const run = async () => {
            let q = sb.from(m.table).select('*');
            (spec.where || []).forEach(([f, op, v]) => { if (op !== '==') throw new Error('só ==');
              const d = m.f[f]; q = q.eq(d ? d[0] : f, v); });
            if (spec.order) { const col = (m.order && m.order[spec.order[0]]) || (m.f[spec.order[0]] || [spec.order[0]])[0]; q = q.order(col, { ascending: spec.order[1] !== 'desc' }); }
            if (spec.limit) q = q.limit(spec.limit);
            const { data, error } = await q;
            if (dead) return;
            if (error) { err && err(error); return; }
            next({ docs: data.map(r => snapDoc(String(r.id), fromRow(name, r))) });
          };
          const refetch = () => { clearTimeout(timer); timer = setTimeout(run, 60); };
          listeners[m.table].add(refetch); run();
          const poll = setInterval(run, 30000); // segurança extra se o tempo real cair
          return () => { dead = true; listeners[m.table].delete(refetch); clearInterval(poll); };
        }
      };
      return api;
    }
    function docRef(name, id) {
      const m = MAP[name]; id = id || uuid();
      return {
        id,
        async set(obj) { const row = toRow(name, obj); row.id = id; const { error } = await sb.from(m.table).upsert(row); if (error) throw error; },
        async update(obj) { const { error } = await sb.from(m.table).update(toRow(name, obj)).eq('id', id); if (error) throw error; },
        async delete() { const { error } = await sb.from(m.table).delete().eq('id', id); if (error) throw error; }
      };
    }
    function configDoc(id) {
      return {
        onSnapshot(cb, err) {
          const run = async () => { const { data, error } = await sb.from('app_config').select('data').eq('id', id).maybeSingle();
            if (error) { err && err(error); return; } cb(snapDoc(id, data ? data.data : null)); };
          listeners.app_config.add(run); run(); return () => listeners.app_config.delete(run);
        },
        async set(obj) { const { error } = await sb.from('app_config').upsert({ id, data: obj }); if (error) throw error; }
      };
    }
    return {
      kind: 'supabase', client: sb,
      status: () => status,
      collection: name => query(name, {}),
      doc: path => configDoc(path.split('/')[1]),
      // notificações no telefone: regista/retira este aparelho (endereço push + de quem é)
      async pushSave(sub, quem, aparelho) {
        const j = sub.toJSON ? sub.toJSON() : sub;
        const { error } = await sb.from('push_subs').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, quem, aparelho: aparelho || null, atualizado_em: new Date().toISOString() }, { onConflict: 'endpoint' });
        if (error) throw error;
      },
      async pushDel(endpoint) { await sb.from('push_subs').delete().eq('endpoint', endpoint); },
      async upload(file) {
        const ext = ((file.name || '').match(/\.([A-Za-z0-9]{1,8})$/) || [, 'bin'])[1].toLowerCase();
        const d = new Date(), path = d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + uuid() + '.' + ext;
        const { error } = await sb.storage.from('anexos').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
        if (error) throw error;
        return { path, nome: file.name || ('ficheiro.' + ext), tipo: file.type || '', tam: file.size || 0 };
      },
      async fileUrl(path, download) {
        const { data, error } = await sb.storage.from('anexos').createSignedUrl(path, 3600, download ? { download } : undefined);
        if (error) throw error; return data.signedUrl;
      },
      async verifyCode(code) { const { data, error } = await sb.rpc('verify_code', { p_code: String(code) }); if (error) throw error; return data || null; },
      async signIn(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error; }
    };
  }

  // ================= Memória (demonstração e testes, sem servidor) =================
  function MemoryStore(seed) {
    // JMC_SHARED (opcional): vários ecrãs da maquete partilham os mesmos dados em memória
    const sh = global.JMC_SHARED;
    const data = sh ? (sh.data = sh.data || { memos: new Map(), chat: new Map(), salas: new Map() }) : { memos: new Map(), chat: new Map(), salas: new Map() };
    const cfg = sh ? (sh.cfg = sh.cfg || new Map()) : new Map();
    const subs = sh ? (sh.subs = sh.subs || new Set()) : new Set();
    if (!sh || !sh.seeded) { (seed && seed(data, uuid)) || 0; if (sh) { sh.seeded = true; if (sh.extra) sh.extra(data, uuid); } }
    const emit = () => subs.forEach(fn => { try { fn(); } catch (e) { subs.delete(fn); } });
    function query(name, spec) {
      return {
        where: (f, op, v) => query(name, Object.assign({}, spec, { where: (spec.where || []).concat([[f, op, v]]) })),
        orderBy: (f, dir) => query(name, Object.assign({}, spec, { order: [f, dir || 'asc'] })),
        limit: n => query(name, Object.assign({}, spec, { limit: n })),
        doc: id => docRef(name, id),
        onSnapshot(next) {
          const run = () => {
            let rows = [...data[name].entries()].map(([id, o]) => ({ id, o }));
            (spec.where || []).forEach(([f, , v]) => { rows = rows.filter(r => r.o[f] === v); });
            if (spec.order) { const [f, d] = spec.order; rows.sort((a, b) => (a.o[f] > b.o[f] ? 1 : -1) * (d === 'desc' ? -1 : 1)); }
            if (spec.limit) rows = rows.slice(0, spec.limit);
            next({ docs: rows.map(r => snapDoc(r.id, Object.assign({}, r.o))) });
          };
          subs.add(run); setTimeout(run, 0); return () => subs.delete(run);
        }
      };
    }
    function docRef(name, id) {
      id = id || uuid();
      return { id,
        async set(o) { data[name].set(id, Object.assign({}, o)); emit(); },
        async update(o) { data[name].set(id, Object.assign({}, data[name].get(id), o)); emit(); },
        async delete() { data[name].delete(id); emit(); } };
    }
    return {
      kind: 'memoria', status: () => 'local',
      collection: name => query(name, {}),
      doc: path => { const id = path.split('/')[1]; return {
        onSnapshot(cb) { const run = () => cb(snapDoc(id, cfg.get(id) || null)); subs.add(run); setTimeout(run, 0); return () => subs.delete(run); },
        async set(o) { cfg.set(id, o); emit(); } }; },
      async pushSave() {}, async pushDel() {},
      async upload(file) { return { path: 'mem:' + URL.createObjectURL(file), nome: file.name, tipo: file.type, tam: file.size }; },
      async fileUrl(path) { return path.slice(4); },
      async verifyCode(code) { return ({ '1111': 'Ana', '2222': 'Beatriz', '3333': 'Joana', '4444': 'Mariana', '5555': 'Tânia' })[code] || null; }
    };
  }

  // ---------- ligação ----------
  // A configuração do servidor vem do "código de instalação" (guardado no aparelho) ou de config.js.
  function readInstall() {
    try { const raw = localStorage.getItem('jmc_install'); if (raw) return JSON.parse(raw); } catch (e) {}
    return global.JMC_CONFIG && global.JMC_CONFIG.url ? global.JMC_CONFIG : null;
  }
  function saveInstall(code) {
    // código de instalação = base64 de {"url","key","email","password"}
    const cfg = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if (!cfg.url || !cfg.key) throw new Error('Código de instalação inválido');
    localStorage.setItem('jmc_install', JSON.stringify(cfg));
    return cfg;
  }
  function msgErro(e) {
    const c = (e && (e.code || e.error_code)) || '', m = (e && e.message) || '';
    if (c === 'invalid_credentials' || /Invalid login/i.test(m)) return 'Email ou palavra-passe errados.';
    if (c === 'email_not_confirmed' || /not confirmed/i.test(m)) return 'A conta ainda não está confirmada no Supabase (Authentication → Users).';
    if (c === 'login') return 'falta iniciar sessão neste aparelho. Abra ⚙︎ Definições → Ligação ao servidor.';
    if (/fetch|network|Failed/i.test(m)) return 'Sem internet ou servidor indisponível.';
    return m || 'Erro desconhecido.';
  }
  // Inicia sessão com email + palavra-passe. Guarda só o endereço e o email; a palavra-passe não fica no aparelho
  // (a sessão renova-se sozinha).
  async function login(email, password) {
    const base = (global.JMC_CONFIG && global.JMC_CONFIG.url) ? global.JMC_CONFIG : readInstall();
    if (!base || !base.url || !base.key) throw new Error('Falta a configuração do servidor (config.js).');
    const sb = global.supabase.createClient(base.url, base.key, { auth: { persistSession: true, autoRefreshToken: true } });
    const { error } = await sb.auth.signInWithPassword({ email: String(email).trim(), password: String(password) });
    if (error) throw error;
    localStorage.setItem('jmc_install', JSON.stringify({ url: base.url, key: base.key, email: String(email).trim() }));
    return true;
  }
  async function connect(opts) {
    const cfg = readInstall();
    if (!cfg || !global.supabase) return MemoryStore(opts && opts.seed);
    const store = SupabaseStore(cfg);
    const { data } = await store.client.auth.getSession();
    if (!data.session) {
      if (cfg.email && cfg.password) await store.signIn(cfg.email, cfg.password);
      else { const e = new Error('login'); e.code = 'login'; throw e; }
    }
    return store;
  }

  global.JMCData = { connect, login, msgErro, memory: seed => MemoryStore(seed), saveInstall, readInstall, MAP, toRow, fromRow };
})(window);
