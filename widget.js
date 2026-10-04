// JMC Avisos · widget para iPhone e iPad (app gratuita "Scriptable")
// Mostra os recados pendentes e as mensagens do chat por ler. Atualiza-se sozinho a partir do site.
// Parâmetro do widget (opcional): de quem é o aparelho. Ex.: Dr. Gonçalo · Dra. Catarina · Aveiro · Faíscas
const VERSAO = '2026.10.04-2';
const SITE = 'https://goncalojpjesus.github.io/jmc-avisos/';
const URL_SB = 'https://piudosbhockofrtiieig.supabase.co';
const KEY = 'sb_publishable_POCYHRzMTQDQPXf8ESnJ_w_I6QDMctw';
const KC = 'jmc_avisos_sessao';
const C = { fundo: new Color('#FBF8F1'), fundoEsc: new Color('#1C1B19'), ouro: new Color('#C6A755'), texto: new Color('#2B2925'),
  textoEsc: new Color('#F2EEE6'), suave: new Color('#8C877D'), laranja: new Color('#E8892B'), vermelho: new Color('#D93A2B') };
const quem = ((args.widgetParameter || '').trim()) || (Keychain.contains('jmc_avisos_quem') ? Keychain.get('jmc_avisos_quem') : 'Dr. Gonçalo');

// ---------- sessão (a palavra-passe nunca fica guardada; só a sessão, no Porta-chaves do iPhone) ----------
async function pedido(path, opts = {}) {
  const r = new Request(URL_SB + path); r.method = opts.method || 'GET';
  r.headers = Object.assign({ apikey: KEY, 'Content-Type': 'application/json' }, opts.headers || {});
  if (opts.body) r.body = JSON.stringify(opts.body);
  const j = await r.loadJSON(); return { status: r.response.statusCode, j };
}
async function sessao() {
  if (!Keychain.contains(KC)) return null;
  let s = JSON.parse(Keychain.get(KC));
  if (Date.now() / 1000 > (s.expires_at || 0) - 120) {
    const { status, j } = await pedido('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token } });
    if (status !== 200) { Keychain.remove(KC); return null; }
    s = j; Keychain.set(KC, JSON.stringify(s));
  }
  return s;
}
async function configurar() {
  const a = new Alert(); a.title = 'JMC Avisos'; a.message = 'Iniciar sessão com a conta da clínica (só uma vez).';
  a.addTextField('email', 'geral@jesusmarcouto.pt'); a.addSecureTextField('palavra-passe', '');
  a.addAction('Ligar'); a.addCancelAction('Cancelar');
  if (await a.present() === -1) return false;
  const { status, j } = await pedido('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: a.textFieldValue(0).trim(), password: a.textFieldValue(1) } });
  if (status !== 200) { const e = new Alert(); e.title = 'Não foi possível ligar'; e.message = j.msg === 'Invalid login credentials' ? 'Email ou palavra-passe errados.' : (j.msg || 'Sem internet.'); e.addAction('OK'); await e.present(); return false; }
  Keychain.set(KC, JSON.stringify(j));
  const q = new Alert(); q.title = 'De quem é este aparelho?';
  const ops = ['Dr. Gonçalo', 'Dra. Catarina', 'Aveiro', 'Faíscas', 'Dr. Diogo', 'Dra. Mara']; ops.forEach(o => q.addAction(o));
  Keychain.set('jmc_avisos_quem', ops[await q.present()] || 'Dr. Gonçalo');
  return true;
}

// ---------- dados ----------
async function dados(s) {
  const H = { headers: { Authorization: 'Bearer ' + s.access_token } };
  const enc = encodeURIComponent;
  const m = await pedido('/rest/v1/memos?select=texto,prioridade,de_txt,de,criado_em,escala_em,estado,ate,pessoa&para=cs.' + enc('{"' + quem + '"}') +
    '&estado=in.(pend,adiado)&order=criado_em.desc&limit=100', H);
  const agora = Date.now();
  const lista = (m.j || []).filter(r => r.estado === 'pend' || (r.ate && Date.parse(r.ate) <= agora)).map(r => {
    let p = r.prioridade; if (r.escala_em && Date.parse(r.escala_em) <= agora) p = 'u'; return Object.assign(r, { p });
  }).sort((a, b) => ('uhn'.indexOf(a.p) - 'uhn'.indexOf(b.p)) || (Date.parse(b.criado_em) - Date.parse(a.criado_em)));
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const c = await pedido('/rest/v1/chat_messages?select=id&para=eq.' + enc(quem) + '&visto_em=is.null&enviado_em=gte.' + enc(d0.toISOString()), H);
  return { lista, chat: Array.isArray(c.j) ? c.j.length : 0 };
}

// ---------- aspeto ----------
async function emblema(cinza) {
  const fm = FileManager.local(), p = fm.joinPath(fm.cacheDirectory(), 'jmc-emblema.png');
  let img = fm.fileExists(p) ? fm.readImage(p) : null;
  if (!img) { try { img = await new Request(SITE + 'icon-256.png').loadImage(); fm.writeImage(p, img); } catch (e) {} }
  return img;
}
const cor = p => p === 'u' ? C.vermelho : p === 'h' ? C.laranja : C.ouro;
const dinamica = (claro, escuro) => Color.dynamic(claro, escuro);
const quando = iso => { const d = new Date(iso), h = new Date(); const df = new DateFormatter();
  df.dateFormat = d.toDateString() === h.toDateString() ? 'HH:mm' : 'dd/MM HH:mm'; return df.string(d); };

async function construir(info, erro) {
  const fam = config.widgetFamily || 'medium';
  const w = new ListWidget(); w.url = SITE;
  w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);
  const n = info ? info.lista.length : 0, top = info && info.lista[0];
  const img = await emblema();

  // ecrã bloqueado
  if (fam === 'accessoryCircular') {
    w.addAccessoryWidgetBackground = true;
    const t = w.addText(n ? String(n) : '✓'); t.font = Font.semiboldRoundedSystemFont(n ? 22 : 18); t.centerAlignText();
    const s = w.addText('avisos'); s.font = Font.systemFont(9); s.centerAlignText(); return w;
  }
  if (fam === 'accessoryRectangular' || fam === 'accessoryInline') {
    if (fam === 'accessoryInline') { w.addText(erro ? 'JMC · abrir para ligar' : n ? `JMC · ${n} aviso${n > 1 ? 's' : ''}` : 'JMC · tudo em dia'); return w; }
    const h = w.addText(n ? `${n} aviso${n > 1 ? 's' : ''}${info.chat ? ' · ' + info.chat + ' msg' : ''}` : 'Tudo em dia'); h.font = Font.semiboldSystemFont(13);
    if (top) { const t = w.addText(top.texto); t.font = Font.systemFont(12); t.lineLimit = 2; }
    else if (erro) { const t = w.addText(erro); t.font = Font.systemFont(11); }
    return w;
  }

  // ecrã principal
  w.backgroundColor = dinamica(C.fundo, C.fundoEsc);
  w.setPadding(14, 16, 14, 16);
  const cab = w.addStack(); cab.centerAlignContent();
  if (img) { const e = cab.addImage(img); e.imageSize = new Size(22, 22); e.cornerRadius = 11; if (!n) e.imageOpacity = 0.45; cab.addSpacer(8); }
  const tt = cab.addText('Avisos'); tt.font = new Font('Didot', 17); tt.textColor = dinamica(C.texto, C.textoEsc);
  cab.addSpacer();
  if (n) { const b = cab.addStack(); b.backgroundColor = cor(top.p); b.cornerRadius = 9; b.setPadding(2, 8, 2, 8);
    const bt = b.addText(String(n)); bt.font = Font.semiboldRoundedSystemFont(12); bt.textColor = Color.white(); }
  if (info && info.chat) { cab.addSpacer(6); const b = cab.addStack(); b.borderColor = C.ouro; b.borderWidth = 1; b.cornerRadius = 9; b.setPadding(2, 7, 2, 7);
    const bt = b.addText('Chat ' + info.chat); bt.font = Font.mediumSystemFont(11); bt.textColor = C.ouro; }
  w.addSpacer(10);

  if (erro) {
    const t = w.addText(erro); t.font = Font.systemFont(13); t.textColor = C.suave;
  } else if (!n) {
    w.addSpacer();
    const t = w.addText('Tudo em dia'); t.font = new Font('Didot-Italic', 20); t.textColor = C.suave;
    w.addSpacer();
  } else {
    const max = fam === 'large' ? 5 : fam === 'small' ? 1 : 2;
    info.lista.slice(0, max).forEach((r, i) => {
      if (i) w.addSpacer(8);
      const row = w.addStack(); row.layoutHorizontally();
      const bar = row.addStack(); bar.size = new Size(3, fam === 'small' ? 54 : 36); bar.backgroundColor = cor(r.p); bar.cornerRadius = 1.5;
      row.addSpacer(8);
      const col = row.addStack(); col.layoutVertically();
      const t = col.addText(r.texto); t.font = Font.mediumSystemFont(fam === 'small' ? 13 : 13.5); t.lineLimit = fam === 'small' ? 3 : 2;
      t.textColor = dinamica(C.texto, C.textoEsc);
      col.addSpacer(2);
      const m = col.addText((r.de_txt || r.de) + ' · ' + quando(r.criado_em)); m.font = Font.systemFont(11); m.textColor = C.suave;
    });
    w.addSpacer();
    if (n > max && fam !== 'small') { const mais = w.addText('+ ' + (n - max) + ' por fazer'); mais.font = Font.systemFont(11); mais.textColor = C.ouro; }
  }
  return w;
}

// ---------- atualização automática do próprio script ----------
async function atualizar() {
  try {
    const novo = await new Request(SITE + 'widget.js?' + Date.now()).loadString();
    const v = (novo.match(/const VERSAO = '([^']+)'/) || [])[1];
    if (v && v !== VERSAO && novo.length > 2000) { const fm = FileManager.iCloud().isFileStoredIniCloud(module.filename) ? FileManager.iCloud() : FileManager.local(); fm.writeString(module.filename, novo); }
  } catch (e) {}
}

// ---------- arranque ----------
let s = await sessao();
if (!s && config.runsInApp) { if (await configurar()) s = await sessao(); }
let info = null, erro = null;
if (!s) erro = 'Abra a app Scriptable e toque neste script para ligar.';
else { try { info = await dados(s); } catch (e) { erro = 'Sem ligação ao servidor.'; } }
const w = await construir(info, erro);
await atualizar();
if (config.runsInWidget) Script.setWidget(w); else await w.presentMedium();
Script.complete();
