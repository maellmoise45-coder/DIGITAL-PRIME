let ME = null;
let PROJECTS = [];
let CURRENT = null; // project detail
let ITEMS = [];

// Appels entrants / sortants
let INCOMING_SINCE = 0;
let INCOMING = null;
let CALL_WAIT = null;
let AUDIO_CTX = null;
let RING_TIMER = null;
let PUSH_READY = false;

document.addEventListener('pointerdown', unlockAudio);

async function init() {
  try { ME = (await API.get('api/auth.php?action=me')).user; }
  catch { location.href = 'index.html'; return; }
  setAccent(ME.color);
  renderMe();
  bindGlobal();
  await loadProjects();
  await initIncoming();
  await initPush();
  await initPresence();
}

function renderMe(){
  document.getElementById('me-pill').innerHTML = avatar(ME.display_name, ME.color) + `<span>${esc(ME.display_name)}</span>`;
}
function bindGlobal(){
  document.getElementById('btn-logout').onclick = async ()=>{ await API.post('api/auth.php?action=logout',{}); location.href='index.html'; };
  document.getElementById('btn-profile').onclick = openProfile;
  const bs = document.getElementById('btn-status'); if(bs) bs.onclick = openStatusModal;
  const bn = document.getElementById('btn-notify'); if(bn) bn.onclick = ()=>enablePush(true);
  document.getElementById('btn-new-project').onclick = openNewProject;
  document.getElementById('btn-add-member').onclick = openAddMember;
  document.getElementById('btn-leave').onclick = leaveProject;
  document.getElementById('btn-new-text').onclick = ()=>openTextEditor();
  document.getElementById('btn-upload').onclick = openUpload;
  const bv = document.getElementById('btn-video'); if(bv) bv.onclick = openVideoCall;
}

async function loadProjects(selectId){
  PROJECTS = (await API.get('api/projects.php?action=list')).projects || [];
  const list = document.getElementById('project-list');
  if (!PROJECTS.length) { list.innerHTML = '<div class="empty">Aucun projet pour l\'instant.</div>'; }
  else {
    list.innerHTML = PROJECTS.map(p => `
      <div class="project-item ${CURRENT && CURRENT.id==p.id?'active':''}" data-id="${p.id}">
        <div class="name">${esc(p.name)}</div>
        <div class="meta">${p.member_count} membre(s) · ${p.item_count} élément(s)</div>
      </div>`).join('');
    list.querySelectorAll('.project-item').forEach(el => el.onclick = ()=>openProject(Number(el.dataset.id)));
  }
  const target = selectId || (CURRENT && CURRENT.id);
  if (target && PROJECTS.find(p=>p.id==target)) await openProject(target, true);
  else if (!PROJECTS.length) { CURRENT=null; showNoProject(); }
}

function showNoProject(){
  document.getElementById('no-project').classList.remove('hidden');
  document.getElementById('project-view').classList.add('hidden');
}

async function openProject(id, silent){
  try {
    const r = await API.get('api/projects.php?action=get&id='+id);
    CURRENT = r.project;
  } catch(e){ if(!silent) alert(e.message); return; }
  document.getElementById('no-project').classList.add('hidden');
  document.getElementById('project-view').classList.remove('hidden');
  document.getElementById('pv-name').textContent = CURRENT.name;
  document.getElementById('pv-desc').textContent = CURRENT.description || 'Aucune description.';
  const members = CURRENT.members||[];
  document.getElementById('pv-members').innerHTML = members.map(m => {
    const callBtns = m.id === ME.id ? '' : `<span class="call-btns"><button class="btn mini" data-call="${m.id}" data-mode="video" title="Appel vidéo">📹</button><button class="btn mini" data-call="${m.id}" data-mode="audio" title="Appel audio">🎙️</button></span>`;
    return `<span class="pill-user" title="@${esc(m.username)}">${avatar(m.display_name,m.color)}<span>${esc(m.display_name)}</span>${m.role==='owner'?'<span class="tag">proprio</span>':''}${callBtns}</span>`;
  }).join('');
  document.querySelectorAll('#pv-members [data-call]').forEach(b => b.onclick = ()=>startOutgoingCall(Number(b.dataset.call), b.dataset.mode));
  document.querySelectorAll('.project-item').forEach(el=>el.classList.toggle('active', Number(el.dataset.id)==CURRENT.id));
  await loadItems();
  if(typeof loadTeam === 'function') loadTeam();
}

async function loadItems(){
  if(!CURRENT) return;
  ITEMS = (await API.get('api/items.php?action=list&project_id='+CURRENT.id)).items || [];
  const wrap = document.getElementById('items');
  if(!ITEMS.length){ wrap.innerHTML = '<div class="empty">Aucun élément. Envoyez un fichier ou créez un texte pour commencer.</div>'; return; }
  wrap.innerHTML = ITEMS.map(renderItemCard).join('');
  wrap.querySelectorAll('[data-act]').forEach(btn => btn.onclick = ()=>handleItemAction(btn.dataset.act, Number(btn.dataset.id)));
}

function renderItemCard(it){
  const isImg = it.kind==='file' && /^image\//.test(it.mime_type||'');
  const icon = isImg ? `<div class="item-icon"><img src="api/items.php?action=download&id=${it.id}" alt=""></div>`
    : `<div class="item-icon">${it.kind==='text'?'T':'F'}</div>`;
  const metaParts = [it.kind==='text'?'Texte':(it.filename||'Fichier')];
  if(it.size) metaParts.push(fmtSize(it.size));
  metaParts.push('par '+(it.display_name||it.username));
  metaParts.push(fmtDate(it.updated_at||it.created_at));
  if(it.parent_id) metaParts.push('v2+');
  return `<div class="item-card">
    <div class="item-head">${icon}<div class="grow">
      <div class="item-title">${esc(it.title)}</div>
      <div class="item-meta">${esc(metaParts.join(' · '))}</div>
    </div></div>
    <div class="row wrap" style="justify-content:space-between">
      <span class="chip">💬 ${it.comment_count||0}</span>
      <div class="item-actions">
        ${it.kind==='text'?`<button class="btn sm" data-act="view" data-id="${it.id}">Ouvrir</button>`:`<button class="btn sm" data-act="preview" data-id="${it.id}">Voir</button>`}
        <button class="btn sm" data-act="download" data-id="${it.id}">Télécharger</button>
        <button class="btn sm ghost" data-act="comments" data-id="${it.id}">Commentaires</button>
        <button class="btn sm danger" data-act="delete" data-id="${it.id}">Suppr.</button>
      </div>
    </div>
  </div>`;
}

function handleItemAction(act,id){
  const it = ITEMS.find(x=>x.id==id);
  if(act==='view') openTextEditor(it);
  else if(act==='preview') openPreview(it);
  else if(act==='download') window.location = 'api/items.php?action=download&id='+id;
  else if(act==='comments') openComments(it);
  else if(act==='delete') deleteItem(it);
}

function modal(html){
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop" id="backdrop"><div class="modal">${html}</div></div>`;
  root.querySelector('#backdrop').addEventListener('click', e=>{ if(e.target.id==='backdrop') closeModal(); });
  root.querySelectorAll('[data-close]').forEach(b=>b.onclick=closeModal);
}
function closeModal(){ document.getElementById('modal-root').innerHTML=''; }

function openNewProject(){
  modal(`<div class="spread"><h3>Nouveau projet</h3><button class="btn sm ghost" data-close>✕</button></div>
    <div class="form-grid"><div><label>Nom</label><input id="np-name" maxlength="80"></div>
    <div><label>Description (optionnel)</label><textarea id="np-desc" rows="3" maxlength="500"></textarea></div>
    <button class="btn primary" id="np-ok">Créer</button><div id="np-msg" class="msg"></div></div>`);
  document.getElementById('np-ok').onclick = async ()=>{
    const msg=document.getElementById('np-msg');
    try{ const r=await API.post('api/projects.php?action=create',{name:npVal('np-name'),description:npVal('np-desc')}); closeModal(); await loadProjects(r.id); }
    catch(e){ msg.textContent=e.message; msg.className='msg err'; }
  };
}
function npVal(id){ return document.getElementById(id).value; }

function openAddMember(){
  if(!CURRENT) return;
  modal(`<div class="spread"><h3>Inviter un ami</h3><button class="btn sm ghost" data-close>✕</button></div>
    <p class="muted small">Entrez le nom d'utilisateur exact de votre ami pour l'ajouter au projet.</p>
    <div class="form-grid"><div><label>Nom d'utilisateur</label><input id="am-user" placeholder="ex: alex_01"></div>
    <button class="btn primary" id="am-ok">Ajouter au projet</button><div id="am-msg" class="msg"></div></div>`);
  document.getElementById('am-ok').onclick = async ()=>{
    const msg=document.getElementById('am-msg');
    try{ await API.post('api/projects.php?action=add_member',{project_id:CURRENT.id,username:npVal('am-user')}); msg.textContent='Membre ajouté !'; msg.className='msg ok'; await openProject(CURRENT.id,true); await loadProjects(CURRENT.id); }
    catch(e){ msg.textContent=e.message; msg.className='msg err'; }
  };
}

async function leaveProject(){
  if(!CURRENT) return; if(!confirm('Quitter ce projet ?')) return;
  try{ await API.post('api/projects.php?action=remove_member',{project_id:CURRENT.id,user_id:ME.id}); CURRENT=null; await loadProjects(); showNoProject(); }
  catch(e){ alert(e.message); }
}

function openUpload(){
  if(!CURRENT) return;
  modal(`<div class="spread"><h3>Envoyer un fichier</h3><button class="btn sm ghost" data-close>✕</button></div>
    <div class="form-grid">
      <div><label>Titre (optionnel)</label><input id="up-title" placeholder="Nom affiché"></div>
      <div><label>Fichier (texte, image, PDF, etc. · max 15 Mo)</label><input id="up-file" type="file"></div>
      <button class="btn primary" id="up-ok">Envoyer</button><div id="up-msg" class="msg"></div>
    </div>`);
  document.getElementById('up-ok').onclick = async ()=>{
    const msg=document.getElementById('up-msg'); const f=document.getElementById('up-file').files[0];
    if(!f){ msg.textContent='Choisissez un fichier.'; msg.className='msg err'; return; }
    const fd=new FormData(); fd.append('project_id', CURRENT.id); fd.append('title', npVal('up-title')); fd.append('file', f);
    try{ await API.postForm('api/items.php?action=upload', fd); closeModal(); await loadItems(); await loadProjects(CURRENT.id); }
    catch(e){ msg.textContent=e.message; msg.className='msg err'; }
  };
}

async function openTextEditor(item){
  if(!CURRENT) return;
  let full = item;
  if(item){ full = (await API.get('api/items.php?action=get&id='+item.id)).item; }
  const isEdit = !!full;
  modal(`<div class="spread"><h3>${isEdit?'Modifier / renvoyer le texte':'Nouveau texte'}</h3><button class="btn sm ghost" data-close>✕</button></div>
    <div class="form-grid">
      <div><label>Titre</label><input id="tx-title" value="${esc(full?full.title:'')}" placeholder="Titre du texte"></div>
      <div><label>Contenu</label><textarea id="tx-body" class="editor" placeholder="Écrivez votre texte ici...">${esc(full?full.content||'':'')}</textarea></div>
      <div class="row wrap">
        ${isEdit?`<button class="btn primary" id="tx-save">Enregistrer les modifications</button>
        <button class="btn" id="tx-newver">Renvoyer comme nouvelle version</button>`:
        `<button class="btn primary" id="tx-create">Créer</button>`}
      </div>
      ${isEdit?'<div class="hint">« Nouvelle version » conserve l’historique (lien vers la version précédente) et indique qui a renvoyé le travail.</div>':''}
      <div id="tx-msg" class="msg"></div>
    </div>`);
  const msg=()=>document.getElementById('tx-msg');
  if(!isEdit){
    document.getElementById('tx-create').onclick = async ()=>{
      try{ await API.post('api/items.php?action=create_text',{project_id:CURRENT.id,title:npVal('tx-title'),content:npVal('tx-body')}); closeModal(); await loadItems(); await loadProjects(CURRENT.id);}catch(e){msg().textContent=e.message;msg().className='msg err';}
    };
  } else {
    document.getElementById('tx-save').onclick = async ()=>{
      try{ await API.post('api/items.php?action=update_text',{id:full.id,title:npVal('tx-title'),content:npVal('tx-body')}); closeModal(); await loadItems(); }catch(e){msg().textContent=e.message;msg().className='msg err';}
    };
    document.getElementById('tx-newver').onclick = async ()=>{
      try{ await API.post('api/items.php?action=update_text',{id:full.id,title:npVal('tx-title'),content:npVal('tx-body'),save_as_new:true}); closeModal(); await loadItems(); await loadProjects(CURRENT.id);}catch(e){msg().textContent=e.message;msg().className='msg err';}
    };
  }
}

async function openPreview(item){
  if(!item) return;
  const isImg = /^image\//.test(item.mime_type||'');
  const isText = /^text\//.test(item.mime_type||'') || /(json|xml|javascript|csv)/.test(item.mime_type||'');
  let body = '';
  if(isImg) body = `<img class="preview-img" src="api/items.php?action=download&id=${item.id}" alt="${esc(item.title)}">`;
  else if(isText) body = `<div class="hint">Aperçu non intégré pour ce type ici — utilisez Télécharger.</div>`;
  else body = `<div class="hint">Aperçu indisponible pour ce type de fichier. Vous pouvez le télécharger.</div>`;
  modal(`<div class="spread"><h3>${esc(item.title)}</h3><button class="btn sm ghost" data-close>✕</button></div>
    <div class="muted small">${esc(item.filename||'')} ${item.size?('· '+fmtSize(item.size)):''} · par ${esc(item.display_name||'')} · ${esc(fmtDate(item.updated_at))}</div>
    ${body}
    <div class="row" style="margin-top:.8rem"><a class="btn primary" href="api/items.php?action=download&id=${item.id}">Télécharger</a></div>`);
}

async function openComments(item){
  if(!item) return;
  modal(`<div class="spread"><h3>Commentaires — ${esc(item.title)}</h3><button class="btn sm ghost" data-close>✕</button></div>
    <div id="c-list" class="comments"><div class="muted">Chargement...</div></div>
    <hr class="sep">
    <div class="form-grid"><div><label>Ajouter un commentaire</label><textarea id="c-body" rows="3" placeholder="Votre message..."></textarea></div>
    <button class="btn primary" id="c-send">Envoyer</button><div id="c-msg" class="msg"></div></div>`);
  async function refresh(){
    const r = await API.get('api/comments.php?action=list&item_id='+item.id);
    const list = document.getElementById('c-list');
    const cs = r.comments||[];
    if(!cs.length){ list.innerHTML='<div class="muted small">Aucun commentaire pour le moment.</div>'; return; }
    list.innerHTML = cs.map(c=>`<div class="comment">${avatar(c.display_name,c.user_color)}<div class="bubble">
      <div class="spread"><span class="who">${esc(c.display_name)}</span><span class="time">${esc(fmtDate(c.created_at))}</span></div>
      <div class="body">${esc(c.body)}</div></div></div>`).join('');
  }
  await refresh();
  document.getElementById('c-send').onclick = async ()=>{
    const msg=document.getElementById('c-msg'); const body=npVal('c-body');
    try{ await API.post('api/comments.php?action=add',{item_id:item.id,body}); document.getElementById('c-body').value=''; msg.textContent=''; await refresh(); await loadItems(); }
    catch(e){ msg.textContent=e.message; msg.className='msg err'; }
  };
}

async function deleteItem(item){
  if(!item || !confirm('Supprimer « '+item.title+' » ?')) return;
  try{ await API.post('api/items.php?action=delete',{id:item.id}); await loadItems(); await loadProjects(CURRENT.id); }
  catch(e){ alert(e.message); }
}

function openProfile(){
  modal(`<div class="spread"><h3>Profil & couleur</h3><button class="btn sm ghost" data-close>✕</button></div>
    <div class="form-grid">
      <div><label>Nom affiché</label><input id="pf-name" value="${esc(ME.display_name)}"></div>
      <div><label>Votre couleur</label><div class="color-row"><input type="color" id="pf-color" value="${esc(ME.color)}"><span class="muted small">Appliquée immédiatement à l'interface.</span></div></div>
      <div><label>Nouveau mot de passe (laisser vide pour ne pas changer)</label><input id="pf-pass" type="password" minlength="4"></div>
      <button class="btn primary" id="pf-save">Enregistrer</button><div id="pf-msg" class="msg"></div>
    </div>`);
  document.getElementById('pf-color').oninput = e=>setAccent(e.target.value);
  document.getElementById('pf-save').onclick = async ()=>{
    const msg=document.getElementById('pf-msg');
    try{
      const r = await API.post('api/auth.php?action=profile',{display_name:npVal('pf-name'), color:npVal('pf-color'), password:npVal('pf-pass')});
      ME = r.user; setAccent(ME.color); renderMe(); closeModal(); if(CURRENT) await openProject(CURRENT.id,true); await loadProjects(CURRENT&&CURRENT.id);
    }catch(e){ msg.textContent=e.message; msg.className='msg err'; }
  };
}

// --- Video call (WebRTC mesh with polling signaling) ---
let VC = null; // {projectId, stream, mode, pcs, since, pollTimer, peerTimer, makingOffer, peers, pendingIce}

async function teardownVC(){
  if(!VC) return;
  const old = VC;
  clearInterval(old.pollTimer); clearInterval(old.peerTimer);
  try{ await API.post('api/video.php?action=leave',{project_id:old.projectId}); }catch(e){}
  for(const pc of old.pcs.values()){ try{ pc.close(); }catch(e){} }
  if(old.stream) old.stream.getTracks().forEach(t=>t.stop());
  if(VC === old) VC = null;
}

function callModal(title, inner){
  modal(`<div class="spread"><h3>${title}</h3><button class="btn sm ghost" data-close>✕</button></div>${inner}`);
}

async function openVideoCall(mode){
  if(!CURRENT) return;
  if(VC && VC.projectId === CURRENT.id){ showActiveCallModal(); return; }
  if(VC) await teardownVC();
  callModal(`Appel — ${esc(CURRENT.name)}`, `
    <p class="muted small">Choisissez le type d'appel pour rejoindre la salle du projet. Autorisez l'accès au micro (et à la caméra pour la visio).</p>
    <div class="video-controls" id="v-join-controls">
      <button class="btn primary" id="v-join-video">📹 Rejoindre en visio</button>
      <button class="btn" id="v-join-audio">🎙️ Appel simple (audio)</button>
      <span id="v-status" class="muted small"></span>
    </div>
    <div id="v-grid" class="video-grid"></div>
    <div class="hint">Astuce : entre appareils différents, les navigateurs exigent généralement <strong>HTTPS</strong> pour l'accès caméra/micro.</div>`);
  document.getElementById('v-join-video').onclick = ()=>startVideoCall('video', CURRENT.id);
  document.getElementById('v-join-audio').onclick = ()=>startVideoCall('audio', CURRENT.id);
}

function showActiveCallModal(){
  if(!VC) return;
  callModal(`Appel — ${esc((CURRENT&&CURRENT.name)||'Projet')}`, `
    <div class="video-controls" id="v-join-controls">
      <button class="btn danger" id="v-leave">Quitter l'appel</button>
      <span id="v-status" class="muted small"><span class="dot"></span> En appel ${VC.mode==='audio'?'(audio)':'(visio)'}</span>
    </div>
    <div id="v-grid" class="video-grid"></div>`);
  document.getElementById('v-leave').onclick = stopVideoCall;
  addLocalTile();
  for(const id of VC.pcs.keys()) ensureTile(id);
  updateLabels();
}

async function startVideoCall(mode, projectId){
  const pid = projectId || (CURRENT && CURRENT.id);
  if(!pid) return;
  const setStatus = (t)=>{ const s=document.getElementById('v-status'); if(s) s.textContent=t; };
  if(VC && VC.projectId === pid){ showActiveCallModal(); return; }
  if(VC) await teardownVC();
  let stream = null;
  try{
    setStatus(mode==='audio' ? 'Accès micro...' : 'Accès caméra/micro...');
    const constraints = mode==='audio' ? {audio:true, video:false} : {video:true, audio:true};
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    setStatus('Connexion à la salle...');
    await API.post('api/video.php?action=join', {project_id: pid});
  }catch(e){
    if(stream) stream.getTracks().forEach(t=>t.stop());
    setStatus("Impossible d'accéder au périphérique ou à la salle : " + (e.message||e));
    return;
  }
  VC = { projectId: pid, stream, mode: mode||'video', pcs:new Map(), since:0, pollTimer:null, peerTimer:null, makingOffer:new Set(), peers:{}, pendingIce:{} };
  addLocalTile();
  const controls = document.getElementById('v-join-controls');
  if(controls){
    controls.innerHTML = `<button class="btn danger" id="v-leave">Quitter l'appel</button><span id="v-status" class="muted small"><span class="dot"></span> En appel ${VC.mode==='audio'?'(audio)':'(visio)'}</span>`;
    document.getElementById('v-leave').onclick = stopVideoCall;
  }
  await syncPeers();
  VC.peerTimer = setInterval(syncPeers, 4000);
  VC.pollTimer = setInterval(pollSignals, 1500);
}

function addLocalTile(){
  const grid = document.getElementById('v-grid'); if(!grid || !VC) return;
  let tile = document.getElementById('vtile-me');
  const label = `Moi (${ME.display_name})${VC.mode==='audio'?' · audio':''}`;
  if(!tile){
    tile=document.createElement('div'); tile.className='video-tile me'; tile.id='vtile-me';
    tile.innerHTML=`<video autoplay playsinline muted></video><div class="vlabel" id="vlabel-me"></div>`;
    grid.prepend(tile);
  }
  tile.querySelector('video').srcObject = VC.stream;
  const vl = tile.querySelector('#vlabel-me') || tile.querySelector('.vlabel'); if(vl) vl.textContent = label;
}

async function syncPeers(){
  const vc = VC; if(!vc) return;
  try{
    const r = await API.get(`api/video.php?action=peers&project_id=${vc.projectId}`);
    if(VC !== vc) return;
    vc.peers = {}; (r.peers||[]).forEach(p=>vc.peers[p.id]=p);
    const ids = (r.peers||[]).map(p=>p.id).filter(id=>id!=ME.id);
    for(const id of ids){
      if(!vc.pcs.has(id)) await makePeer(id, ME.id < id, vc);
    }
    for(const [id,pc] of vc.pcs){ if(!ids.includes(id)){ pc.close(); vc.pcs.delete(id); removeTile(id); } }
    updateLabels();
  }catch(e){ /* erreurs transitoires ignorées */ }
}

async function makePeer(peerId, initiator, vc){
  vc = vc || VC; if(!vc || vc.pcs.has(peerId)) return vc && vc.pcs.get(peerId);
  const pc = new RTCPeerConnection({ iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}] });
  vc.pcs.set(peerId, pc);
  vc.pendingIce[peerId] = [];
  // Une seule offer : onnegotiationneeded (déclenché par addTrack), pas d'envoi explicite en double.
  pc.onnegotiationneeded = async ()=>{
    if(!initiator || VC!==vc || vc.makingOffer.has(peerId)) return;
    vc.makingOffer.add(peerId);
    try{
      await pc.setLocalDescription();
      await API.post('api/video.php?action=send',{project_id:vc.projectId,to_user_id:peerId,type:'offer',payload:pc.localDescription});
    }catch(e){} finally{ vc.makingOffer.delete(peerId); }
  };
  pc.ontrack = (ev)=>{ const tile=ensureTile(peerId); if(tile) tile.querySelector('video').srcObject = ev.streams[0]; };
  pc.onicecandidate = (ev)=>{ if(ev.candidate && VC===vc) API.post('api/video.php?action=send',{project_id:vc.projectId,to_user_id:peerId,type:'ice',payload:ev.candidate}).catch(()=>{}); };
  vc.stream.getTracks().forEach(t=>pc.addTrack(t, vc.stream));
  ensureTile(peerId);
  return pc;
}

function ensureTile(peerId){
  const grid = document.getElementById('v-grid'); if(!grid) return null;
  let tile = document.getElementById('vtile-'+peerId);
  if(!tile){ tile=document.createElement('div'); tile.className='video-tile'; tile.id='vtile-'+peerId; tile.innerHTML=`<video autoplay playsinline></video><div class="vlabel" id="vlabel-${peerId}">Participant</div>`; grid.appendChild(tile); updateLabels(); }
  return tile;
}
function removeTile(peerId){ const t=document.getElementById('vtile-'+peerId); if(t) t.remove(); }
function updateLabels(){ if(!VC) return; for(const [id,p] of Object.entries(VC.peers)){ const l=document.getElementById('vlabel-'+id); if(l) l.textContent=p.display_name; } }

async function pollSignals(){
  const vc = VC; if(!vc) return;
  try{
    const r = await API.get(`api/video.php?action=poll&project_id=${vc.projectId}&since=${vc.since}`);
    if(VC !== vc) return;
    for(const s of (r.signals||[])){
      vc.since = Math.max(vc.since, s.id);
      if(s.to_user_id && s.to_user_id != ME.id) continue;
      const peerId = s.from_user_id;
      let pc = vc.pcs.get(peerId);
      if(!pc) pc = await makePeer(peerId, false, vc);
      if(!pc || VC !== vc) return;
      const polite = ME.id > peerId; // le pair avec l'id le plus élevé cède en cas de collision
      if(s.type==='offer'){
        const collision = vc.makingOffer.has(peerId) || pc.signalingState !== 'stable';
        if(collision && !polite) continue;
        try{
          await pc.setRemoteDescription(s.payload);
          for(const c of (vc.pendingIce[peerId]||[])){ try{ await pc.addIceCandidate(c); }catch(e){} }
          vc.pendingIce[peerId] = [];
          await pc.setLocalDescription();
          await API.post('api/video.php?action=send',{project_id:vc.projectId,to_user_id:peerId,type:'answer',payload:pc.localDescription});
        }catch(e){}
      } else if(s.type==='answer'){
        if(pc.signalingState === 'have-local-offer'){
          try{
            await pc.setRemoteDescription(s.payload);
            for(const c of (vc.pendingIce[peerId]||[])){ try{ await pc.addIceCandidate(c); }catch(e){} }
            vc.pendingIce[peerId] = [];
          }catch(e){}
        }
      } else if(s.type==='ice'){
        if(pc.remoteDescription){ try{ await pc.addIceCandidate(s.payload); }catch(e){} }
        else { (vc.pendingIce[peerId] = vc.pendingIce[peerId]||[]).push(s.payload); }
      }
    }
  }catch(e){}
}

async function stopVideoCall(){
  await teardownVC();
  const grid=document.getElementById('v-grid'); if(grid) grid.innerHTML='';
  const controls=document.getElementById('v-join-controls');
  if(controls){
    controls.innerHTML = `<button class="btn primary" id="v-join-video">📹 Rejoindre en visio</button><button class="btn" id="v-join-audio">🎙️ Appel simple (audio)</button><span id="v-status" class="muted small">Appel terminé.</span>`;
    document.getElementById('v-join-video').onclick = ()=>startVideoCall('video', CURRENT&&CURRENT.id);
    document.getElementById('v-join-audio').onclick = ()=>startVideoCall('audio', CURRENT&&CURRENT.id);
  }
}
// --- Sonnerie + appels ciblés entre membres ---
function unlockAudio(){
  try{
    if(!AUDIO_CTX) AUDIO_CTX = new (window.AudioContext||window.webkitAudioContext)();
    if(AUDIO_CTX.state === 'suspended') AUDIO_CTX.resume();
  }catch(e){}
}

function playRing(loop){
  stopRing();
  try{
    unlockAudio();
    if(!AUDIO_CTX) return;
    const beep = ()=>{
      const t = AUDIO_CTX.currentTime;
      const o = AUDIO_CTX.createOscillator();
      const g = AUDIO_CTX.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, t);
      o.frequency.setValueAtTime(660, t + 0.18);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      o.connect(g); g.connect(AUDIO_CTX.destination);
      o.start(t); o.stop(t + 0.4);
    };
    beep();
    if(loop) RING_TIMER = setInterval(beep, 1800);
  }catch(e){}
}
function stopRing(){ if(RING_TIMER){ clearInterval(RING_TIMER); RING_TIMER=null; } }

function newCallId(){ return 'c' + Date.now() + Math.random().toString(36).slice(2,8); }
function isBusy(){ return !!(INCOMING || VC || CALL_WAIT); }

async function sendCallSignal(type, projectId, toUserId, callId, mode){
  try{
    const body = { project_id: projectId, to_user_id: toUserId, call_id: callId };
    if(mode) body.mode = mode;
    await API.post('api/video.php?action=' + type, body);
  }catch(e){}
}

async function initIncoming(){
  try{
    const r = await API.get('api/video.php?action=incoming&since=0');
    INCOMING_SINCE = r.latest || 0;
  }catch(e){}
  setInterval(pollIncoming, 1500);
}

const HANDLED_CALLS = new Set();

async function pollIncoming(){
  try{
    const r = await API.get(`api/video.php?action=incoming&since=${INCOMING_SINCE}`);
    const list = r.signals || [];
    for(const s of list){
      // On avance le curseur signal par signal : jamais selon le MAX(id) global,
      // sinon un appel reçu pendant une conversation serait définitivement perdu.
      INCOMING_SINCE = Math.max(INCOMING_SINCE, s.id);
      const cid = (s.payload||{}).call_id || '';
      if(s.type === 'call_cancel'){
        HANDLED_CALLS.add(cid);
        if(INCOMING && INCOMING.callId === cid){ INCOMING=null; stopRing(); closeModal(); }
        continue;
      }
      if(s.type !== 'call' || HANDLED_CALLS.has(cid)) continue;
      HANDLED_CALLS.add(cid);
      if(isBusy()){
        await sendCallSignal('call_busy', s.project_id, s.from_user_id, cid);
        continue;
      }
      const p = s.payload || {};
      INCOMING = {
        id: s.id,
        callId: cid,
        projectId: s.project_id,
        fromId: s.from_user_id,
        mode: p.mode === 'audio' ? 'audio' : 'video',
        name: s.caller_name || 'Un ami',
        color: s.caller_color || '#64748b',
        project: s.project_name || 'Projet'
      };
      showIncomingModal();
    }
  }catch(e){}
}

function showIncomingModal(){
  const inc = INCOMING; if(!inc) return;
  modal(`<div class="call-incoming">
    <div class="call-avatar" style="background:${esc(inc.color)}">${esc(initials(inc.name))}</div>
    <h3>Appel entrant</h3>
    <div class="call-name">${esc(inc.name)}</div>
    <div class="muted small">${inc.mode === 'audio' ? '🎙️ Appel audio' : '📹 Appel vidéo'} · ${esc(inc.project)}</div>
    <div class="row" style="justify-content:center;margin-top:1rem">
      <button class="btn danger" id="in-decline">Refuser</button>
      <button class="btn primary" id="in-answer">Répondre</button>
    </div>
  </div>`);
  document.getElementById('in-decline').onclick = declineIncoming;
  document.getElementById('in-answer').onclick = answerIncoming;
  const bd = document.getElementById('backdrop');
  if(bd) bd.addEventListener('click', ()=>{ if(INCOMING) declineIncoming(); });
  playRing(true);
}

async function declineIncoming(){
  const inc = INCOMING; if(!inc) return;
  INCOMING = null; stopRing(); closeModal();
  await sendCallSignal('call_decline', inc.projectId, inc.fromId, inc.callId);
}

async function answerIncoming(){
  const inc = INCOMING; if(!inc) return;
  INCOMING = null; stopRing(); closeModal();
  await sendCallSignal('call_answer', inc.projectId, inc.fromId, inc.callId);
  try{ await openProject(inc.projectId, true); }catch(e){}
  await startVideoCall(inc.mode, inc.projectId);
  if(VC) showActiveCallModal();
}

async function startOutgoingCall(toId, mode){
  if(!CURRENT) return;
  if(isBusy()){ alert('Un appel est déjà en cours.'); return; }
  const target = (CURRENT.members||[]).find(m => m.id === toId);
  const name = target ? target.display_name : 'cet ami';
  const id = newCallId();
  const projectId = CURRENT.id;
  CALL_WAIT = { id, toId, projectId, mode, since: 0, started: Date.now(), timer: null };
  modal(`<div class="spread"><h3>Appel à ${esc(name)}</h3><button class="btn sm ghost" data-close>✕</button></div>
    <div class="call-pulse">${mode === 'audio' ? '🎙️' : '📹'}</div>
    <p class="muted small" style="text-align:center">Sonnerie en cours…</p>
    <div class="row" style="justify-content:center">
      <button class="btn danger" id="cw-cancel">Annuler</button>
      <span id="cw-status" class="muted small"></span>
    </div>`);
  document.querySelector('[data-close]').onclick = cancelOutgoingCall;
  document.getElementById('cw-cancel').onclick = cancelOutgoingCall;
  const bd = document.getElementById('backdrop');
  if(bd) bd.addEventListener('click', ()=>{ if(CALL_WAIT) cancelOutgoingCall(); });
  await sendCallSignal('call', projectId, toId, id, mode);
  playRing(true);
  CALL_WAIT.timer = setInterval(pollCallResponse, 1200);
}

async function cancelOutgoingCall(){
  if(!CALL_WAIT){ closeModal(); return; }
  const w = CALL_WAIT;
  CALL_WAIT = null; clearInterval(w.timer); stopRing();
  await sendCallSignal('call_cancel', w.projectId, w.toId, w.id);
  closeModal();
}

async function pollCallResponse(){
  const w = CALL_WAIT; if(!w) return;
  if(Date.now() - w.started > 60000){
    const st = document.getElementById('cw-status'); if(st) st.textContent = 'Pas de réponse.';
    stopRing(); clearInterval(w.timer);
    await sendCallSignal('call_cancel', w.projectId, w.toId, w.id);
    CALL_WAIT = null;
    setTimeout(closeModal, 1500);
    return;
  }
  try{
    const r = await API.get(`api/video.php?action=responses&from_user_id=${w.toId}&since=${w.since}`);
    w.since = Math.max(w.since, r.latest || 0);
    const st = document.getElementById('cw-status');
    for(const s of (r.signals || [])){
      const p = s.payload || {};
      if(p.call_id && p.call_id !== w.id) continue;
      if(s.type === 'call_decline' || s.type === 'call_busy'){
        stopRing(); clearInterval(w.timer); CALL_WAIT = null;
        if(st) st.textContent = s.type === 'call_busy' ? 'Occupé.' : 'Appel refusé.';
        setTimeout(closeModal, 1600);
        return;
      }
      if(s.type === 'call_answer'){
        stopRing(); clearInterval(w.timer); CALL_WAIT = null; closeModal();
        try{ await openProject(w.projectId, true); }catch(e){}
        await startVideoCall(w.mode, w.projectId);
        if(VC) showActiveCallModal();
        return;
      }
    }
  }catch(e){}
}
// --- Notifications push (même quand la page est fermée) ---
function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(Array.from(raw, c => c.charCodeAt(0)));
}

async function initPush(){
  if(!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try{
    await navigator.serviceWorker.register('sw.js', { scope: './' });
    PUSH_READY = true;
    if('Notification' in window && Notification.permission === 'granted'){
      const reg = await navigator.serviceWorker.ready;
      await subscribePush(reg);
    }
  }catch(e){ console.warn('Push init:', e); }
}

async function enablePush(force){
  if(!PUSH_READY) await initPush();
  if(!('Notification' in window)){ if(force) alert('Ce navigateur ne gère pas les notifications.'); return; }
  let perm = Notification.permission;
  if(perm === 'default' || force) perm = await Notification.requestPermission();
  if(perm !== 'granted'){
    if(force) alert('Autorise les notifications dans ton navigateur pour recevoir les appels.');
    return;
  }
  try{
    const reg = await navigator.serviceWorker.ready;
    await subscribePush(reg);
    if(force) alert('Alertes d’appel activées ✅');
  }catch(e){ if(force) alert('Activation impossible: ' + (e.message||e)); }
}

async function subscribePush(reg){
  const keyRes = await API.get('api/push.php?action=key');
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(keyRes.key)
  });
  const json = sub.toJSON();
  await API.post('api/push.php?action=subscribe', { endpoint: json.endpoint, keys: json.keys });
  const b = document.getElementById('btn-notify');
  if(b) b.textContent = '🔔 Alertes actives';
}

// --- Présence d'équipe en direct + mode concentration (innovation) ---
const PRESENCE_LABELS = {
  available: ['🟢', 'Disponible'],
  focus: ['🧠', 'Concentration'],
  meeting: ['📅', 'En réunion'],
  away: ['🌙', 'Absent']
};
let MY_STATUS = 'available';
let FOCUS_LEFT = 0;

function statusMeta(s){ return PRESENCE_LABELS[s] || PRESENCE_LABELS.available; }

function renderMyStatus(){
  const b = document.getElementById('btn-status');
  if(!b) return;
  const [icon, label] = statusMeta(MY_STATUS);
  b.textContent = icon + ' ' + label + (MY_STATUS === 'focus' && FOCUS_LEFT > 0 ? ' ' + formatCountdown(FOCUS_LEFT) : '');
  b.dataset.status = MY_STATUS;
}

function formatCountdown(sec){
  const m = Math.floor(sec / 60), s = sec % 60;
  return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}

async function heartbeatPresence(){
  try{
    const r = await API.post('api/presence.php?action=heartbeat', { status: MY_STATUS, minutes: 25 });
    if(r && r.status) MY_STATUS = r.status;
    if(MY_STATUS === 'focus') FOCUS_LEFT = Math.max(0, FOCUS_LEFT - 20);
  }catch(e){}
  renderMyStatus();
}

async function initPresence(){
  try{
    const r = await API.get('api/presence.php?action=me');
    MY_STATUS = r.status || 'available';
    if(r.focus_until){
      const left = Math.floor(new Date(r.focus_until.replace(' ','T') + 'Z').getTime()/1000) - Math.floor(Date.now()/1000);
      FOCUS_LEFT = Math.max(0, left);
    }
  }catch(e){}
  renderMyStatus();
  await heartbeatPresence();
  setInterval(heartbeatPresence, 20000);
  setInterval(()=>{ if(MY_STATUS === 'focus' && FOCUS_LEFT > 0){ FOCUS_LEFT--; renderMyStatus(); if(FOCUS_LEFT === 0){ MY_STATUS='available'; heartbeatPresence(); } } }, 1000);
  setInterval(()=>{ if(CURRENT) loadTeam(); }, 10000);
}

function openStatusModal(){
  const current = MY_STATUS;
  modal(`<div class="spread"><h3>Mon statut</h3><button class="btn sm ghost" data-close>✕</button></div>
    <p class="muted small">Ton équipe voit ton statut en direct. Le mode concentration affiche un compte à rebours et reçoit moins de sollicitations.</p>
    <div class="status-grid">
      ${Object.entries(PRESENCE_LABELS).map(([k,v])=>`<button class="status-option ${k===current?'selected':''}" data-status="${k}"><span class="status-icon">${v[0]}</span><span>${v[1]}</span></button>`).join('')}
    </div>
    <div id="status-msg" class="msg"></div>`);
  document.querySelectorAll('[data-status]').forEach(b => b.onclick = async ()=>{
    await setStatus(b.dataset.status);
    const m = document.getElementById('status-msg'); if(m) m.textContent = 'Statut mis à jour ✅';
    closeModal();
  });
}

async function setStatus(status){
  MY_STATUS = status;
  FOCUS_LEFT = status === 'focus' ? 25*60 : 0;
  renderMyStatus();
  await heartbeatPresence();
  if(CURRENT) await loadTeam();
}

async function loadTeam(){
  if(!CURRENT) return;
  const wrap = document.getElementById('team-live'); if(!wrap) return;
  try{
    const r = await API.get('api/presence.php?action=team&project_id=' + CURRENT.id);
    const members = r.members || [];
    wrap.innerHTML = members.map(m => {
      const [icon,label] = statusMeta(m.online ? m.status : 'away');
      const countdown = m.status === 'focus' && m.focus_left > 0 ? formatCountdown(m.focus_left) : '';
      const callBtns = m.id === ME.id ? '' :
        `<span class="call-btns"><button class="btn mini" data-team-call="${m.id}" data-mode="video" title="Appel vidéo">📹</button><button class="btn mini" data-team-call="${m.id}" data-mode="audio" title="Appel audio">🎙️</button></span>`;
      return `<div class="team-row">
        ${avatar(m.display_name, m.color)}
        <div class="team-info"><strong>${esc(m.display_name)}</strong><span class="muted small">${icon} ${label}${countdown?' · '+countdown:''}</span></div>
        ${callBtns}
      </div>`;
    }).join('');
    wrap.querySelectorAll('[data-team-call]').forEach(b => b.onclick = ()=>startOutgoingCall(Number(b.dataset.teamCall), b.dataset.mode));
  }catch(e){ wrap.innerHTML = '<div class="muted small">Présence indisponible.</div>'; }
}

init();
