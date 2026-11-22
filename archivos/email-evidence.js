/* ÁGORA Archivos · correos visuales con fotografías privadas.
 * No insertar miniaturas de Drive como IMG en correos: requieren autenticación
 * y Gmail puede pedirlas desde un servidor que no posee esa sesión.
 * Los botones individuales conservan el acceso seguro del destinatario. */
const htmlEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
export function safeEvidenceUrl(value){
 try{
  const u=new URL(String(value??'').trim());
  return u.protocol==='https:'?u.href:'';
 }catch{return '';}
}
export function evidenceEmailHtml(urls, heading){
 const items=Array.isArray(urls)?urls.slice(0,8).map(safeEvidenceUrl).filter(Boolean):[];
 if(!items.length)return '';
 return '<h3 style="font:700 14px Arial,Helvetica,sans-serif;color:#5a431f;margin:22px 0 10px">'+htmlEscape(heading)+'</h3>'+
 '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;margin:0 0 12px">'+
 items.map((link,i)=>
 '<tr><td style="padding:0 0 9px">'+
 '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;border:1px solid #e6dccb;background:#faf8f3"><tr>'+
 '<td width="54" style="width:54px;padding:11px 8px;text-align:center;background:#e9ddc6;color:#705026;font:700 15px Arial,Helvetica,sans-serif">'+String(i+1).padStart(2,'0')+'</td>'+
 '<td style="padding:12px 12px 12px 15px;color:#33291f;font:13px Arial,Helvetica,sans-serif">'+
 '<b>Fotografía '+(i+1)+'</b>'+
 '<div style="font:11px/1.5 Arial,Helvetica,sans-serif;color:#82715d;margin-top:4px">Disponible en Google Drive</div>'+
 '</td>'+
 '<td align="right" style="padding:10px 12px 10px 2px">'+
 '<a href="'+htmlEscape(link)+'" target="_blank" style="display:inline-block;padding:10px 12px;border-radius:4px;background:#29251f;color:#fff;text-decoration:none;font:700 11px Arial,Helvetica,sans-serif;white-space:nowrap">Abrir fotografía</a>'+
 '</td></tr></table></td></tr>'
 ).join('')+'</table>'+
 '<p style="font:11px/1.5 Arial,Helvetica,sans-serif;color:#756858;margin:3px 0 14px">Para proteger los archivos, las fotografías se abren desde Drive con la cuenta que recibió permiso. No se insertan miniaturas privadas que puedan aparecer rotas en el correo.</p>';
}
export function evidenceEmailPlain(urls, heading){
 const items=Array.isArray(urls)?urls.slice(0,8).map(safeEvidenceUrl).filter(Boolean):[];
 if(!items.length)return '';
 return '\n\n'+heading+':\n'+items.map((url,i)=>(i+1)+'. '+url).join('\n');
}
