/* ÁGORA Archivos · miniaturas de enlaces, sin acceso extra a los archivos.
   Las imágenes permanecen en Drive/Storage; el navegador solicita vistas previas públicas.
   No modifica la URL original ni los permisos de Drive. */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const driveHosts=new Set(['drive.google.com','docs.google.com','drive.usercontent.google.com']);
export function safeImageLink(input){
 try{const url=new URL(String(input??'').trim());return url.protocol==='https:'?url.href:''}catch{return ''}
}
export function imageLinkInfo(raw){
 const original=safeImageLink(raw);
 if(!original)return {type:'invalid',original:'',sources:[],message:'Enlace inválido o sin HTTPS'};
 const url=new URL(original);
 if(!driveHosts.has(url.hostname))return {type:'external',original,sources:[original],message:'Imagen enlazada'};
 const pathname=url.pathname;
 if(/\/(?:drive\/)?folders\//.test(pathname))return {type:'folder',original,sources:[],message:'Es una carpeta de Drive, no un enlace individual de imagen'};
 if(/^\/(document|spreadsheets|presentation|forms)\//.test(pathname))return {type:'document',original,sources:[],message:'Es un documento de Google, no una imagen'};
 let id=pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/)?.[1]||pathname.match(/^\/d\/([A-Za-z0-9_-]+)/)?.[1]||url.searchParams.get('id');
 if(!id||!/^[A-Za-z0-9_-]{8,}$/.test(id))return {type:'unknown-drive',original,sources:[],message:'No se reconoce una imagen individual en este enlace'};
 const resourcekey=url.searchParams.get('resourcekey')||url.searchParams.get('resourceKey');
 const thumb=new URL('https://drive.google.com/thumbnail');
 thumb.searchParams.set('id',id);
 thumb.searchParams.set('sz','w1200');
 if(resourcekey)thumb.searchParams.set('resourcekey',resourcekey);
 const uc=new URL('https://drive.google.com/uc');
 uc.searchParams.set('export','view');
 uc.searchParams.set('id',id);
 if(resourcekey)uc.searchParams.set('resourcekey',resourcekey);
 const sources=[thumb.href,'https://lh3.googleusercontent.com/d/'+encodeURIComponent(id)+'=w1200',uc.href];
 if(url.pathname==='/thumbnail'&&url.searchParams.has('id'))sources.unshift(original);
 return {type:'drive-image',original,id,sources:[...new Set(sources)],message:'Vista previa de Google Drive'};
}
export function preferredImageUrl(raw){
 const info=imageLinkInfo(raw);
 return info.sources[0]||'';
}
export function previewTileHtml(raw,i=0){
 const info=imageLinkInfo(raw),isFile=info.sources.length>0;
 const src=isFile?info.sources[0]:'';
 const title='Imagen '+(i+1);
 const sources=esc(JSON.stringify(info.sources));
 return '<div class="agora-image-tile" data-agora-image-kind="'+esc(info.type)+'">'+
   '<div class="agora-image-visual">'+
     (isFile?'<img alt="'+esc(title)+'" loading="lazy" referrerpolicy="no-referrer" data-agora-image="1" data-step="0" data-sources="'+sources+'" src="'+esc(src)+'">':'')+
     '<div class="agora-image-unavailable" '+(isFile?'hidden':'')+'><span class="agora-preview-symbol" aria-hidden="true">▧</span><span>'+esc(isFile?'No se pudo mostrar la miniatura. Verifica permisos en Drive.':info.message)+'</span></div>'+
   '</div>'+
   '<div class="agora-image-meta"><span>'+esc(title)+'</span>'+
     (info.original?'<button type="button" class="agora-image-open" data-preview-url="'+esc(info.original)+'">Ampliar</button><a href="'+esc(info.original)+'" target="_blank" rel="noopener noreferrer">Abrir original</a>':'')+
   '</div>'+
   (info.type==='drive-image'?'<p class="agora-image-hint">Imagen enlazada desde Drive</p>':'')+
   '</div>';
}
export function galleryHtml(urls,title){
 if(!Array.isArray(urls)||!urls.length)return '';
 return '<div class="reference-group agora-linked-gallery"><h3>'+esc(title)+'</h3><div class="agora-image-grid">'+urls.map(previewTileHtml).join('')+'</div></div>';
}
function fallback(event){
 const img=event.target;
 if(!(img instanceof HTMLImageElement)||!img.hasAttribute('data-agora-image'))return;
 const card=img.closest('.agora-image-tile');
 if(!card)return;
 let sources=[];try{sources=JSON.parse(img.dataset.sources||'[]')}catch{}
 let step=Number(img.dataset.step||0)+1;
 if(step<sources.length){img.dataset.step=String(step);img.src=sources[step];return}
 img.hidden=true;
 const original=card.querySelector('.agora-image-meta a[href]')?.href||'';
 const info=imageLinkInfo(original);
 const box=card.querySelector('.agora-image-unavailable');
 if(info.type==='drive-image'){
   const frame=document.createElement('iframe');
   const url=new URL('https://drive.google.com/file/d/'+encodeURIComponent(info.id)+'/preview');
   const key=new URL(info.original).searchParams.get('resourcekey');
   if(key)url.searchParams.set('resourcekey',key);
   frame.src=url.href;frame.title='Vista previa desde Google Drive';
   frame.loading='lazy';frame.referrerPolicy='no-referrer';
   frame.className='agora-fallback-drive';
   card.querySelector('.agora-image-visual')?.appendChild(frame);
   if(box)box.hidden=true;
 }else if(box){
   box.hidden=false;
   const msg=box.querySelector('span:last-child');
   if(msg)msg.textContent='No se pudo mostrar esta foto. Abre el original y revisa sus permisos.';
 }
 card.classList.add('agora-image-error');
}
function loaded(event){
 const img=event.target;
 if(img instanceof HTMLImageElement&&img.hasAttribute('data-agora-image')){
  const card=img.closest('.agora-image-tile');
  if(card)card.classList.remove('agora-image-error');
 }
}
if(typeof document!=='undefined'){
 document.addEventListener('error',fallback,true);
 document.addEventListener('load',loaded,true);
}

/* Vista ampliada: Drive se abre en su visor autenticado si no autoriza incrustar miniaturas. */
function openViewer(raw){
 const info=imageLinkInfo(raw);if(!info.original)return;
 let overlay=document.getElementById('agoraImageViewer');
 if(!overlay){
  overlay=document.createElement('div');
  overlay.id='agoraImageViewer';
  overlay.className='agora-viewer-overlay';
  overlay.hidden=true;
  overlay.innerHTML='<div class="agora-viewer-dialog" role="dialog" aria-modal="true" aria-label="Vista ampliada de imagen">'+
   '<div class="agora-viewer-bar"><b>Vista ampliada del arte</b><button type="button" class="agora-viewer-close" aria-label="Cerrar vista">✕</button></div>'+
   '<div class="agora-viewer-content"></div>'+
   '<div class="agora-viewer-footer"><a class="btn btn-gold agora-viewer-original" target="_blank" rel="noopener noreferrer">Abrir archivo original</a><small>Si Drive requiere permisos, accede con tu cuenta autorizada.</small></div></div>';
  document.body.appendChild(overlay);
  overlay.querySelector('.agora-viewer-close').addEventListener('click',()=>overlay.hidden=true);
  overlay.addEventListener('click',event=>{if(event.target===overlay)overlay.hidden=true;});
 }
 const content=overlay.querySelector('.agora-viewer-content');
 const link=overlay.querySelector('.agora-viewer-original');
 link.href=info.original;
 if(info.type==='drive-image'){
  const embed=new URL('https://drive.google.com/file/d/'+encodeURIComponent(info.id)+'/preview');const key=new URL(info.original).searchParams.get('resourcekey');if(key)embed.searchParams.set('resourcekey',key);const src=embed.href;
  content.innerHTML='<iframe title="Vista de imagen en Google Drive" allow="fullscreen" loading="lazy" referrerpolicy="no-referrer" src="'+esc(src)+'"></iframe>';
 }else{
  content.innerHTML='<img alt="Vista ampliada del arte" src="'+esc(info.original)+'">';
 }
 overlay.hidden=false;
}
if(typeof document!=='undefined'){
 document.addEventListener('click',event=>{
  const trigger=event.target.closest?.('.agora-image-open');
  if(trigger)openViewer(trigger.dataset.previewUrl);
 });
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){
   const overlay=document.getElementById('agoraImageViewer');
   if(overlay)overlay.hidden=true;
  }
 });
}
