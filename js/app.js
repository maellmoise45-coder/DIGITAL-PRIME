let ME = null;
let PROJECTS = [];
let CURRENT = null; // project detail
let ITEMS = [];

async function init() {
  try { ME = (await API.get('api/auth.php?action=me')).user; }
  catch { location.href = 'index.html'; return; }
  setAccent(ME.color);
  renderMe();
  bindGlobal();
  await loadProjects();
}

function renderMe(){
  document.getElementById('me-pill').innerHTML = avatar(ME.display_name, ME.color) + `<span>${esc(ME.display_name)}</span>`;
}
function bindGlobal(){
  document.getElementById('btn-logout').onclick = async ()=>{ await API.post('api/auth.php?action=logout',{}); location.href='index.html'; };
  document.getElementById('btn-profile').onclick = openProfile;
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
  document.getElementById('pv-members').innerHTML = (CURRENT.members||[]).map(m =>
    `<span class="pill-user" title="@${esc(m.username)}">${avatar(m.display_name,m.color)}<span>${esc(m.display_name)}</span>${m.role==='owner'?'<span class="tag">proprio</span>':''}</span>`
  ).join('');
  document.querySelectorAll('.project-item').forEach(el=>el.classList.toggle('active', Number(el.dataset.id)==CURRENT.id));
  await loadItems();
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
let VC = null; // {projectId, stream, pcs:Map, pollTimer, peerTimer, since, makingOffer:Set}

async function openVideoCall(){
  if(!CURRENT) return;
  if(VC && VC.projectId === CURRENT.id){ renderVideoModal(); return; }
  modal(`<div class="spread"><h3>Appel — ${esc(CURRENT.name)}</h3><button class="btn sm ghost" data-close>✕</button></div>
    <p class="muted small">Choisissez le type d'appel pour rejoindre la salle du projet. Autorisez l'accès au micro (et à la caméra pour la visio).</p>
    <div id="v-wrap">
      <div class="video-controls" id="v-join-controls">
        <button class="btn primary" id="v-join-video">📹 Rejoindre en visio</button>
        <button class="btn" id="v-join-audio">🎙️ Appel simple (audio)</button>
        <span id="v-status" class="muted small"></span>
      </div>
      <div id="v-grid" class="video-grid"></div>
      <div class="hint">Astuce : entre appareils différents, les navigateurs exigent généralement <strong>HTTPS</strong> pour l'accès caméra/micro. Sur certains réseaux restrictifs, un serveur TURN peut être nécessaire.</div>
    </div>`);
  document.querySelector('[data-close]').addEventListener('click', ()=>{ /* keep call running */ });
  document.getElementById('v-join-video').onclick = ()=>startVideoCall('video');
  document.getElementById('v-join-audio').onclick = ()=>startVideoCall('audio');
}

function renderVideoModal(){
  openVideoCall();
  if(VC) {
    updateVideoGrid();
    const controls = document.getElementById('v-join-controls');
    if(controls){
      controls.innerHTML = `<button class="btn danger" id="v-leave">Quitter l'appel</button><span id="v-status" class="muted small"><span class="dot"></span> En appel ${VC.mode==='audio'?'(audio)':'(visio)'}</span>`;
      document.getElementById('v-leave').onclick = stopVideoCall;
    }
  }
}

async function startVideoCall(mode){
  if(!CURRENT) return;
  const status = document.getElementById('v-status');
  const controls = document.getElementById('v-join-controls');
  try {
    status.textContent = mode==='audio' ? 'Accès micro...' : 'Accès caméra/micro...';
    const constraints = mode==='audio' ? {audio:true, video:false} : {video:true, audio:true};
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    VC = { projectId: CURRENT.id, stream, mode: mode||'video', pcs: new Map(), since: 0, pollTimer:null, peerTimer:null, makingOffer:new Set(), peers:{} };
    await API.post('api/video.php?action=join', {project_id: CURRENT.id});
    addLocalTile();
    if(controls){
      controls.innerHTML = `<button class="btn danger" id="v-leave">Quitter l'appel</button><span id="v-status" class="muted small"><span class="dot"></span> En appel ${mode==='audio'?'(audio)':'(visio)'}</span>`;
      document.getElementById('v-leave').onclick = stopVideoCall;
    }
    await syncPeers();
    VC.peerTimer = setInterval(syncPeers, 4000);
    VC.pollTimer = setInterval(pollSignals, 1500);
  } catch(e){
    status.textContent = "Impossible d'accéder au périphérique : " + (e.message||e);
  }
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
  if(!VC) return;
  try{
    const r = await API.get(`api/video.php?action=peers&project_id=${VC.projectId}`);
    VC.peers = {}; (r.peers||[]).forEach(p=>VC.peers[p.id]=p);
    const ids = (r.peers||[]).map(p=>p.id).filter(id=>id!=ME.id);
    for(const id of ids){
      if(!VC.pcs.has(id) && ME.id < id){ await makePeer(id, true); }
      else if(!VC.pcs.has(id)) { await makePeer(id, false); }
    }
    for(const [id,pc] of VC.pcs){ if(!ids.includes(id)) { pc.close(); VC.pcs.delete(id); removeTile(id); } }
    updateLabels();
  }catch(e){ /* ignore transient */ }
}

async function makePeer(peerId, initiator){
  if(!VC || VC.pcs.has(peerId)) return VC && VC.pcs.get(peerId);
  const pc = new RTCPeerConnection({ iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}] });
  VC.pcs.set(peerId, pc);
  VC.stream.getTracks().forEach(t=>pc.addTrack(t, VC.stream));
  pc.ontrack = (ev)=>{ ensureTile(peerId).querySelector('video').srcObject = ev.streams[0]; };
  pc.onicecandidate = (ev)=>{ if(ev.candidate) API.post('api/video.php?action=send',{project_id:VC.projectId,to_user_id:peerId,type:'ice',payload:ev.candidate}).catch(()=>{}); };
  pc.onnegotiationneeded = async ()=>{
    try{
      if(!initiator) return;
      VC.makingOffer.add(peerId);
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      await API.post('api/video.php?action=send',{project_id:VC.projectId,to_user_id:peerId,type:'offer',payload:pc.localDescription});
    }catch(e){} finally{ VC.makingOffer.delete(peerId); }
  };
  if(initiator){
    try{ const offer=await pc.createOffer(); await pc.setLocalDescription(offer); await API.post('api/video.php?action=send',{project_id:VC.projectId,to_user_id:peerId,type:'offer',payload:pc.localDescription}); }catch(e){}
  }
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
function updateVideoGrid(){ /* tiles persist in modal DOM */ }

async function pollSignals(){
  if(!VC) return;
  try{
    const r = await API.get(`api/video.php?action=poll&project_id=${VC.projectId}&since=${VC.since}`);
    for(const s of (r.signals||[])){
      VC.since = Math.max(VC.since, s.id);
      if(s.to_user_id && s.to_user_id != ME.id) continue;
      const peerId = s.from_user_id;
      let pc = VC.pcs.get(peerId);
      if(!pc) pc = await makePeer(peerId, false);
      if(s.type==='offer'){
        const glare = VC.makingOffer.has(peerId) || pc.signalingState !== 'stable';
        if(glare && ME.id < peerId) continue; // polite peer yields
        await pc.setRemoteDescription(s.payload);
        const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
        await API.post('api/video.php?action=send',{project_id:VC.projectId,to_user_id:peerId,type:'answer',payload:pc.localDescription});
      } else if(s.type==='answer'){
        if(pc.signalingState !== 'stable') await pc.setRemoteDescription(s.payload).catch(()=>{});
      } else if(s.type==='ice'){
        try{ await pc.addIceCandidate(s.payload); }catch(e){}
      }
    }
  }catch(e){}
}

async function stopVideoCall(){
  if(!VC) return;
  clearInterval(VC.pollTimer); clearInterval(VC.peerTimer);
  try{ await API.post('api/video.php?action=leave',{project_id:VC.projectId}); }catch(e){}
  for(const pc of VC.pcs.values()) pc.close();
  if(VC.stream) VC.stream.getTracks().forEach(t=>t.stop());
  VC = null;
  const grid=document.getElementById('v-grid'); if(grid) grid.innerHTML='';
  const controls=document.getElementById('v-join-controls');
  if(controls){
    controls.innerHTML = `<button class="btn primary" id="v-join-video">📹 Rejoindre en visio</button><button class="btn" id="v-join-audio">🎙️ Appel simple (audio)</button><span id="v-status" class="muted small">Appel terminé.</span>`;
    const bv=document.getElementById('v-join-video'); if(bv) bv.onclick=()=>startVideoCall('video');
    const ba=document.getElementById('v-join-audio'); if(ba) ba.onclick=()=>startVideoCall('audio');
  } else {
    const status=document.getElementById('v-status'); if(status) status.textContent='Appel terminé.';
  }
}

init();
